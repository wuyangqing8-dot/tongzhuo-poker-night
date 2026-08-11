import type { CardCode, GamePhase, Rank } from "./poker-types";

export type StrategyMix = {
  fold: number;
  check: number;
  call: number;
  raise: number;
};

export type StrategyAdvice = {
  mix: StrategyMix;
  handLabel: string;
  strength: number;
  potOdds: number;
  summary: string;
};

const rankValue: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function rankOf(card: CardCode) {
  return rankValue[card.slice(0, -1) as Rank];
}

function normalizeMix(raw: StrategyMix): StrategyMix {
  const entries = Object.entries(raw) as Array<[keyof StrategyMix, number]>;
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, value), 0) || 1;
  const normalized = Object.fromEntries(entries.map(([key, value]) => [key, Math.round(Math.max(0, value) / total * 100)])) as StrategyMix;
  const difference = 100 - Object.values(normalized).reduce((sum, value) => sum + value, 0);
  const largest = entries.reduce((best, entry) => entry[1] > best[1] ? entry : best, entries[0])[0];
  normalized[largest] += difference;
  return normalized;
}

function preflopStrength(hole: CardCode[]) {
  const [first, second] = hole;
  const high = Math.max(rankOf(first), rankOf(second));
  const low = Math.min(rankOf(first), rankOf(second));
  const pair = high === low;
  const suited = first.slice(-1) === second.slice(-1);
  const gap = high - low;
  if (pair) {
    return {
      strength: clamp((30 + (high - 2) / 12 * 70) / 100),
      label: `${first[0] === "T" ? "10" : first[0]}口袋对子`,
    };
  }
  let score = (high - 2) / 12 * 45 + (low - 2) / 12 * 25;
  if (suited) score += 8;
  if (gap === 1) score += 7;
  else if (gap === 2) score += 4;
  if (high >= 10 && low >= 10) score += 12;
  if (high === 14) score += 5;
  return { strength: clamp(score / 100), label: suited ? "同花起手牌" : "非同花起手牌" };
}

function hasStraight(ranks: number[]) {
  const unique = [...new Set(ranks)];
  if (unique.includes(14)) unique.push(1);
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some((start) =>
    Array.from({ length: 5 }, (_, index) => start + index).every((rank) => unique.includes(rank)),
  );
}

function hasStraightDraw(ranks: number[]) {
  const unique = [...new Set(ranks)];
  if (unique.includes(14)) unique.push(1);
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some((start) =>
    Array.from({ length: 5 }, (_, index) => start + index).filter((rank) => unique.includes(rank)).length === 4,
  );
}

function postflopStrength(hole: CardCode[], board: CardCode[]) {
  const cards = [...hole, ...board];
  const ranks = cards.map(rankOf);
  const rankCounts = [...new Set(ranks)].map((rank) => ranks.filter((item) => item === rank).length).sort((a, b) => b - a);
  const suits = ["S", "H", "D", "C"].map((suit) => cards.filter((card) => card.endsWith(suit)).length);
  const flush = Math.max(...suits) >= 5;
  const straight = hasStraight(ranks);
  const quads = rankCounts[0] === 4;
  const fullHouse = rankCounts[0] >= 3 && rankCounts[1] >= 2;
  const trips = rankCounts[0] === 3;
  const pairCount = rankCounts.filter((count) => count >= 2).length;

  let strength = 0.2;
  let label = "高牌";
  if (quads) ({ strength, label } = { strength: 0.99, label: "四条" });
  else if (fullHouse) ({ strength, label } = { strength: 0.95, label: "葫芦" });
  else if (flush) ({ strength, label } = { strength: 0.88, label: "同花" });
  else if (straight) ({ strength, label } = { strength: 0.82, label: "顺子" });
  else if (trips) ({ strength, label } = { strength: 0.72, label: "三条" });
  else if (pairCount >= 2) ({ strength, label } = { strength: 0.62, label: "两对" });
  else if (pairCount === 1) ({ strength, label } = { strength: 0.42, label: "一对" });

  const flushDraw = board.length < 5 && Math.max(...suits) === 4;
  const straightDraw = board.length < 5 && !straight && hasStraightDraw(ranks);
  const drawBonus = (flushDraw ? 0.1 : 0) + (straightDraw ? 0.08 : 0);
  const drawLabel = [flushDraw ? "同花听牌" : "", straightDraw ? "顺子听牌" : ""].filter(Boolean).join("＋");
  return {
    strength: clamp(strength + drawBonus),
    label: drawLabel && strength < 0.62 ? `${label} · ${drawLabel}` : label,
    hasDraw: flushDraw || straightDraw,
  };
}

export function getStrategyAdvice(input: {
  phase: GamePhase;
  hole: CardCode[];
  board: CardCode[];
  pot: number;
  callAmount: number;
  stack: number;
}): StrategyAdvice | null {
  if (input.hole.length !== 2 || ["waiting", "showdown"].includes(input.phase)) return null;
  const analysis = input.phase === "preflop"
    ? { ...preflopStrength(input.hole), hasDraw: false }
    : postflopStrength(input.hole, input.board);
  const potOdds = input.callAmount > 0 ? input.callAmount / Math.max(1, input.pot + input.callAmount) : 0;
  const canRaise = input.stack > input.callAmount;
  let mix: StrategyMix;

  if (input.callAmount === 0) {
    const raiseWeight = clamp(12 + analysis.strength * 72 + (analysis.hasDraw ? 8 : 0), 8, 92);
    mix = normalizeMix({ fold: 0, check: 100 - raiseWeight, call: 0, raise: canRaise ? raiseWeight : 0 });
  } else {
    const edge = analysis.strength - potOdds;
    const raiseWeight = canRaise ? clamp((analysis.strength - 0.42) * 125 + (analysis.hasDraw ? 9 : 0), 2, 68) : 0;
    const callWeight = clamp(38 + edge * 88 + (analysis.hasDraw ? 10 : 0) - raiseWeight * 0.3, 4, 88);
    const foldWeight = clamp(54 - edge * 105 - analysis.strength * 18, 2, 90);
    mix = normalizeMix({ fold: foldWeight, check: 0, call: callWeight, raise: raiseWeight });
  }

  const bestAction = (Object.entries(mix) as Array<[keyof StrategyMix, number]>).reduce((best, entry) => entry[1] > best[1] ? entry : best)[0];
  const actionName: Record<keyof StrategyMix, string> = { fold: "弃牌", check: "过牌", call: "跟注", raise: "加注" };
  return {
    mix,
    handLabel: analysis.label,
    strength: Math.round(analysis.strength * 100),
    potOdds: Math.round(potOdds * 100),
    summary: `倾向${actionName[bestAction]} · 基于当前牌力、底池赔率与有效筹码`,
  };
}
