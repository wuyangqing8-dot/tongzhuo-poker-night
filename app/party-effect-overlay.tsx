"use client";

import type { CardCode, PartyEffectEvent, Suit } from "../lib/poker-types";

const glyphs: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

function EventCard({ code, crossed = false, accepted = false }: { code: CardCode; crossed?: boolean; accepted?: boolean }) {
  const rank = code[0] === "T" ? "10" : code[0];
  const suit = glyphs[code[1] as Suit];
  const red = code[1] === "H" || code[1] === "D";
  return <span className={`party-event-card ${red ? "red" : ""} ${crossed ? "crossed" : ""} ${accepted ? "accepted" : ""}`}><b>{rank}</b><i>{suit}</i></span>;
}

function EventVisual({ event }: { event: PartyEffectEvent }) {
  if (event.presentation === "board_redraw" && event.cards?.length) {
    if (event.cards.length === 2) return <div className="party-event-cards"><EventCard code={event.cards[0]} crossed /><span>→</span><EventCard code={event.cards[1]} accepted /></div>;
    return <div className="party-event-cards"><EventCard code={event.cards[0]} /><span>或</span><EventCard code={event.cards[1]} /><span>→</span><EventCard code={event.cards[2]} accepted /></div>;
  }
  if (event.presentation === "pass_left") return <div className="party-pass-visual"><i>🂠</i><span>➜</span><i>🂠</i><span>➜</span><i>🂠</i></div>;
  if (event.presentation === "hole_redraw") return <div className="party-redraw-visual"><i>🂠</i><i>🂠</i><span>重新发牌</span><b>✦</b></div>;
  if (event.presentation === "seat_swap") return <div className="party-swap-visual"><i>●</i><span>⇄</span><i>●</i></div>;
  if (event.presentation === "reveal") return <div className="party-reveal-visual">{event.emoji}<span className="reveal-rays" /></div>;
  return <div className="party-generic-visual">{event.emoji}</div>;
}

export default function PartyEffectOverlay({ event }: { event: PartyEffectEvent | null }) {
  if (!event) return null;
  const kicker = event.kind === "awarded" ? "NEW PARTY SKILL" : event.kind === "armed" ? "SKILL ARMED" : event.kind === "expired" ? "SKILL EXPIRED" : "SERVER EXECUTED";
  return (
    <div className={`party-effect-overlay ${event.presentation} ${event.kind}`} role="status" aria-live="assertive">
      <span className="party-effect-kicker">{kicker}</span>
      <EventVisual event={event} />
      <div className="party-effect-copy"><b>{event.title}</b><p>{event.detail}</p><small>Hand #{event.handNumber} · 已同步给牌桌玩家</small></div>
    </div>
  );
}
