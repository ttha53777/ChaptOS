"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChapter } from "../../context/ChapterContext";
import { useOrgPath } from "../../hooks/useOrgPath";
import { requestJson } from "../../lib/api";
import { APP_NAME } from "@/lib/domains";
import { NAV, NAV_WORKFLOW_MAP } from "../../components/Sidebar";
import { ALWAYS_ON_WORKFLOWS, type WorkflowId } from "@/lib/org-types";

// /[slug]/onboarding — the post-creation "finish setup" page picker.
//
// A founder lands here right after creating their org (the create flow
// redirects to /{slug}/onboarding instead of straight to the dashboard). They
// choose which optional pages the org exposes; Dashboard, Timeline, and Chapter
// are always on and shown as locked. On Continue we PATCH /api/orgs/config with
// the chosen workflow set and hard-navigate into the dashboard.
//
// Visual language matches /welcome/create (the auth-scope design) because this
// is a continuation of that same setup wizard, not a normal in-app page.
//
// The OrgGuard layout (app/[slug]/layout.tsx) already enforces that the viewer
// is a signed-in member of this org, so there's no auth handling here. The PATCH
// is additionally org-admin-gated server-side; a non-admin who reaches this URL
// can toggle the form but the save returns 403 (surfaced as an inline error).

// One picker row per hideable nav surface — i.e. every NAV label whose workflow
// is non-null in NAV_WORKFLOW_MAP. Labels + descriptions explain the surface in
// the org's terms. Derived from NAV so this list can never drift from the
// sidebar's actual surfaces.
interface PickerItem {
  label: string;
  workflow: WorkflowId;
  description: string;
}

const DESCRIPTIONS: Record<string, string> = {
  Brotherhood: "Member roster, profiles, attendance, and dues.",
  Treasury:    "Budget, transactions, and the running balance.",
  Events:      "Parties and social events with door revenue tracking.",
  Service:     "Service events and per-member service-hour totals.",
  Instagram:   "Plan and track social posts and announcements.",
  Docs:        "Pinned links and shared documents.",
};

const PICKER_ITEMS: PickerItem[] = NAV.flatMap((label) => {
  const workflow = NAV_WORKFLOW_MAP[label];
  if (workflow == null) return []; // always-on surface — not a toggle
  return [{ label, workflow, description: DESCRIPTIONS[label] ?? "" }];
});

// Always-on surfaces, shown as locked rows so the founder understands what they
// get regardless of their choices. Dashboard/Timeline/Chapter map to null.
const ALWAYS_ON_LABELS = NAV.filter((label) => NAV_WORKFLOW_MAP[label] == null);

export default function OnboardingPage() {
  const router = useRouter();
  const orgPath = useOrgPath();
  const { currentUser, refreshChapterData } = useChapter();

  const orgName = currentUser?.org?.name ?? "your organization";
  const enabledWorkflows = currentUser?.org?.enabledWorkflows;

  // Toggles start with every optional surface ON — the fullest, safe default
  // for the brief window before /api/auth/me resolves. Once the org's actual
  // preset (from its org-type template) arrives, we adopt it ONCE so the founder
  // starts from their template's sensible selection and trims from there. A ref
  // guard makes the re-seed fire a single time, never clobbering later edits.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(PICKER_ITEMS.map((i) => i.workflow)),
  );
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !enabledWorkflows) return;
    seededRef.current = true;
    setSelected(new Set(PICKER_ITEMS.filter((i) => enabledWorkflows.includes(i.workflow)).map((i) => i.workflow)));
  }, [enabledWorkflows]);

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function toggle(workflow: WorkflowId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(workflow)) next.delete(workflow);
      else next.add(workflow);
      return next;
    });
  }

  async function handleContinue() {
    if (submitting) return;
    setSubmitting(true);
    setServerError(null);

    // The service force-enables the always-on workflows, so we only need to send
    // the optional picks. We include the always-on ids too for idempotence.
    const chosen = [
      ...ALWAYS_ON_WORKFLOWS,
      ...PICKER_ITEMS.filter((i) => selected.has(i.workflow)).map((i) => i.workflow),
    ];

    try {
      await requestJson("/api/orgs/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledWorkflows: chosen }),
      });
      // Refresh the cached /me so the sidebar picks up the new workflow set
      // immediately, then navigate into the dashboard.
      await refreshChapterData().catch(() => undefined);
      router.push(orgPath("/"));
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setServerError(
        message.includes("403") || /forbidden/i.test(message)
          ? "Only an org admin can set this up. Ask an admin to finish setup."
          : "Couldn't save your choices. Try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-scope">
      <div className="auth-page">
        <div className="auth-topbar">
          <div className="auth-wordmark">
            <div className="auth-glyph">C</div>
            <div className="auth-wm-txt">{APP_NAME}</div>
          </div>
          <div className="auth-meta">Set up</div>
        </div>

        <div className="auth-main">
          <div className="auth-col wide">
            <div className="auth-index">Almost there</div>
            <h1 className="auth-h1">
              Choose your <em>pages.</em>
            </h1>
            <p className="auth-lede">
              Pick the pages <strong>{orgName}</strong> needs. You can turn any of
              these on or off later in Settings.
            </p>

            <div className="auth-body auth-stack-28">
              {/* Locked, always-on surfaces */}
              <div>
                <p className="auth-label" style={{ padding: 0 }}>Always included</p>
                <p className="auth-hint">Every organization gets these.</p>
                <div className="auth-radios">
                  {ALWAYS_ON_LABELS.map((label) => (
                    <div key={label} className="auth-radio on" style={{ cursor: "default", opacity: 0.85 }}>
                      <span className="auth-dot" aria-hidden />
                      <div>
                        <div className="t">{label}</div>
                      </div>
                      <span
                        aria-hidden
                        style={{ marginLeft: "auto", alignSelf: "center", fontSize: 11, color: "var(--ink-32)", textTransform: "uppercase", letterSpacing: ".1em" }}
                      >
                        Locked
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Toggleable pages */}
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="auth-label" style={{ padding: 0 }}>Optional pages</legend>
                <p className="auth-hint">Toggle the ones you want. Unselected pages are hidden from the sidebar.</p>
                <div className="auth-radios">
                  {PICKER_ITEMS.map((item) => {
                    const on = selected.has(item.workflow);
                    return (
                      <label key={item.workflow} className={`auth-radio${on ? " on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(item.workflow)}
                          className="sr-only"
                        />
                        <span className="auth-dot" aria-hidden />
                        <div>
                          <div className="t">{item.label}</div>
                          <div className="d">{item.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {serverError && (
                <div className="auth-alert" role="alert">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  {serverError}
                </div>
              )}

              <div className="auth-stack">
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={submitting}
                  className="auth-btn-vio"
                >
                  {submitting ? "Saving…" : "Continue to dashboard"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
