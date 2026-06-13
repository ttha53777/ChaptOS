import React from "react";
import { fmt$, getBrotherStatus, type Brother, type BrotherStatus, type Thresholds } from "../../../data";
import { BrotherAvatar } from "../../BrotherAvatar";

const STATUS_TAG: Record<BrotherStatus, { cls: string; label: string }> = {
  "Good":    { cls: "st-good",  label: "GOOD" },
  "Watch":   { cls: "st-watch", label: "WATCH" },
  "At Risk": { cls: "st-risk",  label: "AT RISK" },
};

const SORTABLE: [keyof Brother, string][] = [
  ["attendance", "Attendance"],
  ["duesOwed", "Dues"],
  ["gpa", "GPA"],
  ["serviceHours", "Svc"],
];

function SortHead({
  label, colKey, active, dir, onSort, numeric,
}: {
  label: string; colKey: keyof Brother; active: boolean; dir: "asc" | "desc";
  onSort: (k: keyof Brother) => void; numeric?: boolean;
}) {
  return (
    <th
      className={numeric ? "num" : undefined}
      style={{ cursor: "pointer" }}
      onClick={() => onSort(colKey)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}{active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );
}

/**
 * Editorial roster, restyle of the Brother Tracking table. Reuses the page's
 * filtered+sorted `brothers`, the filter/sort callbacks, getBrotherStatus, and
 * the Pay/+1h handlers. Carries `id="sec-brothers"` for the sidebar anchor.
 */
export function RosterTable({
  brothers,
  statusCounts,
  statusFilter,
  onFilter,
  sortKey,
  sortDir,
  onSort,
  onRowClick,
  thresholds,
  selfId,
  selfAvatarUrl,
  avatarRevision,
  canBrothers,
  onPayDues,
  onAddServiceHour,
  hideButton,
}: {
  brothers: Brother[];
  statusCounts: { Good: number; Watch: number; "At Risk": number };
  statusFilter: string;
  onFilter: (f: string) => void;
  sortKey: keyof Brother | null;
  sortDir: "asc" | "desc";
  onSort: (k: keyof Brother) => void;
  onRowClick: (id: number) => void;
  thresholds: Thresholds;
  selfId: number | null;
  selfAvatarUrl?: string | null;
  avatarRevision: number;
  canBrothers: boolean;
  onPayDues: (b: Brother) => void;
  onAddServiceHour: (b: Brother) => void;
  hideButton?: React.ReactNode;
}) {
  const total = statusCounts.Good + statusCounts.Watch + statusCounts["At Risk"];
  const filters: [string, number][] = [
    ["All", total],
    ["Good", statusCounts.Good],
    ["Watch", statusCounts.Watch],
    ["At Risk", statusCounts["At Risk"]],
  ];

  return (
    <section id="sec-brothers" className="card dash-group" aria-label="Roster">
      {hideButton}
      <div className="card-h">
        <h2>Roster</h2>
        <div className="filters">
          {filters.map(([f, n]) => (
            <button key={f} className={statusFilter === f ? "on" : undefined} onClick={() => onFilter(f)}>
              {f} {n}
            </button>
          ))}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Brother</th>
            <th>Role</th>
            {SORTABLE.map(([k, label]) => (
              <SortHead
                key={k}
                label={label}
                colKey={k}
                active={sortKey === k}
                dir={sortDir}
                onSort={onSort}
                numeric={k !== "attendance"}
              />
            ))}
            <th className="num">Status</th>
          </tr>
        </thead>
        <tbody>
          {brothers.length === 0 ? (
            <tr><td colSpan={7} className="muted" style={{ padding: "24px 18px", textAlign: "center" }}>No brothers match your filters.</td></tr>
          ) : (
            brothers.map((b) => {
              const status = getBrotherStatus(b, thresholds);
              const attCls = b.attendance >= thresholds.attendanceWatch ? "sage" : b.attendance >= thresholds.attendanceAtRisk ? "gold" : "rose";
              const attBar = b.attendance >= thresholds.attendanceWatch ? "bg-sage" : b.attendance >= thresholds.attendanceAtRisk ? "bg-gold" : "bg-rose";
              const gpaCls = b.gpa < thresholds.gpaAtRisk ? "rose" : b.gpa < thresholds.gpaWatch ? "gold" : "";
              const svcCls = b.serviceHours < thresholds.serviceHoursGoal ? "muted" : "";
              const tag = STATUS_TAG[status];
              return (
                <tr key={b.id} onClick={() => onRowClick(b.id)}>
                  <td>
                    <div className="b-name">
                      <BrotherAvatar
                        brother={b}
                        selfId={selfId}
                        selfAvatarUrl={selfAvatarUrl}
                        avatarRevision={avatarRevision}
                        size="xs"
                        ringClassName="bg-[var(--vio-bg)] text-[var(--vio)] text-[9px]"
                      />
                      <p>{b.name}</p>
                    </div>
                  </td>
                  <td className="role">{b.role}</td>
                  <td>
                    <div className="attb">
                      <span className="track"><i className={attBar} style={{ width: `${b.attendance}%` }} /></span>
                      <span className={attCls}>{b.attendance}%</span>
                    </div>
                  </td>
                  <td className="num">
                    {b.duesOwed > 0 ? (
                      <>
                        <span className="mono gold">{fmt$(b.duesOwed)}</span>
                        {canBrothers && (
                          <button type="button" className="row-act" onClick={(e) => { e.stopPropagation(); onPayDues(b); }}>Pay</button>
                        )}
                      </>
                    ) : (
                      <span className="mono muted">—</span>
                    )}
                  </td>
                  <td className="num"><span className={`mono ${gpaCls}`}>{b.gpa.toFixed(1)}</span></td>
                  <td className="num">
                    <span className={`mono ${svcCls}`}>{b.serviceHours}h</span>
                    {canBrothers && (
                      <button type="button" className="row-act" onClick={(e) => { e.stopPropagation(); onAddServiceHour(b); }}>+1h</button>
                    )}
                  </td>
                  <td className="num"><span className={`status-tag ${tag.cls}`}>{tag.label}</span></td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <div className="table-foot">
        {total} brothers · {statusCounts.Good} good · {statusCounts.Watch} watch · {statusCounts["At Risk"]} at risk &ensp;—&ensp; click a row for profile, dues &amp; service log
      </div>
    </section>
  );
}
