"use client";
// The timeline itself, as the demos draw it: month headings, a dashed spine,
// and one card per event with a dot in its type's colour.
import type { KeyboardEvent, ReactNode } from "react";
import { byWhen, dayNum, monthOf, typeOf, weekday, type Ev, type EvType } from "./timeline-data";

export function Spine({ events, types, extra, fresh, stamp, rowRef, empty, onPick, picked, nudge }: {
  events: Ev[];
  types: EvType[];
  /** Anything a demo hangs under the card's meta line (detail stamps). */
  extra?: (ev: Ev) => ReactNode;
  /** The row that just arrived: drops in. */
  fresh?: string | null;
  /** The row wearing the ON THE TIMELINE stamp. */
  stamp?: { key: string; label: string; small: string } | null;
  rowRef?: (key: string, el: HTMLLIElement | null) => void;
  empty?: ReactNode;
  /** Makes each card open the event (the add demo's rail). */
  onPick?: (key: string) => void;
  /** The row whose rail is open. */
  picked?: string | null;
  /** The row that's asking to be opened. */
  nudge?: string | null;
}) {
  const sorted = [...events].sort(byWhen);
  if (!sorted.length && empty) return <div className="tld-spine tld-spine--empty">{empty}</div>;
  let month = "";
  return (
    <ol className="tld-spine">
      {sorted.flatMap(ev => {
        const t = typeOf(types, ev.type);
        const m = monthOf(ev.date);
        const out: ReactNode[] = [];
        if (m !== month) { month = m; out.push(<li key={`m-${m}`} className="tld-month" aria-hidden>{m}</li>); }
        out.push(
          <li key={ev.key} ref={el => rowRef?.(ev.key, el)} data-key={ev.key} data-type={ev.type}
            className={`tld-row${fresh === ev.key ? " fresh" : ""}${picked === ev.key ? " picked" : ""}${nudge === ev.key ? " nudge" : ""}`} style={{ ["--c" as string]: t.color }}>
            <span className="tld-day"><b>{dayNum(ev.date)}</b><small>{weekday(ev.date)}</small></span>
            <div className={`tld-card${onPick ? " pick" : ""}`} {...onPick && {
              role: "button", tabIndex: 0, "aria-pressed": picked === ev.key, onClick: () => onPick(ev.key),
              onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(ev.key); } },
            }}>
              <span className="k">{t.label}{(ev.required ?? (ev.type === "chapter")) && <em>Required</em>}</span>
              <b className="t">{ev.title}</b>
              <span className="m">{ev.time ?? "Due by midnight"}{ev.place ? ` · ${ev.place}` : ""}</span>
              {extra?.(ev)}
              {stamp?.key === ev.key && <span className="tld-ink" aria-hidden>{stamp.label}<small>{stamp.small}</small></span>}
            </div>
          </li>,
        );
        return out;
      })}
    </ol>
  );
}
