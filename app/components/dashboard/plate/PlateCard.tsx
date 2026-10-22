"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fmt$, fmtDate } from "../../../data";
import { useVocab } from "../../../hooks/useVocab";
import { PaperIcon, PaperTile, type PaperIconName, type PaperTone } from "../../paper/PaperIcon";
import { SectionError } from "../ledger/SectionError";
import { useToast } from "../Toast";
import type { PlateItem, PlateLane, PlatePerm } from "./derive-plate";
import "./plate-card.css";

/**
 * "On your plate" — the dashboard's one list of everything waiting on the
 * viewer, replacing Needs attention. _design/Plate + Attention Merge Mock.html.
 *
 * Every row has exactly one button. Tasks, votes and reimbursements finish
 * inside the card; dues and wrap-ups lead to the page that owns them. Rows the
 * viewer sees because of a permission carry an "as <role>" tag.
 *
 * Only lanes with something in them show. Wide (main column): rows two-up.
 * Narrow (rail, phone): one column, capped at RAIL_LIMIT behind "Show more".
 */

const RAIL_LIMIT = 4;
/** Below this card width the list is one column. Matches plate-card.css. */
const WIDE_AT = 540;
const LANES: [PlateLane, string][] = [["late", "Late"], ["today", "Today"], ["soon", "Coming up"]];

type Finished = { key: string; label: string; undo?: () => void };

function days(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}
/** "today", "Thu", "Oct 30": near dates by weekday, far ones by date. */
function when(iso: string, today: string): string {
  const d = days(today, iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (Math.abs(d) <= 6) return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
  return fmtDate(iso);
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function PlateCard({
  items, today, roleNames, hasData = true, loading = false, error = false, onRetry,
  onCompleteTask, onReopenTask, onVote, onReimbursement, onWrapUp, onOpenDues, onOpenMyDues,
}: {
  items: PlateItem[];
  today: string;
  /** The viewer's role that grants each permission, for the "as Treasurer" tag. */
  roleNames: Partial<Record<PlatePerm, string>>;
  /** False when nothing in the org has a record yet. An empty list then means
   *  "nothing measured", not "nothing waiting", and gets no all-clear stamp. */
  hasData?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onCompleteTask: (id: number) => void;
  onReopenTask: (id: number) => void;
  /** Rejects on failure so the row can stay open and say so. */
  onVote: (pollId: number, optionId: number) => Promise<unknown>;
  onReimbursement: (id: number, status: "approved" | "rejected") => Promise<boolean>;
  onWrapUp: (eventId: number) => void;
  onOpenDues?: () => void;
  onOpenMyDues?: () => void;
}) {
  const v = useVocab();
  const toast = useToast();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  // Starts on your own items; "All" adds the ones you see because of a role.
  const [scope, setScope] = useState<"all" | "mine">("mine");
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [finished, setFinished] = useState<Finished[]>([]);
  const [showFinished, setShowFinished] = useState(false);
  // Rows on their way out: kept on screen, struck through, for a beat after the
  // data already dropped them, so a tap visibly lands before the list closes up.
  const [leaving, setLeaving] = useState<{ item: PlateItem; index: number }[]>([]);
  const [pick, setPick] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ key: string; msg: string } | null>(null);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= WIDE_AT));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!leaving.length) return;
    const t = setTimeout(() => setLeaving([]), 650);
    return () => clearTimeout(t);
  }, [leaving]);

  const hasOthers = items.some(i => !i.mine);
  const mineCount = items.filter(i => i.mine).length;
  const scoped = scope === "mine" && hasOthers ? items.filter(i => i.mine) : items;
  // Re-insert leaving rows where they stood.
  const list = [...scoped];
  for (const l of leaving) if (!list.some(i => i.key === l.item.key)) list.splice(Math.min(l.index, list.length), 0, l.item);
  const leavingKeys = new Set(leaving.map(l => l.item.key));

  const capped = !wide && !more && list.length > RAIL_LIMIT + 1;
  const visible = capped ? list.slice(0, RAIL_LIMIT) : list;

  function finish(item: PlateItem, label: string, msg: string, undo?: () => void) {
    setOpen(null);
    setRowError(null);
    setLeaving(l => [...l, { item, index: scoped.findIndex(i => i.key === item.key) }]);
    setFinished(f => [{ key: item.key, label, undo }, ...f.filter(x => x.key !== item.key)]);
    toast.success(msg);
  }

  function tag(it: PlateItem) {
    // On You every row is yours, so the tag only earns its place under All.
    if (it.mine) return hasOthers && scope === "all" ? <span className="pl-why">for you</span> : null;
    return <span className="pl-why role">as {it.as ? roleNames[it.as] ?? "officer" : "officer"}</span>;
  }

  function row(it: PlateItem) {
    const isOpen = open === it.key;
    const out = leavingKeys.has(it.key);
    let icon: PaperIconName, tone: PaperTone, title: React.ReactNode, meta: React.ReactNode, action: React.ReactNode = null, drawer: React.ReactNode = null;
    const late = (s: string) => <span className="late">{s}</span>;
    const toggle = (label: string) => (
      <button type="button" className={`btn sm ${isOpen ? "ghost" : ""}`} aria-expanded={isOpen}
        onClick={() => { setRowError(null); setOpen(isOpen ? null : it.key); }}>
        {isOpen ? <><PaperIcon name="x" /> Close</> : label}
      </button>
    );

    switch (it.kind) {
      case "task": {
        icon = "box"; tone = it.lane === "late" ? "peach" : "mint";
        title = it.title;
        meta = <>
          {it.dueDate == null ? "No due date" : it.lane === "late"
            ? <>Due {when(it.dueDate, today)} · {late(`${plural(it.daysLate, "day")} late`)}</>
            : `Due ${when(it.dueDate, today)}`}
        </>;
        action = (
          <button type="button" className="btn sm" onClick={() => {
            onCompleteTask(it.id);
            finish(it, it.title, "Marked done", () => onReopenTask(it.id));
          }}><PaperIcon name="check" /> Mark done</button>
        );
        break;
      }
      case "poll": {
        icon = "chat"; tone = "lilac";
        title = `Vote: ${it.question}`;
        meta = it.closeDate ? (it.lane === "today" ? late("Closes today") : `Closes ${when(it.closeDate, today)}`) : "Open until it's closed";
        action = toggle("Vote");
        const chosen = pick[it.id];
        drawer = (
          <div className="pl-dr">
            <p className="pl-q">Pick one. Your vote counts once you cast it.</p>
            <div className="pl-opts" role="radiogroup" aria-label={it.question}>
              {it.options.map(o => (
                <button type="button" key={o.id} role="radio" aria-checked={chosen === o.id}
                  className={`pl-opt${chosen === o.id ? " on" : ""}`} onClick={() => setPick(p => ({ ...p, [it.id]: o.id }))}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="pl-acts">
              <button type="button" className="btn sm ghost" onClick={() => setOpen(null)}>Not now</button>
              <button type="button" className="btn sm solid" disabled={chosen == null || busy === it.key} onClick={async () => {
                setBusy(it.key);
                try {
                  await onVote(it.id, chosen);
                  finish(it, `Vote: ${it.question}`, "Vote cast");
                } catch {
                  setRowError({ key: it.key, msg: "That vote didn't go through. Try again." });
                } finally { setBusy(null); }
              }}><PaperIcon name="check" /> {busy === it.key ? "Casting…" : "Cast vote"}</button>
            </div>
          </div>
        );
        break;
      }
      case "wrap-up": {
        icon = "clip"; tone = "rose";
        title = `Wrap up ${it.title}`;
        meta = <>{it.dueDate ? `Happened ${when(it.dueDate, today)}` : "Happened"} · {late("not wrapped up yet")}</>;
        action = <button type="button" className="btn sm" onClick={() => onWrapUp(it.id)}>Wrap up <PaperIcon name="arrow-r" /></button>;
        break;
      }
      case "reimbursement": {
        icon = "receipt"; tone = "sky";
        title = `${plural(it.requests.length, "reimbursement")} to review · ${fmt$(it.total)}`;
        meta = it.requests.slice(0, 3).map(r => `${r.name.split(" ")[0]} ${fmt$(r.amount)}`).join(" · ") + (it.requests.length > 3 ? " · …" : "");
        action = toggle("Review");
        const act = async (ids: number[], status: "approved" | "rejected") => {
          setBusy(it.key);
          setRowError(null);
          let ok = 0;
          for (const id of ids) if (await onReimbursement(id, status)) ok++;
          setBusy(null);
          if (ok < ids.length) { setRowError({ key: it.key, msg: "Some of those didn't save. Try again." }); return; }
          const who = ids.length === 1 ? it.requests.find(r => r.id === ids[0])?.name.split(" ")[0] : `All ${ids.length}`;
          if (ids.length === it.requests.length) finish(it, "Reimbursements reviewed", `${who} ${status}`);
          else toast.success(`${who} ${status}`);
        };
        drawer = (
          <div className="pl-dr">
            <p className="pl-q">Approving records it as an expense in Treasury.</p>
            {it.requests.map(r => (
              <div className="pl-rq" key={r.id}>
                <div><b>{r.name} · {fmt$(r.amount)}</b><small>{r.description} · {fmtDate(r.date)}</small></div>
                <div className="pl-rq-a">
                  <button type="button" className="pl-mini" disabled={busy === it.key} onClick={() => act([r.id], "rejected")}>Reject</button>
                  <button type="button" className="pl-mini ok" disabled={busy === it.key} onClick={() => act([r.id], "approved")}>Approve</button>
                </div>
              </div>
            ))}
            <div className="pl-acts">
              <button type="button" className="btn sm ghost" onClick={() => setOpen(null)}>Close</button>
              {it.requests.length > 1 && (
                <button type="button" className="btn sm pl-mint" disabled={busy === it.key} onClick={() => act(it.requests.map(r => r.id), "approved")}>
                  <PaperIcon name="check" /> Approve all {it.requests.length}
                </button>
              )}
            </div>
          </div>
        );
        break;
      }
      case "dues": {
        icon = "wallet"; tone = "butter";
        title = `${fmt$(it.total)} in ${v("Dues").toLowerCase()} outstanding`;
        meta = <>
          {it.count} {v("Member", it.count !== 1).toLowerCase()}
          {it.overdue > 0 && <> · {late(`${it.overdue} overdue`)}</>}
          {" · "}{it.top.map(b => `${b.name.split(" ")[0]} ${fmt$(b.amount)}`).join(", ")}{it.count > 3 ? "…" : ""}
        </>;
        if (onOpenDues) action = <button type="button" className="btn sm" onClick={onOpenDues}>Open {v("Dues").toLowerCase()} <PaperIcon name="arrow-r" /></button>;
        break;
      }
      case "my-dues": {
        icon = "wallet"; tone = "butter";
        title = `You owe ${fmt$(it.amount)} in ${v("Dues").toLowerCase()}`;
        meta = it.lateDays > 0 ? late(`${plural(it.lateDays, "day")} overdue`) : "Unpaid balance";
        if (onOpenMyDues) action = <button type="button" className="btn sm" onClick={onOpenMyDues}>See {v("Dues").toLowerCase()} <PaperIcon name="arrow-r" /></button>;
        break;
      }
    }

    return (
      <div key={it.key} className={`pl-it${isOpen ? " open" : ""}${out ? " out" : ""}`} data-lane={it.lane}>
        <div className="pl-r">
          <span className="pl-tile">{out ? <PaperTile icon="check" tone="mint" /> : <PaperTile icon={icon} tone={tone} />}</span>
          <div className="pl-x">
            <b>{title}</b>
            <div className="pl-m">{meta}</div>
            {tag(it)}
          </div>
          {action}
        </div>
        {isOpen && drawer}
        {isOpen && rowError?.key === it.key && <p className="pl-err" role="alert">{rowError.msg}</p>}
      </div>
    );
  }

  let body: React.ReactNode;
  if (error) body = <SectionError what="your list" onRetry={onRetry} />;
  else if (loading) body = (
    <div className="pl-skel" aria-busy="true" aria-label="Loading what's on your plate">
      {[0, 1, 2].map(i => <i key={i} className="skel" />)}
    </div>
  );
  else if (!items.length && !leaving.length) body = hasData ? (
    <div className="pl-clear"><span className="pl-stamp">ALL CLEAR</span><p>Nothing&rsquo;s waiting on you right now.</p></div>
  ) : (
    <div className="pl-hello">
      <PaperTile icon="mug" tone="peach" />
      <div><b>Nothing here yet.</b><p>Tasks, votes and anything else waiting on you will show up here.</p></div>
    </div>
  );
  else body = (
    <>
      {hasOthers && (
        <div className="pl-scope" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={scope === "mine"} className={scope === "mine" ? "on" : ""} onClick={() => setScope("mine")}>
            You <em>{mineCount}</em>
          </button>
          <button type="button" role="tab" aria-selected={scope === "all"} className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>
            All <em>{items.length}</em>
          </button>
        </div>
      )}
      {!list.length ? (
        // Your part is done but the role queue isn't: say so, and keep the way to it.
        <div className="pl-clear">
          <span className="pl-stamp">ALL CLEAR</span>
          <p>Nothing of yours is waiting. {items.length} {items.length === 1 ? "item for your role is" : "items for your role are"} under All.</p>
          <button type="button" className="btn sm" onClick={() => setScope("all")}>Show all {items.length} <PaperIcon name="arrow-r" /></button>
        </div>
      ) : (
      <div className="pl-lanes">
        {LANES.map(([lane, label]) => {
          const rows = visible.filter(i => i.lane === lane);
          const n = list.filter(i => i.lane === lane && !leavingKeys.has(i.key)).length;
          if (!rows.length) return null;
          return (
            <div className="pl-lane" data-lane={lane} key={lane}>
              <div className="pl-lane-h">{label} <span>{n}</span></div>
              <div className="pl-list">
                {rows.map(row)}
              </div>
            </div>
          );
        })}
      </div>
      )}
      {!wide && list.length > RAIL_LIMIT + 1 && (
        <button type="button" className="pl-more" onClick={() => setMore(m => !m)}>
          {more ? "Show less" : `Show ${list.length - RAIL_LIMIT} more`}
        </button>
      )}
    </>
  );

  const left = scoped.length;
  return (
    <section className="card pl dash-group" aria-label="On your plate">
      <div className="card-h">
        <PaperTile icon="flag" tone="peach" />
        <h2>On your plate</h2>
        {!loading && !error && (left > 0
          ? <span className="pl-left">{left} left</span>
          : hasData && <span className="pl-left clear">all clear</span>)}
      </div>
      <div className="pl-b" ref={bodyRef}>
        {body}
      </div>
      {finished.length > 0 && (
        <div className={`pl-done${showFinished ? " open" : ""}`}>
          <button type="button" aria-expanded={showFinished} onClick={() => setShowFinished(s => !s)}>
            <PaperIcon name="check" /> Just finished · {finished.length}
            <PaperIcon name="chev-d" className="pp-ic chev" />
          </button>
          {showFinished && (
            <ul>
              {finished.map(f => (
                <li key={f.key}>
                  <s>{f.label}</s>
                  {f.undo && (
                    <button type="button" onClick={() => {
                      f.undo?.();
                      setFinished(list => list.filter(x => x.key !== f.key));
                      toast.success("Put back");
                    }}>Undo</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
