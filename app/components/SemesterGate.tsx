"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Modal } from "./dashboard/primitives";
import { useChapter } from "../context/ChapterContext";
import { isDashboardRoute } from "../lib/routes";
import { useSemesters, type SemesterRow } from "../hooks/useActiveSemester";
import { requestJson } from "../lib/api";
// The form body styles below use the dusk CSS vars (--vio, --paper-2, …) which are
// scoped to `.dash[data-dashboard-theme="dusk"]`. The gate mounts at the root (not
// inside a dashboard page), so import the stylesheet here and wrap the body in a
// .dash container below so those vars resolve.
import "./dashboard/dashboard-ledger.css";

/**
 * SemesterGate — the no-active-semester hard block.
 *
 * Renders a NON-DISMISSABLE modal over the whole app whenever the current org has
 * no active semester. The active semester drives the dashboard and every
 * period-scoped metric, and dated-item writes are rejected without one
 * (lib/services/semester-bounds.ts), so an org in this state is unusable. New orgs
 * land here right after onboarding (org creation doesn't seed a semester).
 *
 * Two ways out, both org-admin only (MANAGE_SEMESTERS):
 *   - Extend current  — push the most-recent semester's end date out + reactivate
 *                       (PATCH /api/semesters/{id} with { endDate }). Hidden when
 *                       the org has no semesters at all (the new-org case).
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

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--line)",
  background: "var(--paper-2)",
  color: "var(--ink)",
};

const labelStyle: React.CSSProperties = { color: "var(--muted)" };

// Two-up date row. Inline (not Tailwind `grid grid-cols-2`) to dodge the `.dash .grid`
// rule in dashboard-ledger.css — see the date-row comment in CreateForm.
const dateGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

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

/**
 * SemesterTimeline — the native span preview, built from the dashboard's own .bk bar
 * primitive (a 3px violet track). Renders nothing until both dates are valid and the
 * range is non-negative, so it stays quiet while the admin is mid-entry.
 */
function SemesterTimeline({ startDate, endDate }: { startDate: string; endDate: string }) {
  if (!startDate || !endDate || endDate < startDate) return null;
  const days = dayCount(startDate, endDate);
  return (
    <div className="mt-1 px-0.5">
      <div className="relative h-[3px] rounded-sm" style={{ background: "var(--line)" }}>
        <div className="h-full rounded-sm" style={{ background: "var(--vio)", opacity: 0.85 }} />
        <span
          className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: "0%", background: "var(--paper)", border: "1.5px solid var(--vio)" }}
        />
        <span
          className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: "100%", background: "var(--vio)", border: "1.5px solid var(--vio)" }}
        />
      </div>
      <div className="mt-2.5 flex items-baseline justify-between text-[10px]" style={{ fontFamily: "var(--mono)", color: "var(--muted)" }}>
        <span>{shortDate(startDate)}</span>
        <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "13px", color: "var(--gold)" }}>
          <b style={{ fontStyle: "normal", fontWeight: 500 }}>{days}</b> {days === 1 ? "day" : "days"}
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

  // Only block once we KNOW there's no active semester. While the fetch is in
  // flight, `loaded` is false and we render nothing — no flash on every page load.
  if (!enabled || !loaded || active) return null;

  const canManage = can("MANAGE_SEMESTERS");

  // A brand-new org has no semesters at all — frame it as first-time setup rather
  // than the "your active semester lapsed" recovery case.
  const isFirstSemester = mostRecent === null;

  return (
    <Modal
      title={isFirstSemester ? "Create your first semester" : "No active semester"}
      tone="dusk"
      dismissable={false}
      onClose={() => {}}
    >
      {/* .dash[data-dashboard-theme="dusk"] scopes the form's CSS vars (see import). */}
      <div className="dash" data-dashboard-theme="dusk">
        {canManage ? (
          <SemesterGateForm mostRecent={mostRecent} onResolved={refresh} />
        ) : (
          <p className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
            Your chapter has no active semester, so the app is locked. Ask an org admin to set
            up a semester to continue.
          </p>
        )}
      </div>
    </Modal>
  );
}

function SemesterGateForm({
  mostRecent,
  onResolved,
}: {
  mostRecent: SemesterRow | null;
  onResolved: () => void;
}) {
  // "extend" is only offered when there's a semester to extend; new orgs (zero
  // semesters) go straight to "create".
  const canExtend = mostRecent !== null;
  const [mode, setMode] = useState<"extend" | "create">(canExtend ? "extend" : "create");

  return (
    <div className="space-y-4">
      {canExtend ? (
        <p className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
          Your chapter has no active semester. Extend the current one or create a new period to
          unlock the app.
        </p>
      ) : (
        // New org: one quiet serif line with italic-violet emphasis (mirrors h1.greeting em).
        <p className="text-[16px] leading-snug" style={{ fontFamily: "var(--serif)", color: "var(--ink)" }}>
          Set your <em style={{ fontStyle: "italic", color: "var(--vio)" }}>first semester</em> to unlock the app.
        </p>
      )}

      {canExtend && (
        <div className="flex gap-2">
          <ModeTab active={mode === "extend"} onClick={() => setMode("extend")}>Extend current</ModeTab>
          <ModeTab active={mode === "create"} onClick={() => setMode("create")}>Create new</ModeTab>
        </div>
      )}

      {mode === "extend" && mostRecent ? (
        <ExtendForm semester={mostRecent} onResolved={onResolved} />
      ) : (
        <CreateForm onResolved={onResolved} />
      )}
    </div>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors"
      style={
        active
          ? { background: "var(--vio-bg)", color: "var(--vio)", border: "1px solid var(--vio)" }
          : { background: "var(--card)", color: "var(--ink-soft)", border: "1px solid var(--line)" }
      }
    >
      {children}
    </button>
  );
}

function ExtendForm({ semester, onResolved }: { semester: SemesterRow; onResolved: () => void }) {
  // Default the new end date to today if the semester already ended, otherwise keep
  // its current end date so the admin only has to push it out.
  const today = todayISO();
  const [endDate, setEndDate] = useState(semester.endDate < today ? today : semester.endDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <form onSubmit={submit} className="space-y-4">
      {error && <FormError message={error} />}
      <div className="rounded-lg px-3 py-2 text-[12px]" style={{ border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-soft)" }}>
        <div className="font-medium" style={{ color: "var(--ink)" }}>{semester.label}</div>
        <div>{semester.startDate} – {semester.endDate}</div>
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-medium" style={labelStyle}>New end date</label>
        <input
          type="date"
          value={endDate}
          min={semester.startDate}
          onChange={e => setEndDate(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none"
          style={inputStyle}
        />
      </div>
      <SemesterTimeline startDate={semester.startDate} endDate={endDate} />
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
    <form onSubmit={submit} className="space-y-4">
      {error && <FormError message={error} />}
      <div>
        <label className="mb-1.5 block text-[11px] font-medium" style={labelStyle}>Label</label>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Fall 2026"
          className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none"
          style={inputStyle}
        />
      </div>
      {/* Inline-style grid, NOT the `grid grid-cols-2` Tailwind classes: the modal body
          is wrapped in .dash, and dashboard-ledger.css has a `.dash .grid` rule (the
          dashboard layout grid) that overrides Tailwind's .grid with a 1fr/rail-width
          template — collapsing both date cells into one column. Inline styles win on
          specificity. minWidth:0 still lets the native date widgets shrink to track. */}
      <div style={dateGridStyle}>
        <div style={{ minWidth: 0 }}>
          <label className="mb-1.5 block text-[11px] font-medium" style={labelStyle}>Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none" style={{ ...inputStyle, minWidth: 0 }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <label className="mb-1.5 block text-[11px] font-medium" style={labelStyle}>End date</label>
          <input type="date" value={endDate} min={startDate || undefined} onChange={e => setEndDate(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none" style={{ ...inputStyle, minWidth: 0 }} />
        </div>
      </div>
      <SemesterTimeline startDate={startDate} endDate={endDate} />
      <SubmitButton saving={saving} idle="Create & activate" busy="Creating…" />
    </form>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-[12px]"
      style={{ border: "1px solid rgba(217,139,163,.25)", background: "var(--rose-bg)", color: "var(--rose)" }}
    >
      {message}
    </div>
  );
}

// Mirrors the dashboard's .ba-chip.primary: violet-bg tint at rest, solid --vio-deep
// on hover. Hover is JS-driven since these are inline styles (the dusk vars resolve via
// the .dash wrapper, not a class the button could carry a :hover rule on).
function SubmitButton({ saving, idle, busy }: { saving: boolean; idle: string; busy: string }) {
  const [hover, setHover] = useState(false);
  const hot = hover && !saving;
  return (
    <button
      type="submit"
      disabled={saving}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-[12px] font-semibold transition-colors disabled:opacity-50"
      style={{
        background: hot ? "var(--vio-deep)" : "var(--vio-bg)",
        color: hot ? "#fff" : "var(--vio)",
        border: `1px solid ${hot ? "var(--vio-deep)" : "var(--vio-bg)"}`,
      }}
    >
      {saving ? busy : idle}
      {!saving && (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )}
    </button>
  );
}
