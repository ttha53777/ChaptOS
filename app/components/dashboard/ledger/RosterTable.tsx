import React from "react";
import { fmt$, getBrotherStatus, roleTitle, type Brother, type BrotherStatus, type Thresholds } from "../../../data";
import { isAttendanceExempt } from "@/lib/thresholds";
import { ALL_TRACKED, type TrackedMetrics } from "@/lib/tracked-metrics";
import type { BuiltinMetricId } from "@/lib/onboarding/kinds";
import { useVocab } from "../../../hooks/useVocab";
import { BrotherAvatar } from "../../BrotherAvatar";

const STATUS_TAG: Record<BrotherStatus, { cls: string; label: string }> = {
  "Good":    { cls: "st-good",  label: "GOOD" },
  "Watch":   { cls: "st-watch", label: "WATCH" },
  "At Risk": { cls: "st-risk",  label: "AT RISK" },
};

/**
 * Metric columns, in display order. `metric` ties each to the org's tracked set
 * so a measure the org switched off doesn't render a column of zeros; `label`
 * is a vocab key where the org can rename the concept.
 */
const METRIC_COLUMNS: { key: keyof Brother; metric: BuiltinMetricId; label: string; vocabKey?: "Dues" | "Service" }[] = [
  { key: "attendance",   metric: "attendance",   label: "Attendance" },
  { key: "duesOwed",     metric: "duesOwed",     label: "Dues", vocabKey: "Dues" },
  { key: "gpa",          metric: "gpa",          label: "GPA" },
  { key: "serviceHours", metric: "serviceHours", label: "Svc", vocabKey: "Service" },
];

function SortHead({
  label, colKey, active, dir, onSort, numeric, secondary,
}: {
  label: string; colKey: keyof Brother; active: boolean; dir: "asc" | "desc";
  onSort: (k: keyof Brother) => void; numeric?: boolean; secondary?: boolean;
}) {
  const cls = [numeric ? "num" : "", secondary ? "col-secondary" : ""].filter(Boolean).join(" ");
  return (
    <th
      className={cls || undefined}
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
 * filtered+sorted `brothers`, the filter/sort callbacks, and getBrotherStatus.
 * Carries `id="sec-brothers"` for the sidebar anchor. Dues/service-hour edits
 * happen in the BrotherDrawer (open a row); this table is read-only.
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
  hideButton,
  tracked = ALL_TRACKED,
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
  hideButton?: React.ReactNode;
  tracked?: TrackedMetrics;
}) {
  const v = useVocab();
  const total = statusCounts.Good + statusCounts.Watch + statusCounts["At Risk"];
  const filters: [string, number][] = [
    ["All", total],
    ["Good", statusCounts.Good],
    ["Watch", statusCounts.Watch],
    ["At Risk", statusCounts["At Risk"]],
  ];
  const columns = METRIC_COLUMNS.filter(c => tracked[c.metric]);
  // Name + Role + one per tracked metric + Status.
  const colCount = 3 + columns.length;
  const memberLabel = v("Member");

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

      <div className="roster-scroll">
      <table>
        <thead>
          <tr>
            <th>{memberLabel}</th>
            <th>Role</th>
            {columns.map(({ key, label, vocabKey }) => (
              <SortHead
                key={key}
                label={vocabKey ? v(vocabKey) : label}
                colKey={key}
                active={sortKey === key}
                dir={sortDir}
                onSort={onSort}
                numeric={key !== "attendance"}
                /* GPA + Service are the lowest-priority columns — hidden ≤1023 to
                   keep the roster readable on tablet without horizontal scroll. */
                secondary={key === "gpa" || key === "serviceHours"}
              />
            ))}
            <th className="num">Status</th>
          </tr>
        </thead>
        <tbody>
          {brothers.length === 0 ? (
            <tr><td colSpan={colCount} className="muted" style={{ padding: "24px 18px", textAlign: "center" }}>No {v("Member", true).toLowerCase()} match your filters.</td></tr>
          ) : (
            brothers.map((b) => {
              const status = getBrotherStatus(b, thresholds, tracked);
              const exempt = isAttendanceExempt(b.attendance);
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
                  <td className="role">{roleTitle(b)}</td>
                  {tracked.attendance && (
                    <td>
                      {exempt ? (
                        <span className="status-tag exempt" title={`Exempt from attendance this ${v("Period").toLowerCase()}`}>Exempt</span>
                      ) : (
                        <div className="attb">
                          <span className="track"><i className={attBar} style={{ width: `${b.attendance}%` }} /></span>
                          <span className={attCls}>{b.attendance}%</span>
                        </div>
                      )}
                    </td>
                  )}
                  {tracked.duesOwed && (
                    <td className="num">
                      {b.duesOwed > 0 ? (
                        <span className="mono gold">{fmt$(b.duesOwed)}</span>
                      ) : (
                        <span className="mono muted">—</span>
                      )}
                    </td>
                  )}
                  {tracked.gpa && (
                    <td className="num col-secondary"><span className={`mono ${gpaCls}`}>{b.gpa.toFixed(1)}</span></td>
                  )}
                  {tracked.serviceHours && (
                    <td className="num col-secondary">
                      <span className={`mono ${svcCls}`}>{b.serviceHours}h</span>
                    </td>
                  )}
                  <td className="num"><span className={`status-tag ${tag.cls}`}>{tag.label}</span></td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>

      <div className="table-foot">
        {total} {v("Member", total !== 1).toLowerCase()} · {statusCounts.Good} good · {statusCounts.Watch} watch · {statusCounts["At Risk"]} at risk &ensp;—&ensp; click a row for the full profile
      </div>
    </section>
  );
}
