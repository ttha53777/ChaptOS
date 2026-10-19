"use client";

/**
 * Treasury → Dues: who owes what, at a glance and person by person.
 *
 * The real version of _design/Treasury Dues Paper Mock.html. Everything on it is
 * read off GET /api/dues (lib/services/dues-charge-service.ts getDuesBoard): the
 * server allocates payments oldest-due-first and sends each member's standing,
 * so nothing here re-derives money — it only scopes and sorts what it was sent.
 *
 * Everyone in the chapter sees this tab. Controls that change a tab (hand out,
 * record, waive, edit or take back a charge) are treasury-gated and live in the
 * Hand out sheet, the stub's edit sheet and the member drawer. Every write
 * refreshes the board, the roster and — for a payment — the books, through
 * `onChanged`, then says what happened in a toast that can undo it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DuesBoard, DuesChargeSummary, DuesStanding, MemberDuesStanding } from "@/lib/api-types/dues";
import { daysBetween } from "@/lib/dues-ledger";
import type { Brother } from "../../../data";
import { roleTitle } from "../../../data";
import { BrotherAvatar } from "../../BrotherAvatar";
import { PaperIcon } from "../../paper/PaperIcon";
import { apiErrorMessage } from "../../../lib/api";
import { ChargeEditSheet } from "./ChargeEditSheet";
import { DuesMemberDrawer, type DuesWriteDone } from "./DuesMemberDrawer";
import { HandOutDuesSheet, type RoleOption, type SheetStart } from "./HandOutDuesSheet";
import { voidCharge } from "./dues-api";
import {
  STANDING, STANDING_ORDER, STRIP_ORDER, chargeAmounts, chargeTone, dueLine, fmtDay, money, plural, standingLine,
} from "./dues-ui";

export type DuesFilter = "all" | DuesStanding;

/** Where the tab opens when something hands you through its door (a deep link, the Overview card). */
export interface DuesJump {
  filter: DuesFilter | null;
  memberId: number | null;
  /** Open with the Hand out sheet up. */
  sheet?: boolean;
}

export interface DuesPerson {
  id: number;
  name: string;
  title: string;
  avatarUrl: string | null;
  /** Highest-ranked role, for the Role grouping; null = holds none. */
  topRole: { id: number; name: string; rank: number } | null;
  /** Every role they hold — what a by-role charge bills them for. */
  roleIds: number[];
}

/** One member's position in the current view (the whole term, or one charge). */
interface Row {
  p: DuesPerson;
  s: DuesStanding;
  billed: number;
  paid: number;
  owes: number;
  lateDays: number;
  nextDueDate: string | null;
}

/** Roster rows → what the Dues tab shows for a person. Anyone the board names but the roster doesn't (archived) still gets a row. */
export function toPeople(roster: readonly Brother[]): Map<number, DuesPerson> {
  const out = new Map<number, DuesPerson>();
  for (const b of roster) {
    const top = [...(b.roles ?? [])].sort((x, y) => y.rank - x.rank)[0] ?? null;
    out.set(b.id, {
      id: b.id, name: b.name, title: roleTitle(b), avatarUrl: b.avatarUrl ?? null,
      topRole: top ? { id: top.id, name: top.name, rank: top.rank } : null,
      roleIds: (b.roles ?? []).map(r => r.id),
    });
  }
  return out;
}

function personFor(people: Map<number, DuesPerson>, id: number): DuesPerson {
  return people.get(id) ?? { id, name: "Former member", title: "No longer on the roster", avatarUrl: null, topRole: null, roleIds: [] };
}

/** A member's row, either over every charge in view or scoped to one charge. */
function rowFor(m: MemberDuesStanding, p: DuesPerson, scope: DuesChargeSummary | null, today: string): Row | null {
  if (!scope) {
    return { p, s: m.standing, billed: m.billed, paid: m.paid, owes: m.owes, lateDays: m.lateDays, nextDueDate: m.nextDueDate };
  }
  const line = m.lines.find(l => l.chargeId === scope.id);
  if (!line) return null;
  const late = line.rest > 0 && scope.dueDate !== null && scope.dueDate < today;
  return {
    p,
    s: line.rest === 0 ? "paid" : late ? "overdue" : "due",
    billed: line.amount,
    paid: Math.round((line.amount - line.rest) * 100) / 100,
    owes: line.rest,
    lateDays: late ? daysBetween(scope.dueDate!, today) : 0,
    nextDueDate: line.rest > 0 ? scope.dueDate : null,
  };
}

export function DuesTab({
  board, error, loading, roster, selfId, avatarRevision, canTreasury, duesWord, jump, onChanged,
}: {
  board: DuesBoard | null;
  error: string | null;
  loading: boolean;
  roster: readonly Brother[];
  selfId: number | null;
  avatarRevision: number;
  canTreasury: boolean;
  /** The org's word for dues ("Dues", "Contributions"). */
  duesWord: string;
  jump?: DuesJump | null;
  /** Re-fetch the board and roster (and the books, when `tx`) after a write. */
  onChanged: (opts: { tx?: boolean }) => Promise<void>;
}) {
  const [filter, setFilter]     = useState<DuesFilter>(jump?.filter ?? "all");
  const [group, setGroup]       = useState<"standing" | "role">("standing");
  const [view, setView]         = useState<"wall" | "list">("wall");
  const [scopeId, setScopeId]   = useState<number | null>(null);
  const [q, setQ]               = useState("");
  const [openId, setOpenId]     = useState<number | null>(jump?.memberId ?? null);
  const [tip, setTip]           = useState<{ id: number; x: number; y: number } | null>(null);
  const [sheet, setSheet]       = useState<SheetStart | null>(jump?.sheet && canTreasury ? { mode: "all" } : null);
  const [editId, setEditId]     = useState<number | null>(null);
  const [bookKey, setBookKey]   = useState(0);
  const [toast, setToast]       = useState<{ msg: string; undo?: () => Promise<string>; n: number } | null>(null);
  const wallRef = useRef<HTMLDivElement>(null);

  // Toasts linger long enough to reach Undo, then go.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.undo ? 7000 : 5200);
    return () => window.clearTimeout(t);
  }, [toast]);
  const closeDrawer = useCallback(() => setOpenId(null), []);
  const closeSheet  = useCallback(() => setSheet(null), []);
  const closeEdit   = useCallback(() => setEditId(null), []);
  const say = useCallback((msg: string, undo?: () => Promise<string>) => setToast(t => ({ msg, undo, n: (t?.n ?? 0) + 1 })), []);

  /** After any write: pull everything it touched back in, re-read the open drawer, then toast. */
  const done = useCallback(async ({ msg, undo, tx }: DuesWriteDone) => {
    try { await onChanged({ tx }); }
    catch { msg = `${msg} — but the page didn't refresh. Reload to see it.`; }
    setBookKey(k => k + 1);
    say(msg, undo);
  }, [onChanged, say]);

  async function runUndo() {
    const undo = toast?.undo;
    if (!undo) return;
    setToast(null);
    try {
      const msg = await undo();
      await done({ msg, tx: false });
    } catch (e) {
      say(apiErrorMessage(e, "Couldn't undo that."));
    }
  }

  // A jump can also arrive after mount (the page reads ?tab=Dues&f=…&m=… in an effect).
  useEffect(() => {
    if (!jump) return;
    if (jump.filter) { setFilter(jump.filter); setScopeId(null); }
    if (jump.memberId) setOpenId(jump.memberId);
    if (jump.sheet && canTreasury) setSheet({ mode: "all" });
  }, [jump, canTreasury]);

  const people = useMemo(() => toPeople(roster), [roster]);
  const roster$ = useMemo(() => [...people.values()].sort((a, b) => a.name.localeCompare(b.name)), [people]);
  const roles = useMemo<RoleOption[]>(() => {
    const out = new Map<number, RoleOption>();
    for (const b of roster) for (const r of b.roles ?? []) out.set(r.id, { id: r.id, name: r.name, rank: r.rank });
    return [...out.values()].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
  }, [roster]);
  const today = board?.today ?? "";
  const scope = board?.charges.find(c => c.id === scopeId) ?? null;
  // A scoped charge can disappear (taken back, or another term picked): fall back to everything.
  useEffect(() => { if (scopeId !== null && board && !scope) setScopeId(null); }, [scopeId, board, scope]);

  const rows = useMemo(() => {
    if (!board) return [] as Row[];
    return board.members
      .map(m => rowFor(m, personFor(people, m.brotherId), scope, board.today))
      .filter((r): r is Row => r !== null);
  }, [board, people, scope]);

  if (!board) {
    return (
      <div className="du">
        {error ? <div className="du-empty">{error}</div> : <div className="tr-skel" style={{ height: 360, marginTop: 28, borderRadius: 22 }} aria-busy={loading} />}
      </div>
    );
  }

  const sheetEl = sheet && (
    <HandOutDuesSheet
      start={sheet} people={roster$} roles={roles} board={board} duesWord={duesWord}
      selfId={selfId} avatarRevision={avatarRevision}
      onClose={closeSheet}
      onIssued={issued => {
        setSheet(null); setOpenId(null); setScopeId(null); setFilter("all");
        void done({
          msg: `${issued.name} handed out · ${plural(issued.people, "person", "people")} · ${money(issued.total)}${issued.skipped ? ` · ${issued.skipped} skipped` : ""}`,
          undo: async () => { await voidCharge(issued.id); return "Charge taken back. Nobody was billed."; },
        });
      }}
    />
  );
  const toastEl = toast && (
    <div key={toast.n} className="du-toast" role="status">
      <span>{toast.msg}</span>
      {toast.undo && <button type="button" onClick={runUndo}>Undo</button>}
    </div>
  );

  if (board.charges.length === 0) {
    return (
      <div className="du">
        <DayOne count={rows.length} canTreasury={canTreasury} duesWord={duesWord} onStart={setSheet} />
        {sheetEl}{toastEl}
      </div>
    );
  }

  const count = (s: DuesStanding) => rows.filter(r => r.s === s).length;
  const sum = (pick: (r: Row) => number, only?: DuesStanding) =>
    Math.round(rows.filter(r => !only || r.s === only).reduce((t, r) => t + pick(r), 0) * 100) / 100;
  const billed = sum(r => r.billed), paid = sum(r => r.paid);
  const overdue = sum(r => r.owes, "overdue"), due = sum(r => r.owes, "due");
  const pct = billed ? Math.floor((paid / billed) * 100) : 0;

  const needle = q.trim().toLowerCase();
  const visible = rows.filter(r =>
    (filter === "all" || r.s === filter)
    && (!needle || r.p.name.toLowerCase().includes(needle) || r.p.title.toLowerCase().includes(needle)));

  const viewer = board.viewer;
  const showYourTab = !canTreasury && viewer !== null && viewer.billed > 0;
  const openPerson = openId !== null ? personFor(people, openId) : null;
  const editCharge = editId !== null ? board.charges.find(c => c.id === editId) ?? null : null;

  return (
    <div className="du">
      {showYourTab && <YourTab viewer={viewer!} charges={board.charges} today={today} onOpen={() => setOpenId(viewer!.brotherId)} />}

      <section className="du-top">
        <div className="du-card du-hero">
          <p className="du-k"><PaperIcon name="jar" />{scope ? `${scope.name}${scope.dueDate ? ` · due ${fmtDay(scope.dueDate)}` : ""}` : board.term ? `${board.term.label}, every charge` : "Every charge"}</p>
          <div className="du-big"><b>{money(paid)}</b><span>collected of <em>{money(billed)}</em> billed · {pct}%</span></div>
          <div className="du-mbar" role="img" aria-label={`Collected ${pct} percent`}>
            {paid > 0 && <i className="du-p" style={{ flexBasis: `${(paid / billed) * 100}%` }} />}
            {due > 0 && <i className="du-d" style={{ flexBasis: `${(due / billed) * 100}%` }} />}
            {overdue > 0 && <i className="du-o" style={{ flexBasis: `${(overdue / billed) * 100}%` }} />}
          </div>
          <div className="du-legend">
            {/* Paid shows whenever money came in, even if nobody is square yet. */}
            {([["paid", "Paid", paid], ["due", "Not due yet", due], ["overdue", "Overdue", overdue]] as const).map(([s, l, v]) => (count(s) > 0 || v > 0) && (
              <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(f => f === s ? "all" : s)}>
                <span className="du-sw" data-s={s} />{l} <b>{money(v)}</b>{count(s) > 0 && <span className="du-n">· {plural(count(s), "person", "people")}</span>}
              </button>
            ))}
          </div>
          <div className="du-strip-h"><span><span className="du-hint-hover">One square per member · hover for a name, click to open</span><span className="du-hint-touch">One square per member · tap one to open</span></span><span className="du-mono">{count("paid")} / {rows.length} square</span></div>
          <div className={`du-strip${filter !== "all" ? " du-dim" : ""}`} onMouseLeave={() => setTip(null)}>
            {STRIP_ORDER.flatMap(s => rows.filter(r => r.s === s).sort((a, b) => a.p.name.localeCompare(b.p.name))).map(r => (
              <button
                key={r.p.id} type="button" data-s={r.s} className={filter === r.s ? "du-on" : ""} aria-label={`${r.p.name}: ${STANDING[r.s].chip}`}
                onClick={() => setOpenId(r.p.id)}
                onMouseEnter={e => { const b = e.currentTarget.getBoundingClientRect(); setTip({ id: r.p.id, x: b.left + b.width / 2, y: b.top }); }}
              />
            ))}
          </div>
          {canTreasury && (
            <div className="du-cta">
              <button type="button" className="du-btn" onClick={() => setSheet({ mode: "all" })}><PaperIcon name="plus" />Hand out {duesWord.toLowerCase()}</button>
              <button type="button" className="du-btn du-ghost" onClick={() => {
                const f: DuesFilter = count("overdue") ? "overdue" : count("due") ? "due" : "all";
                setFilter(f); setView("wall");
                wallRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                say("Tap who paid, then Record payment on their tab.");
              }}><PaperIcon name="wallet" />Record a payment</button>
            </div>
          )}
        </div>

        <div className="du-card du-charges">
          <div className="du-charges-h">
            <h3>Charges</h3>
            {scope
              ? <button type="button" className="du-link" onClick={() => setScopeId(null)}>Show every charge</button>
              : <span className="du-k">{plural(board.charges.length, "bill")}</span>}
          </div>
          <div className="du-stubs">
            {board.charges.map(c => {
              const amt = chargeAmounts(c);
              return (
                <div key={c.id} className="du-stub-w">
                <button
                  type="button" className="du-stub" style={{ "--c": chargeTone(c) } as React.CSSProperties}
                  aria-pressed={scopeId === c.id} onClick={() => { setScopeId(id => id === c.id ? null : c.id); setFilter("all"); }}
                >
                  <i />
                  <span className="du-nm"><span>{c.name}</span><span className="du-aud">{c.audienceLabel}</span></span>
                  <span className="du-amt">
                    <b>{amt.text}{amt.each && <small> ea</small>}</b>
                    <small>{c.paidPeople}/{c.people} paid</small>
                    <span className="du-prog"><i style={{ width: `${c.people ? (c.paidPeople / c.people) * 100 : 0}%` }} /></span>
                  </span>
                  <span className="du-meta">
                    {c.overdue ? <span className="du-od">Overdue since {fmtDay(c.dueDate!)}</span> : c.dueDate ? <>Due {fmtDay(c.dueDate)}</> : <>No due date</>}
                    <span>·</span><span>{money(c.outstanding)} out</span>
                  </span>
                </button>
                {canTreasury && <button type="button" className="du-stub-more" aria-label={`Edit ${c.name}`} onClick={() => setEditId(c.id)}><PaperIcon name="dots" /></button>}
                </div>
              );
            })}
          </div>
          <div className="du-foot">
            <span>Tap a charge to see only its payers.</span>
            {canTreasury && <button type="button" className="du-link" onClick={() => setSheet({ mode: "all" })}><PaperIcon name="plus" />New charge</button>}
          </div>
        </div>
      </section>

      <div className="du-wall-h" ref={wallRef}>
        <div>
          <h2>{scope ? `Who owes for ${scope.name}` : "Who owes what"}</h2>
          <p>{scope ? `${plural(rows.length, "person", "people")} on this charge` : "Everyone on the roster, sorted by where they stand"}</p>
        </div>
        <div className="du-tools">
          <label className="du-srch"><PaperIcon name="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a member or role" aria-label="Find a member or role" /></label>
          <div className="du-seg" role="group" aria-label="Group by">
            <button type="button" aria-pressed={group === "standing"} onClick={() => setGroup("standing")}>Standing</button>
            <button type="button" aria-pressed={group === "role"} onClick={() => setGroup("role")}>Role</button>
          </div>
          <div className="du-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "wall"} aria-label="Tags" onClick={() => setView("wall")}><PaperIcon name="board" /></button>
            <button type="button" aria-pressed={view === "list"} aria-label="List" onClick={() => setView("list")}><PaperIcon name="sheet" /></button>
          </div>
        </div>
      </div>

      <div className="du-filt">
        <FilterChip f="all" label="Everyone" n={rows.length} cur={filter} set={setFilter} />
        <FilterChip f="overdue" label="Overdue" n={count("overdue")} cur={filter} set={setFilter} />
        <FilterChip f="due" label="Not due yet" n={count("due")} cur={filter} set={setFilter} />
        <FilterChip f="paid" label="Paid up" n={count("paid")} cur={filter} set={setFilter} />
        {count("none") > 0 && <FilterChip f="none" label="Nothing billed" n={count("none")} cur={filter} set={setFilter} />}
        {scope && <span className="du-note">Filtered to <b>{scope.name}</b><button type="button" className="du-link" onClick={() => setScopeId(null)}>clear</button></span>}
      </div>

      {visible.length === 0 ? (
        <div className="du-empty">Nobody matches that. <button type="button" className="du-link" onClick={() => { setFilter("all"); setQ(""); setScopeId(null); }}>Show everyone</button></div>
      ) : view === "list" ? (
        <Table rows={visible} onOpen={setOpenId} selfId={selfId} avatarRevision={avatarRevision} />
      ) : (
        <Lanes rows={visible} group={group} onOpen={setOpenId} selfId={selfId} avatarRevision={avatarRevision}
          onBill={canTreasury ? key => setSheet({ mode: "role", key }) : undefined} />
      )}

      {tip && (() => {
        const r = rows.find(x => x.p.id === tip.id);
        return r ? <div className="du-tip" style={{ left: tip.x, top: tip.y }}>{r.p.name}<span>{r.s === "paid" ? "paid up" : r.s === "none" ? "nothing billed" : money(r.owes)}</span></div> : null;
      })()}

      {openPerson && (
        <DuesMemberDrawer
          person={openPerson} today={today} selfId={selfId} avatarRevision={avatarRevision}
          refreshKey={bookKey}
          onClose={closeDrawer}
          manage={canTreasury ? { onBill: () => { const id = openPerson.id; setOpenId(null); setSheet({ mode: "pick", brotherIds: [id] }); }, onDone: done } : undefined}
        />
      )}

      {editCharge && (
        <ChargeEditSheet
          charge={editCharge} today={today}
          onClose={closeEdit}
          onSaved={() => { setEditId(null); void done({ msg: `${editCharge.name} updated` }); }}
          onTakenBack={() => { setEditId(null); void done({ msg: `${editCharge.name} taken back. It’s off every tab.` }); }}
        />
      )}
      {sheetEl}{toastEl}
    </div>
  );
}

function FilterChip({ f, label, n, cur, set }: { f: DuesFilter; label: string; n: number; cur: DuesFilter; set: (f: DuesFilter) => void }) {
  return (
    <button type="button" className="du-fchip" aria-pressed={cur === f} onClick={() => set(cur === f && f !== "all" ? "all" : f)}>
      {f !== "all" && <span className="du-sw" data-s={f} />}{label}<span className="du-c">{n}</span>
    </button>
  );
}

function Lanes({ rows, group, onOpen, selfId, avatarRevision, onBill }: {
  rows: Row[]; group: "standing" | "role"; onOpen: (id: number) => void; selfId: number | null; avatarRevision: number;
  /** Role grouping, treasurers only: open the sheet billing this lane's role. */
  onBill?: (key: number | "none") => void;
}) {
  const lanes = group === "standing"
    ? STANDING_ORDER.map(s => ({ key: s, label: STANDING[s].lane, s, rows: rows.filter(r => r.s === s) }))
    : (() => {
        const byRole = new Map<string, { label: string; rank: number; rows: Row[] }>();
        for (const r of rows) {
          const key = r.p.topRole ? `r${r.p.topRole.id}` : "none";
          const lane = byRole.get(key) ?? { label: r.p.topRole?.name ?? "Members", rank: r.p.topRole?.rank ?? -Infinity, rows: [] };
          lane.rows.push(r);
          byRole.set(key, lane);
        }
        return [...byRole.entries()].sort((a, b) => b[1].rank - a[1].rank).map(([key, l]) => ({
          key, label: l.label, s: null as DuesStanding | null, rows: l.rows,
          bill: (key === "none" ? "none" : Number(key.slice(1))) as number | "none",
        }));
      })();

  return (
    <>
      {lanes.filter(l => l.rows.length).map(l => {
        const sorted = [...l.rows].sort((a, b) => group === "role"
          ? STANDING_ORDER.indexOf(a.s) - STANDING_ORDER.indexOf(b.s) || b.owes - a.owes
          : b.owes - a.owes || b.lateDays - a.lateDays || a.p.name.localeCompare(b.p.name));
        const out = Math.round(l.rows.reduce((t, r) => t + r.owes, 0) * 100) / 100;
        return (
          <section key={l.key} className="du-lane">
            <div className="du-lane-h">
              <span className="du-sw" data-s={l.s ?? "role"} />
              <h3>{l.label}</h3><span className="du-c">{l.rows.length}</span>
              <span className="du-sum">{out ? `${money(out)} out` : l.s === "paid" ? "all square" : ""}</span>
              {onBill && "bill" in l && <button type="button" className="du-link du-lane-bill" onClick={() => onBill(l.bill)}>Bill {l.label}</button>}
            </div>
            <div className="du-tags">
              {sorted.map(r => <Tag key={r.p.id} r={r} onOpen={onOpen} selfId={selfId} avatarRevision={avatarRevision} />)}
            </div>
          </section>
        );
      })}
    </>
  );
}

function Tag({ r, onOpen, selfId, avatarRevision }: { r: Row; onOpen: (id: number) => void; selfId: number | null; avatarRevision: number }) {
  return (
    <button type="button" className="du-tag" data-s={r.s} onClick={() => onOpen(r.p.id)}>
      <span className="du-who">
        <BrotherAvatar brother={{ id: r.p.id, name: r.p.name, avatarUrl: r.p.avatarUrl }} selfId={selfId} avatarRevision={avatarRevision} size="xs" className="du-av" />
        <span className="du-nm"><b>{r.p.name}{r.p.id === selfId ? " (you)" : ""}</b><small>{r.p.title}</small></span>
      </span>
      <span className="du-owe">
        <b>{r.s === "paid" ? <><PaperIcon name="check" />Paid up</> : r.s === "none" ? "Nothing billed" : money(r.owes)}</b>
        <span className="du-st">{standingLine(r.s, r.lateDays, r.nextDueDate)}</span>
      </span>
      {r.billed > 0 && <>
        <span className="du-bar"><i style={{ width: `${(r.paid / r.billed) * 100}%` }} /></span>
        <span className="du-sub">{money(r.paid)} of {money(r.billed)} paid</span>
      </>}
    </button>
  );
}

function Table({ rows, onOpen, selfId, avatarRevision }: { rows: Row[]; onOpen: (id: number) => void; selfId: number | null; avatarRevision: number }) {
  const sorted = [...rows].sort((a, b) => STANDING_ORDER.indexOf(a.s) - STANDING_ORDER.indexOf(b.s) || b.owes - a.owes);
  return (
    <div className="du-tbl" role="table">
      <div className="du-tr du-th" role="row"><span>Member</span><span>Role</span><span className="du-n">Billed</span><span className="du-n">Paid</span><span className="du-n">Owes</span><span>Standing</span></div>
      {sorted.map(r => (
        <button key={r.p.id} type="button" className="du-tr" role="row" onClick={() => onOpen(r.p.id)}>
          <span className="du-nm"><BrotherAvatar brother={{ id: r.p.id, name: r.p.name, avatarUrl: r.p.avatarUrl }} selfId={selfId} avatarRevision={avatarRevision} size="xs" className="du-av" /><span>{r.p.name}</span></span>
          <span className="du-rl">{r.p.title}</span>
          <span className="du-n">{r.billed ? money(r.billed) : "—"}</span>
          <span className="du-n">{r.paid ? money(r.paid) : "—"}</span>
          <span className="du-n du-owe">{r.owes ? money(r.owes) : "—"}</span>
          <span><span className="du-stp" data-s={r.s}>{r.s === "overdue" ? `${r.lateDays}d late` : STANDING[r.s].chip}</span></span>
        </button>
      ))}
    </div>
  );
}

function YourTab({ viewer, charges, today, onOpen }: { viewer: MemberDuesStanding; charges: DuesChargeSummary[]; today: string; onOpen: () => void }) {
  const next = viewer.nextChargeId !== null ? charges.find(c => c.id === viewer.nextChargeId) ?? null : null;
  return (
    <section className="du-card du-you" data-s={viewer.standing}>
      <div>
        <p className="du-k"><PaperIcon name="jar" />Your tab</p>
        <div className="du-big"><b>{viewer.owes ? money(viewer.owes) : "Square"}</b>
          <span>{viewer.owes ? (viewer.standing === "overdue" ? `${viewer.lateDays} days late` : next ? `${next.name} · ${dueLine(next.dueDate, today).toLowerCase()}` : "owed") : `${money(viewer.paid)} paid · nothing left`}</span>
        </div>
        {next?.note && <p className="du-note">{next.note}</p>}
      </div>
      <button type="button" className="du-btn du-ghost" onClick={onOpen}>See it line by line</button>
    </section>
  );
}

function DayOne({ count, canTreasury, duesWord, onStart }: { count: number; canTreasury: boolean; duesWord: string; onStart: (s: SheetStart) => void }) {
  const start = canTreasury ? onStart : undefined;
  return (
    <section className="du-d1">
      <span className="du-eyebrow">{duesWord}</span>
      <h2>Nobody’s been <span className="du-hi">billed</span> yet.</h2>
      <p>{canTreasury
        ? `Hand out the term’s ${duesWord.toLowerCase()} once and this page keeps the tab for all ${count} of you: who’s paid, who’s late, and what’s still out.`
        : `When your treasurer hands out ${duesWord.toLowerCase()}, this page shows what each of you owes, what’s been paid, and what’s late.`}</p>
      <div className="du-ways">
        <Way icon="people" tone="sky" title="Everyone" body="One amount, the whole roster." eg={`Fall dues · $140 × ${count}`} onClick={start && (() => start({ mode: "all" }))} />
        <Way icon="star" tone="lilac" title="By role" body="A rate per role. Holding two roles? They pay both." eg="Treasurer $60 · Social $40" onClick={start && (() => start({ mode: "role" }))} />
        <Way icon="hand" tone="peach" title="A few people" body="Fines, a shirt, a retreat seat." eg="Late fine · $25 × 3" onClick={start && (() => start({ mode: "pick" }))} />
      </div>
      {start && <button type="button" className="du-btn du-d1-go" onClick={() => start({ mode: "all" })}><PaperIcon name="plus" />Hand out {duesWord.toLowerCase()}</button>}
      <div className="du-d1-strip">
        <div className="du-strip">{Array.from({ length: count }, (_, i) => <span key={i} data-s="none" />)}</div>
        <p>One square per member. Each one fills in as they pay.</p>
      </div>
    </section>
  );
}

function Way({ icon, tone, title, body, eg, onClick }: { icon: "people" | "star" | "hand"; tone: string; title: string; body: string; eg: string; onClick?: () => void }) {
  const inner = <>
    <span className="du-g"><PaperIcon name={icon} /></span>
    <h4>{title}</h4><p>{body}</p><div className="du-eg">{eg}</div>
  </>;
  const style = { "--c": `var(--pp-${tone})` } as React.CSSProperties;
  return onClick
    ? <button type="button" className="du-way" style={style} onClick={onClick}>{inner}</button>
    : <div className="du-way" style={style}>{inner}</div>;
}
