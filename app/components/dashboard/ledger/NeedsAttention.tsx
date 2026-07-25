import React, { useState } from "react";
import { fmt$, fmtDate, type AttentionItem } from "../../../data";
import { isAttendanceExempt } from "@/lib/thresholds";
import { ALL_TRACKED, type TrackedMetrics } from "@/lib/tracked-metrics";
import { useVocab } from "../../../hooks/useVocab";

/** Rows shown before the list collapses behind "Show all". */
const VISIBLE_LIMIT = 6;

/**
 * "Needs attention" queue — the first content block. Renders the ordered
 * AttentionItem[] from deriveNeedsAttention(). Actions route to existing
 * handlers: Mark done → completeDeadline, Open profile → open the brother
 * drawer, Send reminder → open the Dues KPI drawer (decision: no new backend).
 *
 * Capped at VISIBLE_LIMIT rows: this card sits above the roster, and an
 * uncapped list on a large org pushes everything else off the screen. The count
 * chip always reports the true total.
 */
export function NeedsAttention({
  items,
  onMarkDone,
  onOpenProfile,
  onSendReminder,
  onOpenReimbursements,
  hideButton,
  tracked = ALL_TRACKED,
}: {
  items: AttentionItem[];
  onMarkDone: (deadlineId: number) => void;
  onOpenProfile: (brotherId: number) => void;
  onSendReminder: () => void;
  onOpenReimbursements: () => void;
  hideButton?: React.ReactNode;
  tracked?: TrackedMetrics;
}) {
  const v = useVocab();
  const [expanded, setExpanded] = useState(false);
  const overflow = items.length - VISIBLE_LIMIT;
  const visible = expanded ? items : items.slice(0, VISIBLE_LIMIT);

  return (
    <section className="card dash-group" aria-label="Needs attention">
      {hideButton}
      <div className="card-h">
        <h2>
          Needs attention
          {items.length > 0 && <span className="count-chip">{items.length}</span>}
        </h2>
        <span className="sub">Resolved items drop off</span>
      </div>

      {items.length === 0 ? (
        <div className="rail-empty">Nothing needs attention — nice work.</div>
      ) : (
        visible.map((it) => {
          if (it.kind === "deadline-overdue") {
            return (
              <div className="att-row" key={`d-${it.id}`}>
                <span className="dot bg-rose" />
                <span className="tag rose">OVERDUE</span>
                <div className="body">
                  <p className="t">{it.title}</p>
                  <p className="m">
                    Due {fmtDate(it.dueDate)} · {it.assignees} · {it.daysLate} day{it.daysLate === 1 ? "" : "s"} late
                  </p>
                </div>
                <button type="button" className="act" onClick={() => onMarkDone(it.id)}>Mark done</button>
              </div>
            );
          }
          if (it.kind === "reimbursement") {
            return (
              <div className="att-row" key="reimbursement">
                <span className="dot bg-rose" />
                <span className="tag rose">REIMBURSE</span>
                <div className="body">
                  <p className="t">{it.count} reimbursement {it.count === 1 ? "request" : "requests"} awaiting review · {fmt$(it.total)}</p>
                  <p className="m">
                    {it.requests.slice(0, 3).map((r) => `${r.name.split(" ")[0]} ${fmt$(r.amount)}`).join(" · ")}
                    {it.requests.length > 3 ? " · …" : ""}
                  </p>
                </div>
                <button type="button" className="act" onClick={onOpenReimbursements}>Review</button>
              </div>
            );
          }
          if (it.kind === "dues") {
            return (
              <div className="att-row" key="dues">
                <span className="dot bg-gold" />
                <span className="tag gold">DUES</span>
                <div className="body">
                  <p className="t">{fmt$(it.total)} outstanding across {it.brothers.length} {v("Member", it.brothers.length !== 1).toLowerCase()}</p>
                  <p className="m">
                    {it.brothers.slice(0, 3).map((b) => `${b.name.split(" ")[0]} ${fmt$(b.amount)}`).join(" · ")}
                    {it.brothers.length > 3 ? " · …" : ""}
                  </p>
                </div>
                <button type="button" className="act" onClick={onSendReminder}>Send reminder</button>
              </div>
            );
          }
          // Only report measures the org tracks — otherwise the line reads
          // "0.0 GPA · 0 service hours" for metrics nobody ever recorded.
          const detail = [
            tracked.attendance
              ? (isAttendanceExempt(it.attendance) ? "Exempt from attendance" : `${it.attendance}% attendance`)
              : null,
            tracked.gpa ? `${it.gpa.toFixed(1)} GPA` : null,
            tracked.serviceHours ? `${it.serviceHours} ${v("Service").toLowerCase()} hours` : null,
          ].filter(Boolean).join(" · ");
          return (
            <div className="att-row" key={`m-${it.brotherId}`}>
              <span className="dot bg-rose" />
              <span className="tag rose">MEMBER</span>
              <div className="body">
                <p className="t">{it.name} flagged at risk</p>
                {detail && <p className="m">{detail}</p>}
              </div>
              <button type="button" className="act" onClick={() => onOpenProfile(it.brotherId)}>Open profile</button>
            </div>
          );
        })
      )}

      {overflow > 0 && (
        <button type="button" className="att-more" onClick={() => setExpanded(e => !e)}>
          {expanded ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}
