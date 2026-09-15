import React from "react";

/**
 * What a member without MANAGE_TREASURY sees on a treasury whose books were
 * never opened.
 *
 * The state this replaces is the whole reason it exists: the full instrument
 * panel rendered against an empty ledger, which prints "$0.00" as the balance,
 * "$0" income, "$0" expenses and "No transactions for this semester". Five
 * zeroes arranged like a cockpit read as a chapter that LOST its money, not one
 * that hasn't started — and the viewer here is precisely the person with no way
 * to check, no permission to fix it, and no reason to doubt the number.
 *
 * So: no instruments at all. A zero is a measurement claim, and nothing has been
 * measured. One sentence of state, and the name of whoever can change it, which
 * turns a dead end into a nudge that happens over text message rather than in
 * the product.
 *
 * `openers` is the list of people holding MANAGE_TREASURY. It is optional and
 * currently always empty: the roster DTO ships role `{id, name, color, rank}`
 * with no `permissions`, so the client cannot yet work out who those people are.
 * Matching the role NAME against "Treasurer" was the obvious shortcut and is
 * wrong — org vocabulary is renameable, so it silently names nobody in any
 * chapter that calls the office something else. The copy reads correctly with
 * the chip absent; wiring it up is a server change, not a change here.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface TreasuryOpener {
  id: number;
  name: string;
  title: string;
}

export function TreasuryLocked({
  treasuryLabel,
  openers = [],
}: {
  /** The org's word for "Treasury" — this copy is read by members, so it has to
   *  use the chapter's own vocabulary rather than ours. */
  treasuryLabel: string;
  openers?: TreasuryOpener[];
}) {
  const opener = openers[0] ?? null;

  return (
    <div className="tr-locked">
      <span className="lglyph">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="10" width="16" height="11" rx="2.4" />
          <path d="M8 10V7a4 4 0 018 0v3" />
        </svg>
      </span>
      <h2>The books aren&apos;t open yet.</h2>
      <p>
        Your chapter hasn&apos;t started recording finances here. Once the books are
        open, your dues balance and the chapter&apos;s {treasuryLabel.toLowerCase()} show
        up on this page.
      </p>
      {opener && (
        <div className="who-can">
          <span className="av" aria-hidden="true">{initials(opener.name)}</span>
          <span><b>{opener.name}</b> · {opener.title} can open them</span>
        </div>
      )}
    </div>
  );
}
