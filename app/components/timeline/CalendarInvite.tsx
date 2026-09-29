"use client";
import { useEffect, useState } from "react";
import { requestJson } from "../../lib/api";
import { AddToCalendarDialog, CalendarIcon, prefetchSubscription, readAdded } from "./CalendarSubscription";
import "./calendar-invite.css";

/** The org segment of the current URL (`/<slug>/…`). */
function currentSlug() { return typeof window === "undefined" ? "" : window.location.pathname.split("/")[1] ?? ""; }
const dismissedKey = (slug: string) => `chaptos:calendar-invite-dismissed:${slug}`;
function readDismissed(slug: string) { try { return localStorage.getItem(dismissedKey(slug)) !== null; } catch { return false; } }

/** Whether members can subscribe right now. `null` while unknown; never the URL. */
export function useCalendarLive(enabled = true) {
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    requestJson<{ live: boolean }>("/api/calendar/subscription?summary=1")
      .then(r => { if (!cancelled) setLive(r.live); })
      .catch(() => { if (!cancelled) setLive(false); });
    return () => { cancelled = true; };
  }, [enabled]);
  return live;
}

/**
 * Dashboard invite: "Get chapter events in your own calendar". Shown once the
 * feed is live, to anyone who hasn't marked it added or said "Not now" in this
 * browser. It sits near the top, so it's also what a newly approved member sees
 * on their first visit, without a second wall after SemesterGate's.
 */
export function CalendarInviteCard() {
  const [slug, setSlug] = useState("");
  const [eligible, setEligible] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const s = currentSlug();
    setSlug(s);
    setEligible(Boolean(s) && !readAdded(s) && !readDismissed(s));
  }, []);
  const live = useCalendarLive(eligible);
  useEffect(() => { if (live) void prefetchSubscription().catch(() => {}); }, [live]);
  if (!eligible || !live) return null;

  function dismiss() {
    try { localStorage.setItem(dismissedKey(slug), new Date().toISOString()); } catch { /* hide for this visit anyway */ }
    setEligible(false);
  }
  const today = new Date();
  return (
    <>
      <section className="cal-invite" aria-labelledby="cal-invite-title">
        <span className="cal-invite-page" aria-hidden>
          <span className="m">{today.toLocaleDateString(undefined, { month: "short" })}</span>
          <span className="n">{today.getDate()}</span>
        </span>
        <div className="cal-invite-copy">
          <h3 id="cal-invite-title">Get chapter events in your own calendar</h3>
          <p>Meetings and deadlines show up in Google or Apple Calendar and stay up to date on their own. It takes about a minute.</p>
        </div>
        <div className="cal-invite-actions">
          <button type="button" className="cal-invite-go" onClick={() => setOpen(true)}><CalendarIcon />Add to my calendar</button>
          <button type="button" className="cal-invite-later" onClick={dismiss}>Not now</button>
        </div>
      </section>
      {open && <AddToCalendarDialog onClose={() => { setOpen(false); if (readAdded(slug)) setEligible(false); }} />}
    </>
  );
}

/**
 * Event sheet: a one-off copy of this event, for people who won't subscribe or
 * are on a phone with Google (which can't subscribe there). Both links are
 * served by /api/calendar/<id>/export from the feed's own published fields.
 */
export function AddThisEvent({ eventId, onSubscribe }: { eventId: number; onSubscribe?: () => void }) {
  const [slug, setSlug] = useState("");
  useEffect(() => { setSlug(currentSlug()); }, []);
  const href = (to: "google" | "ics") => `/api/calendar/${eventId}/export?to=${to}${slug ? `&org=${encodeURIComponent(slug)}` : ""}`;
  return (
    <div className="cal-one">
      <span className="lab">Add this event</span>
      <div className="cal-one-links">
        <a className="cal-one-link" href={href("google")} target="_blank" rel="noopener noreferrer">Google Calendar</a>
        <a className="cal-one-link" href={href("ics")} download>Apple &amp; others</a>
      </div>
      <p className="cal-one-note">
        A one-time copy: it won&apos;t change if this event does.
        {onSubscribe && <> <button type="button" onClick={onSubscribe}>Get every event, kept up to date</button></>}
      </p>
    </div>
  );
}
