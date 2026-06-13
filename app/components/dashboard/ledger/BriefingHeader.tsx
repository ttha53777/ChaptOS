import React from "react";
import { fmtRange } from "../../../data";

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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
}: {
  firstName: string;
  weekStart: string;
  weekEnd: string;
  digest: string | null;
  digestLoading: boolean;
  health?: React.ReactNode;
}) {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <section id="sec-dashboard" className="briefing" aria-label="Chapter briefing">
      <div>
        <p className="kicker">
          <span className="today">{dateLabel}</span>
          &ensp;·&ensp;Week of {fmtRange(weekStart, weekEnd)}
        </p>
        <h1 className="greeting">
          {greetingFor(now.getHours())}, <em>{firstName}</em>.
        </h1>
        {(digest || digestLoading) && (
          <div className="digest">
            <span className="ai-chip">AI</span>
            {digestLoading
              ? <p className="digest-loading">Summarizing this week…</p>
              : <p>{digest}</p>}
          </div>
        )}
      </div>
      {health}
    </section>
  );
}
