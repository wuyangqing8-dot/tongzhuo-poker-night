import assert from "node:assert/strict";
import test from "node:test";
import { defaultAchievements, defaultWheelEffects } from "../lib/lucky-defaults";
import type { WheelEffect } from "../lib/lucky-types";
import {
  effectProbability,
  grantableSpinCount,
  seededRandom,
  weightedPick,
} from "../lib/lucky-wheel";

function effect(id: string, weight: number, enabled = true): WheelEffect {
  return {
    id,
    name: id,
    emoji: "🎡",
    category: "neutral",
    description: id,
    weight,
    enabled,
    timing: "immediate",
    requiresTarget: false,
    ruleChanging: false,
  };
}

test("the first-run configuration contains all requested defaults", () => {
  assert.equal(defaultWheelEffects.length, 24);
  assert.equal(defaultAchievements.length, 12);
  assert.equal(new Set(defaultWheelEffects.map((item) => item.id)).size, 24);
  assert.equal(new Set(defaultAchievements.map((item) => item.id)).size, 12);
});

test("weighted selection strongly favors the larger weight over many draws", () => {
  const effects = [effect("light", 1), effect("heavy", 10)];
  const random = seededRandom(20260811);
  const counts = { light: 0, heavy: 0 };
  for (let index = 0; index < 20_000; index += 1) {
    counts[weightedPick(effects, random).id as keyof typeof counts] += 1;
  }
  assert.ok(counts.heavy > counts.light * 8, `${counts.heavy} should dominate ${counts.light}`);
});

test("disabled and zero-weight effects can never win", () => {
  const effects = [effect("winner", 2), effect("disabled", 999, false), effect("zero", 0)];
  const random = seededRandom(7);
  for (let index = 0; index < 1_000; index += 1) {
    assert.equal(weightedPick(effects, random).id, "winner");
  }
});

test("probabilities and stored-spin caps are calculated independently", () => {
  const effects = [effect("one", 1), effect("three", 3)];
  assert.equal(effectProbability(effects[0], effects), 25);
  assert.equal(effectProbability(effects[1], effects), 75);
  assert.equal(grantableSpinCount(1, 2, 2), 1);
  assert.equal(grantableSpinCount(1, 2, null), 2);
});
