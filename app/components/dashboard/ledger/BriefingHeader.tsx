"use client";

import React, { useEffect, useState } from "react";
import { fmtRange } from "../../../data";

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Briefing-first header: a mono date/week kicker, a serif greeting with the
 * viewer's first name emphasized, and the existing AI digest sentence inline.
 * The health dial is passed in as `health` (composed by the page so the feature
 * gate + hide affordance stay in Home). Carries `id="sec-dashboard"` so the
 * sidebar scroll-spy/jump still resolves the Dashboard anchor.
 */
export function BriefingHeader({
  firstName,
  weekStart,
  weekEnd,
  digest,
  digestLoading,
  health,
  actions,
}: {
  firstName: string;
  weekStart: string;
  weekEnd: string;
  digest: string | null;
  digestLoading: boolean;
  health?: React.ReactNode;
  /** Action bar (My Standing / Quick Actions / Log Attendance / search / export)
   *  folded in from the removed top toolbar. Renders below the digest. */
  actions?: React.ReactNode;
}) {
  // `new Date()` resolves differently on the server (its clock/timezone, baked
  // into the SSR HTML) and on the client (the viewer's local clock). Around a day
  // boundary or across timezones those disagree, which is a hydration mismatch.
  // So we seed from `weekStart` — a server-provided snapshot that's identical on
  // both sides — and swap in the viewer's actual local date/greeting only after
  // mount, where it's client-only and can't mismatch.
  const [clock, setClock] = useState<{ label: string; greeting: string }>(() => ({
    label: fmtDate(new Date(`${weekStart}T00:00:00`)),
    greeting: "Welcome",
  }));
  useEffect(() => {
    const now = new Date();
    setClock({ label: fmtDate(now), greeting: greetingFor(now.getHours()) });
  }, []);

  const dateLabel = clock.label;

  return (
    <section id="sec-dashboard" className="briefing" aria-label="Chapter briefing">
      <div>
        <p className="kicker">
          <span className="today">{dateLabel}</span>
          &ensp;·&ensp;Week of {fmtRange(weekStart, weekEnd)}
        </p>
        <h1 className="greeting">
          {clock.greeting}, <em>{firstName}</em>.
        </h1>
        {(digest || digestLoading) && (
          <div className="digest">
            <span className="ai-chip">AI</span>
            {digestLoading
              ? <p className="digest-loading">Summarizing this week…</p>
              : <p>{digest}</p>}
          </div>
        )}
        {actions}
      </div>
      {health}
    </section>
  );
}
