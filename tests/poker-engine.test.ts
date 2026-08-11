import assert from "node:assert/strict";
import test from "node:test";
import { potFractionRaiseTarget } from "../lib/bet-sizing";
import { getStrategyAdvice } from "../lib/strategy-advisor";
import type { PartyRuntimeEffect } from "../lib/poker-types";
import {
  addBotPlayer,
  addHumanPlayer,
  activatePartyEffect,
  applyPlayerAction,
  configurePartyRules,
  createInitialState,
  kickPlayer,
  leavePlayer,
  requestRebuy,
  setDealerProfile,
  spinPartyWheel,
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

test("leaving the table folds the player, preserves the pot and transfers the host", () => {
  const state = createInitialState({
    roomId: "room_leave",
    code: "TONG-LEAVE1",
    name: "离桌测试",
    ownerId: "human-1",
    ownerName: "房主",
    ownerEmail: "host@example.com",
    maxPlayers: 6,
    startingChips: 5000,
    smallBlind: 20,
    bigBlind: 40,
    bots: 0,
  });
  addHumanPlayer(state, { id: "human-2", displayName: "同学", email: "friend@example.com" });
  const owner = state.players.find((player) => player.id === "human-1")!;
  const contributed = owner.contribution;

  leavePlayer(state, owner.id);

  assert.equal(owner.isKicked, true);
  assert.equal(owner.leftVoluntarily, true);
  assert.equal(owner.folded, true);
  assert.ok(state.lastPot >= contributed, "the chips already posted by the leaving player stay in the settled pot");
  assert.equal(state.ownerId, "human-2");
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

test("party mode awards a wheel credit from a real showdown trigger", () => {
  const state = createInitialState({
    roomId: "room_party_award",
    code: "TONG-PARTY1",
    name: "娱乐成就测试",
    ownerId: "human-1",
    ownerName: "房主",
    ownerEmail: "host@example.com",
    maxPlayers: 6,
    startingChips: 5000,
    smallBlind: 20,
    bigBlind: 40,
    bots: 0,
    roomMode: "party",
    partyTriggers: ["quads"],
  });
  addHumanPlayer(state, { id: "human-2", displayName: "同学", email: "friend@example.com" });
  const owner = state.players.find((player) => player.id === "human-1")!;
  const friend = state.players.find((player) => player.id === "human-2")!;
  owner.hole = ["AS", "AH"];
  friend.hole = ["KS", "KH"];
  state.board = ["AC", "AD", "2C", "3D", "4H"];
  state.phase = "river";
  state.currentBet = 0;
  state.turnSeat = owner.seat;
  owner.streetBet = 0;
  friend.streetBet = 0;
  owner.contribution = 100;
  friend.contribution = 100;
  owner.acted = false;
  friend.acted = true;

  applyPlayerAction(state, owner.id, "check");

  assert.equal(state.phase, "showdown");
  assert.equal(state.party?.playerStates[owner.id].credits, 1);
  assert.equal(state.party?.lastAwards[0]?.triggerId, "quads");
});

test("party wheel result is server-selected and a manual skill executes on demand", () => {
  const state = createInitialState({
    roomId: "room_party_spin",
    code: "TONG-PARTY2",
    name: "娱乐转盘测试",
    ownerId: "human-1",
    ownerName: "房主",
    ownerEmail: "host@example.com",
    maxPlayers: 6,
    startingChips: 5000,
    smallBlind: 20,
    bigBlind: 40,
    bots: 1,
    roomMode: "party",
    partyTriggers: ["all_in_win"],
  });
  state.party!.playerStates["human-1"].credits = 1;
  const spin = spinPartyWheel(state, "human-1", "human-1", () => 0);

  assert.equal(spin.effectId, "sky_eye");
  assert.equal(state.party?.playerStates["human-1"].credits, 0);
  assert.equal(state.party?.playerStates["human-1"].effects[0].status, "pending");

  startHand(state);
  const runtimeEffect = state.party!.playerStates["human-1"].effects[0];
  assert.equal(runtimeEffect.status, "pending");
  activatePartyEffect(state, "human-1", runtimeEffect.id);
  const bot = state.players.find((player) => player.isBot)!;
  assert.equal(runtimeEffect.status, "used");
  assert.equal(toPublicView(state, "human-1").players.find((player) => player.id === bot.id)?.hole?.length, 1);
  assert.equal(state.party?.effectEvents.at(-1)?.kind, "executed");
  assert.ok(!toPublicView(state, bot.id).party?.effectEvents.some((event) => event.detail.startsWith("已私下查看")));
});

test("manual public-card effects arm before the street and show the real redraw to everyone", () => {
  const state = createInitialState({
    roomId: "room_party_redraw",
    code: "TONG-PARTY4",
    name: "公共牌重铸测试",
    ownerId: "human-1",
    ownerName: "房主",
    ownerEmail: "host@example.com",
    maxPlayers: 6,
    startingChips: 5000,
    smallBlind: 20,
    bigBlind: 40,
    bots: 1,
    roomMode: "party",
  });
  const owner = state.players.find((player) => player.id === "human-1")!;
  const bot = state.players.find((player) => player.isBot)!;
  state.phase = "flop";
  state.board = ["2S", "3H", "4D"];
  state.currentBet = 0;
  state.turnSeat = owner.seat;
  owner.folded = false;
  owner.allIn = false;
  owner.acted = false;
  owner.streetBet = 0;
  bot.folded = false;
  bot.allIn = true;
  bot.acted = true;
  bot.streetBet = 0;
  const effect: PartyRuntimeEffect = {
    id: "effect-turn-redraw",
    effectId: "turn_redraw",
    awardedHand: state.handNumber - 1,
    appliesHand: state.handNumber,
    status: "pending",
  };
  state.party!.playerStates[owner.id].effects.push(effect);

  activatePartyEffect(state, owner.id, effect.id);
  assert.equal(effect.status, "active");
  applyPlayerAction(state, owner.id, "check");

  assert.equal(effect.status, "used");
  const event = [...state.party!.effectEvents].reverse().find((item) => item.effectId === "turn_redraw" && item.kind === "executed")!;
  assert.equal(event.presentation, "board_redraw");
  assert.equal(event.cards?.length, 2);
  assert.ok(event.cards?.[1] && state.board.includes(event.cards[1]));
  assert.match(event.detail, /作废/);
});

test("unused manual party skills expire after their one-hand window", () => {
  const state = createInitialState({
    roomId: "room_party_expiry",
    code: "TONG-PARTY5",
    name: "技能过期测试",
    ownerId: "human-1",
    ownerName: "房主",
    ownerEmail: "host@example.com",
    maxPlayers: 6,
    startingChips: 5000,
    smallBlind: 20,
    bigBlind: 40,
    bots: 1,
    roomMode: "party",
  });
  state.party!.playerStates["human-1"].credits = 1;
  spinPartyWheel(state, "human-1", "human-1", () => 0);
  const effect = state.party!.playerStates["human-1"].effects[0];
  startHand(state);
  state.phase = "showdown";
  startHand(state);

  assert.equal(effect.status, "expired");
  assert.match(effect.detail ?? "", /自动失效/);
  assert.ok(state.party?.effectEvents.some((event) => event.kind === "expired" && event.effectId === "sky_eye"));
});

test("pass-left is armed before the hand, really transfers cards and broadcasts the execution", () => {
  const state = createInitialState({
    roomId: "room_party_pass",
    code: "TONG-PARTY6",
    name: "传牌效果测试",
    ownerId: "human-1",
    ownerName: "房主",
    ownerEmail: "host@example.com",
    maxPlayers: 6,
    startingChips: 5000,
    smallBlind: 20,
    bigBlind: 40,
    bots: 2,
    roomMode: "party",
  });
  state.phase = "showdown";
  const effect: PartyRuntimeEffect = {
    id: "effect-pass-left",
    effectId: "pass_left",
    awardedHand: state.handNumber,
    appliesHand: state.handNumber + 1,
    status: "pending",
  };
  state.party!.playerStates["human-1"].effects.push(effect);

  activatePartyEffect(state, "human-1", effect.id);
  assert.equal(effect.status, "active");
  startHand(state);

  assert.equal(effect.status, "used");
  const holeCards = state.players.flatMap((player) => player.hole);
  assert.equal(new Set(holeCards).size, holeCards.length);
  assert.ok(state.party?.effectEvents.some((event) => event.effectId === "pass_left" && event.kind === "executed" && event.presentation === "pass_left"));
});

test("host controls party triggers and no-raise is enforced by the server", () => {
  const state = createInitialState({
    roomId: "room_party_rules",
    code: "TONG-PARTY3",
    name: "娱乐规则测试",
    ownerId: "human-1",
    ownerName: "房主",
    ownerEmail: "host@example.com",
    maxPlayers: 6,
    startingChips: 5000,
    smallBlind: 20,
    bigBlind: 40,
    bots: 1,
    roomMode: "party",
  });
  configurePartyRules(state, "human-1", ["quads", "seven_two"]);
  assert.deepEqual(state.party?.enabledTriggers, ["quads", "seven_two"]);
  assert.throws(() => configurePartyRules(state, state.players.find((player) => player.isBot)!.id, ["quads"]), /只有房主/);

  state.party!.playerStates["human-1"].effects.push({
    id: "effect-no-raise",
    effectId: "no_raise",
    awardedHand: state.handNumber - 1,
    appliesHand: state.handNumber,
    status: "active",
  });
  assert.equal(toPublicView(state, "human-1").validActions.canRaise, false);
  assert.throws(() => applyPlayerAction(state, "human-1", "raise", 80), /禁止加注/);
});
