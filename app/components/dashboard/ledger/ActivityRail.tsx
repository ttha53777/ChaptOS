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
    <section className="card" aria-label="Activity">
      <div className="card-h">
        <h2>Activity</h2>
        <div className="right">
          <span className="sub">Recent</span>
          {onAll && <button type="button" className="card-act" onClick={onAll}>All</button>}
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="rail-empty">No recent activity.</div>
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
