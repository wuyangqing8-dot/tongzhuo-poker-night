"use client";

import { useMemo, useState } from "react";
import type { HistoryEvent, HistoryEventType, LuckyGameState } from "../../../lib/lucky-types";

const eventNames: Record<HistoryEventType, string> = {
  achievement: "成就",
  spin: "转盘",
  effect: "效果",
  hand: "手牌",
  player: "玩家",
  dice: "骰子",
  system: "系统",
};

export function HistoryPanel({ state, onClear }: { state: LuckyGameState; onClear: () => void }) {
  const [playerId, setPlayerId] = useState("");
  const [hand, setHand] = useState("");
  const [type, setType] = useState<HistoryEventType | "">("");
  const filtered = useMemo(() => state.history.filter((item) =>
    (!playerId || item.playerId === playerId)
    && (!hand || item.handNumber === Number(hand))
    && (!type || item.type === type)), [hand, playerId, state.history, type]);

  function exportJson() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), state }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lucky-poker-hand-${state.handNumber}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="history-page lucky-panel">
      <div className="lucky-section-title"><span><small>SESSION LOG</small><b>历史记录</b></span><em>{filtered.length}</em></div>
      <div className="history-filters">
        <label>玩家<select value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">全部玩家</option>{state.players.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label>
        <label>Hand<input type="number" min="1" placeholder="全部" value={hand} onChange={(event) => setHand(event.target.value)} /></label>
        <label>事件<select value={type} onChange={(event) => setType(event.target.value as HistoryEventType | "")}><option value="">全部类型</option>{Object.entries(eventNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <button type="button" onClick={exportJson}>导出 JSON</button>
        <button className="danger-outline" type="button" onClick={onClear}>清空记录</button>
      </div>
      <div className="history-list">{[...filtered].reverse().map((item: HistoryEvent) => <article key={item.id}><div><span>HAND #{item.handNumber}</span><em>{eventNames[item.type]}</em></div><b>{item.title}</b><p>{item.playerName ? `${item.playerName} · ` : ""}{item.detail}</p><time>{new Date(item.at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></article>)}{!filtered.length && <div className="lucky-empty"><span>⌛</span><b>暂无记录</b><p>触发成就、转动转盘和使用效果后会自动记录。</p></div>}</div>
    </section>
  );
}
