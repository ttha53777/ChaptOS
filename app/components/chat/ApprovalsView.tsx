"use client";

// Approvals — the approval record. Purely the HISTORY of approvals: actions
// that were approved, by whom, under what authority (the required permission),
// newest first, grouped by day, filterable by kind. Not a queue — proposals
// that never landed leave no record here. Tapping a row reopens the approved
// action as a settled writ card with its audit stamp.
//
// Data: GET /api/ai/approvals (records written at confirm time from the
// server-signed proposal blob — see lib/services/chat-approval-service.ts).

import { useEffect, useMemo, useState } from "react";
import { orgFetch } from "../../lib/api";
import { IcLock, IcTick, KindGlyph } from "./icons";

interface ApprovalRecord {
  id: number;
  kind: string;
  title: string;    // writ title — "Record a dues payment"
  summary: string;  // list-row label — "Record $200 dues · Kofi Adjei"
  rows: Array<{ k: string; v: string; em?: boolean }>;
  permLabel: string;
  approvedByName: string;
  approvedByRole: string;
  approvedAt: string; // ISO
}

const KIND_LABELS: Record<string, string> = {
  dues: "Dues",
  treasury: "Treasury",
  events: "Events",
  timeline: "Timeline",
  instagram: "Instagram",
  programming: "Programming",
};

function dayGroup(iso: string, now: Date): { key: string; label: string; date: string } {
  const d = new Date(iso);
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const dateLbl = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (day(d) === day(now)) return { key: day(d), label: "Today", date: dateLbl };
  if (day(d) === day(yesterday)) return { key: day(d), label: "Yesterday", date: dateLbl };
  return { key: day(d), label: dateLbl, date: d.toLocaleDateString("en-US", { weekday: "short" }) };
}

function stampOf(a: ApprovalRecord): string {
  const t = new Date(a.approvedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${t} · ${a.approvedByName} (${a.approvedByRole})`;
}

export function ApprovalsView() {
  const [records, setRecords] = useState<ApprovalRecord[] | null>(null); // null = loading
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    orgFetch("/api/ai/approvals")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { approvals?: ApprovalRecord[] }) => {
        if (!cancelled) setRecords(Array.isArray(d.approvals) ? d.approvals : []);
      })
      .catch(() => { if (!cancelled) { setRecords([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const a of records ?? []) c.set(a.kind, (c.get(a.kind) ?? 0) + 1);
    return c;
  }, [records]);

  const shown = useMemo(
    () => (records ?? []).filter(a => filter === "all" || a.kind === filter),
    [records, filter],
  );

  const groups = useMemo(() => {
    const now = new Date();
    const out: Array<{ key: string; label: string; date: string; items: ApprovalRecord[] }> = [];
    for (const a of shown) {
      const g = dayGroup(a.approvedAt, now);
      const last = out[out.length - 1];
      if (last && last.key === g.key) last.items.push(a);
      else out.push({ ...g, items: [a] });
    }
    return out;
  }, [shown]);

  return (
    <div className="cs-inbox">
      <div className="inbox-hd">
        <h3>Approvals</h3>
        <span className="meta">The approval record — every action approved, and under whose authority.</span>
      </div>

      {records !== null && records.length > 0 && (
        <div className="audit-filters">
          <button type="button" className={`fchip${filter === "all" ? " on" : ""}`} onClick={() => setFilter("all")}>
            All · {records.length}
          </button>
          {[...counts.entries()].map(([kind, n]) => (
            <button key={kind} type="button" className={`fchip${filter === kind ? " on" : ""}`} onClick={() => setFilter(kind)}>
              {KIND_LABELS[kind] ?? kind} · {n}
            </button>
          ))}
        </div>
      )}

      {records === null && <div className="inbox-empty"><p className="note">Opening the record…</p></div>}
      {records !== null && shown.length === 0 && (
        <div className="inbox-empty">
          <p className="note">
            {failed
              ? <>The record couldn&apos;t be opened — try again in a moment.</>
              : filter === "all"
                ? <>Nothing on record yet — approve a proposal in chat and it will be <em>entered here.</em></>
                : <>No <em>{KIND_LABELS[filter]?.toLowerCase() ?? filter}</em> approvals on record.</>}
          </p>
        </div>
      )}

      {groups.map(g => (
        <div key={g.key} className="inbox-sec">
          <div className="lbl">{g.label} <span className="date">{g.date}</span></div>
          {g.items.map(a => {
            const isOpen = openId === a.id;
            return (
              <div key={a.id} className={`appr${isOpen ? " open" : ""}`}>
                <button type="button" className="appr-row" onClick={() => setOpenId(isOpen ? null : a.id)}>
                  <span className="glyph"><KindGlyph kind={a.kind} /></span>
                  <span className="rb">
                    <span className="t">{a.summary}</span>
                    <span className="s">Approved by <b>{a.approvedByName}</b> · {a.approvedByRole} · {new Date(a.approvedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                  </span>
                  <span className="permpill"><span className="lk"><IcLock size={11} /></span>{a.permLabel}</span>
                </button>
                {isOpen && (
                  <div className="appr-detail">
                    <div className="writ">
                      <div className="wh"><span className="chip-tag">Proposal</span><span className="what">{a.title}</span></div>
                      <div className="wb">
                        {a.rows.map(r => (
                          <div key={r.k} className="wrow">
                            <span className="wk">{r.k}</span>
                            <span className={`wv${r.em ? " em" : ""}`}>{r.v}</span>
                          </div>
                        ))}
                      </div>
                      <div className="permline"><span className="lk"><IcLock size={11} /></span>Requires <b>{a.permLabel}</b></div>
                      <div className="settled">
                        <span className="tk"><IcTick /></span>
                        <span className="txt">Approved.</span>
                        <span className="stamp">{stampOf(a)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
