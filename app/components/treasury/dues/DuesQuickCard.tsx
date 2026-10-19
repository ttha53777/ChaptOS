"use client";

/**
 * Overview → the short Dues card. It replaced "Who still owes" (a list of names
 * with Pay / + Add beside each): this one only says how dues stand and hands you
 * into the Dues tab for anything you'd do about it.
 *
 * Every number is the board the Dues tab reads (GET /api/dues), so the card and
 * the tab can't disagree. Each row carries its filter through the door, and a
 * square carries its member.
 */
import React from "react";
import type { DuesBoard, DuesStanding } from "@/lib/api-types/dues";
import { PaperIcon } from "../../paper/PaperIcon";
import type { DuesFilter, DuesPerson } from "./DuesTab";
import { Stack } from "./HandOutDuesSheet";
import { STANDING, STRIP_ORDER, fmtDay, money, plural } from "./dues-ui";

export function DuesQuickCard({ board, error, people, duesWord, canTreasury, selfId, avatarRevision, onGo, onHandOut }: {
  board: DuesBoard | null;
  error: string | null;
  people: Map<number, DuesPerson>;
  duesWord: string;
  canTreasury: boolean;
  selfId: number | null;
  avatarRevision: number;
  /** Open the Dues tab on a filter, or with a member's tab open. */
  onGo: (filter: DuesFilter, memberId?: number) => void;
  /** Open the Dues tab with the Hand out sheet up. */
  onHandOut: () => void;
}) {
  const head = (pill: React.ReactNode) => (
    <div className="du-dq-h">
      <span className="du-tile"><PaperIcon name="jar" /></span>
      <h3>{duesWord}</h3>
      {pill}
      <span className="du-go-ar" aria-hidden="true"><PaperIcon name="arrow-r" /></span>
    </div>
  );
  // The whole card opens the tab; the rows and squares inside are their own, more specific doors.
  const cardProps = {
    className: "du du-dq", role: "link", tabIndex: 0, "aria-label": `Open ${duesWord}`,
    onClick: () => onGo("all"),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" && e.target === e.currentTarget) onGo("all"); },
  };
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  if (!board) {
    return (
      <div {...cardProps}>
        {head(null)}
        {error ? <p className="du-dq-d1">{error}</p> : <div className="tr-skel" style={{ height: 150, margin: "4px 20px 20px", borderRadius: 14 }} />}
      </div>
    );
  }

  if (board.charges.length === 0) {
    return (
      <div {...cardProps}>
        {head(null)}
        <div className="du-dq-d1">
          <p>Nobody’s been billed{board.term ? ` for ${board.term.label}` : ""}. {canTreasury
            ? `Hand out ${duesWord.toLowerCase()} to everyone, by role, or to a few people.`
            : `When your treasurer hands out ${duesWord.toLowerCase()}, who’s paid shows up here.`}</p>
          <div className="du-strip">{board.members.map(m => <span key={m.brotherId} data-s="none" />)}</div>
        </div>
        <div className="du-dq-f">
          <span>{plural(board.members.length, "member")}, nothing billed</span>
          {canTreasury && <button type="button" className="du-open" onClick={stop(onHandOut)}><PaperIcon name="plus" />Hand out {duesWord.toLowerCase()}</button>}
        </div>
      </div>
    );
  }

  const by: Record<DuesStanding, typeof board.members> = { overdue: [], due: [], paid: [], none: [] };
  for (const m of board.members) by[m.standing].push(m);
  const owe = by.overdue.length + by.due.length;
  const { billed, paid } = board.totals;
  const pct = billed ? Math.floor((paid / billed) * 100) : 0;
  const sum = (s: DuesStanding) => Math.round(by[s].reduce((t, m) => t + m.owes, 0) * 100) / 100;
  const nameOf = (id: number) => people.get(id)?.name ?? "Former member";
  const order = STRIP_ORDER.flatMap(s => [...by[s]].sort((a, b) => nameOf(a.brotherId).localeCompare(nameOf(b.brotherId))));
  // The next charge still collecting: due today or later, with money out.
  const next = board.charges
    .filter(c => c.dueDate !== null && c.dueDate >= board.today && c.outstanding > 0)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0] ?? null;
  const toPeople = (ms: typeof board.members) => ms
    .sort((a, b) => b.owes - a.owes)
    .map(m => people.get(m.brotherId))
    .filter((p): p is DuesPerson => !!p);

  return (
    <div {...cardProps}>
      {head(<span className={`du-pill ${owe ? "du-rose" : "du-mint"}`}>{owe ? `${owe} owe` : "All paid"}</span>)}
      <div className="du-dq-sum"><b>{pct}%</b><span>collected · <em>{money(paid)}</em> of {money(billed)}</span></div>
      <div className="du-strip">
        {order.map(m => (
          <button key={m.brotherId} type="button" tabIndex={-1} data-s={m.standing} title={`${nameOf(m.brotherId)}: ${STANDING[m.standing].chip}`}
            aria-label={`${nameOf(m.brotherId)}: ${STANDING[m.standing].chip}`} onClick={stop(() => onGo("all", m.brotherId))} />
        ))}
      </div>
      <div className="du-dq-rows">
        {(["overdue", "due", "paid"] as const).map(s => by[s].length > 0 && (
          <button key={s} type="button" className="du-dq-row" data-s={s} onClick={stop(() => onGo(s))}>
            <span className="du-sw" data-s={s} />
            <span className="du-nm"><b>{STANDING[s].lane}</b>{s !== "paid" && <Stack ps={toPeople([...by[s]])} max={3} selfId={selfId} avatarRevision={avatarRevision} />}</span>
            <span className="du-c">{by[s].length}</span>
            <span className="du-v">{s === "paid" ? "" : money(sum(s))}</span>
            <PaperIcon name="chev-r" className="pp-ic du-ch" />
          </button>
        ))}
      </div>
      <div className="du-dq-f">
        {next
          ? <span>Next due · <b>{next.name}</b> {fmtDay(next.dueDate!)}</span>
          : <span>{plural(board.charges.length, "charge")}{board.term ? ` in ${board.term.label}` : ""}</span>}
        <span className="du-open">Open {duesWord} <PaperIcon name="arrow-r" /></span>
      </div>
    </div>
  );
}
