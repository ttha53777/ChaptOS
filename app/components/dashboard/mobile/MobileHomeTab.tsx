"use client";

import { fmt$, fmtRange, KPI_SPARKLINES, type AttentionItem } from "../../../data";
import { ActivityFeed } from "../widgets";
import { LedgerSparkline } from "../ledger/LedgerSparkline";
import { useVocab } from "../../../hooks/useVocab";
import type { MobileActions, MobileHealth, MobileTasksData } from "./MobileDashboard";

type VocabFn = ReturnType<typeof useVocab>;

// Health label → dusk accent. Mirrors calcHealthScore's three-band output.
const HEALTH_TONE: Record<MobileHealth["label"], { dot: string; num: string; stroke: string }> = {
  "Healthy":          { dot: "bg-[var(--ok)]",   num: "text-[var(--ok)]",   stroke: "#7fb08a" },
  "Needs Attention":  { dot: "bg-[var(--gold)]", num: "text-[var(--gold)]", stroke: "#ddb36a" },
  "Critical":         { dot: "bg-[var(--rose)]", num: "text-[var(--rose)]", stroke: "#d98ba3" },
};

export function MobileHomeTab({ health, needsAttention, tasksData, actions, igEnabled }: {
  health: MobileHealth;
  needsAttention: AttentionItem[];
  tasksData: MobileTasksData;
  actions: MobileActions;
  igEnabled: boolean;
}) {
  const v = useVocab();
  const { weeklyDigest, weekRange, digestNarration } = tasksData;
  const tone = HEALTH_TONE[health.label];
  const digestTotal =
    weeklyDigest.deadlinesDue.length +
    (igEnabled ? weeklyDigest.igDue.length : 0) +
    weeklyDigest.eventsThisWeek.length + weeklyDigest.partiesThisWeek.length;

  return (
    <div className="space-y-5">
      {/* ── Chapter health hero (calm, single number) ─────────────────────── */}
      <button
        onClick={() => actions.setWidgetDrawer("health")}
        className="dm-card flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left"
      >
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            Chapter health
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className={`dm-serif text-[32px] leading-none tabular-nums ${tone.num}`}>{health.score}</span>
            <span className="text-[15px] font-medium text-[var(--muted)]">/100</span>
          </div>
          <div className="mt-1 text-[12px] text-[var(--ink-soft)]">{health.label}</div>
        </div>
        <LedgerSparkline data={KPI_SPARKLINES.health} stroke={tone.stroke} width={96} height={40} />
      </button>

      {/* ── This week digest (the AI's voice, surfaced) ───────────────────── */}
      <button
        onClick={() => actions.setWidgetDrawer("digest")}
        className="dm-card block w-full overflow-hidden rounded-2xl text-left"
        style={{ background: "linear-gradient(to bottom, var(--vio-bg) 0%, var(--card) 55%)" }}
      >
        <div className="h-[3px] bg-[var(--vio)]/70" />
        <div className="px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="dm-serif text-[16px] text-[var(--ink)]">This week</h2>
              <p className="text-[11px] text-[var(--muted)]">{fmtRange(weekRange.start, weekRange.end)}</p>
            </div>
            {weeklyDigest.atRiskCount > 0 && (
              <span className="rounded-full bg-[var(--gold-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gold)]">{weeklyDigest.atRiskCount} at risk</span>
            )}
          </div>
          {digestTotal === 0 ? (
            <p className="py-3 text-center text-[12px] text-[var(--muted)]">Nothing on the agenda this week</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {([
                ["Deadlines", weeklyDigest.deadlinesDue.length,                        "text-[var(--vio)]"],
                ...(igEnabled ? [["Instagram", weeklyDigest.igDue.length,              "text-[var(--rose)]"] as const] : []),
                ["Events",    weeklyDigest.eventsThisWeek.length,                      "text-[var(--ok)]"],
                ["Parties",   weeklyDigest.partiesThisWeek.length,                     "text-[var(--gold)]"],
              ] as const).map(([label, count, color]) => (
                <div key={label} className={`flex items-center justify-between rounded-md px-2.5 py-1.5 ${count > 0 ? "bg-[rgba(236,231,221,0.05)]" : "bg-[rgba(236,231,221,0.02)]"}`}>
                  <span className={`text-[11px] ${count > 0 ? "text-[var(--ink-soft)]" : "text-[var(--faint)]"}`}>{label}</span>
                  <span className={`text-[13px] font-bold tabular-nums ${count > 0 ? color : "text-[var(--faint)]"}`}>{count}</span>
                </div>
              ))}
            </div>
          )}
          {digestNarration && (
            <div className="mt-3 flex items-start gap-1.5 border-t border-[var(--line)] pt-2.5">
              <span className="mt-px shrink-0 rounded bg-[var(--vio-bg)] px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[var(--vio)]">AI</span>
              <p className="text-[11px] italic leading-snug text-[var(--ink-soft)]">{digestNarration}</p>
            </div>
          )}
        </div>
      </button>

      {/* ── Needs you (action-first) ──────────────────────────────────────── */}
      <section>
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h2 className="dm-serif text-[17px] text-[var(--ink)]">Needs you</h2>
          <button onClick={() => actions.setWidgetDrawer("deadlines")} className="text-[12px] font-medium text-[var(--muted)] active:text-[var(--vio)]">
            All tasks
          </button>
        </div>
        {needsAttention.length === 0 ? (
          <div className="dm-card rounded-2xl px-4 py-6 text-center text-[12.5px] text-[var(--muted)]">
            You&apos;re all caught up — nothing needs your attention.
          </div>
        ) : (
          <div className="space-y-2">
            {needsAttention.map((item, i) => (
              <NeedsYouRow key={rowKey(item, i)} item={item} actions={actions} v={v} />
            ))}
          </div>
        )}
      </section>

      {/* ── Recent activity ───────────────────────────────────────────────── */}
      <section>
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h2 className="dm-serif text-[17px] text-[var(--ink)]">Recent</h2>
          <button onClick={() => actions.setWidgetDrawer("activity")} className="text-[12px] font-medium text-[var(--muted)] active:text-[var(--vio)]">
            Activity log
          </button>
        </div>
        <ActivityFeed entries={tasksData.activityFeed} onExpand={() => actions.setWidgetDrawer("activity")} />
      </section>
    </div>
  );
}

function rowKey(item: AttentionItem, i: number): string {
  if (item.kind === "deadline-overdue") return `dl-${item.id}`;
  if (item.kind === "member-risk") return `mr-${item.brotherId}`;
  if (item.kind === "reimbursement") return "reimbursement";
  return `dues-${i}`;
}

function NeedsYouRow({ item, actions, v }: {
  item: AttentionItem;
  actions: MobileActions;
  v: VocabFn;
}) {
  if (item.kind === "deadline-overdue") {
    const late = item.daysLate <= 0 ? "Today" : item.daysLate === 1 ? "1d late" : `${item.daysLate}d late`;
    return (
      <Row
        iconBg="bg-[var(--rose-bg)] text-[var(--rose)]"
        icon="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
        title={item.title}
        desc={item.assignees && item.assignees !== "Unassigned" ? item.assignees : "Deadline overdue"}
        pill={late}
        pillCls="bg-[var(--rose-bg)] text-[var(--rose)]"
        onClick={() => actions.openEditDeadline(item.id)}
      />
    );
  }
  if (item.kind === "reimbursement") {
    return (
      <Row
        iconBg="bg-[var(--rose-bg)] text-[var(--rose)]"
        icon="M9 14l6-6M9.5 8.5h.01M14.5 13.5h.01M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"
        title={`${item.count} reimbursement ${item.count === 1 ? "request" : "requests"}`}
        desc={`Awaiting review · ${fmt$(item.total)} total`}
        pill="Review"
        pillCls="bg-[var(--rose-bg)] text-[var(--rose)]"
        onClick={() => actions.openReimbursements()}
      />
    );
  }
  if (item.kind === "dues") {
    return (
      <Row
        iconBg="bg-[var(--gold-bg)] text-[var(--gold)]"
        icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 9v1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        title={`Outstanding ${v("Dues").toLowerCase()}`}
        desc={`${item.brothers.length} owing · ${fmt$(item.total)} total`}
        pill={fmt$(item.total)}
        pillCls="bg-[var(--gold-bg)] text-[var(--gold)]"
        onClick={() => actions.setActiveDrawer("dues")}
      />
    );
  }
  // member-risk
  return (
    <Row
      iconBg="bg-[var(--rose-bg)] text-[var(--rose)]"
      icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      title={item.name}
      desc={`${item.attendance}% att · ${item.gpa.toFixed(2)} GPA · ${item.serviceHours}h`}
      pill="At risk"
      pillCls="bg-[var(--rose-bg)] text-[var(--rose)]"
      onClick={() => actions.setSelectedBrotherId(item.brotherId)}
    />
  );
}

function Row({ iconBg, icon, title, desc, pill, pillCls, onClick }: {
  iconBg: string;
  icon: string;
  title: string;
  desc: string;
  pill: string;
  pillCls: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="dm-card flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`} aria-hidden>
        <svg className="h-[18px] w-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-[var(--ink)]">{title}</span>
        <span className="block truncate text-[12px] text-[var(--muted)]">{desc}</span>
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pillCls}`}>{pill}</span>
    </button>
  );
}
