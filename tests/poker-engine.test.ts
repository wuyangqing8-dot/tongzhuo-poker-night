import assert from "node:assert/strict";
import test from "node:test";
import { potFractionRaiseTarget } from "../lib/bet-sizing";
import { getStrategyAdvice } from "../lib/strategy-advisor";
import {
  addBotPlayer,
  applyPlayerAction,
  createInitialState,
  kickPlayer,
  requestRebuy,
  setDealerProfile,
  startHand,
  toPublicView,
} from "../lib/poker-engine";

function newThreePlayerGame() {
  return createInitialState({
    roomId: "room_test",
    code: "TONG-TEST01",
    name: "规则测试桌",
    ownerId: "human-1",
    ownerName: "测试玩家",
    ownerEmail: "player@example.com",
    maxPlayers: 6,
    startingChips: 5000,
    smallBlind: 20,
    bigBlind: 40,
    bots: 2,
  });
}

test("server shuffle deals unique private cards and hides opponents", () => {
  const state = newThreePlayerGame();
  const dealt = state.players.flatMap((player) => player.hole);
  assert.equal(dealt.length, 6);
  assert.equal(new Set([...dealt, ...state.deck]).size, 52);
  assert.equal(state.deck.length, 46);

  const view = toPublicView(state, "human-1");
  assert.equal(view.players.find((player) => player.id === "human-1")?.hole?.length, 2);
  assert.equal(view.players.find((player) => player.isBot)?.hole, null);
});

test("only the current player may act and bot actions follow automatically", () => {
  const state = newThreePlayerGame();
  assert.equal(state.turnSeat, 0);
  const outsider = state.players.find((player) => player.isBot)!;
  assert.throws(() => applyPlayerAction(state, outsider.id, "call"), /还没轮到你/);

  applyPlayerAction(state, "human-1", "call");
  assert.ok(state.logs.some((log) => log.text.includes("测试玩家") && log.text.includes("跟注")));
  const nextActor = state.players.find((player) => player.seat === state.turnSeat);
  assert.ok(!nextActor || !nextActor.isBot, "bot chain should stop at a human or finish the street");
});

test("raise validation rejects amounts below the legal minimum", () => {
  const state = newThreePlayerGame();
  assert.throws(() => applyPlayerAction(state, "human-1", "raise", 41), /最小加注/);
});

test("rebuy during a hand is queued and applied before the next hand", () => {
  const state = newThreePlayerGame();
  requestRebuy(state, "human-1", 1000);
  const player = state.players.find((item) => item.id === "human-1")!;
  assert.equal(player.pendingRebuy, 1000);
  assert.equal(player.totalBuyIn, 6000);
  const chipsBefore = player.chips;
  startHand(state);
  assert.equal(player.pendingRebuy, 0);
  assert.ok(player.chips > chipsBefore);
});

test("owner can add and kick a bot", () => {
  const state = newThreePlayerGame();
  const count = state.players.length;
  const bot = addBotPlayer(state, "human-1");
  assert.equal(state.players.length, count + 1);
  kickPlayer(state, "human-1", bot.id);
  assert.ok(bot.isKicked || !state.players.some((player) => player.id === bot.id));
});

test("pot fraction shortcut includes the call before sizing a raise", () => {
  const target = potFractionRaiseTarget({
    pot: 1000,
    callAmount: 200,
    playerStreetBet: 0,
    fraction: 1 / 2,
    chipStep: 1,
    minRaiseTo: 400,
    maxRaiseTo: 5000,
  });
  assert.equal(target, 800);
});

test("pot sizing rounds to a single chip and table actions are recorded", () => {
  const target = potFractionRaiseTarget({
    pot: 997,
    callAmount: 17,
    playerStreetBet: 20,
    fraction: 0.37,
    chipStep: 1,
    minRaiseTo: 80,
    maxRaiseTo: 5000,
  });
  assert.equal(target, 412);

  const state = newThreePlayerGame();
  applyPlayerAction(state, "human-1", "call");
  assert.ok(state.actionFeed?.length);
  assert.equal(state.actionFeed?.[0].playerName, "测试玩家");
});

test("dealer starts with the supplied photo and only the owner can change it", () => {
  const state = newThreePlayerGame();
  assert.equal(toPublicView(state, "human-1").dealer.image, "/dealers/classmate.png");
  setDealerProfile(state, "human-1", { presetId: "lan" });
  assert.equal(state.dealer?.name, "阿岚");
  assert.throws(() => setDealerProfile(state, state.players[1].id, { presetId: "chen" }), /只有房主/);
});

test("strategy advice produces a legal 100 percent mixed strategy", () => {
  const premium = getStrategyAdvice({ phase: "preflop", hole: ["AS", "AH"], board: [], pot: 100, callAmount: 40, stack: 4960 });
  const weak = getStrategyAdvice({ phase: "preflop", hole: ["7S", "2H"], board: [], pot: 100, callAmount: 40, stack: 4960 });
  assert.ok(premium && weak);
  assert.equal(Object.values(premium.mix).reduce((sum, value) => sum + value, 0), 100);
  assert.equal(premium.mix.check, 0);
  assert.ok(premium.mix.raise > weak.mix.raise);
  assert.ok(weak.mix.fold > premium.mix.fold);
});
