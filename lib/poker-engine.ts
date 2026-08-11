import type {
  CardCode,
  GamePhase,
  GamePlayer,
  PartyEffectEventKind,
  PartyEffectId,
  PartyEffectPresentation,
  PartyGameState,
  PartyPlayerState,
  PartyRuntimeEffect,
  PartyTriggerId,
  PlayerAction,
  PokerGameState,
  PublicGameView,
  Rank,
  Suit,
} from "./poker-types";
import { DEALER_PRESETS, DEFAULT_DEALER } from "./dealer-options";
import { DEFAULT_PARTY_TRIGGERS, ONLINE_PARTY_EFFECTS, ONLINE_PARTY_TRIGGERS, partyEffect, partyTrigger } from "./online-party";
import { getTablePositions } from "./table-positions";

const ranks: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const suits: Suit[] = ["S", "H", "D", "C"];
const rankValue: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

const phaseLabel: Record<GamePhase, string> = {
  waiting: "等待开局",
  preflop: "翻牌前",
  flop: "翻牌圈",
  turn: "转牌圈",
  river: "河牌圈",
  showdown: "摊牌",
};

function id(prefix = "evt") {
  return `${prefix}_${Date.now().toString(36)}_${randomInt(1_000_000).toString(36)}`;
}

function randomInt(max: number) {
  if (max <= 1) return 0;
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= limit);
  return values[0] % max;
}

function shuffledDeck(): CardCode[] {
  const deck = suits.flatMap((suit) => ranks.map((rank) => `${rank}${suit}` as CardCode));
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

function addLog(state: PokerGameState, text: string, kind: "action" | "system" | "result" = "action") {
  state.logs.push({ id: id("log"), text, at: Date.now(), kind });
  state.logs = state.logs.slice(-36);
}

function orderedPlayers(state: PokerGameState) {
  return [...state.players].sort((a, b) => a.seat - b.seat);
}

function nextPlayer(
  state: PokerGameState,
  afterSeat: number,
  predicate: (player: GamePlayer) => boolean,
) {
  const players = orderedPlayers(state);
  for (let offset = 1; offset <= state.maxPlayers; offset += 1) {
    const seat = (afterSeat + offset) % state.maxPlayers;
    const player = players.find((item) => item.seat === seat);
    if (player && predicate(player)) return player;
  }
  return null;
}

function playersInHand(state: PokerGameState) {
  return state.players.filter((player) => player.hole.length === 2 && !player.folded);
}

function playersWhoCanAct(state: PokerGameState) {
  return playersInHand(state).filter((player) => !player.allIn && player.chips > 0);
}

function draw(state: PokerGameState) {
  const card = state.deck.pop();
  if (!card) throw new Error("牌堆已空");
  return card;
}

function burn(state: PokerGameState) {
  draw(state);
}

function postBlind(state: PokerGameState, player: GamePlayer, amount: number, label: string) {
  const paid = Math.min(player.chips, amount);
  player.chips -= paid;
  player.streetBet += paid;
  player.contribution += paid;
  player.allIn = player.chips === 0;
  player.lastAction = `${label} ${paid}`;
  addLog(state, `${player.name} 支付${label} ${paid}`);
}

function setTurn(state: PokerGameState, seat: number | null) {
  state.turnSeat = seat;
  state.actionDeadline = seat === null ? null : Date.now() + 25_000;
}

function handReadyPlayers(state: PokerGameState) {
  return state.players.filter((player) => player.chips > 0);
}

function ensurePauseState(state: PokerGameState) {
  state.paused ??= false;
  state.pausedAt ??= null;
  state.pausedByName ??= null;
}

function ensurePartyPlayer(state: PokerGameState, playerId: string): PartyPlayerState {
  const party = ensurePartyState(state);
  party.playerStates[playerId] ??= { playerId, credits: 0, achievementCount: 0, effects: [] };
  return party.playerStates[playerId];
}

function ensurePartyState(state: PokerGameState): PartyGameState {
  state.party ??= {
    enabledTriggers: [...DEFAULT_PARTY_TRIGGERS],
    maxStoredCredits: 3,
    playerStates: {},
    reveals: [],
    turnLeaderIds: [],
    lastAwards: [],
    effectEvents: [],
  };
  state.party.effectEvents ??= [];
  state.players.forEach((player) => {
    state.party!.playerStates[player.id] ??= { playerId: player.id, credits: 0, achievementCount: 0, effects: [] };
  });
  return state.party;
}

function partyEffectsFor(
  state: PokerGameState,
  effectId: PartyEffectId,
  playerId?: string,
) {
  if (state.roomMode !== "party") return [] as Array<{ owner: GamePlayer; effect: PartyRuntimeEffect }>;
  const party = ensurePartyState(state);
  return state.players.flatMap((owner) => {
    if (playerId && owner.id !== playerId) return [];
    const runtime = party.playerStates[owner.id];
    return (runtime?.effects ?? [])
      .filter((effect) => effect.effectId === effectId && effect.status === "active" && effect.appliesHand === state.handNumber)
      .map((effect) => ({ owner, effect }));
  });
}

function effectPresentation(effectId: PartyEffectId): PartyEffectPresentation {
  if (["sky_eye", "public_card", "get_peeked", "open_card", "river_judgement"].includes(effectId)) return "reveal";
  if (["redraw_one", "redraw_hand"].includes(effectId)) return "hole_redraw";
  if (["turn_redraw", "river_redraw", "random_turn"].includes(effectId)) return "board_redraw";
  if (effectId === "pass_left") return "pass_left";
  if (effectId === "seat_swap" || effectId === "emperor_button") return "seat_swap";
  if (effectId === "peek_shield") return "shield";
  return "rule";
}

function addPartyEffectEvent(
  state: PokerGameState,
  owner: GamePlayer,
  effectId: PartyEffectId,
  kind: PartyEffectEventKind,
  title: string,
  detail: string,
  options?: { visibility?: "all" | string; presentation?: PartyEffectPresentation; cards?: CardCode[] },
) {
  const definition = partyEffect(effectId);
  const party = ensurePartyState(state);
  party.effectEvents.push({
    id: id("party_event"),
    playerId: owner.id,
    playerName: owner.name,
    effectId,
    effectName: definition?.name ?? effectId,
    emoji: definition?.emoji ?? "✦",
    kind,
    title,
    detail,
    handNumber: state.handNumber,
    at: Date.now(),
    visibility: options?.visibility ?? "all",
    presentation: options?.presentation ?? effectPresentation(effectId),
    cards: options?.cards,
  });
  party.effectEvents = party.effectEvents.slice(-30);
}

function consumePartyEffect(
  state: PokerGameState,
  owner: GamePlayer,
  effect: PartyRuntimeEffect,
  detail: string,
  options?: { visibility?: "all" | string; presentation?: PartyEffectPresentation; cards?: CardCode[]; title?: string },
) {
  if (effect.status === "used") return;
  effect.status = "used";
  effect.detail = detail;
  const name = partyEffect(effect.effectId)?.name ?? effect.effectId;
  addPartyEffectEvent(state, owner, effect.effectId, "executed", options?.title ?? `「${name}」已执行`, detail, options);
}

function expirePartyEffect(state: PokerGameState, owner: GamePlayer, effect: PartyRuntimeEffect, detail: string) {
  if (effect.status === "used" || effect.status === "expired") return;
  effect.status = "expired";
  effect.detail = detail;
  const name = partyEffect(effect.effectId)?.name ?? effect.effectId;
  addPartyEffectEvent(state, owner, effect.effectId, "expired", `「${name}」已过期`, detail, { presentation: "rule" });
}

function randomOther(players: GamePlayer[], playerId: string) {
  const others = players.filter((player) => player.id !== playerId && player.hole.length === 2 && !player.folded);
  return others.length ? others[randomInt(others.length)] : null;
}

function tryPartyReveal(state: PokerGameState, owner: GamePlayer, viewerId: string | "all", target: GamePlayer, source: PartyRuntimeEffect) {
  const shield = partyEffectsFor(state, "peek_shield", target.id)[0];
  if (shield) {
    consumePartyEffect(state, target, shield.effect, `抵消了「${partyEffect(source.effectId)?.name ?? "看牌"}」`, { presentation: "shield" });
    consumePartyEffect(state, owner, source, `被 ${target.name} 的防窥盾抵消`, { presentation: "shield" });
    addLog(state, `${target.name} 的防窥盾抵消了一次看牌效果`, "system");
    return;
  }
  const cardIndex = randomInt(2);
  ensurePartyState(state).reveals.push({ viewerId, playerId: target.id, cardIndex, handNumber: state.handNumber });
  if (viewerId !== "all") addPartyEffectEvent(state, owner, source.effectId, "executed", `${owner.name} 使用了「${partyEffect(source.effectId)?.name ?? "看牌"}」`, "服务器已私下向技能持有者展示一张对手底牌。", { presentation: "reveal" });
  consumePartyEffect(state, owner, source, viewerId === "all" ? `${target.name} 的一张底牌已向全桌公开` : `已私下查看 ${target.name} 的一张底牌`, { visibility: viewerId === "all" ? "all" : owner.id, presentation: "reveal" });
  addLog(state, viewerId === "all" ? `${target.name} 的一张底牌因娱乐效果公开` : `服务器已执行一次私密看牌效果`, "system");
}

function preparePartyHand(state: PokerGameState, ready: GamePlayer[]) {
  if (state.roomMode !== "party") return null;
  const party = ensurePartyState(state);
  party.reveals = [];
  party.turnLeaderIds = [];
  party.lastAwards = [];
  state.players.forEach((owner) => party.playerStates[owner.id]?.effects.forEach((effect) => {
    const definition = partyEffect(effect.effectId);
    const persistsUntilUsed = effect.effectId === "free_big_blind";
    if ((effect.status === "pending" || effect.status === "active") && effect.appliesHand < state.handNumber) {
      if (persistsUntilUsed) {
        effect.status = "active";
        effect.appliesHand = state.handNumber;
      } else {
        expirePartyEffect(state, owner, effect, "限定手牌已经结束，未使用的效果自动失效");
      }
    }
    if (effect.status === "pending" && effect.appliesHand === state.handNumber) {
      if (definition?.control === "automatic") {
        effect.status = "active";
        addPartyEffectEvent(state, owner, effect.effectId, "armed", `${owner.name} 的「${definition.name}」自动生效`, definition.useWindowLabel, { presentation: effectPresentation(effect.effectId) });
      } else if (definition?.useWindow === "before_hand") {
        if (owner.isBot) {
          effect.status = "active";
          addPartyEffectEvent(state, owner, effect.effectId, "armed", `${owner.name} 激活「${definition.name}」`, "机器人已在开局前自动使用，服务器将在本手执行。", { presentation: effectPresentation(effect.effectId) });
        } else {
          expirePartyEffect(state, owner, effect, "没有在本手开始前点击使用");
        }
      }
    }
  }));

  for (const { owner, effect } of partyEffectsFor(state, "seat_swap")) {
    if (!ready.includes(owner)) continue;
    const candidates = ready.filter((player) => player.id !== owner.id);
    const target = candidates.length ? candidates[randomInt(candidates.length)] : null;
    if (target) {
      [owner.seat, target.seat] = [target.seat, owner.seat];
      consumePartyEffect(state, owner, effect, `与 ${target.name} 交换座位，双方筹码保持不变`, { presentation: "seat_swap" });
      addLog(state, `娱乐效果：${owner.name} 与 ${target.name} 交换座位`, "system");
    }
  }

  const emperor = partyEffectsFor(state, "emperor_button")[0];
  if (emperor && ready.includes(emperor.owner)) {
    consumePartyEffect(state, emperor.owner, emperor.effect, "本手 Button 已移交给技能持有者", { presentation: "seat_swap" });
    addLog(state, `娱乐效果：${emperor.owner.name} 获得皇帝 Button`, "system");
    return emperor.owner;
  }
  return null;
}

function applyPartyHoleEffects(state: PokerGameState, ready: GamePlayer[]) {
  if (state.roomMode !== "party") return;

  for (const { owner, effect } of partyEffectsFor(state, "redraw_hand")) {
    if (owner.hole.length === 2) {
      owner.hole = [draw(state), draw(state)];
      consumePartyEffect(state, owner, effect, "两张底牌已由服务器重发", { presentation: "hole_redraw" });
      addLog(state, `娱乐效果：${owner.name} 整手重抽`, "system");
    }
  }
  for (const { owner, effect } of partyEffectsFor(state, "redraw_one")) {
    if (owner.hole.length === 2) {
      const index = randomInt(2);
      owner.hole[index] = draw(state);
      consumePartyEffect(state, owner, effect, `第 ${index + 1} 张底牌已由服务器重发`, { presentation: "hole_redraw" });
      addLog(state, `娱乐效果：${owner.name} 换了一张底牌`, "system");
    }
  }

  const passLeft = partyEffectsFor(state, "pass_left").find(({ owner }) => ready.includes(owner));
  if (passLeft) {
    const ordered = [...ready].filter((player) => player.hole.length === 2).sort((a, b) => a.seat - b.seat);
    if (ordered.length > 1) {
      const passing = ordered.map((player) => {
        const index = randomInt(2);
        return { index, card: player.hole[index] };
      });
      const nextHoles = ordered.map((player) => [...player.hole]);
      passing.forEach((item, senderIndex) => {
        const receiverIndex = (senderIndex + 1) % ordered.length;
        nextHoles[receiverIndex][passing[receiverIndex].index] = item.card;
      });
      ordered.forEach((player, index) => { player.hole = nextHoles[index] as CardCode[]; });
      consumePartyEffect(state, passLeft.owner, passLeft.effect, `所有 ${ordered.length} 名玩家已随机向左传递一张底牌`, { presentation: "pass_left" });
      addLog(state, "娱乐效果：乾坤大挪移已由服务器完成", "system");
    }
  }

  for (const { owner, effect } of partyEffectsFor(state, "open_card")) {
    if (owner.hole.length !== 2) continue;
    ensurePartyState(state).reveals.push({ viewerId: "all", playerId: owner.id, cardIndex: randomInt(2), handNumber: state.handNumber });
    consumePartyEffect(state, owner, effect, "一张底牌已向全桌公开", { presentation: "reveal" });
  }
  for (const { owner, effect } of partyEffectsFor(state, "sky_eye")) {
    if (owner.hole.length !== 2) continue;
    const target = randomOther(ready, owner.id);
    if (target) tryPartyReveal(state, owner, owner.id, target, effect);
  }
  for (const { owner, effect } of partyEffectsFor(state, "public_card")) {
    if (owner.hole.length !== 2) continue;
    const target = randomOther(ready, owner.id);
    if (target) tryPartyReveal(state, owner, "all", target, effect);
  }
  for (const { owner, effect } of partyEffectsFor(state, "get_peeked")) {
    if (owner.hole.length !== 2) continue;
    const viewer = randomOther(ready, owner.id);
    if (viewer) tryPartyReveal(state, owner, viewer.id, owner, effect);
  }
}

export function startHand(state: PokerGameState) {
  ensurePauseState(state);
  if (state.paused) throw new Error("牌桌已暂停，请先由房主恢复牌局");
  state.roomMode ??= "classic";
  state.players = state.players.filter((player) => !player.isKicked);
  state.players.forEach((player) => {
    player.totalBuyIn ??= state.startingChips;
    const pending = player.pendingRebuy ?? 0;
    if (pending > 0) {
      player.chips += pending;
      player.pendingRebuy = 0;
      addLog(state, `${player.name} 补充 ${pending.toLocaleString()} 筹码`, "system");
    }
  });
  let ready = handReadyPlayers(state);
  if (ready.length < 2 && state.players.length >= 2) {
    state.players.forEach((player) => {
      player.chips = state.startingChips;
      player.totalBuyIn = state.startingChips;
      player.pendingRebuy = 0;
    });
    addLog(state, "筹码已重置，新一轮友谊赛开始", "system");
    ready = handReadyPlayers(state);
  }
  if (ready.length < 2) {
    state.phase = "waiting";
    setTurn(state, null);
    state.resultText = "至少需要两位玩家才能开始";
    return state;
  }

  state.handNumber += 1;
  const forcedDealer = preparePartyHand(state, ready);
  const previousDealer = state.dealerSeat;
  const dealer = forcedDealer ?? (state.handNumber === 1
    ? [...ready].sort((a, b) => a.seat - b.seat)[0]
    : nextPlayer(state, previousDealer, (player) => player.chips > 0) ?? ready[0]);
  state.dealerSeat = dealer.seat;
  state.deck = shuffledDeck();
  state.board = [];
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
  state.lastPot = 0;
  state.resultText = "";
  state.nextHandAt = null;
  state.actionFeed = [];
  state.lastHandResults = [];

  state.players.forEach((player) => {
    player.streetBet = 0;
    player.contribution = 0;
    player.hole = [];
    player.folded = player.chips <= 0;
    player.allIn = false;
    player.acted = false;
    player.lastAction = player.chips <= 0 ? "等待补充筹码" : "等待行动";
    player.handStartChips = player.chips;
  });

  const dealOrder: GamePlayer[] = [];
  let cursor = dealer.seat;
  for (let index = 0; index < ready.length; index += 1) {
    const player = nextPlayer(state, cursor, (candidate) => candidate.chips > 0 && !dealOrder.includes(candidate));
    if (!player) break;
    dealOrder.push(player);
    cursor = player.seat;
  }
  for (let round = 0; round < 2; round += 1) {
    dealOrder.forEach((player) => player.hole.push(draw(state)));
  }
  applyPartyHoleEffects(state, ready);

  const headsUp = ready.length === 2;
  const smallBlindPlayer = headsUp
    ? dealer
    : nextPlayer(state, dealer.seat, (player) => player.hole.length === 2)!;
  const bigBlindPlayer = nextPlayer(state, smallBlindPlayer.seat, (player) => player.hole.length === 2)!;
  postBlind(state, smallBlindPlayer, state.smallBlind, "小盲");
  const freeBigBlind = partyEffectsFor(state, "free_big_blind", bigBlindPlayer.id)[0];
  if (freeBigBlind) {
    bigBlindPlayer.lastAction = "免大盲";
    consumePartyEffect(state, bigBlindPlayer, freeBigBlind.effect, "服务器已免除本手大盲", { presentation: "rule" });
    addLog(state, `娱乐效果：${bigBlindPlayer.name} 免除本手大盲`, "system");
  } else {
    postBlind(state, bigBlindPlayer, state.bigBlind, "大盲");
  }
  state.currentBet = Math.max(smallBlindPlayer.streetBet, bigBlindPlayer.streetBet);
  state.phase = "preflop";
  if (state.roomMode === "party") {
    state.players.filter((player) => player.isBot).forEach((bot) => {
      const effects = ensurePartyPlayer(state, bot.id).effects.filter((effect) => {
        const definition = partyEffect(effect.effectId);
        return effect.status === "pending" && effect.appliesHand === state.handNumber && definition?.control === "manual";
      });
      effects.forEach((effect) => {
        try { activatePartyEffect(state, state.ownerId, effect.id); } catch { /* bot skips effects without a legal target */ }
      });
    });
  }
  const first = nextPlayer(state, bigBlindPlayer.seat, (player) => player.hole.length === 2 && !player.allIn);
  setTurn(state, first?.seat ?? null);
  addLog(state, `第 ${state.handNumber} 手牌已由服务器洗牌并发出`, "system");
  state.updatedAt = Date.now();

  if (playersWhoCanAct(state).length <= 1) runBoardToShowdown(state);
  return runBots(state);
}

function streetComplete(state: PokerGameState) {
  const actors = playersWhoCanAct(state);
  if (actors.length === 0) return true;
  return actors.every((player) => player.acted && player.streetBet === state.currentBet);
}

function captureHandResults(state: PokerGameState, winnerIds: Set<string>) {
  state.lastHandResults = state.players
    .filter((player) => player.hole.length === 2)
    .map((player) => {
      const chipsBefore = player.handStartChips ?? player.chips;
      return {
        playerId: player.id,
        playerName: player.name,
        chipsBefore,
        chipsAfter: player.chips,
        net: player.chips - chipsBefore,
        won: winnerIds.has(player.id),
      };
    });
}

function finishUncontested(state: PokerGameState, winner: GamePlayer) {
  const pot = state.players.reduce((sum, player) => sum + player.contribution, 0);
  winner.chips += pot;
  if (state.roomMode === "party") {
    if (winner.allIn) awardPartyCredit(state, winner, "all_in_win");
    if (state.players.some((player) => player.id !== winner.id && player.hole.length === 2 && player.chips === 0)) {
      awardPartyCredit(state, winner, "knockout");
    }
    if (winner.isBot && ensurePartyPlayer(state, winner.id).credits > 0) spinPartyWheel(state, state.ownerId, winner.id);
  }
  state.lastPot = pot;
  state.resultText = `${winner.name} 赢得 ${pot.toLocaleString()} 筹码`;
  captureHandResults(state, new Set([winner.id]));
  addLog(state, state.resultText, "result");
  state.players.forEach((player) => {
    player.streetBet = 0;
    player.contribution = 0;
  });
  state.phase = "showdown";
  setTurn(state, null);
  state.nextHandAt = Date.now() + (state.roomMode === "party" ? 15_000 : 8_000);
}

function drawPartyStreetCard(state: PokerGameState, street: "turn" | "river") {
  if (state.roomMode !== "party") return draw(state);
  if (street === "turn") {
    const redraw = partyEffectsFor(state, "turn_redraw").find(({ owner }) => !owner.folded);
    const randomTurn = partyEffectsFor(state, "random_turn").find(({ owner }) => !owner.folded);
    if (redraw) {
      const voided = draw(state);
      const accepted = draw(state);
      consumePartyEffect(state, redraw.owner, redraw.effect, `第一张 Turn ${voided} 作废，第二张 ${accepted} 生效并必须接受`, { presentation: "board_redraw", cards: [voided, accepted] });
      addLog(state, `娱乐效果：Turn ${voided} 作废，重发 ${accepted} 并必须接受`, "system");
      return accepted;
    }
    if (randomTurn) {
      const first = draw(state);
      const second = draw(state);
      const accepted = randomInt(2) === 0 ? first : second;
      consumePartyEffect(state, randomTurn.owner, randomTurn.effect, `Turn 候选 ${first}/${second}，服务器随机选择 ${accepted} 生效`, { presentation: "board_redraw", cards: [first, second, accepted] });
      addLog(state, `娱乐效果：随机 Turn 候选 ${first}/${second}，${accepted} 生效`, "system");
      return accepted;
    }
  }
  if (street === "river") {
    const redraw = partyEffectsFor(state, "river_redraw").find(({ owner }) => !owner.folded);
    if (redraw) {
      const voided = draw(state);
      const accepted = draw(state);
      consumePartyEffect(state, redraw.owner, redraw.effect, `第一张 River ${voided} 作废，第二张 ${accepted} 生效并必须接受`, { presentation: "board_redraw", cards: [voided, accepted] });
      addLog(state, `娱乐效果：River ${voided} 作废，重发 ${accepted} 并必须接受`, "system");
      return accepted;
    }
  }
  return draw(state);
}

function rememberTurnLeaders(state: PokerGameState) {
  if (state.roomMode !== "party" || state.board.length !== 4) return;
  const contenders = playersInHand(state);
  if (!contenders.length) return;
  const scores = new Map(contenders.map((player) => [player.id, bestScore([...player.hole, ...state.board])]));
  let best = scores.get(contenders[0].id)!;
  contenders.forEach((player) => {
    const score = scores.get(player.id)!;
    if (compareScore(score, best) > 0) best = score;
  });
  ensurePartyState(state).turnLeaderIds = contenders
    .filter((player) => compareScore(scores.get(player.id)!, best) === 0)
    .map((player) => player.id);
}

function applyRiverJudgement(state: PokerGameState) {
  for (const { owner, effect } of partyEffectsFor(state, "river_judgement")) {
    if (owner.folded) continue;
    ensurePartyState(state).reveals.push({ viewerId: "all", playerId: owner.id, cardIndex: randomInt(2), handNumber: state.handNumber });
    consumePartyEffect(state, owner, effect, "River 发出后，一张底牌已向全桌公开", { presentation: "reveal" });
    addLog(state, `娱乐效果：河牌审判公开了 ${owner.name} 的一张底牌`, "system");
  }
}

function advanceStreet(state: PokerGameState) {
  state.players.forEach((player) => {
    player.streetBet = 0;
    player.acted = false;
    if (!player.folded && !player.allIn) player.lastAction = "等待行动";
  });
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
  burn(state);

  if (state.phase === "preflop") {
    state.phase = "flop";
    state.board.push(draw(state), draw(state), draw(state));
  } else if (state.phase === "flop") {
    state.phase = "turn";
    state.board.push(drawPartyStreetCard(state, "turn"));
    rememberTurnLeaders(state);
  } else if (state.phase === "turn") {
    state.phase = "river";
    state.board.push(drawPartyStreetCard(state, "river"));
    applyRiverJudgement(state);
  }
  addLog(state, `${phaseLabel[state.phase]}开始`, "system");

  const first = nextPlayer(state, state.dealerSeat, (player) =>
    player.hole.length === 2 && !player.folded && !player.allIn && player.chips > 0,
  );
  setTurn(state, first?.seat ?? null);

  if (playersWhoCanAct(state).length <= 1) runBoardToShowdown(state);
}

function advanceAfterAction(state: PokerGameState, actorSeat: number) {
  const remaining = playersInHand(state);
  if (remaining.length === 1) {
    finishUncontested(state, remaining[0]);
    return;
  }

  if (streetComplete(state)) {
    if (state.phase === "river") finishShowdown(state);
    else advanceStreet(state);
    return;
  }

  const next = nextPlayer(state, actorSeat, (player) =>
    player.hole.length === 2 && !player.folded && !player.allIn && player.chips > 0,
  );
  setTurn(state, next?.seat ?? null);
  if (!next) runBoardToShowdown(state);
}

function applyActionInternal(
  state: PokerGameState,
  actor: GamePlayer,
  action: PlayerAction,
  requestedAmount?: number,
) {
  const callAmount = Math.max(0, state.currentBet - actor.streetBet);
  let actionLabel = "";
  let actionAmount = 0;

  if (action === "fold") {
    actor.folded = true;
    actor.acted = true;
    actor.lastAction = "弃牌";
    actionLabel = "弃牌";
    addLog(state, `${actor.name} 弃牌`);
  } else if (action === "check") {
    if (callAmount !== 0) throw new Error("当前不能过牌");
    actor.acted = true;
    actor.lastAction = "过牌";
    actionLabel = "过牌";
    addLog(state, `${actor.name} 过牌`);
  } else if (action === "call") {
    if (callAmount <= 0) throw new Error("当前无需跟注");
    const paid = Math.min(callAmount, actor.chips);
    actor.chips -= paid;
    actor.streetBet += paid;
    actor.contribution += paid;
    actor.allIn = actor.chips === 0;
    actor.acted = true;
    actor.lastAction = actor.allIn ? `全下 ${paid}` : `跟注 ${paid}`;
    actionLabel = actor.allIn ? "全下" : "跟注";
    actionAmount = paid;
    addLog(state, `${actor.name} ${actor.allIn ? "全下" : "跟注"} ${paid}`);
  } else {
    const noRaise = state.phase === "preflop" && partyEffectsFor(state, "no_raise", actor.id)[0];
    if (noRaise) throw new Error("娱乐效果「禁止加注」生效中：Preflop 只能弃牌、过牌或跟注");
    const maxTarget = actor.streetBet + actor.chips;
    const target = Math.floor(requestedAmount ?? 0);
    if (target <= state.currentBet) throw new Error("加注金额必须高于当前下注");
    if (target > maxTarget) throw new Error("筹码不足");
    const raiseSize = target - state.currentBet;
    const isAllIn = target === maxTarget;
    const miniRaise = state.phase === "preflop" && partyEffectsFor(state, "mini_raise", actor.id)[0];
    if (miniRaise && target !== Math.min(maxTarget, state.currentBet + state.minRaise)) {
      throw new Error(`娱乐效果「Mini Raise」生效中：第一次只能加注到 ${Math.min(maxTarget, state.currentBet + state.minRaise)}`);
    }
    if (raiseSize < state.minRaise && !isAllIn) {
      throw new Error(`最小加注到 ${state.currentBet + state.minRaise}`);
    }
    const paid = target - actor.streetBet;
    actor.chips -= paid;
    actor.streetBet = target;
    actor.contribution += paid;
    actor.allIn = actor.chips === 0;
    state.players.forEach((player) => {
      if (player.id !== actor.id && !player.folded && !player.allIn) player.acted = false;
    });
    actor.acted = true;
    if (raiseSize >= state.minRaise) state.minRaise = raiseSize;
    state.currentBet = target;
    actor.lastAction = actor.allIn ? `全下 ${target}` : `加注到 ${target}`;
    actionLabel = actor.allIn ? "全下" : "加注到";
    actionAmount = target;
    addLog(state, `${actor.name} ${actor.allIn ? "全下" : "加注到"} ${target}`);
    if (miniRaise) consumePartyEffect(state, actor, miniRaise.effect, `已执行最小加注到 ${target}`, { presentation: "rule" });
  }

  const actionAt = Date.now();
  state.actionFeed = [...(state.actionFeed ?? []), {
    id: id("move"),
    playerId: actor.id,
    playerName: actor.name,
    isBot: actor.isBot,
    action,
    label: actionLabel,
    amount: actionAmount,
    at: actionAt,
  }].slice(-6);
  state.updatedAt = actionAt;
  advanceAfterAction(state, actor.seat);
}

export function applyPlayerAction(
  state: PokerGameState,
  userId: string,
  action: PlayerAction,
  amount?: number,
) {
  ensurePauseState(state);
  if (state.paused) throw new Error("牌桌已暂停，暂时不能操作");
  if (!["preflop", "flop", "turn", "river"].includes(state.phase)) {
    throw new Error("当前牌局不能操作");
  }
  const actor = state.players.find((player) => player.id === userId);
  if (!actor || actor.seat !== state.turnSeat) throw new Error("还没轮到你");
  if (actor.folded || actor.allIn) throw new Error("本手已无法继续操作");
  applyActionInternal(state, actor, action, amount);
  return runBots(state);
}

function botDecision(state: PokerGameState, bot: GamePlayer): { action: PlayerAction; amount?: number } {
  const callAmount = Math.max(0, state.currentBet - bot.streetBet);
  const roll = randomInt(100);
  const noRaise = state.phase === "preflop" && partyEffectsFor(state, "no_raise", bot.id).length > 0;
  const miniRaise = state.phase === "preflop" && partyEffectsFor(state, "mini_raise", bot.id).length > 0;
  if (callAmount === 0) {
    if (!noRaise && roll < 17 && bot.chips >= state.bigBlind * 2) {
      return { action: "raise", amount: Math.min(bot.streetBet + bot.chips, state.currentBet + state.minRaise) };
    }
    return { action: "check" };
  }
  if (callAmount >= bot.chips) return roll < 62 ? { action: "call" } : { action: "fold" };
  if (callAmount > bot.chips * 0.42 && roll < 68) return { action: "fold" };
  if (!noRaise && roll < 12 && bot.chips > callAmount + state.minRaise) {
    const target = miniRaise
      ? Math.min(bot.streetBet + bot.chips, state.currentBet + state.minRaise)
      : Math.min(bot.streetBet + bot.chips, state.currentBet + state.minRaise + randomInt(4) * state.bigBlind);
    return { action: "raise", amount: target };
  }
  return roll < 84 ? { action: "call" } : { action: "fold" };
}

export function runBots(state: PokerGameState) {
  ensurePauseState(state);
  if (state.paused) return state;
  let guard = 0;
  while (state.turnSeat !== null && guard < 40) {
    const bot = state.players.find((player) => player.seat === state.turnSeat);
    if (!bot?.isBot) break;
    const decision = botDecision(state, bot);
    applyActionInternal(state, bot, decision.action, decision.amount);
    guard += 1;
  }
  return state;
}

function runBoardToShowdown(state: PokerGameState) {
  while (state.board.length < 5) {
    burn(state);
    if (state.board.length === 0) state.board.push(draw(state), draw(state), draw(state));
    else if (state.board.length === 3) {
      state.board.push(drawPartyStreetCard(state, "turn"));
      rememberTurnLeaders(state);
    } else {
      state.board.push(drawPartyStreetCard(state, "river"));
      applyRiverJudgement(state);
    }
  }
  finishShowdown(state);
}

type Score = number[];

function fiveCardScore(cards: CardCode[]): Score {
  const values = cards.map((card) => rankValue[card[0] as Rank]).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card[1] === cards[0][1]);
  const unique = [...new Set(values)];
  if (unique[0] === 14) unique.push(1);
  let straightHigh = 0;
  for (let index = 0; index <= unique.length - 5; index += 1) {
    if (unique[index] - unique[index + 4] === 4) {
      straightHigh = unique[index];
      break;
    }
  }
  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)];
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    return [2, ...pairs, groups[2][0]];
  }
  if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)];
  return [0, ...values];
}

function compareScore(left: Score, right: Score) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) - (right[index] ?? 0);
  }
  return 0;
}

function bestScore(cards: CardCode[]) {
  let best: Score = [-1];
  for (let a = 0; a < cards.length - 4; a += 1)
    for (let b = a + 1; b < cards.length - 3; b += 1)
      for (let c = b + 1; c < cards.length - 2; c += 1)
        for (let d = c + 1; d < cards.length - 1; d += 1)
          for (let e = d + 1; e < cards.length; e += 1) {
            const score = fiveCardScore([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (compareScore(score, best) > 0) best = score;
          }
  return best;
}

const scoreNames = ["高牌", "一对", "两对", "三条", "顺子", "同花", "葫芦", "四条", "同花顺"];

function awardPartyCredit(state: PokerGameState, player: GamePlayer, triggerId: PartyTriggerId) {
  if (state.roomMode !== "party") return;
  const party = ensurePartyState(state);
  if (!party.enabledTriggers.includes(triggerId)) return;
  if (party.lastAwards.some((award) => award.playerId === player.id && award.triggerId === triggerId)) return;
  const runtime = ensurePartyPlayer(state, player.id);
  if (runtime.credits >= party.maxStoredCredits) {
    addLog(state, `${player.name} 触发「${partyTrigger(triggerId)?.name ?? triggerId}」，但转盘次数已达上限`, "system");
    return;
  }
  runtime.credits += 1;
  runtime.achievementCount += 1;
  const triggerName = partyTrigger(triggerId)?.name ?? triggerId;
  party.lastAwards.push({ id: id("award"), playerId: player.id, playerName: player.name, triggerId, triggerName, handNumber: state.handNumber, at: Date.now() });
  addLog(state, `娱乐成就：${player.name} 触发「${triggerName}」，获得 1 次转盘`, "result");
}

function processShowdownParty(
  state: PokerGameState,
  contenders: GamePlayer[],
  scored: Map<string, Score>,
  awards: Map<string, number>,
) {
  if (state.roomMode !== "party") return;
  const winners = contenders.filter((player) => (awards.get(player.id) ?? 0) > 0);
  winners.forEach((winner) => {
    const score = scored.get(winner.id)!;
    if (score[0] === 8) awardPartyCredit(state, winner, "straight_flush");
    if (score[0] === 7) awardPartyCredit(state, winner, "quads");
    if (score[0] === 6) awardPartyCredit(state, winner, "full_house");
    if (score[0] === 0) awardPartyCredit(state, winner, "high_card");
    const holeRanks = winner.hole.map((card) => card[0]).sort().join("");
    if (holeRanks === "27" && winner.hole[0][1] !== winner.hole[1][1]) awardPartyCredit(state, winner, "seven_two");
    if (winner.allIn) awardPartyCredit(state, winner, "all_in_win");
    if (ensurePartyState(state).turnLeaderIds.length && !ensurePartyState(state).turnLeaderIds.includes(winner.id)) {
      awardPartyCredit(state, winner, "river_comeback");
    }
    const knockedOut = state.players.some((player) => player.id !== winner.id && player.hole.length === 2 && player.chips === 0);
    if (knockedOut) awardPartyCredit(state, winner, "knockout");
  });
  contenders
    .filter((player) => !winners.includes(player) && (scored.get(player.id)?.[0] ?? 0) >= 6)
    .forEach((player) => awardPartyCredit(state, player, "bad_beat"));

  state.players.filter((player) => player.isBot).forEach((bot) => {
    const runtime = ensurePartyPlayer(state, bot.id);
    let guard = 0;
    while (runtime.credits > 0 && guard < 8) {
      spinPartyWheel(state, state.ownerId, bot.id);
      guard += 1;
    }
  });
}

function secureRandomFloat() {
  return randomInt(0x1_0000_0000) / 0x1_0000_0000;
}

export function configurePartyRules(state: PokerGameState, actorId: string, triggerIds: PartyTriggerId[]) {
  if (state.ownerId !== actorId) throw new Error("只有房主可以修改娱乐触发条件");
  if ((state.roomMode ?? "classic") !== "party") throw new Error("当前不是娱乐德州房间");
  const valid = [...new Set(triggerIds)].filter((triggerId) => ONLINE_PARTY_TRIGGERS.some((item) => item.id === triggerId));
  if (!valid.length) throw new Error("至少启用一个娱乐触发条件");
  ensurePartyState(state).enabledTriggers = valid;
  state.updatedAt = Date.now();
  addLog(state, `房主已更新娱乐触发条件，共 ${valid.length} 项`, "system");
  return valid;
}

export function setTablePaused(state: PokerGameState, actorId: string, paused: boolean) {
  ensurePauseState(state);
  if (state.ownerId !== actorId) throw new Error("只有房主可以暂停或恢复牌局");
  if (state.paused === paused) return state;
  const owner = state.players.find((player) => player.id === actorId);
  const now = Date.now();
  if (paused) {
    state.paused = true;
    state.pausedAt = now;
    state.pausedByName = owner?.name ?? "房主";
    addLog(state, `${state.pausedByName} 暂停了牌局，发牌与倒计时已冻结`, "system");
  } else {
    const pausedDuration = state.pausedAt ? Math.max(0, now - state.pausedAt) : 0;
    if (state.actionDeadline) state.actionDeadline += pausedDuration;
    if (state.nextHandAt) state.nextHandAt += pausedDuration;
    state.paused = false;
    state.pausedAt = null;
    state.pausedByName = null;
    addLog(state, `${owner?.name ?? "房主"} 恢复了牌局，倒计时继续`, "system");
  }
  state.updatedAt = now;
  return state;
}

function partyUseWindowOpen(state: PokerGameState, effect: PartyRuntimeEffect) {
  const definition = partyEffect(effect.effectId);
  if (!definition?.useWindow) return false;
  if (definition.useWindow === "before_hand") {
    return (state.phase === "waiting" || state.phase === "showdown") && effect.appliesHand === state.handNumber + 1;
  }
  if (effect.appliesHand !== state.handNumber) return false;
  if (definition.useWindow === "preflop") return state.phase === "preflop";
  if (definition.useWindow === "before_turn") return state.phase === "preflop" || state.phase === "flop";
  return state.phase === "preflop" || state.phase === "flop" || state.phase === "turn";
}

export function activatePartyEffect(state: PokerGameState, actorId: string, effectInstanceId: string) {
  ensurePauseState(state);
  if (state.paused) throw new Error("牌桌已暂停，恢复后才能使用效果");
  if ((state.roomMode ?? "classic") !== "party") throw new Error("当前不是娱乐德州房间");
  const party = ensurePartyState(state);
  const owner = state.players.find((player) => party.playerStates[player.id]?.effects.some((effect) => effect.id === effectInstanceId));
  const effect = owner ? party.playerStates[owner.id]?.effects.find((item) => item.id === effectInstanceId) : undefined;
  if (!owner || !effect) throw new Error("没有找到这个娱乐效果");
  if (actorId !== owner.id && !(owner.isBot && actorId === state.ownerId)) throw new Error("只能使用自己的娱乐效果");
  if (effect.status !== "pending") throw new Error(effect.status === "active" ? "这个效果已经激活" : "这个效果已经处理过了");
  const definition = partyEffect(effect.effectId);
  if (!definition || definition.control !== "manual") throw new Error("这个效果由服务器自动执行");
  if (!partyUseWindowOpen(state, effect)) throw new Error(`使用时机不正确：${definition.useWindowLabel}`);
  if (owner.hole.length === 2 && owner.folded && definition.useWindow !== "before_hand") throw new Error("你已经弃牌，无法在本手使用这个效果");

  if (definition.boardChanging) {
    const conflict = Object.values(party.playerStates).flatMap((runtime) => runtime.effects).some((other) => {
      if (other.id === effect.id || other.appliesHand !== effect.appliesHand || other.status !== "active") return false;
      return partyEffect(other.effectId)?.boardChanging;
    });
    if (conflict) throw new Error("本手已有一个改变公共牌的效果，不能重复激活");
  }

  effect.status = "active";
  effect.detail = `已激活，${definition.useWindowLabel}`;

  if (effect.effectId === "sky_eye" || effect.effectId === "public_card") {
    const target = randomOther(playersInHand(state), owner.id);
    if (!target) {
      effect.status = "pending";
      throw new Error("当前没有可以选择的对手");
    }
    tryPartyReveal(state, owner, effect.effectId === "public_card" ? "all" : owner.id, target, effect);
  } else if (effect.effectId === "redraw_one") {
    if (owner.hole.length !== 2) {
      effect.status = "pending";
      throw new Error("底牌尚未发出，无法换牌");
    }
    const index = randomInt(2);
    owner.hole[index] = draw(state);
    consumePartyEffect(state, owner, effect, `第 ${index + 1} 张底牌已收回，并由服务器补发一张新牌`, { presentation: "hole_redraw" });
    addLog(state, `娱乐效果：${owner.name} 主动使用「换一张」`, "system");
  } else if (effect.effectId === "redraw_hand") {
    if (owner.hole.length !== 2) {
      effect.status = "pending";
      throw new Error("底牌尚未发出，无法重抽");
    }
    owner.hole = [draw(state), draw(state)];
    consumePartyEffect(state, owner, effect, "原两张底牌已收回，服务器重新发出两张底牌", { presentation: "hole_redraw" });
    addLog(state, `娱乐效果：${owner.name} 主动使用「整手重抽」`, "system");
  } else {
    addPartyEffectEvent(state, owner, effect.effectId, "armed", `${owner.name} 激活「${definition.name}」`, `效果已锁定到 Hand #${effect.appliesHand}，服务器会在正确时点自动执行。`, { presentation: effectPresentation(effect.effectId) });
    addLog(state, `娱乐效果：${owner.name} 激活「${definition.name}」`, "system");
  }

  state.updatedAt = Date.now();
  return effect;
}

export function spinPartyWheel(
  state: PokerGameState,
  actorId: string,
  targetId = actorId,
  random: () => number = secureRandomFloat,
) {
  if ((state.roomMode ?? "classic") !== "party") throw new Error("当前不是娱乐德州房间");
  const target = state.players.find((player) => player.id === targetId && !player.isKicked);
  if (!target) throw new Error("没有找到获得转盘资格的玩家");
  if (actorId !== targetId && state.ownerId !== actorId) throw new Error("只能转动自己的转盘");
  if (target.isBot && state.ownerId !== actorId) throw new Error("只有房主可以代机器人转盘");
  const party = ensurePartyState(state);
  const runtime = ensurePartyPlayer(state, target.id);
  if (runtime.credits <= 0) throw new Error("该玩家没有可用转盘次数");

  const nextHand = state.handNumber + 1;
  const hasBoardEffect = Object.values(party.playerStates).some((playerState) => playerState.effects.some((effect) => {
    const definition = partyEffect(effect.effectId);
    return effect.appliesHand === nextHand && (effect.status === "pending" || effect.status === "active") && definition?.boardChanging;
  }));
  const choices = ONLINE_PARTY_EFFECTS.filter((effect) => !(hasBoardEffect && effect.boardChanging));
  const total = choices.reduce((sum, effect) => sum + effect.weight, 0);
  let cursor = Math.max(0, Math.min(0.999999999, random())) * total;
  let selected = choices[choices.length - 1];
  for (const effect of choices) {
    cursor -= effect.weight;
    if (cursor < 0) {
      selected = effect;
      break;
    }
  }

  runtime.credits -= 1;
  if (selected.id === "spin_again") {
    runtime.credits = Math.min(party.maxStoredCredits, runtime.credits + 1);
  } else if (selected.timing === "next_hand") {
    runtime.effects.push({
      id: id("party_effect"),
      effectId: selected.id,
      awardedHand: state.handNumber,
      appliesHand: nextHand,
      status: "pending",
    });
  }
  const spin = {
    id: id("spin"),
    playerId: target.id,
    playerName: target.name,
    effectId: selected.id,
    effectName: selected.name,
    emoji: selected.emoji,
    description: selected.description,
    effectIndex: ONLINE_PARTY_EFFECTS.findIndex((effect) => effect.id === selected.id),
    at: Date.now(),
  };
  party.lastSpin = spin;
  if (selected.control === "instant") {
    addPartyEffectEvent(state, target, selected.id, "executed", `${target.name} 抽中「${selected.name}」`, selected.description, { presentation: "reward" });
  } else {
    const detail = selected.control === "manual"
      ? `已存入技能栏；${selected.useWindowLabel}，错过后自动过期。`
      : `服务器将在${selected.useWindowLabel}，无需玩家点击。`;
    addPartyEffectEvent(state, target, selected.id, "awarded", `${target.name} 获得「${selected.name}」`, detail, { presentation: "reward" });
  }
  state.updatedAt = Date.now();
  addLog(state, `${target.name} 转动娱乐转盘，获得「${selected.name}」`, "result");
  return spin;
}

function finishShowdown(state: PokerGameState) {
  const contenders = playersInHand(state);
  const scored = new Map(contenders.map((player) => [player.id, bestScore([...player.hole, ...state.board])]));
  const levels = [...new Set(state.players.map((player) => player.contribution).filter((value) => value > 0))].sort((a, b) => a - b);
  let previous = 0;
  let totalPot = 0;
  const awards = new Map<string, number>();

  for (const level of levels) {
    const contributors = state.players.filter((player) => player.contribution >= level);
    const pot = (level - previous) * contributors.length;
    previous = level;
    totalPot += pot;
    const eligible = contenders.filter((player) => player.contribution >= level);
    if (!eligible.length) continue;
    let best = scored.get(eligible[0].id)!;
    eligible.forEach((player) => {
      const score = scored.get(player.id)!;
      if (compareScore(score, best) > 0) best = score;
    });
    const winners = eligible.filter((player) => compareScore(scored.get(player.id)!, best) === 0);
    const share = Math.floor(pot / winners.length);
    let remainder = pot % winners.length;
    winners.sort((a, b) => a.seat - b.seat).forEach((winner) => {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      awards.set(winner.id, (awards.get(winner.id) ?? 0) + share + extra);
    });
  }

  awards.forEach((amount, playerId) => {
    const player = state.players.find((item) => item.id === playerId)!;
    player.chips += amount;
  });
  processShowdownParty(state, contenders, scored, awards);
  captureHandResults(state, new Set(awards.keys()));
  state.players.forEach((player) => {
    player.streetBet = 0;
    player.contribution = 0;
  });
  const winnerText = [...awards.entries()].map(([playerId, amount]) => {
    const player = state.players.find((item) => item.id === playerId)!;
    const score = scored.get(playerId);
    return `${player.name} 以${score ? scoreNames[score[0]] : "牌型"}赢得 ${amount.toLocaleString()}`;
  }).join("；");
  state.lastPot = totalPot;
  state.resultText = winnerText || "本手结束";
  addLog(state, state.resultText, "result");
  state.phase = "showdown";
  setTurn(state, null);
  state.nextHandAt = Date.now() + (state.roomMode === "party" ? 15_000 : 8_000);
  state.updatedAt = Date.now();
}

export function maybeAdvanceGame(state: PokerGameState) {
  ensurePauseState(state);
  if (state.paused) return state;
  const now = Date.now();
  if (state.phase === "showdown" && state.nextHandAt && now >= state.nextHandAt) return startHand(state);
  if (state.turnSeat !== null && state.actionDeadline && now >= state.actionDeadline) {
    const actor = state.players.find((player) => player.seat === state.turnSeat);
    if (actor) {
      const callAmount = Math.max(0, state.currentBet - actor.streetBet);
      addLog(state, `${actor.name} 操作超时`, "system");
      applyActionInternal(state, actor, callAmount === 0 ? "check" : "fold");
      return runBots(state);
    }
  }
  return runBots(state);
}

export function potSize(state: PokerGameState) {
  const live = state.players.reduce((sum, player) => sum + player.contribution, 0);
  return live || state.lastPot;
}

export function toPublicView(state: PokerGameState, viewerId: string): PublicGameView {
  ensurePauseState(state);
  const viewer = state.players.find((player) => player.id === viewerId);
  const isYourTurn = !state.paused && viewer?.seat === state.turnSeat && !!viewer && !viewer.folded && !viewer.allIn;
  const callAmount = viewer ? Math.max(0, state.currentBet - viewer.streetBet) : 0;
  const maxRaiseTo = viewer ? viewer.streetBet + viewer.chips : 0;
  const minRaiseTo = Math.min(maxRaiseTo, state.currentBet + state.minRaise);
  const revealAll = state.phase === "showdown";
  const roomMode = state.roomMode ?? "classic";
  const party = roomMode === "party" ? ensurePartyState(state) : undefined;
  const tablePositions = getTablePositions(state.players, state.dealerSeat, state.maxPlayers);
  const noRaise = !!viewer && state.phase === "preflop" && partyEffectsFor(state, "no_raise", viewer.id).length > 0;
  const miniRaise = !!viewer && state.phase === "preflop" && partyEffectsFor(state, "mini_raise", viewer.id).length > 0;

  const visibleHole = (player: GamePlayer) => {
    if (player.id === viewerId || (revealAll && !player.folded)) return player.hole;
    const indices = party?.reveals
      .filter((reveal) => reveal.handNumber === state.handNumber && reveal.playerId === player.id && (reveal.viewerId === "all" || reveal.viewerId === viewerId))
      .map((reveal) => reveal.cardIndex) ?? [];
    return indices.length ? [...new Set(indices)].map((index) => player.hole[index]).filter(Boolean) as CardCode[] : null;
  };

  return {
    room: {
      id: state.roomId,
      code: state.roomCode,
      name: state.roomName,
      ownerId: state.ownerId,
      maxPlayers: state.maxPlayers,
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      startingChips: state.startingChips,
      mode: roomMode,
    },
    viewerId,
    version: state.version,
    handNumber: state.handNumber,
    phase: state.phase,
    dealerSeat: state.dealerSeat,
    turnSeat: state.turnSeat,
    board: state.board,
    pot: potSize(state),
    players: state.players.map((source) => {
      const { email, ...player } = source;
      void email;
      return {
        ...player,
        hole: visibleHole(source),
        isOnline: player.isBot || Date.now() - player.lastSeenAt < 18_000,
        tablePosition: tablePositions.get(source.id) ?? null,
      };
    }),
    logs: state.logs.slice(-16),
    chats: state.chats.slice(-40),
    validActions: {
      isYourTurn,
      canFold: isYourTurn,
      canCheck: isYourTurn && callAmount === 0,
      canCall: isYourTurn && callAmount > 0,
      canRaise: isYourTurn && !noRaise && !!viewer && viewer.chips > callAmount && maxRaiseTo > state.currentBet,
      callAmount: Math.min(callAmount, viewer?.chips ?? 0),
      minRaiseTo,
      maxRaiseTo: miniRaise ? minRaiseTo : maxRaiseTo,
    },
    actionDeadline: state.actionDeadline,
    nextHandAt: state.nextHandAt,
    paused: state.paused,
    pausedAt: state.pausedAt,
    pausedByName: state.pausedByName,
    resultText: state.resultText,
    dealer: state.dealer ?? DEFAULT_DEALER,
    actionFeed: (state.actionFeed ?? []).slice(-6),
    party: party ? {
      ...party,
      reveals: party.reveals.filter((reveal) => reveal.viewerId === "all" || reveal.viewerId === viewerId),
      effectEvents: party.effectEvents.filter((event) => event.visibility === "all" || event.visibility === viewerId),
    } : undefined,
  };
}

export function createInitialState(input: {
  roomId: string;
  code: string;
  name: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  maxPlayers: number;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  bots: number;
  roomMode?: "classic" | "party";
  partyTriggers?: PartyTriggerId[];
}) {
  const now = Date.now();
  const players: GamePlayer[] = [{
    id: input.ownerId,
    name: input.ownerName,
    email: input.ownerEmail,
    seat: 0,
    chips: input.startingChips,
    streetBet: 0,
    contribution: 0,
    hole: [],
    folded: false,
    allIn: false,
    acted: false,
    isBot: false,
    lastAction: "已入座",
    lastSeenAt: now,
    pendingRebuy: 0,
    isKicked: false,
    totalBuyIn: input.startingChips,
  }];
  const botNames = ["林墨", "Mia", "Leo", "周扬", "陈一凡"];
  for (let index = 0; index < Math.min(input.bots, input.maxPlayers - 1); index += 1) {
    players.push({
      id: `bot:${input.roomId}:${index}`,
      name: botNames[index],
      email: null,
      seat: index + 1,
      chips: input.startingChips,
      streetBet: 0,
      contribution: 0,
      hole: [],
      folded: false,
      allIn: false,
      acted: false,
      isBot: true,
      lastAction: "已入座",
      lastSeenAt: now,
      pendingRebuy: 0,
      isKicked: false,
      totalBuyIn: input.startingChips,
    });
  }
  const state: PokerGameState = {
    roomId: input.roomId,
    roomCode: input.code,
    roomName: input.name,
    ownerId: input.ownerId,
    maxPlayers: input.maxPlayers,
    startingChips: input.startingChips,
    roomMode: input.roomMode ?? "classic",
    smallBlind: input.smallBlind,
    bigBlind: input.bigBlind,
    version: 1,
    handNumber: 0,
    phase: "waiting",
    dealerSeat: -1,
    turnSeat: null,
    currentBet: 0,
    minRaise: input.bigBlind,
    board: [],
    deck: [],
    players,
    logs: [{ id: id("log"), text: `${input.ownerName} 创建了牌局`, at: now, kind: "system" }],
    chats: [],
    actionDeadline: null,
    nextHandAt: null,
    paused: false,
    pausedAt: null,
    pausedByName: null,
    lastPot: 0,
    resultText: "",
    dealer: { ...DEFAULT_DEALER },
    actionFeed: [],
    party: input.roomMode === "party" ? {
      enabledTriggers: input.partyTriggers?.length ? [...input.partyTriggers] : [...DEFAULT_PARTY_TRIGGERS],
      maxStoredCredits: 3,
      playerStates: Object.fromEntries(players.map((player) => [player.id, { playerId: player.id, credits: 0, achievementCount: 0, effects: [] }])),
      reveals: [],
      turnLeaderIds: [],
      lastAwards: [],
      effectEvents: [],
    } : undefined,
    createdAt: now,
    updatedAt: now,
  };
  return players.length >= 2 ? startHand(state) : state;
}

export function addHumanPlayer(state: PokerGameState, user: { id: string; displayName: string; email: string }) {
  const existing = state.players.find((player) => player.id === user.id);
  if (existing) {
    if (existing.isKicked) {
      throw new Error(existing.leftVoluntarily
        ? "你已离桌，请等待当前手牌结束后再加入"
        : "你已被房主移出，请等待当前手牌结束后再加入");
    }
    existing.name = user.displayName;
    existing.email = user.email;
    existing.lastSeenAt = Date.now();
    return state;
  }
  if (state.players.length >= state.maxPlayers) throw new Error("房间已满");
  const used = new Set(state.players.map((player) => player.seat));
  let seat = 0;
  while (used.has(seat)) seat += 1;
  state.players.push({
    id: user.id,
    name: user.displayName,
    email: user.email,
    seat,
    chips: state.startingChips,
    streetBet: 0,
    contribution: 0,
    hole: [],
    folded: true,
    allIn: false,
    acted: true,
    isBot: false,
    lastAction: state.phase === "waiting" ? "已入座" : "下手牌加入",
    lastSeenAt: Date.now(),
    pendingRebuy: 0,
    isKicked: false,
    totalBuyIn: state.startingChips,
  });
  if (state.roomMode === "party") ensurePartyPlayer(state, user.id);
  addLog(state, `${user.displayName} 加入了牌桌`, "system");
  if (state.phase === "waiting" && state.players.length >= 2) startHand(state);
  return state;
}

export function requestRebuy(state: PokerGameState, userId: string, requestedAmount: number) {
  const player = state.players.find((item) => item.id === userId && !item.isKicked);
  if (!player || player.isBot) throw new Error("无法为这个座位补码");
  const amount = Math.floor(requestedAmount);
  if (!Number.isFinite(amount) || amount < 100) throw new Error("补码至少为 100");
  const cap = state.startingChips * 5;
  const available = cap - player.chips - (player.pendingRebuy ?? 0);
  const granted = Math.min(amount, available);
  if (granted <= 0) throw new Error("你的筹码已经达到本桌上限");
  player.totalBuyIn = (player.totalBuyIn ?? state.startingChips) + granted;
  const handActive = ["preflop", "flop", "turn", "river"].includes(state.phase) && player.hole.length === 2;
  if (handActive) {
    player.pendingRebuy = (player.pendingRebuy ?? 0) + granted;
    player.lastAction = `已预约补码 ${granted.toLocaleString()}`;
    addLog(state, `${player.name} 预约在下一手补充 ${granted.toLocaleString()} 筹码`, "system");
  } else {
    player.chips += granted;
    player.lastAction = `补码 ${granted.toLocaleString()}`;
    addLog(state, `${player.name} 补充 ${granted.toLocaleString()} 筹码`, "system");
  }
  state.updatedAt = Date.now();
  return granted;
}

export function addBotPlayer(state: PokerGameState, actorId: string) {
  if (state.ownerId !== actorId) throw new Error("只有房主可以添加机器人");
  const activePlayers = state.players.filter((player) => !player.isKicked);
  if (activePlayers.length >= state.maxPlayers) throw new Error("房间已经满了");
  const usedSeats = new Set(activePlayers.map((player) => player.seat));
  let seat = 0;
  while (usedSeats.has(seat)) seat += 1;
  const botNumber = state.players.filter((player) => player.isBot).length + 1;
  const botNames = ["小林", "Mia", "Leo", "周扬", "一凡", "阿布"];
  const bot: GamePlayer = {
    id: `bot:${state.roomId}:${crypto.randomUUID()}`,
    name: botNames[(botNumber - 1) % botNames.length],
    email: null,
    seat,
    chips: state.startingChips,
    streetBet: 0,
    contribution: 0,
    hole: [],
    folded: true,
    allIn: false,
    acted: true,
    isBot: true,
    lastAction: state.phase === "waiting" ? "已入座" : "下手牌加入",
    lastSeenAt: Date.now(),
    pendingRebuy: 0,
    isKicked: false,
    totalBuyIn: state.startingChips,
  };
  state.players.push(bot);
  if (state.roomMode === "party") ensurePartyPlayer(state, bot.id);
  addLog(state, `房主添加了机器人 ${bot.name}`, "system");
  if (state.phase === "waiting" && state.players.filter((player) => !player.isKicked).length >= 2) startHand(state);
  state.updatedAt = Date.now();
  return bot;
}

export function kickPlayer(state: PokerGameState, actorId: string, targetId: string) {
  if (state.ownerId !== actorId) throw new Error("只有房主可以移出玩家");
  if (targetId === actorId) throw new Error("房主不能移出自己");
  const target = state.players.find((player) => player.id === targetId && !player.isKicked);
  if (!target) throw new Error("玩家已经不在房间中");
  addLog(state, `${target.name} 已被房主移出牌桌`, "system");
  const handActive = ["preflop", "flop", "turn", "river"].includes(state.phase) && target.hole.length === 2;
  if (handActive) {
    target.isKicked = true;
    target.folded = true;
    target.acted = true;
    target.lastAction = "已被移出";
    if (target.seat === state.turnSeat) {
      advanceAfterAction(state, target.seat);
      runBots(state);
    }
  } else {
    state.players = state.players.filter((player) => player.id !== targetId);
  }
  state.updatedAt = Date.now();
  return target;
}

export function leavePlayer(state: PokerGameState, actorId: string) {
  const player = state.players.find((item) => item.id === actorId && !item.isKicked);
  if (!player || player.isBot) throw new Error("你已经不在这张牌桌");

  const nextOwner = state.players.find(
    (item) => item.id !== actorId && !item.isBot && !item.isKicked,
  );
  if (state.ownerId === actorId && nextOwner) {
    state.ownerId = nextOwner.id;
    addLog(state, `${nextOwner.name} 已接任房主`, "system");
  }

  const handActive = ["preflop", "flop", "turn", "river"].includes(state.phase)
    && player.hole.length === 2;
  addLog(state, `${player.name} 主动离开了牌桌`, "system");
  if (handActive) {
    player.isKicked = true;
    player.leftVoluntarily = true;
    player.folded = true;
    player.acted = true;
    player.lastAction = "已离桌";
    if (player.seat === state.turnSeat) {
      advanceAfterAction(state, player.seat);
      runBots(state);
    }
  } else {
    state.players = state.players.filter((item) => item.id !== actorId);
  }
  state.updatedAt = Date.now();
  return player;
}

export function setDealerProfile(
  state: PokerGameState,
  actorId: string,
  input: { presetId?: string; image?: string },
) {
  if (state.ownerId !== actorId) throw new Error("只有房主可以更换荷官");
  const preset = DEALER_PRESETS.find((item) => item.id === input.presetId);
  if (preset) {
    state.dealer = { ...preset };
  } else if (input.presetId === "custom") {
    const image = input.image ?? "";
    if (!/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(image)) {
      throw new Error("请选择 JPG、PNG 或 WebP 照片");
    }
    if (image.length > 500_000) throw new Error("荷官照片处理后仍然太大");
    state.dealer = { id: "custom", name: "房主自定义", image, isCustom: true };
  } else {
    throw new Error("没有这个荷官人物");
  }
  addLog(state, `房主将荷官更换为 ${state.dealer.name}`, "system");
  state.updatedAt = Date.now();
  return state.dealer;
}
