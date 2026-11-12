"use client";

import React from "react";
import { PERMISSIONS } from "@/lib/permissions";
import { PaperIcon } from "../../../../../components/paper/PaperIcon";
import { andList, gapRank, ladderRungs, type RoleRow } from "./role-copy";
import { RoleChip } from "./RoleChip";

/**
 * Rank as a place on a ladder of the org's real roles instead of a bare number.
 * Click a gap ("put it here") or a rung ("level with"); the number is derived.
 * Rungs and gaps at or above the actor's own rank are locked, matching the
 * server's strictly-below rule.
 */
export function RankLadder({ others, rank, onChange, myMaxRank, myRoleIds, name, color, readOnly }: {
  /** Every role except the one being edited. */
  others: RoleRow[];
  rank: number;
  onChange: (rank: number) => void;
  myMaxRank: number;
  myRoleIds: Set<number>;
  name: string;
  color: string;
  readOnly?: boolean;
}) {
  const rungs = ladderRungs(others);
  const top = rungs[0];
  const isLevel = rungs.some(r => r.rank === rank);
  const inGap = (hi: number | null, lo: number) => !isLevel && rank > lo && (hi === null || rank < hi);

  const neighbours = (hi: number | null, lo: number) => {
    const above = rungs.find(r => r.rank === hi);
    const below = rungs.find(r => r.rank === lo);
    const a = above?.roles.map(r => r.name).join(" / ");
    const b = below && below.roles.length ? below.roles.map(r => r.name).join(" / ") : "members with no role";
    return a ? `below ${a}, above ${b}` : `above ${b}`;
  };

  function gap(hi: number | null, lo: number) {
    if (inGap(hi, lo)) {
      return (
        <div key={`slot-${lo}`} className="rs-slot" style={{ "--rc": color } as React.CSSProperties}>
          <div className="rs-slot-card">
            <RoleChip name={name} color={color} />
            <span className="where">{neighbours(hi, lo)}</span>
            <span className="rk">Rank {rank}</span>
          </div>
        </div>
      );
    }
    const target = gapRank(hi, lo, myMaxRank);
    if (readOnly || target === null) return hi === null ? null : <span key={`gap-${lo}`} className="rs-gap-x" aria-hidden="true" />;
    return (
      <button key={`gap-${lo}`} type="button" className="rs-gap" onClick={() => onChange(target)} aria-label={`Put it ${neighbours(hi, lo)}`}>
        <span>Put it here</span>
      </button>
    );
  }

  const givers = others.filter(r => r.rank > rank && (r.permissions & PERMISSIONS.MANAGE_ROLES)).map(r => r.name);
  const below = others.filter(r => r.rank < rank).map(r => r.name);

  return (
    <div>
      <div className="rs-ladder">
        {top && gap(null, top.rank)}
        {rungs.map((r, i) => {
          const locked = r.rank >= myMaxRank;
          const mine = r.roles.some(x => myRoleIds.has(x.id) && x.rank === myMaxRank);
          const sel = r.rank === rank;
          const next = rungs[i + 1];
          const base = r.rank === 0;
          return (
            <React.Fragment key={r.rank}>
              <button
                type="button"
                className={`rs-rung${sel ? " with-new" : ""}${base ? " base" : ""}`}
                style={{ "--rc": color } as React.CSSProperties}
                disabled={readOnly || locked}
                aria-pressed={sel}
                aria-label={`Level with ${base && !r.roles.length ? "members with no role" : r.roles.map(x => x.name).join(", ")} (rank ${r.rank})`}
                onClick={() => onChange(r.rank)}
              >
                {r.roles.map(x => <RoleChip key={x.id} name={x.name} color={x.color} />)}
                {base && <span className="rs-base-l">{r.roles.length ? "and members with no role" : "Members with no role"}</span>}
                {sel && <RoleChip name={name} color={color} live />}
                {mine && <span className="rs-you">You</span>}
                {locked && !mine && <PaperIcon name="lock" className="rs-lock" />}
                {!sel && !locked && !readOnly && <span className="rs-lvl">Level with</span>}
                <span className="rk">{r.rank}</span>
              </button>
              {next && gap(r.rank, next.rank)}
            </React.Fragment>
          );
        })}
      </div>
      <div className="rs-why">
        <div><b>Who can give it out</b>{givers.length ? `${andList(givers)}, and org admins.` : "Org admins only."}</div>
        <div><b>Who it can manage</b>{below.length
          ? `If ${name} can change Roles, it could hand out ${andList(below)}.`
          : `Nothing. No roles sit below ${name}.`}</div>
      </div>
    </div>
  );
}
