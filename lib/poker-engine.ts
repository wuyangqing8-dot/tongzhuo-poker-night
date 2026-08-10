import type {
  CardCode,
  GamePhase,
  GamePlayer,
  PlayerAction,
  PokerGameState,
  PublicGameView,
  Rank,
  Suit,
} from "./poker-types";

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

export function startHand(state: PokerGameState) {
  let ready = handReadyPlayers(state);
  if (ready.length < 2 && state.players.length >= 2) {
    state.players.forEach((player) => { player.chips = state.startingChips; });
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
  const previousDealer = state.dealerSeat;
  const dealer = state.handNumber === 1
    ? [...ready].sort((a, b) => a.seat - b.seat)[0]
    : nextPlayer(state, previousDealer, (player) => player.chips > 0) ?? ready[0];
  state.dealerSeat = dealer.seat;
  state.deck = shuffledDeck();
  state.board = [];
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
  state.lastPot = 0;
  state.resultText = "";
  state.nextHandAt = null;

  state.players.forEach((player) => {
    player.streetBet = 0;
    player.contribution = 0;
    player.hole = [];
    player.folded = player.chips <= 0;
    player.allIn = false;
    player.acted = false;
    player.lastAction = player.chips <= 0 ? "等待补充筹码" : "等待行动";
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

  const headsUp = ready.length === 2;
  const smallBlindPlayer = headsUp
    ? dealer
    : nextPlayer(state, dealer.seat, (player) => player.hole.length === 2)!;
  const bigBlindPlayer = nextPlayer(state, smallBlindPlayer.seat, (player) => player.hole.length === 2)!;
  postBlind(state, smallBlindPlayer, state.smallBlind, "小盲");
  postBlind(state, bigBlindPlayer, state.bigBlind, "大盲");
  state.currentBet = Math.max(smallBlindPlayer.streetBet, bigBlindPlayer.streetBet);
  state.phase = "preflop";
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

function finishUncontested(state: PokerGameState, winner: GamePlayer) {
  const pot = state.players.reduce((sum, player) => sum + player.contribution, 0);
  winner.chips += pot;
  state.lastPot = pot;
  state.resultText = `${winner.name} 赢得 ${pot.toLocaleString()} 筹码`;
  addLog(state, state.resultText, "result");
  state.players.forEach((player) => {
    player.streetBet = 0;
    player.contribution = 0;
  });
  state.phase = "showdown";
  setTurn(state, null);
  state.nextHandAt = Date.now() + 8_000;
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
    state.board.push(draw(state));
  } else if (state.phase === "turn") {
    state.phase = "river";
    state.board.push(draw(state));
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

  if (action === "fold") {
    actor.folded = true;
    actor.acted = true;
    actor.lastAction = "弃牌";
    addLog(state, `${actor.name} 弃牌`);
  } else if (action === "check") {
    if (callAmount !== 0) throw new Error("当前不能过牌");
    actor.acted = true;
    actor.lastAction = "过牌";
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
    addLog(state, `${actor.name} ${actor.allIn ? "全下" : "跟注"} ${paid}`);
  } else {
    const maxTarget = actor.streetBet + actor.chips;
    const target = Math.floor(requestedAmount ?? 0);
    if (target <= state.currentBet) throw new Error("加注金额必须高于当前下注");
    if (target > maxTarget) throw new Error("筹码不足");
    const raiseSize = target - state.currentBet;
    const isAllIn = target === maxTarget;
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
    addLog(state, `${actor.name} ${actor.allIn ? "全下" : "加注到"} ${target}`);
  }

  state.updatedAt = Date.now();
  advanceAfterAction(state, actor.seat);
}

export function applyPlayerAction(
  state: PokerGameState,
  userId: string,
  action: PlayerAction,
  amount?: number,
) {
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
  if (callAmount === 0) {
    if (roll < 17 && bot.chips >= state.bigBlind * 2) {
      return { action: "raise", amount: Math.min(bot.streetBet + bot.chips, state.currentBet + state.minRaise) };
    }
    return { action: "check" };
  }
  if (callAmount >= bot.chips) return roll < 62 ? { action: "call" } : { action: "fold" };
  if (callAmount > bot.chips * 0.42 && roll < 68) return { action: "fold" };
  if (roll < 12 && bot.chips > callAmount + state.minRaise) {
    const target = Math.min(bot.streetBet + bot.chips, state.currentBet + state.minRaise + randomInt(4) * state.bigBlind);
    return { action: "raise", amount: target };
  }
  return roll < 84 ? { action: "call" } : { action: "fold" };
}

export function runBots(state: PokerGameState) {
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
    else state.board.push(draw(state));
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
  state.nextHandAt = Date.now() + 8_000;
  state.updatedAt = Date.now();
}

export function maybeAdvanceGame(state: PokerGameState) {
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
  const viewer = state.players.find((player) => player.id === viewerId);
  const isYourTurn = viewer?.seat === state.turnSeat && !!viewer && !viewer.folded && !viewer.allIn;
  const callAmount = viewer ? Math.max(0, state.currentBet - viewer.streetBet) : 0;
  const maxRaiseTo = viewer ? viewer.streetBet + viewer.chips : 0;
  const minRaiseTo = Math.min(maxRaiseTo, state.currentBet + state.minRaise);
  const revealAll = state.phase === "showdown";

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
    },
    viewerId,
    version: state.version,
    handNumber: state.handNumber,
    phase: state.phase,
    dealerSeat: state.dealerSeat,
    turnSeat: state.turnSeat,
    board: state.board,
    pot: potSize(state),
    players: state.players.map(({ email: _email, ...player }) => ({
      ...player,
      hole: player.id === viewerId || (revealAll && !player.folded) ? player.hole : null,
      isOnline: player.isBot || Date.now() - player.lastSeenAt < 18_000,
    })),
    logs: state.logs.slice(-16),
    chats: state.chats.slice(-40),
    validActions: {
      isYourTurn,
      canFold: isYourTurn,
      canCheck: isYourTurn && callAmount === 0,
      canCall: isYourTurn && callAmount > 0,
      canRaise: isYourTurn && !!viewer && viewer.chips > callAmount && maxRaiseTo > state.currentBet,
      callAmount: Math.min(callAmount, viewer?.chips ?? 0),
      minRaiseTo,
      maxRaiseTo,
    },
    actionDeadline: state.actionDeadline,
    nextHandAt: state.nextHandAt,
    resultText: state.resultText,
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
    });
  }
  const state: PokerGameState = {
    roomId: input.roomId,
    roomCode: input.code,
    roomName: input.name,
    ownerId: input.ownerId,
    maxPlayers: input.maxPlayers,
    startingChips: input.startingChips,
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
    lastPot: 0,
    resultText: "",
    createdAt: now,
    updatedAt: now,
  };
  return players.length >= 2 ? startHand(state) : state;
}

export function addHumanPlayer(state: PokerGameState, user: { id: string; displayName: string; email: string }) {
  const existing = state.players.find((player) => player.id === user.id);
  if (existing) {
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
  });
  addLog(state, `${user.displayName} 加入了牌桌`, "system");
  if (state.phase === "waiting" && state.players.length >= 2) startHand(state);
  return state;
}
