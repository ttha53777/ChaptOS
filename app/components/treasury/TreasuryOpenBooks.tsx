"use client";

import React, { useState } from "react";
import { PaperIcon } from "../paper/PaperIcon";
import { apiErrorMessage, requestJson } from "../../lib/api";

/**
 * Day one for whoever holds MANAGE_TREASURY: one question, the opening balance.
 *
 * Before this, an officer on never-opened books got the full instrument panel
 * printing $0 everywhere, and nothing in the product ever asked the question
 * PATCH /api/treasury/settings exists to answer. 0 is a legitimate answer
 * ("we're starting from nothing"), so the field accepts it.
 *
 * Reuses `.tr-locked` for the card so both looks frame it the same way as the
 * member's locked state; `.tr-open` adds the form.
 */
export function TreasuryOpenBooks({ onOpened }: { onOpened: (openingBalance: number) => void }) {
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = parseFloat(raw.replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(v)) { setErr("Enter what’s in the account today — $0 is fine."); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await requestJson<{ openingBalance: number | null }>("/api/treasury/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingBalance: Math.round(v * 100) / 100 }),
      });
      onOpened(res.openingBalance ?? v);
    } catch (e2) {
      setErr(apiErrorMessage(e2, "Couldn’t open the books. Please try again."));
      setSaving(false);
    }
  }

  return (
    <div className="tr-locked tr-open">
      <span className="tr-open-eyebrow">Day one of the books</span>
      <h2>Let’s open the <span className="hi">books.</span></h2>
      <p>
        One question: what’s in the account today? Every number after this is a
        transaction you can trace back.
      </p>
      <form onSubmit={submit} autoComplete="off">
        <label className="tr-cash">
          <span aria-hidden="true">$</span>
          <input
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Opening balance"
            value={raw}
            onChange={e => { setRaw(e.target.value); setErr(null); }}
            autoFocus
          />
        </label>
        {err && <p className="tr-open-err" role="alert">{err}</p>}
        <button className="tr-add" disabled={saving}>
          <PaperIcon name="check" />
          {saving ? "Opening…" : "Open the books"}
        </button>
      </form>
      <p className="tr-open-note">Starting from nothing? $0 is a fine answer.</p>
      <div className="tr-open-unl">
        <span>This turns on</span>
        <span className="pl mint">Balance</span>
        <span className="pl peach">Breakdown</span>
        <span className="pl butter">Dues</span>
        <span className="pl sky">Reports</span>
      </div>
    </div>
  );
}
