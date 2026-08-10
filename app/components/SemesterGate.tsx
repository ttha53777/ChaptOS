"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Modal } from "./dashboard/primitives";
import { useChapter } from "../context/ChapterContext";
import { isDashboardRoute } from "../lib/routes";
import { useSemesters, type SemesterRow } from "../hooks/useActiveSemester";
import { requestJson } from "../lib/api";
// Local-component today, NOT `new Date().toISOString().slice(0,10)`: the UTC form
// rolls over in the evening for western timezones, which would wall a chapter out
// of the app hours before their semester's last day is actually over.
import { todayISO } from "@/lib/dates";
// The gate's own styles (.sg-*) use the dusk CSS vars (--vio, --paper-2, …), which
// are scoped to `.dash[data-dashboard-theme="dusk"]`. The gate mounts at the root
// (not inside a dashboard page), so import the ledger stylesheet here and wrap the
// body in a .dash container below so those vars resolve.
import "./dashboard/dashboard-ledger.css";
import "./semester-gate.css";

/**
 * SemesterGate — the no-active-semester / semester-ended hard block.
 *
 * Renders a NON-DISMISSABLE modal over the whole app whenever the current org has
 * no active semester, OR the active semester's endDate has passed ("semester is
 * up"). isActive never auto-flips when a semester's end date passes — nothing in
 * the backend clears it — so this gate compares the active row's endDate against
 * today itself. The active semester drives the dashboard and every period-scoped
 * metric, and dated-item writes are rejected without one
 * (lib/services/semester-bounds.ts), so an org in this state is unusable. New orgs
 * land here right after onboarding (org creation doesn't seed a semester).
 *
 * Two ways out, both org-admin only (MANAGE_SEMESTERS):
 *   - Extend current  — push the relevant semester's end date out + reactivate
 *                       (PATCH /api/semesters/{id} with { endDate }). Targets the
 *                       actually-active row when one has expired (it may not be
 *                       the most-recently-created semester, if an admin manually
 *                       reactivated an older one from settings); otherwise falls
 *                       back to the most-recent row. Hidden when the org has no
 *                       semesters at all (the new-org case).
 *   - Create new      — POST /api/semesters (creates + activates).
 *
 * Non-admins see the same block with an "ask an admin" message and no form.
 *
 * Mounted once at the root (app/layout.tsx) inside ChapterProvider. It self-
 * disables off the org dashboard, gating on TWO things (like ChatWidgetGate): an
 * org is resolved AND we're on a /[slug]/… route. Gating on org alone would leak
 * the modal onto auth screens (a signed-in org-less user on /welcome can still
 * have currentUser.org populated from /api/auth/me). It also skips /[slug]/onboarding
 * so a brand-new org finishes the setup wizard before being asked for a semester.
 */

// Inclusive day span between two YYYY-MM-DD strings (parsed as UTC to dodge DST).
function dayCount(startDate: string, endDate: string): number {
  const a = Date.parse(`${startDate}T00:00:00Z`);
  const b = Date.parse(`${endDate}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

// "Aug 25" style short label from a YYYY-MM-DD string (no year — the bar's two ends
// share one).
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

/**
 * SemesterTimeline — the span preview.
 *
 * With `priorEnd` (the extend case) the bar reads as two runs: the semester's
 * original span in bone, the days being added in violet, with a pin at the old end
 * date — so the admin sees the size of the extension, not just the new total. Given
 * only start/end (the create case) it's a single violet run showing the total.
 *
 * Renders nothing until the dates are valid and the range is non-negative, so it
 * stays quiet while the admin is mid-entry.
 */
function SemesterTimeline({
  startDate,
  endDate,
  priorEnd,
}: {
  startDate: string;
  endDate: string;
  /** The semester's end date before this edit — omit when creating. */
  priorEnd?: string;
}) {
  if (!startDate || !endDate || endDate < startDate) return null;

  // Only an actual push-out splits the bar; shrinking (or an unchanged end) renders
  // as one run so the "added" segment never reads as negative.
  const extending = priorEnd !== undefined && priorEnd >= startDate && priorEnd < endDate;
  const total = dayCount(startDate, endDate);
  const basePct = extending ? (dayCount(startDate, priorEnd) / total) * 100 : 100;
  const added = extending ? dayCount(priorEnd, endDate) - 1 : 0;

  return (
    <div className="sg-bar">
      <div className="sg-track">
        <div className="sg-track-base" style={{ width: `${basePct}%` }} />
        {extending && <div className="sg-track-add" style={{ left: `${basePct}%`, right: 0 }} />}
        <span className="sg-pin sg-pin-start" style={{ left: "0%" }} />
        {extending && <span className="sg-pin sg-pin-mid" style={{ left: `${basePct}%` }} />}
        <span className="sg-pin sg-pin-end" style={{ left: "100%" }} />
      </div>
      <div className="sg-scale">
        <span>{shortDate(startDate)}</span>
        <span className="sg-scale-mid">
          {extending ? <><b>+{added}</b> {added === 1 ? "day" : "days"}</> : <><b>{total}</b> {total === 1 ? "day" : "days"}</>}
        </span>
        <span>{shortDate(endDate)}</span>
      </div>
    </div>
  );
}

export function SemesterGate() {
  const pathname = usePathname();
  const { currentUser, can } = useChapter();

  // Active only on the org dashboard, never on auth/platform routes, and never on
  // the onboarding wizard itself (a new org has no semester yet — let it finish
  // onboarding first). Gating on org alone would leak onto /welcome etc. where a
  // signed-in user can still have currentUser.org populated.
  const isOnboarding = !!currentUser?.org?.slug && pathname === `/${currentUser.org.slug}/onboarding`;
  const enabled = !!currentUser?.org?.slug && isDashboardRoute(pathname) && !isOnboarding;

  // Passed to useSemesters so disabled routes don't fire a failing GET /api/semesters.
  const { loaded, active, mostRecent, refresh } = useSemesters(enabled);

  // Only block once we KNOW where the org stands. While the fetch is in flight,
  // `loaded` is false and we render nothing — no flash on every page load.
  if (!enabled || !loaded) return null;

  // isActive never auto-clears when endDate passes, so "the semester is up" has to
  // be detected here: an active row whose end date is before today.
  const expired = active !== null && active.endDate < todayISO();
  if (active && !expired) return null;

  const canManage = can("MANAGE_SEMESTERS");

  // A brand-new org has no semesters at all — frame it as first-time setup rather
  // than either recovery case below.
  const isFirstSemester = mostRecent === null;

  // When the active semester expired, extend THAT row — an admin may have manually
  // reactivated an older semester from settings, so it isn't necessarily `mostRecent`
  // (the highest-id row). Otherwise (no active row at all) fall back to mostRecent.
  const extendTarget = expired ? active : mostRecent;

  const head: HeadCopy = isFirstSemester
    ? {
        icon: "calendar",
        kicker: "Welcome",
        title: <>Set your <em>first semester</em> to unlock the app.</>,
        lede: "Dues, attendance, events — everything on the dashboard is scoped to a semester. Name the one you're in now.",
        ariaLabel: "Set your first semester to unlock the app",
      }
    : expired
      ? {
          icon: "clock",
          kicker: "Period closed",
          title: <>Your semester has <em>ended</em>.</>,
          lede: "The dashboard scopes dues, attendance, and events to a semester, so the app stays locked until one is running.",
          ariaLabel: "Your semester has ended",
        }
      : {
          icon: "calendar",
          kicker: "No active period",
          title: <>No <em>active semester</em>.</>,
          lede: "The dashboard scopes dues, attendance, and events to a semester, so the app stays locked until one is running.",
          ariaLabel: "No active semester",
        };

  return (
    // hideHeader: the body owns its own head (seal + mono kicker + serif line), the
    // way the poll composer does — the default title bar would sit above and compete
    // with it. Non-dismissable, so no ✕ is lost by dropping the bar.
    <Modal tone="dusk" maxWidthClass="max-w-lg" dismissable={false} hideHeader ariaLabel={head.ariaLabel} onClose={() => {}}>
      {/* .dash[data-dashboard-theme="dusk"] scopes the .sg-* CSS vars (see import). */}
      <div className="dash" data-dashboard-theme="dusk">
        <div className="sg">
          <GateHead {...head} />
          {canManage ? (
            <SemesterGateForm extendTarget={extendTarget} onResolved={refresh} />
          ) : (
            <p className="sg-note">Ask an org admin to set up a semester to continue.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

interface HeadCopy {
  icon: "calendar" | "clock";
  kicker: string;
  title: React.ReactNode;
  lede: string;
  /** Plain-text echo of `title` — the dialog's accessible name, since the rich
   *  title lives in the body rather than the (hidden) modal header. */
  ariaLabel: string;
}

function GateHead({ icon, kicker, title, lede }: HeadCopy) {
  return (
    <div className="sg-head">
      <div className="sg-seal" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          {icon === "clock" ? (
            <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>
          ) : (
            <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>
          )}
        </svg>
      </div>
      <p className="sg-kicker">{kicker}</p>
      <h2 className="sg-title">{title}</h2>
      <p className="sg-lede">{lede}</p>
    </div>
  );
}

function SemesterGateForm({
  extendTarget,
  onResolved,
}: {
  extendTarget: ExtendableSemester | null;
  onResolved: () => void;
}) {
  // "extend" is only offered when there's a semester to extend; new orgs (zero
  // semesters) go straight to "create".
  const canExtend = extendTarget !== null;
  const [mode, setMode] = useState<"extend" | "create">(canExtend ? "extend" : "create");

  if (!canExtend) return <CreateForm onResolved={onResolved} />;

  return (
    <>
      <div className="sg-seg" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "extend"}
          className={mode === "extend" ? "on" : ""} onClick={() => setMode("extend")}>
          Extend it
        </button>
        <button type="button" role="tab" aria-selected={mode === "create"}
          className={mode === "create" ? "on" : ""} onClick={() => setMode("create")}>
          Start new
        </button>
      </div>

      {mode === "extend"
        ? <ExtendForm semester={extendTarget} onResolved={onResolved} />
        : <CreateForm onResolved={onResolved} />}
    </>
  );
}

// What ExtendForm/SemesterTimeline actually need — satisfied by both a SemesterRow
// (the "no active semester" fallback) and an ActiveSemester (the "expired" case,
// which points at the actually-active row, not necessarily the most-recent one).
type ExtendableSemester = Pick<SemesterRow, "id" | "label" | "startDate" | "endDate">;

/** "Jan 1 – Jun 30", widened to "Aug 25, 2026 – Jan 10, 2027" when the run crosses a year. */
function spanLabel(startDate: string, endDate: string): string {
  if (startDate.slice(0, 4) === endDate.slice(0, 4)) {
    return `${shortDate(startDate)} – ${shortDate(endDate)}`;
  }
  return `${shortDate(startDate)}, ${startDate.slice(0, 4)} – ${shortDate(endDate)}, ${endDate.slice(0, 4)}`;
}

function ExtendForm({ semester, onResolved }: { semester: ExtendableSemester; onResolved: () => void }) {
  // Default the new end date to today if the semester already ended, otherwise keep
  // its current end date so the admin only has to push it out.
  const today = todayISO();
  const [endDate, setEndDate] = useState(semester.endDate < today ? today : semester.endDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether it has lapsed is a fact about the semester, not about which gate state
  // we're in — an inactive-but-also-expired semester deserves the note too.
  const lapsed = semester.endDate < today;
  const daysSince = dayCount(semester.endDate, today) - 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!endDate) { setError("Pick a new end date."); return; }
    if (endDate < semester.startDate) { setError("End date must be on or after the start date."); return; }
    setSaving(true);
    setError(null);
    try {
      await requestJson(`/api/semesters/${semester.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate }),
      });
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extend the semester.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <p className="sg-error">{error}</p>}

      <div className="sg-card">
        <span className="sg-card-label">{semester.label}</span>
        <span className="sg-card-span">
          {spanLabel(semester.startDate, semester.endDate)}
          {lapsed && <> · <span className="sg-card-stat">ended {plural(daysSince, "day")} ago</span></>}
        </span>
      </div>

      <div className="sg-section">
        <label className="sg-label" htmlFor="sg-extend-end">Run it through</label>
        <input
          id="sg-extend-end"
          type="date"
          className="sg-date"
          value={endDate}
          min={semester.startDate}
          onChange={e => setEndDate(e.target.value)}
        />
      </div>

      <SemesterTimeline startDate={semester.startDate} endDate={endDate} priorEnd={semester.endDate} />
      <SubmitButton saving={saving} idle="Extend & reactivate" busy="Extending…" />
    </form>
  );
}

function CreateForm({ onResolved }: { onResolved: () => void }) {
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !startDate || !endDate) { setError("All fields are required."); return; }
    if (endDate < startDate) { setError("End date must be on or after the start date."); return; }
    setSaving(true);
    setError(null);
    try {
      await requestJson("/api/semesters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), startDate, endDate }),
      });
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the semester.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <p className="sg-error">{error}</p>}

      <div className="sg-section">
        <label className="sg-label" htmlFor="sg-new-label">What to call it</label>
        <input
          id="sg-new-label"
          className="sg-input"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Fall 2026"
        />
      </div>

      <div className="sg-section sg-dates">
        <div>
          <label className="sg-label" htmlFor="sg-new-start">Starts</label>
          <input id="sg-new-start" type="date" className="sg-date"
            value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="sg-label" htmlFor="sg-new-end">Ends</label>
          <input id="sg-new-end" type="date" className="sg-date"
            value={endDate} min={startDate || undefined} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>

      <SemesterTimeline startDate={startDate} endDate={endDate} />
      <SubmitButton saving={saving} idle="Create & activate" busy="Creating…" />
    </form>
  );
}

// Solid violet mono-uppercase primary, matching the poll composer's .pc-submit —
// the single way out of the wall, so it carries full weight rather than the tinted
// treatment used for optional dashboard actions.
function SubmitButton({ saving, idle, busy }: { saving: boolean; idle: string; busy: string }) {
  return (
    <button type="submit" className="sg-submit" disabled={saving}>
      {saving ? busy : idle}
    </button>
  );
}
