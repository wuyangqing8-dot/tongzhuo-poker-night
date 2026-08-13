"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createInitialLuckyState } from "../../lib/lucky-defaults";
import { clearLuckyState, loadLuckyState, saveLuckyState } from "../../lib/lucky-storage";
import type { LuckyGameState } from "../../lib/lucky-types";

export function luckyId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useLuckyGame() {
  const [state, setState] = useState<LuckyGameState | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setState(loadLuckyState());
      loaded.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loaded.current && state) saveLuckyState(state);
  }, [state]);

  const updateState = useCallback((updater: (current: LuckyGameState) => LuckyGameState) => {
    setState((current) => current ? { ...updater(current), updatedAt: Date.now() } : current);
  }, []);

  const resetAll = useCallback(() => {
    clearLuckyState();
    setState(createInitialLuckyState());
  }, []);

  return { state, updateState, resetAll };
}
