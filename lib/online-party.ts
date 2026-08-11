import type { PartyEffectId, PartyTriggerId } from "./poker-types";

export type OnlinePartyTrigger = {
  id: PartyTriggerId;
  name: string;
  description: string;
};

export type OnlinePartyEffect = {
  id: PartyEffectId;
  name: string;
  emoji: string;
  description: string;
  weight: number;
  timing: "immediate" | "next_hand";
  control: "instant" | "automatic" | "manual";
  useWindow?: "before_hand" | "preflop" | "before_turn" | "before_river";
  useWindowLabel: string;
  boardChanging?: boolean;
};

export const ONLINE_PARTY_TRIGGERS: OnlinePartyTrigger[] = [
  { id: "quads", name: "四条", description: "摊牌时以四条赢得任一底池。" },
  { id: "straight_flush", name: "同花顺", description: "摊牌时以同花顺赢得任一底池。" },
  { id: "full_house", name: "葫芦", description: "摊牌时以葫芦赢得任一底池。" },
  { id: "seven_two", name: "72 杂色赢池", description: "使用不同花色的 7、2 底牌赢得任一底池。" },
  { id: "high_card", name: "高牌胜出", description: "摊牌时仅以高牌赢得任一底池。" },
  { id: "all_in_win", name: "All-in 获胜", description: "已经 All-in 的玩家赢得任一底池。" },
  { id: "river_comeback", name: "河牌反超", description: "Turn 时不是领先者，River 发出后赢得底池。" },
  { id: "bad_beat", name: "Bad Beat", description: "葫芦或更强牌型仍在摊牌中落败，输家获得机会。" },
  { id: "knockout", name: "淘汰玩家", description: "赢池后使至少一名参赛玩家筹码归零。" },
];

export const DEFAULT_PARTY_TRIGGERS: PartyTriggerId[] = [
  "quads", "straight_flush", "full_house", "seven_two", "all_in_win", "river_comeback", "bad_beat", "knockout",
];

export const ONLINE_PARTY_EFFECTS: OnlinePartyEffect[] = [
  { id: "sky_eye", name: "天眼", emoji: "👁️", description: "下一手翻牌前由你点击使用，服务器私下显示一名随机对手的一张底牌。", weight: 9, timing: "next_hand", control: "manual", useWindow: "preflop", useWindowLabel: "下一手翻牌前使用" },
  { id: "public_card", name: "公开处刑", emoji: "📣", description: "下一手翻牌前由你点击使用，随机一名对手的一张底牌会向全桌公开。", weight: 6, timing: "next_hand", control: "manual", useWindow: "preflop", useWindowLabel: "下一手翻牌前使用" },
  { id: "peek_shield", name: "防窥盾", emoji: "🛡️", description: "下一手自动保护你，抵消一次针对你的看牌效果；本手未触发则过期。", weight: 7, timing: "next_hand", control: "automatic", useWindowLabel: "下一手自动生效" },
  { id: "river_redraw", name: "河牌重铸", emoji: "🌊", description: "下一手 River 发出前点击激活；第一张 River 作废并重发，第二张必须接受。", weight: 3, timing: "next_hand", control: "manual", useWindow: "before_river", useWindowLabel: "下一手 River 前激活", boardChanging: true },
  { id: "turn_redraw", name: "转牌重铸", emoji: "🔄", description: "下一手 Turn 发出前点击激活；第一张 Turn 作废并重发，第二张必须接受。", weight: 4, timing: "next_hand", control: "manual", useWindow: "before_turn", useWindowLabel: "下一手 Turn 前激活", boardChanging: true },
  { id: "redraw_one", name: "换一张", emoji: "🂠", description: "下一手翻牌前点击使用，服务器随机丢弃你的一张底牌并立即补发。", weight: 6, timing: "next_hand", control: "manual", useWindow: "preflop", useWindowLabel: "下一手翻牌前使用" },
  { id: "redraw_hand", name: "整手重抽", emoji: "🎴", description: "下一手翻牌前点击使用，服务器立即弃掉你的两张底牌并重新发两张。", weight: 3, timing: "next_hand", control: "manual", useWindow: "preflop", useWindowLabel: "下一手翻牌前使用" },
  { id: "free_big_blind", name: "免大盲", emoji: "🎟️", description: "持续保留到下一次你坐大盲时，由服务器自动免除一次大盲。", weight: 7, timing: "next_hand", control: "automatic", useWindowLabel: "下次大盲自动使用" },
  { id: "spin_again", name: "再来一次", emoji: "🎡", description: "立即返还一次转盘机会。", weight: 6, timing: "immediate", control: "instant", useWindowLabel: "立即结算" },
  { id: "get_peeked", name: "被偷窥", emoji: "🙈", description: "下一手自动生效，随机一名对手会看到你的一张底牌。", weight: 7, timing: "next_hand", control: "automatic", useWindowLabel: "下一手自动生效" },
  { id: "open_card", name: "明牌玩家", emoji: "📢", description: "下一手自动生效，你的一张底牌会持续向全桌公开。", weight: 6, timing: "next_hand", control: "automatic", useWindowLabel: "下一手自动生效" },
  { id: "no_raise", name: "禁止加注", emoji: "🚫", description: "下一手 Preflop 自动生效，服务器只允许你 Fold、Check 或 Call。", weight: 7, timing: "next_hand", control: "automatic", useWindowLabel: "下一手自动生效" },
  { id: "mini_raise", name: "Mini Raise", emoji: "📏", description: "下一手 Preflop 自动生效，第一次主动加注只能是服务器计算的最小加注。", weight: 6, timing: "next_hand", control: "automatic", useWindowLabel: "下一手自动生效" },
  { id: "river_judgement", name: "河牌审判", emoji: "⚖️", description: "下一手自动生效，River 发出后你的一张底牌会向全桌公开。", weight: 5, timing: "next_hand", control: "automatic", useWindowLabel: "下一手自动生效" },
  { id: "random_turn", name: "随机转牌", emoji: "🎲", description: "下一手 Turn 发出前点击激活；服务器抽两张 Turn 并随机决定一张生效。", weight: 4, timing: "next_hand", control: "manual", useWindow: "before_turn", useWindowLabel: "下一手 Turn 前激活", boardChanging: true },
  { id: "seat_swap", name: "座位交换", emoji: "🔁", description: "在下一手开始前点击使用，服务器随机选择一名对手与你交换座位，筹码不交换。", weight: 5, timing: "next_hand", control: "manual", useWindow: "before_hand", useWindowLabel: "下一手开始前使用" },
  { id: "emperor_button", name: "皇帝 Button", emoji: "👑", description: "在下一手开始前点击使用，下一手 Button 由你直接获得。", weight: 4, timing: "next_hand", control: "manual", useWindow: "before_hand", useWindowLabel: "下一手开始前使用" },
  { id: "pass_left", name: "乾坤大挪移", emoji: "🌀", description: "在下一手开始前点击使用；发牌后每位玩家随机向左传递一张底牌。", weight: 2, timing: "next_hand", control: "manual", useWindow: "before_hand", useWindowLabel: "下一手开始前使用" },
  { id: "thanks", name: "谢谢参与", emoji: "🙂", description: "什么都没有发生，机会已经消耗。", weight: 13, timing: "immediate", control: "instant", useWindowLabel: "立即结算" },
];

export function partyTrigger(id: PartyTriggerId) {
  return ONLINE_PARTY_TRIGGERS.find((item) => item.id === id);
}

export function partyEffect(id: PartyEffectId) {
  return ONLINE_PARTY_EFFECTS.find((item) => item.id === id);
}
