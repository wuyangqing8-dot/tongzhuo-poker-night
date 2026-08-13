import { createInitialLuckyState } from "./lucky-defaults";
import type { LuckyGameState } from "./lucky-types";

export const LUCKY_STORAGE_KEY = "lucky-poker-state-v1";

export function loadLuckyState(): LuckyGameState {
  if (typeof window === "undefined") return createInitialLuckyState();
  try {
    const stored = window.localStorage.getItem(LUCKY_STORAGE_KEY);
    if (!stored) return createInitialLuckyState();
    const parsed = JSON.parse(stored) as LuckyGameState;
    if (parsed.version !== 1 || !Array.isArray(parsed.players) || !Array.isArray(parsed.effects)) throw new Error("invalid state");
    return parsed;
  } catch {
    return createInitialLuckyState();
  }
}

export function saveLuckyState(state: LuckyGameState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LUCKY_STORAGE_KEY, JSON.stringify({ ...state, updatedAt: Date.now() }));
}

export function clearLuckyState() {
  if (typeof window !== "undefined") window.localStorage.removeItem(LUCKY_STORAGE_KEY);
}
