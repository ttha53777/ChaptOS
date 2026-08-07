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

/** Rows shown on phone before the list collapses behind "Show all". Touch
 *  dislikes a scroll region nested in a scrolling page, so phone hides the
 *  rest outright rather than making it scrollable. */
const PHONE_LIMIT = 8;

/** Rows shown (uncapped height) on desktop before `.rt-scroll` clips to a
 *  fixed 10-row window — full data stays mounted underneath, so scrolling
 *  reaches the rest with a mouse. "Show all" removes the cap entirely.
 *  Keep in sync with `--rt-row-h`/`--rt-head-h` in dashboard-ledger.css. */
const ROW_LIMIT = 10;

/** Skeleton rows drawn while the roster section is still loading. */
const SKELETON_ROWS = 6;

/**
 * Metric columns, in display order. `metric` ties each to the org's tracked set
 * so a measure the org switched off doesn't render a column of zeros; `label`
 * is a vocab key where the org can rename the concept. `secondary` marks the
 * two lowest-priority columns, dropped by a @container query when the card
 * itself is narrow (see dashboard-ledger.css).
 */
const METRIC_COLUMNS: {
  key: keyof Brother; metric: BuiltinMetricId; label: string;
  vocabKey?: "Dues" | "Service"; numeric?: boolean; secondary?: boolean;
}[] = [
  { key: "attendance",   metric: "attendance",   label: "Attendance" },
  { key: "duesOwed",     metric: "duesOwed",     label: "Dues", vocabKey: "Dues", numeric: true },
  { key: "gpa",          metric: "gpa",          label: "GPA", numeric: true, secondary: true },
  { key: "serviceHours", metric: "serviceHours", label: "Svc", vocabKey: "Service", numeric: true, secondary: true },
];

function SortHead({
  label, colKey, active, dir, onSort, numeric, secondary,
}: {
  label: string; colKey: keyof Brother; active: boolean; dir: "asc" | "desc";
  onSort: (k: keyof Brother) => void; numeric?: boolean; secondary?: boolean;
}) {
  const cls = ["sortable", numeric ? "num" : "", secondary ? "col-secondary" : ""].filter(Boolean).join(" ");
  return (
    <th
      className={cls}
      tabIndex={0}
      onClick={() => onSort(colKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSort(colKey); }
      }}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}<span className="arrow" aria-hidden="true">{active ? (dir === "asc" ? "↑" : "↓") : "↓"}</span>
    </th>
  );
}

/**
 * Editorial roster. Reuses the page's filtered+sorted `brothers`, the
 * filter/sort callbacks, and getBrotherStatus. Carries `id="sec-brothers"` for
 * the sidebar anchor. Dues/service-hour edits happen in the BrotherDrawer (open
 * a row); this table is read-only.
 *
 * Role lives inside the Member cell rather than in a column of its own: that is
 * what frees the width the Status column was being clipped out of, and it lets
 * "Treasurer · Banquet · Social" render whole instead of truncating with no
 * tooltip. The card is bounded (scroll region on desktop, row cap on phone) so
 * a 120-member chapter can't produce a 5,000px card the way it used to.
 */
export function RosterTable({
  brothers,
  totalCount,
  statusCounts,
  statusFilter,
  onFilter,
  search,
  onSearch,
  sortKey,
  sortDir,
  onSort,
  onRowClick,
  selectedId,
  thresholds,
  selfId,
  selfAvatarUrl,
  avatarRevision,
  hideButton,
  loading = false,
  onOpenAll,
  tracked = ALL_TRACKED,
}: {
  brothers: Brother[];
  /** Roster size before search/status filtering — distinguishes "no members at
   *  all" from "nothing matched", which the old single empty state conflated. */
  totalCount: number;
  statusCounts: { Good: number; Watch: number; "At Risk": number };
  statusFilter: string;
  onFilter: (f: string) => void;
  search: string;
  onSearch: (q: string) => void;
  sortKey: keyof Brother | null;
  sortDir: "asc" | "desc";
  onSort: (k: keyof Brother) => void;
  onRowClick: (id: number) => void;
  selectedId: number | null;
  thresholds: Thresholds;
  selfId: number | null;
  selfAvatarUrl?: string | null;
  avatarRevision: number;
  hideButton?: React.ReactNode;
  loading?: boolean;
  onOpenAll: () => void;
  tracked?: TrackedMetrics;
}) {
  const v = useVocab();
  const [expanded, setExpanded] = React.useState(false);
  const [isPhone, setIsPhone] = React.useState(false);

  // Phone caps rows; desktop bounds by scroll height. Tracked with a listener
  // rather than CSS because the cap changes what we render, not just its size.
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const total = statusCounts.Good + statusCounts.Watch + statusCounts["At Risk"];
  const filters: [string, number][] = [
    ["All", total],
    ["Good", statusCounts.Good],
    ["Watch", statusCounts.Watch],
    ["At Risk", statusCounts["At Risk"]],
  ];
  const columns = METRIC_COLUMNS.filter(c => tracked[c.metric]);
  const memberLabel = v("Member");
  const sortedLabel = sortKey ? METRIC_COLUMNS.find(c => c.key === sortKey) : null;

  const visible = isPhone && !expanded ? brothers.slice(0, PHONE_LIMIT) : brothers;
  // Desktop keeps the full list mounted (so scroll can reach past the cap)
  // and clips it visually instead — `hidden` here just drives the footer copy.
  const desktopCapped = !isPhone && !expanded && brothers.length > ROW_LIMIT;
  const hidden = isPhone ? brothers.length - visible.length : (desktopCapped ? brothers.length - ROW_LIMIT : 0);
  const shownCount = desktopCapped ? ROW_LIMIT : visible.length;

  return (
    <section id="sec-brothers" className="card rt dash-group" aria-label="Roster">
      {hideButton}
      <div className="card-h">
        <h2>Roster</h2>
        <div className="right">
          <div className="ba-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={`Search ${v("Member", true).toLowerCase()} or role…`}
              aria-label="Search the roster"
            />
          </div>
          <div className="filters">
            {filters.map(([f, n]) => (
              <button key={f} className={statusFilter === f ? "on" : undefined} onClick={() => { onFilter(f); setExpanded(false); }}>
                {f} {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        Array.from({ length: SKELETON_ROWS }, (_, i) => <div key={i} className="row-skel" />)
      ) : brothers.length === 0 ? (
        <div className="rt-empty">
          <p className="t">
            {totalCount === 0
              ? `No one is on the roster yet.`
              : `No ${v("Member", true).toLowerCase()} match your filters.`}
          </p>
          <p className="h">
            {totalCount === 0
              ? "Send an invite link and approve the first join request."
              : "Pick another filter, or clear the search."}
          </p>
        </div>
      ) : (
        <div className={desktopCapped ? "rt-scroll rt-capped" : "rt-scroll"}>
          <table>
            <thead>
              <tr>
                <th>{memberLabel}</th>
                {columns.map(({ key, label, vocabKey, numeric, secondary }) => (
                  <SortHead
                    key={key}
                    label={vocabKey ? v(vocabKey) : label}
                    colKey={key}
                    active={sortKey === key}
                    dir={sortDir}
                    onSort={onSort}
                    numeric={numeric}
                    secondary={secondary}
                  />
                ))}
                <th className="num">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((b) => {
                const status = getBrotherStatus(b, thresholds, tracked);
                const exempt = isAttendanceExempt(b.attendance);
                const attCls = b.attendance >= thresholds.attendanceWatch ? "sage" : b.attendance >= thresholds.attendanceAtRisk ? "gold" : "rose";
                const attBar = b.attendance >= thresholds.attendanceWatch ? "bg-sage" : b.attendance >= thresholds.attendanceAtRisk ? "bg-gold" : "bg-rose";
                const gpaCls = b.gpa < thresholds.gpaAtRisk ? "rose" : b.gpa < thresholds.gpaWatch ? "gold" : "";
                const svcCls = b.serviceHours < thresholds.serviceHoursGoal ? "muted" : "";
                const tag = STATUS_TAG[status];
                const title = roleTitle(b);
                // Relational roles carry a colour the roster never used; the
                // first (highest-ranked) one becomes a quiet dot beside the title.
                const roleColor = b.roles?.[0]?.color ?? null;
                return (
                  <tr
                    key={b.id}
                    tabIndex={0}
                    className={selectedId === b.id ? "sel" : undefined}
                    onClick={() => onRowClick(b.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(b.id); }
                    }}
                  >
                    <td className="c-member">
                      <div className="b-name">
                        <BrotherAvatar
                          brother={b}
                          selfId={selfId}
                          selfAvatarUrl={selfAvatarUrl}
                          avatarRevision={avatarRevision}
                          size="xs"
                          ringClassName="av-seat bg-[var(--vio-bg)] text-[var(--vio)] text-[9px]"
                        />
                        <div className="who">
                          <p className="nm">{b.name}</p>
                          <p className="rl" title={title} style={roleColor ? ({ ["--dot"]: roleColor } as React.CSSProperties) : undefined}>
                            {roleColor && <i />}{title}
                          </p>
                        </div>
                      </div>
                    </td>
                    {tracked.attendance && (
                      <td className="c-att">
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
                      <td className="num c-num" data-k={v("Dues")}>
                        {b.duesOwed > 0 ? (
                          <span className="mono gold">{fmt$(b.duesOwed)}</span>
                        ) : (
                          <span className="mono muted">—</span>
                        )}
                      </td>
                    )}
                    {tracked.gpa && (
                      <td className="num c-num col-secondary" data-k="GPA"><span className={`mono ${gpaCls}`}>{b.gpa.toFixed(2)}</span></td>
                    )}
                    {tracked.serviceHours && (
                      <td className="num c-num col-secondary" data-k={v("Service")}>
                        <span className={`mono ${svcCls}`}>{b.serviceHours}h</span>
                      </td>
                    )}
                    <td className="num c-status"><span className={`status-tag ${tag.cls}`}>{tag.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rt-foot">
        <span>
          {loading
            ? "Loading the roster…"
            : <>
                Showing {shownCount} of {total}
                {sortedLabel ? <> · sorted by {(sortedLabel.vocabKey ? v(sortedLabel.vocabKey) : sortedLabel.label).toLowerCase()}</> : null}
                &ensp;·&ensp;{" "}click a row for the full profile
              </>}
        </span>
        {hidden > 0 || expanded ? (
          <button type="button" onClick={() => setExpanded(e => !e)}>
            {expanded ? "Show less" : `Show all ${brothers.length} →`}
          </button>
        ) : (
          <button type="button" onClick={onOpenAll}>Open full roster →</button>
        )}
      </div>
    </section>
  );
}
