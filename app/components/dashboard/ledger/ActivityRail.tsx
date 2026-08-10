import React from "react";
import type { ActivityEntry } from "../../../data";
import { SectionError } from "./SectionError";

const DOT: Record<ActivityEntry["type"], string> = {
  success: "bg-sage",
  warning: "bg-gold",
  info: "", // violet via inline style below
};

/**
 * Activity rail — recent feed entries with a status dot. Replaces the cold
 * ActivityFeed card on the desktop pane; All opens the existing activity drawer.
 */
export function ActivityRail({
  entries,
  onAll,
  loading = false,
  error = false,
  onRetry,
}: {
  entries: ActivityEntry[];
  onAll?: () => void;
  /** The activity section hasn't landed. "Nothing yet" is a claim about the
   *  chapter's whole history — never make it from an unfetched empty array. */
  loading?: boolean;
  /** The activity fetch failed. Takes precedence over `loading`, which stays
   *  true for a failed section (it never joins `loadedSections`). */
  error?: boolean;
  onRetry?: () => void;
}) {
  const inert = loading || error;
  return (
    <section
      className={`card${onAll && !inert ? " cursor-pointer" : ""}`}
      aria-label="Activity"
      onClick={inert ? undefined : onAll}
    >
      <div className="card-h">
        <h2>Activity</h2>
        <div className="right">
          <span className="sub">Recent</span>
        </div>
      </div>
      {error ? (
        <SectionError what="recent activity" onRetry={onRetry} />
      ) : loading ? (
        <div className="rail-skel rows" aria-busy="true" aria-label="Loading activity">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="skel-row">
              <i className="skel dot" />
              <i className="skel line" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        // "No recent activity" reads as a lull to an org that has one; on day
        // one the feed has never had anything in it, and saying so is the more
        // useful sentence for both.
        <div className="rail-empty">Nothing yet — activity appears here as your chapter uses the app.</div>
      ) : (
        entries.slice(0, 6).map((e) => (
          <div key={e.id} className="act-row">
            <span className={`dot ${DOT[e.type]}`} style={e.type === "info" ? { background: "var(--vio)" } : undefined} />
            <p>{e.message}</p>
            <time>{e.timestamp.replace(/\s*ago$/, "")}</time>
          </div>
        ))
      )}
    </section>
  );
}
