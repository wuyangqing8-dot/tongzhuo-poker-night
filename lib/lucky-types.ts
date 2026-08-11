export type EffectCategory = "reward" | "penalty" | "chaos" | "neutral";
export type EffectTiming = "immediate" | "current_hand" | "next_hand" | "until_used" | "permanent";
export type EffectCapability = "peek" | "swap_hole" | "board_change" | "button_move" | "pass_card";
export type ActiveEffectStatus = "active" | "used" | "removed" | "expired";
export type HistoryEventType = "achievement" | "spin" | "effect" | "hand" | "player" | "dice" | "system";

export interface WheelEffect {
  id: string;
  name: string;
  emoji: string;
  category: EffectCategory;
  description: string;
  weight: number;
  enabled: boolean;
  timing: EffectTiming;
  requiresTarget: boolean;
  ruleChanging: boolean;
  capability?: EffectCapability;
  builtIn?: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  rewardSpins: number;
  enabled: boolean;
  builtIn?: boolean;
}

export interface ActiveEffect {
  id: string;
  sourceEffectId: string;
  name: string;
  emoji: string;
  category: EffectCategory;
  description: string;
  timing: EffectTiming;
  status: ActiveEffectStatus;
  appliedHand: number;
  effectiveHand: number;
  targetPlayerId?: string;
  targetPlayerName?: string;
  ruleChanging: boolean;
}

export interface LuckyPlayer {
  id: string;
  name: string;
  avatar: string;
  wheelCredits: number;
  totalSpins: number;
  achievementCount: number;
  effects: ActiveEffect[];
  createdAt: number;
}

export interface HistoryEvent {
  id: string;
  handNumber: number;
  playerId?: string;
  playerName?: string;
  type: HistoryEventType;
  title: string;
  detail: string;
  at: number;
}

export interface LuckySettings {
  maxStoredSpins: 1 | 2 | 3 | null;
  maxSpecialRules: number;
  doubleRiverMode: "split" | "random";
  allowSwapHole: boolean;
  allowPeek: boolean;
  allowBoardChange: boolean;
  allowButtonMove: boolean;
  allowPassCard: boolean;
  soundEnabled: boolean;
}

export interface LuckyGameState {
  version: 1;
  handNumber: number;
  players: LuckyPlayer[];
  effects: WheelEffect[];
  achievements: Achievement[];
  history: HistoryEvent[];
  settings: LuckySettings;
  selectedPlayerId: string;
  updatedAt: number;
}
