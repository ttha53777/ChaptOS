"use client";

import React, { useEffect, useRef, useState } from "react";
import { dropCard, nudgeCard, setWidgetHidden, type DashCardId, type DashboardLayout } from "@/lib/dashboard-layout";
import { EditChrome } from "./EditChrome";

export interface GridCard {
  node: React.ReactNode;
  label: string;
  /** Spans the full row once the grid collapses below desktop. */
  wide?: boolean;
  /** Stand-in shown in Customize mode when the card renders nothing right now
   *  (the ballot only appears while a vote is waiting), so it can still be placed. */
  ghost?: string;
}

type Drop = { card: DashCardId; after: boolean } | { column: "main" | "rail" };

/**
 * The dashboard's two-column grid, in whatever order the org's layout says.
 *
 * `cards` holds only what this org can have (workflow + Settings switches);
 * ids the layout names that aren't in it are skipped, which is why a hidden
 * workflow's card keeps its slot for when it comes back.
 *
 * Below desktop the two columns dissolve (`display: contents`) and the cards
 * interleave main/rail by CSS `order`, so each column's top card stays near the
 * top of the single stack.
 */
export function DashGrid({
  layout,
  cards,
  editing,
  onChange,
}: {
  layout: DashboardLayout;
  cards: Partial<Record<DashCardId, GridCard>>;
  editing: boolean;
  onChange: (next: DashboardLayout, moved?: DashCardId) => void;
}) {
  const hidden = new Set(layout.hidden);
  const visible = (k: DashCardId) => !!cards[k] && !hidden.has(k);
  const main = layout.main.filter(visible);
  const rail = layout.rail.filter(visible);

  const order: DashCardId[] = [];
  for (let i = 0; i < Math.max(main.length, rail.length); i++) {
    if (main[i]) order.push(main[i]);
    if (rail[i]) order.push(rail[i]);
  }

  const [dragW, setDragW] = useState<DashCardId | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [landed, setLanded] = useState<DashCardId | null>(null);
  const landT = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (landT.current) clearTimeout(landT.current); }, []);

  function commit(next: DashboardLayout, w: DashCardId) {
    if (next === layout) return;
    onChange(next, w);
    setLanded(w);
    if (landT.current) clearTimeout(landT.current);
    landT.current = setTimeout(() => setLanded(null), 700);
  }

  function dropAt(e: React.DragEvent): Drop | null {
    const el = e.target as HTMLElement;
    const t = el.closest<HTMLElement>(".dw[data-w]");
    if (t && t.dataset.w) {
      const r = t.getBoundingClientRect();
      return { card: t.dataset.w as DashCardId, after: e.clientY > r.top + r.height / 2 };
    }
    const col = el.closest<HTMLElement>("[data-col]");
    return col ? { column: col.dataset.col as "main" | "rail" } : null;
  }

  const dragProps = editing ? {
    onDragOver: (e: React.DragEvent) => {
      if (!dragW) return;
      const d = dropAt(e);
      if (!d) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDrop(d && "card" in d && d.card === dragW ? null : d);
    },
    onDrop: (e: React.DragEvent) => {
      if (!dragW) return;
      e.preventDefault();
      const d = dropAt(e);
      if (d && !("card" in d && d.card === dragW)) commit(dropCard(layout, dragW, d), dragW);
      setDrop(null);
    },
  } : {};

  const column = (c: "main" | "rail", ids: DashCardId[]) => (
    <div
      className={`col ${c === "main" ? "col-main" : "rail col-rail"}${drop && "column" in drop && drop.column === c ? " drop-end" : ""}`}
      data-col={c}
    >
      {ids.map(k => {
        const card = cards[k]!;
        const mark = drop && "card" in drop && drop.card === k ? (drop.after ? " drop-a" : " drop-b") : "";
        return (
          <div
            key={k}
            data-w={k}
            className={`dw${card.wide ? " wide" : ""}${dragW === k ? " dragging" : ""}${landed === k ? " landed" : ""}${mark}`}
            style={{ order: order.indexOf(k) }}
            draggable={editing || undefined}
            onDragStart={editing ? (e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", k);
              setDragW(k);
            } : undefined}
            onDragEnd={editing ? () => { setDragW(null); setDrop(null); } : undefined}
          >
            <div className="dw-body">{card.node}</div>
            {editing && card.ghost && (
              <div className="dw-ghost"><b>{card.label}</b><span>{card.ghost}</span></div>
            )}
            {editing && (
              <EditChrome
                label={card.label}
                inRail={c === "rail"}
                onMove={dir => commit(nudgeCard(layout, k, dir, visible), k)}
                onHide={() => onChange(setWidgetHidden(layout, k, true))}
              />
            )}
          </div>
        );
      })}
      {editing && ids.length === 0 && <div className="dw-empty">Drop a card here</div>}
    </div>
  );

  return (
    <div className={`grid dg${editing ? " editing" : ""}`} {...dragProps}>
      {column("main", main)}
      {column("rail", rail)}
    </div>
  );
}
