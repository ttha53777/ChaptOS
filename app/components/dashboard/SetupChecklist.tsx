"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useChapter } from "../../context/ChapterContext";
import { useOrgPath } from "../../hooks/useOrgPath";
import { useActiveSemester } from "../../hooks/useActiveSemester";
import { useVocab } from "../../hooks/useVocab";

/**
 * SetupChecklist — the post-onboarding "finish setting up" nudge on the
 * dashboard.
 *
 * It only renders once the founder has finished the setup wizard
 * (org.onboardingComplete) and there are still outstanding starter tasks. Each
 * item is DERIVED from live data (member count, an existing semester, the org
 * logo) so it self-checks the moment the founder completes it elsewhere — there
 * is no stored per-item done flag to keep in sync. When every item is done the
 * card disappears on its own.
 *
 * Dismissal is intentionally a localStorage flag keyed by org slug, not a server
 * field: this is a transient, self-expiring nudge (it vanishes once the items
 * are done regardless), so it isn't worth a new column/endpoint or polluting the
 * dashboard-widget registry. Worst case a founder who dismisses on one device
 * still sees it on another until they finish the items — harmless.
 *
 * Each row deep-links into the relevant Settings section via ?section=<id>,
 * which the settings page reads on mount.
 */

const DISMISS_KEY = (slug: string) => `figurints:setup-checklist-dismissed:${slug}`;

interface ChecklistItem {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  /** Settings section id to deep-link to, consumed by ?section=<id>. */
  section: string;
}

export function SetupChecklist() {
  const { currentUser, brotherList } = useChapter();
  const router = useRouter();
  const orgPath = useOrgPath();
  const activeSemester = useActiveSemester();
  const v = useVocab();

  const slug = currentUser?.org?.slug ?? "";
  const onboardingComplete = currentUser?.org?.onboardingComplete ?? false;

  // Read the dismissal flag once on first render. Lazy initializer so SSR (where
  // window is undefined) and the client agree on a stable initial value.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined" || !slug) return false;
    try { return window.localStorage.getItem(DISMISS_KEY(slug)) === "1"; }
    catch { return false; }
  });

  const items: ChecklistItem[] = useMemo(() => {
    const memberLabel = v("Member", true).toLowerCase();
    return [
      {
        key: "invite",
        label: `Invite your ${memberLabel}`,
        hint: "Share a join link so your members can sign in.",
        // More than just the founder means real members exist.
        done: brotherList.length > 1,
        section: "invitations",
      },
      {
        key: "semester",
        label: `Set up your ${v("Period").toLowerCase()}`,
        hint: "The active period drives the dashboard and every period-scoped number.",
        done: activeSemester != null,
        section: "semesters",
      },
      {
        key: "logo",
        label: "Add your logo",
        hint: "Give your org its badge in the sidebar and on sign-in.",
        done: !!currentUser?.org?.logoUrl,
        section: "general",
      },
    ];
    // NB: roles aren't a checklist item — the founder already sets them in the
    // onboarding wizard's Roles step, and Brother.role is a free-text display
    // string with no reliable "customized" signal to derive a done-state from.
  }, [brotherList, activeSemester, currentUser?.org?.logoUrl, v]);

  const doneCount = items.filter(i => i.done).length;
  const allDone = doneCount === items.length;

  // Hide entirely until onboarding is finished, once dismissed, or once every
  // item is satisfied (the card has served its purpose).
  if (!onboardingComplete || dismissed || allDone || !slug) return null;

  function dismiss() {
    setDismissed(true);
    try { window.localStorage.setItem(DISMISS_KEY(slug), "1"); } catch { /* non-fatal */ }
  }

  function go(section: string) {
    router.push(`${orgPath("/settings")}?section=${encodeURIComponent(section)}`);
  }

  return (
    <div className="dash-group" style={{ marginBottom: 18 }}>
      <div
        className="dash-card"
        style={{
          border: "1px solid var(--line, rgba(236,231,221,.09))",
          borderRadius: 14,
          padding: "18px 20px",
          background: "var(--card, #161310)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--ink, #ece7dd)", margin: 0 }}>
              Finish setting up {currentUser?.org?.name ?? "your org"}
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--muted, #958d7c)", margin: "3px 0 0" }}>
              {doneCount} of {items.length} done · a few steps to get going
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss setup checklist"
            style={{
              fontSize: 12, color: "var(--muted, #958d7c)", background: "none",
              border: "1px solid var(--line, rgba(236,231,221,.12))", borderRadius: 8,
              padding: "5px 10px", cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => !item.done && go(item.section)}
              disabled={item.done}
              style={{
                display: "flex", alignItems: "flex-start", gap: 11, textAlign: "left",
                padding: "10px 12px", borderRadius: 10,
                border: "1px solid var(--line, rgba(236,231,221,.08))",
                background: item.done ? "transparent" : "var(--card-2, #1b1813)",
                cursor: item.done ? "default" : "pointer",
                opacity: item.done ? 0.6 : 1,
                width: "100%",
              }}
            >
              <span
                aria-hidden
                style={{
                  marginTop: 1, flex: "0 0 auto", width: 17, height: 17, borderRadius: "50%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  border: item.done ? "none" : "1.5px solid var(--muted, #958d7c)",
                  background: item.done ? "var(--ok, #7fb08a)" : "transparent",
                  color: "#0f0d0a",
                }}
              >
                {item.done && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--ink, #ece7dd)", textDecoration: item.done ? "line-through" : "none" }}>
                  {item.label}
                </span>
                {!item.done && (
                  <span style={{ display: "block", fontSize: 12, color: "var(--muted, #958d7c)", marginTop: 1 }}>
                    {item.hint}
                  </span>
                )}
              </span>
              {!item.done && (
                <span aria-hidden style={{ marginLeft: "auto", alignSelf: "center", color: "var(--muted, #958d7c)" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
