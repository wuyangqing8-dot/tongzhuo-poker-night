"use client";

import type { ReactNode } from "react";

export function Modal({ title, kicker, children, onClose, wide = false }: {
  title: string;
  kicker?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="lucky-modal-backdrop">
      <section className={`lucky-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <button className="lucky-modal-close" type="button" onClick={onClose} aria-label="关闭">×</button>
        {kicker && <span className="lucky-kicker">{kicker}</span>}
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
