"use client";

import type { LuckyPlayer } from "../../../lib/lucky-types";

export function PlayerCard({ player, selected, creditBurst, onSelect, onRename, onReset, onDelete }: {
  player: LuckyPlayer;
  selected: boolean;
  creditBurst: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const active = player.effects.filter((item) => item.status === "active");
  return (
    <article className={`lucky-player-card ${selected ? "selected" : ""}`}>
      <button className="player-select" type="button" onClick={onSelect} aria-label={`选择 ${player.name}`}><span>{player.avatar}</span></button>
      <div className="player-card-main">
        <input value={player.name} maxLength={16} onChange={(event) => onRename(event.target.value)} aria-label="玩家名称" />
        <small>成就 {player.achievementCount} · 转盘累计 {player.totalSpins}</small>
        <div className="player-effect-dots">{active.slice(0, 5).map((item) => <i title={item.name} key={item.id}>{item.emoji}</i>)}{active.length > 5 && <i>+{active.length - 5}</i>}</div>
      </div>
      <div className="credit-badge"><b>{player.wheelCredits}</b><span>次</span>{creditBurst && <em>+1</em>}</div>
      <div className="player-card-actions"><button type="button" onClick={onReset}>重置</button><button className="danger" type="button" onClick={onDelete}>删除</button></div>
    </article>
  );
}
