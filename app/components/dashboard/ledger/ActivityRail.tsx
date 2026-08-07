import React from "react";
import type { ActivityEntry } from "../../../data";

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
}: {
  entries: ActivityEntry[];
  onAll?: () => void;
}) {
  return (
    <section className={`card${onAll ? " cursor-pointer" : ""}`} aria-label="Activity" onClick={onAll}>
      <div className="card-h">
        <h2>Activity</h2>
        <div className="right">
          <span className="sub">Recent</span>
        </div>
      </div>
      {entries.length === 0 ? (
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
