"use client";

import type { ActiveEffect, LuckyPlayer } from "../../../lib/lucky-types";

const categoryName = { reward: "BUFF", penalty: "DEBUFF", chaos: "混沌", neutral: "中性" };

export function EffectPanel({ players, currentHand, onUse, onRemove }: {
  players: LuckyPlayer[];
  currentHand: number;
  onUse: (playerId: string, effect: ActiveEffect) => void;
  onRemove: (playerId: string, effect: ActiveEffect) => void;
}) {
  const entries = players.flatMap((player) => player.effects.filter((item) => item.status === "active").map((item) => ({ player, effect: item })));
  return (
    <section className="lucky-panel active-effects-panel">
      <div className="lucky-section-title"><span><small>ACTIVE EFFECTS</small><b>当前 Buff / Debuff</b></span><em>{entries.length}</em></div>
      <div className="effect-list">
        {entries.length ? entries.map(({ player, effect }) => <article className={`active-effect ${effect.category}`} key={effect.id}>
          <span className="effect-icon">{effect.emoji}</span>
          <div><small>{player.name} · {categoryName[effect.category]}</small><b>{effect.name}</b><p>{effect.description}</p><em>{effect.timing === "next_hand" ? `Hand #${effect.effectiveHand}` : "持续至使用或移除"}{effect.targetPlayerName ? ` · 目标：${effect.targetPlayerName}` : ""}</em></div>
          <div className="effect-actions"><button type="button" disabled={effect.timing === "next_hand" && currentHand < effect.effectiveHand} onClick={() => onUse(player.id, effect)}>使用</button><button type="button" onClick={() => onRemove(player.id, effect)}>移除</button></div>
        </article>) : <div className="lucky-empty"><span>✦</span><b>暂无生效效果</b><p>转盘结果应用后会出现在这里。</p></div>}
      </div>
    </section>
  );
}
