import type { Achievement, LuckyGameState, LuckyPlayer, LuckySettings, WheelEffect } from "./lucky-types";

const effect = (
  id: string,
  name: string,
  emoji: string,
  category: WheelEffect["category"],
  description: string,
  weight: number,
  timing: WheelEffect["timing"],
  options: Partial<Pick<WheelEffect, "requiresTarget" | "ruleChanging" | "capability">> = {},
): WheelEffect => ({
  id,
  name,
  emoji,
  category,
  description,
  weight,
  enabled: true,
  timing,
  requiresTarget: false,
  ruleChanging: false,
  builtIn: true,
  ...options,
});

export const defaultWheelEffects: WheelEffect[] = [
  effect("sky-eye", "天眼", "👁️", "reward", "下一手翻牌前，可以随机查看一名对手的一张底牌。", 10, "next_hand", { capability: "peek" }),
  effect("precise-peek", "精准偷窥", "🔍", "reward", "下一手翻牌前，选择一名玩家，并查看其任意一张底牌。", 7, "next_hand", { requiresTarget: true, capability: "peek" }),
  effect("public-card", "公开处刑", "📢", "reward", "下一手翻牌前，指定一名玩家公开一张底牌给全桌。", 7, "next_hand", { requiresTarget: true, capability: "peek" }),
  effect("peek-shield", "防窥盾", "🛡️", "reward", "下一次有玩家尝试查看你的底牌时，该查看效果无效。", 8, "until_used"),
  effect("river-redraw", "河牌重铸", "🌊", "reward", "下一手若进入 River，可将第一张 River 永久作废并重发一次；第二张必须接受。", 3, "next_hand", { ruleChanging: true, capability: "board_change" }),
  effect("turn-redraw", "转牌重铸", "🔄", "reward", "下一手若进入 Turn，可要求重发一次；第二张 Turn 必须接受。", 4, "next_hand", { ruleChanging: true, capability: "board_change" }),
  effect("swap-one", "换一张", "🃏", "reward", "下一手发完两张底牌后，可以弃掉其中一张并重新获得一张。", 5, "next_hand", { capability: "swap_hole" }),
  effect("redraw-hand", "整手重抽", "🎴", "reward", "下一手发完底牌后，可以弃掉两张并重新发两张。", 2, "next_hand", { capability: "swap_hole" }),
  effect("free-big-blind", "免大盲", "🪙", "reward", "下一次轮到该玩家支付大盲时，可以免除一次大盲。", 6, "until_used"),
  effect("spin-again", "再来一次", "🎟️", "reward", "立即获得 1 次额外转盘机会。", 6, "immediate"),
  effect("get-peeked", "被偷窥", "🙈", "penalty", "下一手随机一名对手可以查看你的一张底牌。", 8, "next_hand", { capability: "peek" }),
  effect("open-card", "明牌玩家", "📣", "penalty", "下一手必须公开自己的一张底牌，并保持公开到该手结束。", 7, "next_hand"),
  effect("no-raise", "禁止加注", "🚫", "penalty", "下一手 Preflop 只能 Fold 或 Call，不能 Raise。", 8, "next_hand"),
  effect("mini-raise", "Mini Raise", "📏", "penalty", "下一手第一次主动加注只能进行最小加注。", 7, "next_hand"),
  effect("river-judgement", "河牌审判", "⚖️", "penalty", "下一手若进入 River，River 发出后必须公开自己的一张底牌。", 6, "next_hand"),
  effect("thanks", "谢谢参与", "🙂", "neutral", "什么都没有发生。", 15, "immediate"),
  effect("double-river", "双河牌", "🌊", "chaos", "下一手 River 发两张；按设置选择平分底池或随机决定有效 River。", 3, "next_hand", { ruleChanging: true, capability: "board_change" }),
  effect("random-turn", "随机转牌", "🎲", "chaos", "下一手 Turn 发两张，然后随机决定其中一张有效。", 4, "next_hand", { ruleChanging: true, capability: "board_change" }),
  effect("seat-swap", "座位交换", "💺", "chaos", "下一手开始前，可以和一名玩家交换座位，筹码不交换。", 5, "next_hand", { requiresTarget: true }),
  effect("nemesis", "宿敌", "⚔️", "chaos", "指定一名宿敌；下一手双方都入池且你获胜时，再获得一次转盘机会。", 5, "next_hand", { requiresTarget: true }),
  effect("emperor-button", "皇帝 Button", "👑", "reward", "下一手 Button 直接由你获得。", 4, "next_hand", { capability: "button_move" }),
  effect("pass-one-left", "乾坤大挪移", "🌀", "chaos", "下一手所有玩家收到底牌后，每人随机向左传递一张底牌。", 2, "next_hand", { ruleChanging: true, capability: "pass_card" }),
  effect("destiny-die", "命运骰子", "🎲", "chaos", "自动掷 1～6：1～2 随机惩罚，3～4 无事发生，5～6 额外获得一次转盘。", 6, "immediate"),
  effect("bounty", "赏金猎人", "🎯", "chaos", "指定一名赏金目标；下一手赢下该玩家参与底池的玩家获得一次转盘。", 5, "next_hand", { requiresTarget: true }),
];

const achievement = (id: string, name: string, description: string, rewardSpins = 1): Achievement => ({
  id,
  name,
  description,
  rewardSpins,
  enabled: true,
  builtIn: true,
});

export const defaultAchievements: Achievement[] = [
  achievement("quads", "四条", "以四条完成牌局。"),
  achievement("straight-flush", "同花顺", "以同花顺完成牌局。"),
  achievement("full-house", "葫芦", "以葫芦完成牌局。"),
  achievement("seven-two", "72 杂色赢下底池", "使用 7-2 非同花赢下底池。"),
  achievement("high-card-win", "高牌摊牌获胜", "摊牌时仅以高牌赢下底池。"),
  achievement("bluff-catch", "成功抓诈唬", "跟注并成功抓到一次诈唬。"),
  achievement("all-in-win", "All-in 获胜", "全下后赢下该手牌。"),
  achievement("three-pots", "连续赢下 3 个底池", "连续三手赢得底池。"),
  achievement("knockout", "淘汰一名玩家", "在本局中淘汰一名玩家。"),
  achievement("river-comeback", "河牌完成反超", "在 River 发出后完成反超并获胜。"),
  achievement("bad-beat", "Bad Beat", "AA 被弱牌爆冷、葫芦撞四条等；由输家获得。"),
  achievement("double-knockout", "一手牌淘汰两名玩家", "在同一手牌中淘汰两名玩家。", 2),
];

export const defaultLuckySettings: LuckySettings = {
  maxStoredSpins: 1,
  maxSpecialRules: 2,
  doubleRiverMode: "split",
  allowSwapHole: true,
  allowPeek: true,
  allowBoardChange: true,
  allowButtonMove: true,
  allowPassCard: true,
  soundEnabled: false,
};

const avatars = ["🦊", "🐼", "🐯", "🐧"];

export function createDefaultPlayers(now = Date.now()): LuckyPlayer[] {
  return avatars.map((avatar, index) => ({
    id: `player-${index + 1}`,
    name: `玩家 ${index + 1}`,
    avatar,
    wheelCredits: index === 0 ? 1 : 0,
    totalSpins: 0,
    achievementCount: 0,
    effects: [],
    createdAt: now + index,
  }));
}

export function createInitialLuckyState(): LuckyGameState {
  const now = Date.now();
  const players = createDefaultPlayers(now);
  return {
    version: 1,
    handNumber: 1,
    players,
    effects: defaultWheelEffects.map((item) => ({ ...item })),
    achievements: defaultAchievements.map((item) => ({ ...item })),
    history: [],
    settings: { ...defaultLuckySettings },
    selectedPlayerId: players[0].id,
    updatedAt: now,
  };
}
