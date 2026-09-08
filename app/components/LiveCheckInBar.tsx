"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useChapter } from "../context/ChapterContext";
import { useSharedLiveCheckIn } from "../context/LiveCheckInContext";
import { isDashboardRoute } from "../lib/routes";
import { requestJson, apiErrorMessage } from "../lib/api";
import type { LiveCheckIn } from "@/lib/services/attendance-service";
import "./dashboard/dashboard-ledger.css";
import "./live-checkin-bar.css";

/**
 * LiveCheckInBar — the check-in window, following a member off the dashboard.
 *
 * The full band (ledger/LiveCheckIn.tsx) lives on /[slug] and only there, so a
 * member reading Timeline or Treasury when an officer opens the window saw
 * nothing at all. The window is 60 minutes long; there is no second chance once
 * it expires. This is the surface that makes it reachable from anywhere in the
 * app.
 *
 * Deliberately NOT the full band. It carries one fact (which event) and one
 * action (I'm here), because it is an interruption on a page about something
 * else. Everything else — the tally, the excuse link, officer controls — stays
 * on the dashboard, one tap away through the title.
 *
 * It shows itself only when there is something for THIS member to do:
 *   · a window is open (not closing-as-in-closed, not a lingering tally), and
 *   · they have not checked in, and
 *   · they do not hold an approved excuse.
 * Once they are accounted for it dismisses itself. An officer who has already
 * checked in is not nagged about a window they opened.
 */

const DISMISS_KEY = "figurints:checkin-bar-dismissed";

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function LiveCheckInBar() {
  const pathname = usePathname();
  const { currentUser } = useChapter();
  const { data, refresh, apply } = useSharedLiveCheckIn();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedId, setDismissedId] = useState<number | null>(null);

  // A dismissal survives navigation (the bar remounts on every route change)
  // but not the window itself — it is keyed by event id, so the next meeting
  // gets a fresh bar. sessionStorage, not local: dismissing today's meeting
  // should not silence next week's on the same laptop.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      if (raw) setDismissedId(Number(raw) || null);
    } catch {
      // Private mode / blocked storage: the bar is simply never pre-dismissed.
    }
  }, []);

  const slug = currentUser?.org?.slug ?? null;

  // The dashboard already renders the full band directly under the briefing.
  // Two check-in surfaces stacked on one page reads as a bug, so the bar yields
  // there — this is the ONE place the big one is guaranteed to be.
  const onDashboardHome = !!slug && pathname === `/${slug}`;

  const state = data?.state;
  const actionable =
    !!data &&
    (state === "open" || state === "closing") &&
    !data.me.checkedIn &&
    data.me.excuse?.status !== "approved";

  if (!currentUser?.org) return null;
  if (!isDashboardRoute(pathname)) return null;
  if (onDashboardHome) return null;
  if (!actionable) return null;
  if (dismissedId === data.event.id) return null;

  async function checkIn() {
    if (!data) return;
    setBusy(true);
    setError(null);

    // Optimistic: the tap reads as done immediately, and the server's answer
    // reconciles a beat later. A member standing in a doorway on chapter wifi
    // should not watch a spinner to find out whether they pressed the button.
    const optimistic: LiveCheckIn = {
      ...data,
      presentCount: data.presentCount + 1,
      me: { ...data.me, checkedIn: true, checkedInAt: new Date().toISOString() },
    };
    apply(optimistic);

    try {
      const next = await requestJson<LiveCheckIn | null>(
        `/api/attendance/${data.event.id}/check-in`,
        { method: "POST" },
      );
      apply(next ?? null);
    } catch (e) {
      // Roll the optimistic guess back to what the server last told us, then say
      // why. Leaving the tick up on a failed write is the one outcome worse than
      // a slow button: they walk away believing they are marked present.
      apply(data);
      setError(apiErrorMessage(e, "Could not check you in."));
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    if (!data) return;
    setDismissedId(data.event.id);
    try {
      sessionStorage.setItem(DISMISS_KEY, String(data.event.id));
    } catch {
      // Non-fatal: the in-memory state above still hides it for this page view.
    }
  }

  const closing = state === "closing";

  return (
    <div className="dash" data-dashboard-theme="dusk">
      <section
        className={`lcb${closing ? " closing" : ""}`}
        aria-label="Live event check-in"
      >
        <span className="lcb-dot" aria-hidden="true" />

        <p className="lcb-what">
          <b>{closing ? "Check-in closing" : "Check-in open"}</b>
          <span className="lcb-sep">·</span>
          {/* The title is the way back to the full band — the tally, the excuse
              link and the officer controls all live there. */}
          <a className="lcb-title" href={slug ? `/${slug}` : "#"}>{data.event.title}</a>
        </p>

        {error && <span className="lcb-err" role="alert">{error}</span>}

        <button type="button" className="lcb-btn" disabled={busy} onClick={() => void checkIn()}>
          <CheckIcon />
          {busy ? "Checking in…" : "I'm here"}
        </button>

        <button type="button" className="lcb-x" onClick={dismiss} aria-label="Dismiss check-in reminder">
          <CloseIcon />
        </button>
      </section>
    </div>
  );
}
