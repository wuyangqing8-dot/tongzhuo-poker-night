"use client";

import type { CSSProperties } from "react";
import { ONLINE_PARTY_EFFECTS, partyEffect } from "../lib/online-party";
import type { PartySpin } from "../lib/poker-types";

export default function OnlinePartyWheel({ rotation, spinning, result, onClose }: {
  rotation: number;
  spinning: boolean;
  result: PartySpin | null;
  onClose: () => void;
}) {
  const segment = 360 / ONLINE_PARTY_EFFECTS.length;
  const colors = ["#8f251f", "#b68a2e", "#342d2b", "#6a335f"];
  const gradient = `conic-gradient(from -90deg, ${ONLINE_PARTY_EFFECTS.map((_, index) => `${colors[index % colors.length]} ${index * segment}deg ${(index + 1) * segment}deg`).join(", ")})`;
  const definition = result ? partyEffect(result.effectId) : null;

  return (
    <div className="party-wheel-backdrop" role="dialog" aria-modal="true" aria-label="娱乐德州转盘">
      <section className="party-wheel-modal">
        <span className="party-wheel-kicker">SERVER WEIGHTED WHEEL</span>
        <h2>{spinning ? "命运正在选择…" : result ? `${result.playerName} 获得「${result.effectName}」` : "娱乐转盘"}</h2>
        <div className="party-wheel-stage">
          <i className="party-wheel-pointer">▼</i>
          <div className={`party-wheel-disc ${spinning ? "spinning" : ""}`} style={{ background: gradient, transform: `rotate(${rotation}deg)` }}>
            {ONLINE_PARTY_EFFECTS.map((effect, index) => (
              <span className={result?.effectId === effect.id && !spinning ? "winner" : ""} key={effect.id} style={{ "--party-angle": `${index * segment + segment / 2}deg` } as CSSProperties}>{effect.emoji}</span>
            ))}
            <b><em>同桌</em><small>PARTY</small></b>
          </div>
        </div>
        {result && !spinning && <div className="party-wheel-result"><span>{result.emoji}</span><div><b>{result.effectName}</b><p>{result.description}</p><small>{definition?.control === "manual" ? `已存入技能栏 · ${definition.useWindowLabel} · 逾期失效` : definition?.control === "automatic" ? `${definition.useWindowLabel} · 服务器会强制执行` : "效果已经立即结算"}</small></div></div>}
        <button className="primary-action" type="button" disabled={spinning} onClick={onClose}>{spinning ? "转盘旋转中…" : definition?.control === "manual" ? "去技能栏查看" : "确认效果"}</button>
      </section>
    </div>
  );
}
