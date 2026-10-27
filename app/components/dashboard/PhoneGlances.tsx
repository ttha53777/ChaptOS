"use client";

import React from "react";
import type { ActivityEntry, Brother, Thresholds } from "../../data";
import type { TrackedMetrics } from "@/lib/tracked-metrics";
import { standingCounts } from "./MembersCard";
import { useRecentDocs } from "./ledger/RecentDocs";
import { LedgerSparkline } from "./ledger/LedgerSparkline";

/**
 * What a card says when the phone folds it to a half-width tile (DashGrid's
 * `glance`): one headline and one line under it, from the same data the card
 * draws. A tap opens the card itself. Never a number the card wouldn't show.
 */

function Skel() {
  return <><i className="skel gl-skv" /><i className="skel gl-skn" /></>;
}

export function TreasuryGlance({ balance, projected, trend, loading, error }: {
  balance: number | null;
  projected: number | null;
  trend: { month: string; balance: number }[];
  loading: boolean;
  error: boolean;
}) {
  if (error) return <span className="gl-n warn">Couldn&apos;t load the books</span>;
  if (loading) return <Skel />;
  if (balance == null) return <><span className="gl-v unset">—</span><span className="gl-n">No balance yet</span></>;
  return (
    <>
      <span className="gl-v">${Math.round(balance).toLocaleString()}</span>
      {trend.length > 1 && <span className="gl-spark"><LedgerSparkline data={trend.map(t => t.balance)} stroke="var(--pp-mint-ink)" width={140} height={26} /></span>}
      <span className="gl-n">{projected != null ? `$${Math.round(projected).toLocaleString()} projected` : "Net balance"}</span>
    </>
  );
}

export function MembersGlance({ brothers, thresholds, standing, loading, error, pending }: {
  brothers: Brother[];
  thresholds: Thresholds;
  standing: TrackedMetrics;
  loading: boolean;
  error: boolean;
  /** Join requests this viewer can act on (zero for anyone who can't). */
  pending: number;
}) {
  const counts = React.useMemo(() => standingCounts(brothers, thresholds, standing), [brothers, thresholds, standing]);
  if (error) return <span className="gl-n warn">Couldn&apos;t load the roster</span>;
  if (loading) return <Skel />;
  const off = counts ? counts.watch + counts.risk : 0;
  return (
    <>
      <span className="gl-v">{brothers.length}</span>
      {counts && brothers.length > 0 && (
        <span className="gl-bands" aria-hidden="true">
          {counts.good > 0 && <i style={{ flex: counts.good, background: "var(--pp-mint-ink)" }} />}
          {counts.watch > 0 && <i style={{ flex: counts.watch, background: "var(--pp-butter-ink)" }} />}
          {counts.risk > 0 && <i style={{ flex: counts.risk, background: "var(--pp-peach-ink)" }} />}
        </span>
      )}
      <span className={`gl-n${pending > 0 ? " warn" : ""}`}>
        {pending > 0
          ? `${pending} asking to join`
          : !counts || brothers.length === 0 ? "on the roster"
          : off > 0 ? `${off} to keep an eye on`
          : "All in good standing"}
      </span>
    </>
  );
}

export function ActivityGlance({ entries, loading, error }: { entries: ActivityEntry[]; loading: boolean; error: boolean }) {
  if (error) return <span className="gl-n warn">Couldn&apos;t load activity</span>;
  if (loading) return <Skel />;
  const e = entries[0];
  if (!e) return <span className="gl-n">Nothing yet</span>;
  return (
    <>
      <span className="gl-line">{e.message}</span>
      <span className="gl-n">{e.timestamp}</span>
    </>
  );
}

export function DocsGlance() {
  const { docs, failed } = useRecentDocs();
  if (failed) return <span className="gl-n warn">Couldn&apos;t load docs</span>;
  if (!docs) return <Skel />;
  if (docs.length === 0) return <span className="gl-n">No docs yet</span>;
  return (
    <>
      <span className="gl-line">{docs[0].title}</span>
      <span className="gl-n">{docs.length > 1 ? `+${docs.length - 1} more recent` : "Newest in the library"}</span>
    </>
  );
}
