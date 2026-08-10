import React from "react";

/**
 * The failure counterpart to a widget's loading skeleton.
 *
 * Progressive hydration made this necessary. When every commit landed together,
 * one dead endpoint was a whole-page condition and the page-level banner covered
 * it. Now that each widget waits on its own section, a section that never arrives
 * leaves that one widget pulsing a skeleton forever — an animation that means
 * "still coming" pointing at data that isn't. A stalled widget has to say so
 * itself, and offer the retry, because it is the only part of the page that knows.
 *
 * `onRetry` refetches every loaded section, not just this one: the context's
 * refresh is all-or-nothing by design, and a per-section retry endpoint would be
 * new API surface for a case that is nearly always a transient network blip.
 */
export function SectionError({ what, onRetry }: {
  /** Lowercase noun phrase for the missing data, e.g. "the roster". */
  what: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rail-error" role="status">
      Couldn&apos;t load {what}.
      {onRetry && (
        <button
          type="button"
          className="a"
          onClick={(e) => { e.stopPropagation(); onRetry(); }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
