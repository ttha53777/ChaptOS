import React from "react";
import { fmt$, fmtDate, type PartyEvent } from "../../../data";

/**
 * Socials rail — door revenue by event as ranked bars (top = best event), plus
 * a "next up" line for the soonest future party. Replaces the Party Events card
 * and the Recharts door-revenue panel. Carries `id="sec-parties"`.
 */
export function SocialsRail({
  parties,
  totalDoorRev,
  maxRevenue,
  bestEvent,
  today,
  onAdd,
  onAll,
}: {
  parties: PartyEvent[];
  totalDoorRev: number;
  maxRevenue: number;
  bestEvent: PartyEvent | null;
  today: string;
  onAdd?: () => void;
  onAll?: () => void;
}) {
  const ranked = [...parties].sort((a, b) => b.doorRevenue - a.doorRevenue).slice(0, 6);
  const nextUp = [...parties]
    .filter((p) => p.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

  return (
    <section id="sec-parties" className="card" aria-label="Socials">
      <div className="card-h">
        <h2>Socials</h2>
        <div className="right">
          <span className="sub">{fmt$(totalDoorRev)} at the door</span>
          {onAll && <button type="button" className="card-act" onClick={onAll}>All</button>}
          {onAdd && <button type="button" className="card-act" onClick={onAdd}>+ Add</button>}
        </div>
      </div>
      {ranked.length === 0 ? (
        <div className="rail-empty">No events logged — add one to track door revenue.</div>
      ) : (
        <div style={{ padding: "8px 0 6px" }}>
          {ranked.map((p) => {
            const isTop = bestEvent ? p.id === bestEvent.id : false;
            const pct = maxRevenue > 0 ? Math.round((p.doorRevenue / maxRevenue) * 100) : 0;
            return (
              <div key={p.id} className={isTop ? "rev-row top" : "rev-row"}>
                <span className="n">{p.name}</span>
                <span className="track"><i style={{ width: `${pct}%` }} /></span>
                <span className="v">{fmt$(p.doorRevenue)}</span>
              </div>
            );
          })}
        </div>
      )}
      {nextUp && (
        <div className="rev-up">
          Next up — <b>{nextUp.name}</b>{nextUp.collabOrg ? ` with ${nextUp.collabOrg}` : ""} · {fmtDate(nextUp.date)}
        </div>
      )}
    </section>
  );
}
