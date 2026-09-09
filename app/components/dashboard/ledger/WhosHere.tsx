import React, { useEffect, useMemo, useRef, useState } from "react";
import { requestJson } from "@/app/lib/api";
import type { LiveAttendee, LiveCheckIn as LiveCheckInData, LiveRoster } from "@/lib/services/attendance-service";
import { apiErrorMessage } from "../../../lib/api";

// No "use client" directive: ledger/* components inherit client-ness from
// app/[slug]/page.tsx, which is itself "use client".

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Clock time from an ISO instant, in the viewer's own locale. */
function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Two-letter monogram, for the roster rows that have no avatar image. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  const first = parts[0][0] ?? "";
  const last  = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

type Filter = "here" | "expected";

/**
 * "Who's here" — the roster behind the live band's tally.
 *
 * The list is fetched when this mounts, not polled by the dashboard: see
 * getLiveRoster's note on why the names don't ride along on the 20s poll. It
 * DOES re-fetch while open, because the whole point is watching the room fill.
 */
export function WhosHere({ live, onClose }: { live: LiveCheckInData; onClose: () => void }) {
  const [roster, setRoster]   = useState<LiveAttendee[] | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState<Filter>("here");
  const [query, setQuery]     = useState("");

  const panelRef = useRef<HTMLDivElement>(null);
  const eventId  = live.event.id;

  // onClose is an inline arrow from the parent, so its identity changes every
  // render. Read it through a ref or the key handler below would re-bind on
  // every keystroke in the search field.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Remember the trigger so focus returns to it on close. Captured during the
  // first render, before any child's autoFocus has moved activeElement.
  const triggerRef = useRef<HTMLElement | null>(null);
  if (triggerRef.current === null && typeof document !== "undefined") {
    triggerRef.current = document.activeElement as HTMLElement | null;
  }

  // Fetch on open, then keep pace with the band's own poll while the window is
  // still accepting people. A closed window's list is final — no interval.
  const open = live.state === "open" || live.state === "closing";
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const next = await requestJson<LiveRoster>(
          `/api/attendance/${eventId}/roster`,
          { signal: controller.signal },
        );
        if (cancelled || controller.signal.aborted) return;
        setRoster(next.attendees);
        setError(null);
      } catch (e) {
        if (cancelled || controller.signal.aborted) return;
        // Only the FIRST load surfaces an error. Once a list is on screen a
        // dropped refresh should leave it standing, not replace the room with
        // a banner.
        setRoster(prev => {
          if (prev === null) setError(apiErrorMessage(e, "Could not load the roster."));
          return prev;
        });
      }
    };

    void load();
    if (!open) return () => { cancelled = true; controller.abort(); };

    const id = setInterval(() => { void load(); }, 20_000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [eventId, open]);

  // Escape to close, Tab trapped inside the panel — same contract as the house
  // Modal primitive in dashboard/primitives.tsx.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => !el.hasAttribute("aria-hidden"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    panelRef.current?.focus();
    return () => {
      const trigger = triggerRef.current;
      if (trigger?.isConnected) trigger.focus?.();
    };
  }, []);

  const here     = useMemo(() => (roster ?? []).filter(a => a.present), [roster]);
  const expected = useMemo(() => (roster ?? []).filter(a => !a.present), [roster]);
  // Excused members are listed (so you can see they're accounted for) but are
  // NOT in the card's denominator, so "not here yet" is larger than the number
  // the band is still waiting on. Say so rather than leave the reader to
  // reconcile two numbers that look like they disagree.
  const excused  = useMemo(() => expected.filter(a => a.excused).length, [expected]);
  const awaited  = expected.length - excused;

  const shown = useMemo(() => {
    const base = filter === "here" ? here : expected;
    const q = query.trim().toLowerCase();
    return q ? base.filter(a => a.name.toLowerCase().includes(q)) : base;
  }, [filter, here, expected, query]);

  return (
    <div className="wh-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        className="wh-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Who's here — ${live.event.title}`}
        tabIndex={-1}
      >
        <header className="wh-head">
          <button type="button" className="wh-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="live-kicker">
            <span className="live-dot" />
            <span>{live.state === "closed" ? "Check-in closed" : "Happening now"}</span>
          </p>
          <h2>Who&rsquo;s here</h2>
          <p className="wh-sub">
            {live.event.title}
            {live.event.location ? ` · ${live.event.location}` : ""}
            {live.event.time ? <><br />{live.event.time}</> : null}
          </p>
          <p className="wh-summary" role="status" aria-live="polite">
            {roster === null
              ? "Counting the room…"
              : `${live.presentCount} of ${live.eligibleCount} here`
                + (awaited > 0 ? ` · ${awaited} still expected` : "")
                + (excused > 0 ? ` · ${excused} excused` : "")}
          </p>
        </header>

        <div className="wh-tools">
          <input
            className="wh-search"
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find a member…"
            aria-label="Find a member"
          />
          <div className="wh-filters">
            <button type="button" aria-pressed={filter === "here"} onClick={() => setFilter("here")}>
              Here now{roster ? ` (${here.length})` : ""}
            </button>
            <button type="button" aria-pressed={filter === "expected"} onClick={() => setFilter("expected")}>
              Not here yet{roster ? ` (${expected.length})` : ""}
            </button>
          </div>
        </div>

        <div className="wh-list" role="list" aria-label="Members">
          {error && <p className="wh-empty" role="alert">{error}</p>}

          {!error && roster === null && <p className="wh-empty">Loading the roster…</p>}

          {!error && roster !== null && shown.length === 0 && (
            <p className="wh-empty">
              {query.trim()
                ? "No members match your search."
                : filter === "here"
                  ? "Nobody has checked in yet."
                  : "Everyone is here."}
            </p>
          )}

          {!error && shown.map(a => (
            <div className="wh-person" role="listitem" key={a.brotherId}>
              <span className="wh-avatar" aria-hidden="true">
                {a.avatarUrl
                  ? <img src={a.avatarUrl} alt="" />
                  : initials(a.name)}
              </span>
              <span className="wh-name">
                {a.name}
                {a.excused && !a.present && <small>Excused — not counted absent</small>}
              </span>
              <span className={`wh-status${a.present ? "" : a.excused ? " excused" : " waiting"}`}>
                {a.present
                  ? (a.at ? clockLabel(a.at) : "here")
                  : a.excused ? "excused" : "not yet"}
              </span>
            </div>
          ))}
        </div>

        <footer className="wh-foot">
          <span>
            {live.state === "closed"
              ? "Final — recorded when check-in closed"
              : "Updates as members check in"}
          </span>
        </footer>
      </div>
    </div>
  );
}
