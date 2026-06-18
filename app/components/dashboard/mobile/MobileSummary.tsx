"use client";

import { fmt$ } from "../../../data";
import { SvgIcon } from "../../Sidebar";
import { useVocab } from "../../../hooks/useVocab";
import { useFeature } from "../../../hooks/useFeature";
import { KPI_ICONS } from "../styles";
import { QuickActionsMenu, type QuickActionKey } from "../QuickActionsMenu";
import type { Announcement } from "../AnnouncementCard";
import type { KPIDrawerKey, MobileKpis } from "./MobileDashboard";

const PIN_PATH = "M5 11l5-5 7 7-5 5-7-7zm12 6l4 4M9 7l8 8";

// Only the two most actionable KPIs ride in the always-visible header now —
// money owed and attendance. The other four (gpa/service/treasury/door) live a
// tap deeper (Activity ▸ Money, or their drawers), so the header stays calm.
const CHIP_FEATURE: Partial<Record<KPIDrawerKey, string>> = {
  attendance: "kpi-attendance",
  dues:       "kpi-dues",
};

export function MobileSummary({
  firstName, orgName, announcement, kpis,
  onEditAnnouncement, onOpenKpi,
  isAdmin, onQuickAction, enabledWorkflows, onOpenStanding,
}: {
  firstName: string;
  orgName: string | null;
  announcement: Announcement | null;
  kpis: MobileKpis;
  onEditAnnouncement: () => void;
  onOpenKpi: (k: KPIDrawerKey) => void;
  isAdmin: boolean;
  onQuickAction: (k: QuickActionKey) => void;
  enabledWorkflows?: readonly string[];
  /** Opens the signed-in member's own record; absent when they have no roster row. */
  onOpenStanding?: () => void;
}) {
  const v = useVocab();
  const feature = useFeature();
  const greeting = greetingFor(new Date());
  const title = announcement?.title ?? "Welcome to your chapter dashboard";
  const rawBody = announcement?.body ?? "";
  const hasPreview = rawBody.trim().length > 0 || !announcement;
  const preview = announcement ? rawBody : "Tap to post the first announcement.";

  const chips: { key: KPIDrawerKey; label: string; value: string; note: string; color: string }[] = [
    { key: "dues",       label: v("Dues"),   value: fmt$(kpis.outstandingDues), note: `${kpis.owingCount} owing`,     color: kpis.outstandingDues > 0 ? "text-[var(--gold)]" : "text-[var(--ok)]" },
    { key: "attendance", label: "Attendance", value: `${kpis.avgAttendance.toFixed(0)}%`, note: "chapter average", color: "text-[var(--vio)]" },
  ];
  const visibleChips = chips.filter(c => {
    const f = CHIP_FEATURE[c.key];
    return !f || feature("operations", f);
  });

  return (
    <div className="px-4 pb-2.5 pt-1">
      {/* Greeting + quick-action + standing affordance */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="dm-serif truncate text-[23px] leading-tight text-[var(--ink)]">{greeting}, {firstName}</h1>
          {orgName && <p className="truncate text-[12.5px] text-[var(--muted)]">{orgName}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <QuickActionsMenu
            isAdmin={isAdmin}
            onSelect={onQuickAction}
            variant="mobile"
            enabledWorkflows={enabledWorkflows}
          />
          {onOpenStanding && (
            <button
              onClick={onOpenStanding}
              aria-label="My standing"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--card)] text-[var(--muted)] active:border-[var(--vio)]/40 active:text-[var(--vio)]"
            >
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Pinned announcement — the header's dominant element */}
      {feature("operations", "announcement") && (
        <button
          onClick={onEditAnnouncement}
          className="mb-2.5 flex w-full items-start gap-3.5 overflow-hidden rounded-2xl border border-[var(--rose)]/25 bg-[var(--rose-bg)] px-4 py-3.5 text-left transition-colors active:border-[var(--rose)]/45"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--rose)]/15 text-[var(--rose)]" aria-hidden>
            <SvgIcon d={PIN_PATH} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--rose)]">Announcement</div>
            <div className="dm-serif mt-0.5 text-[17px] font-semibold leading-snug text-[var(--ink)]">{title}</div>
            {hasPreview && (
              <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[var(--ink-soft)]">{preview}</p>
            )}
          </div>
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--faint)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 112.828 2.828L11.828 13.828 9 14l.172-2.828z" />
          </svg>
        </button>
      )}

      {/* Two essential KPIs */}
      <div className="grid grid-cols-2 gap-2">
        {visibleChips.map(c => (
          <button
            key={c.key}
            onClick={() => onOpenKpi(c.key)}
            className="dm-card flex flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left"
          >
            <div className="flex items-center gap-1.5 text-[var(--faint)]">
              <SvgIcon d={KPI_ICONS[c.key] ?? ""} className="h-3 w-3 shrink-0" />
              <span className="truncate text-[10px] font-semibold uppercase tracking-wide">{c.label}</span>
            </div>
            <span className={`truncate text-[19px] font-bold tabular-nums ${c.color}`}>{c.value}</span>
            <span className="truncate text-[10.5px] text-[var(--muted)]">{c.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
