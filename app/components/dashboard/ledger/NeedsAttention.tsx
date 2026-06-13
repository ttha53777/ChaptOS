import React from "react";
import { fmt$, fmtDate, type AttentionItem } from "../../../data";

/**
 * "Needs attention" queue — the first content block. Renders the ordered
 * AttentionItem[] from deriveNeedsAttention(). Actions route to existing
 * handlers: Mark done → completeDeadline, Open profile → open the brother
 * drawer, Send reminder → open the Dues KPI drawer (decision: no new backend).
 */
export function NeedsAttention({
  items,
  onMarkDone,
  onOpenProfile,
  onSendReminder,
  hideButton,
}: {
  items: AttentionItem[];
  onMarkDone: (deadlineId: number) => void;
  onOpenProfile: (brotherId: number) => void;
  onSendReminder: () => void;
  hideButton?: React.ReactNode;
}) {
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
        items.map((it) => {
          if (it.kind === "deadline-overdue") {
            return (
              <div className="att-row" key={`d-${it.id}`}>
                <span className="dot bg-rose" />
                <span className="tag rose">OVERDUE</span>
                <div className="body">
                  <p className="t">{it.title}</p>
                  <p className="m">
                    Due {fmtDate(it.dueDate)} · {it.owner.split(" ")[0]} · {it.daysLate} day{it.daysLate === 1 ? "" : "s"} late
                  </p>
                </div>
                <button type="button" className="act" onClick={() => onMarkDone(it.id)}>Mark done</button>
              </div>
            );
          }
          if (it.kind === "dues") {
            return (
              <div className="att-row" key="dues">
                <span className="dot bg-gold" />
                <span className="tag gold">DUES</span>
                <div className="body">
                  <p className="t">{fmt$(it.total)} outstanding across {it.brothers.length} {it.brothers.length === 1 ? "brother" : "brothers"}</p>
                  <p className="m">
                    {it.brothers.slice(0, 3).map((b) => `${b.name.split(" ")[0]} ${fmt$(b.amount)}`).join(" · ")}
                    {it.brothers.length > 3 ? " · …" : ""}
                  </p>
                </div>
                <button type="button" className="act" onClick={onSendReminder}>Send reminder</button>
              </div>
            );
          }
          return (
            <div className="att-row" key={`m-${it.brotherId}`}>
              <span className="dot bg-rose" />
              <span className="tag rose">MEMBER</span>
              <div className="body">
                <p className="t">{it.name} flagged at risk</p>
                <p className="m">{it.attendance}% attendance · {it.gpa.toFixed(1)} GPA · {it.serviceHours} service hours</p>
              </div>
              <button type="button" className="act" onClick={() => onOpenProfile(it.brotherId)}>Open profile</button>
            </div>
          );
        })
      )}
    </section>
  );
}
