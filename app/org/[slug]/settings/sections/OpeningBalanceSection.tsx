"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "../../../../context/ChapterContext";
import { apiErrorMessage, requestJson } from "../../../../lib/api";
import { useDirtyGuard } from "../SettingsDirtyContext";
import { OPENING_BALANCE_COPY as C, balanceDirty, parseBalance, toBalanceDraft } from "@/lib/settings/opening-balance";

// Settings → Opening balance. The same number TreasuryOpenBooks asks for on day
// one, made editable afterwards: a treasurer who typed the wrong figure, or who
// skipped the wall and wants to answer later, had no way back to it.
//
// Settings doesn't load the treasury section, so this fetches /api/treasury itself
// and, after a save, pushes the server's recomputed balance + trend into
// ChapterContext — a session that visited Treasury first won't refetch on the way
// back, and would otherwise keep showing the old opening figure.

interface TreasuryResponse {
  balance: number;
  projected: number;
  trend: { month: string; balance: number }[];
  openingBalance: number | null;
}

export function OpeningBalanceSection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { setTreasuryData } = useChapter();
  const [persisted, setPersisted] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    requestJson<TreasuryResponse>("/api/treasury")
      .then(data => {
        if (!mounted.current) return;
        setPersisted(data.openingBalance);
        setDraft(toBalanceDraft(data.openingBalance));
      })
      .catch(() => { if (mounted.current) onError(C.loadFailed); })
      .finally(() => { if (mounted.current) setLoading(false); });
  }, [onError]);

  const parsed = useMemo(() => parseBalance(draft), [draft]);
  const dirty = balanceDirty(parsed, persisted, loading);
  useDirtyGuard("opening-balance", dirty);

  const save = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    if (parsed === null || Number.isNaN(parsed)) {
      setInvalid(C.invalid);
      return;
    }
    setSaving(true);
    try {
      const res = await requestJson<{ openingBalance: number | null }>("/api/treasury/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingBalance: parsed }),
      });
      const next = res.openingBalance ?? parsed;
      if (!mounted.current) return;
      setPersisted(next);
      setDraft(toBalanceDraft(next));
      // Balance and trend are folded server-side; take the fresh copy rather than
      // re-deriving them here.
      const fresh = await requestJson<TreasuryResponse>("/api/treasury").catch(() => null);
      if (fresh) setTreasuryData(fresh);
      onStatus(C.saved(next));
    } catch (err) {
      onError(apiErrorMessage(err, C.saveFailed));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [saving, parsed, setTreasuryData, onStatus, onError]);

  return (
    <form className="sc-stack-tight" onSubmit={save} autoComplete="off">
      <p className="sc-lede">
        {C.lede}
      </p>

      <div className="sc-card sc-card-pad">
        <div className="sc-row sc-row-between">
          <span className="sc-row-key">
            {C.key}
            {!loading && persisted == null && <span className="sc-dirty" style={{ marginLeft: 8 }}>{C.notSet}</span>}
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="sc-unit">{C.unit}</span>
              <input
                inputMode="decimal"
                placeholder={loading ? C.loadingPlaceholder : C.placeholder}
                aria-label={C.aria}
                value={draft}
                disabled={loading || saving}
                onChange={e => { setDraft(e.target.value); setInvalid(null); }}
                aria-invalid={invalid != null}
                aria-describedby={invalid ? "opening-balance-err" : undefined}
                className="sc-input sc-input-num sc-input-sm w-32"
                style={invalid ? { borderColor: "rgba(217,139,163,.6)" } : undefined}
              />
            </div>
            {invalid && (
              <p className="sc-err mt-1 text-right" id="opening-balance-err" role="alert">{invalid}</p>
            )}
          </div>
        </div>
      </div>

      <div className="sc-actions">
        <button type="submit" disabled={!dirty || saving} className="sc-btn sc-btn-primary">
          {saving ? C.saving : persisted == null ? C.set : C.save}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => { setDraft(toBalanceDraft(persisted)); setInvalid(null); }}
            disabled={saving}
            className="sc-btn sc-btn-ghost"
          >
            {C.undo}
          </button>
        )}
        {dirty && <span className="sc-dirty">{C.unsaved}</span>}
      </div>
    </form>
  );
}
