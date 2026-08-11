import type { LuckySettings, WheelEffect } from "./lucky-types";

export function weightedPick(effects: WheelEffect[], random = Math.random) {
  const enabled = effects.filter((item) => item.enabled && Number.isFinite(item.weight) && item.weight > 0);
  if (!enabled.length) throw new Error("至少需要启用一个权重大于 0 的转盘效果");
  const total = enabled.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.max(0, Math.min(0.999999999, random())) * total;
  for (const item of enabled) {
    cursor -= item.weight;
    if (cursor < 0) return item;
  }
  return enabled[enabled.length - 1];
}

export function secureRandom() {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) return Math.random();
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] / 0x1_0000_0000;
}

export function effectProbability(effect: WheelEffect, effects: WheelEffect[]) {
  const total = effects.filter((item) => item.enabled && item.weight > 0).reduce((sum, item) => sum + item.weight, 0);
  return total > 0 && effect.enabled ? effect.weight / total * 100 : 0;
}

export function grantableSpinCount(current: number, requested: number, max: LuckySettings["maxStoredSpins"]) {
  if (max === null) return Math.max(0, requested);
  return Math.max(0, Math.min(requested, max - current));
}

export function effectAllowed(effect: WheelEffect, settings: LuckySettings) {
  if (effect.capability === "peek" && !settings.allowPeek) return false;
  if (effect.capability === "swap_hole" && !settings.allowSwapHole) return false;
  if (effect.capability === "board_change" && !settings.allowBoardChange) return false;
  if (effect.capability === "button_move" && !settings.allowButtonMove) return false;
  if (effect.capability === "pass_card" && !settings.allowPassCard) return false;
  return true;
}

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
