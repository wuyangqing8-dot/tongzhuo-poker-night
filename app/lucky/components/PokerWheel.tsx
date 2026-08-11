"use client";

import type { CSSProperties } from "react";
import type { WheelEffect } from "../../../lib/lucky-types";

const colors: Record<WheelEffect["category"], [string, string]> = {
  reward: ["#b68a2e", "#755519"],
  penalty: ["#8b2727", "#571818"],
  chaos: ["#67306f", "#3f1c48"],
  neutral: ["#4c5057", "#292c31"],
};

export function PokerWheel({ effects, rotation, spinning, winnerId }: {
  effects: WheelEffect[];
  rotation: number;
  spinning: boolean;
  winnerId?: string;
}) {
  const shown = effects.filter((item) => item.enabled && item.weight > 0);
  const segment = 360 / Math.max(1, shown.length);
  const gradient = shown.length
    ? `conic-gradient(from -90deg, ${shown.map((item, index) => {
        const palette = colors[item.category];
        const color = palette[index % 2];
        return `${color} ${index * segment}deg ${(index + 1) * segment}deg`;
      }).join(", ")})`
    : "#2c2c2f";

  return (
    <div className="wheel-stage">
      <div className="wheel-pointer"><span>▼</span></div>
      <div className={`poker-wheel ${spinning ? "spinning" : ""}`} style={{ background: gradient, transform: `rotate(${rotation}deg)` }}>
        <div className="wheel-rim" />
        {shown.map((item, index) => {
          const angle = index * segment + segment / 2;
          return (
            <div className={`wheel-segment-label ${winnerId === item.id ? "winner" : ""}`} key={item.id} style={{ "--segment-angle": `${angle}deg` } as CSSProperties}>
              <span>{item.emoji}</span><b>{item.name}</b>
            </div>
          );
        })}
        <div className="wheel-hub"><span>♠</span><b>LUCKY</b><small>POKER</small></div>
      </div>
    </div>
  );
}
