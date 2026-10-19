"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DuesBoard } from "@/lib/api-types/dues";
import { apiErrorMessage, requestJson } from "../lib/api";

/**
 * The Dues board for one term (GET /api/dues): every live charge in view and
 * where each member stands on them.
 *
 * Loaded by the treasury page, not the Dues tab, because the tab's badge and the
 * Overview's dues card read it too. `semester` must be a real Semester label —
 * a legacy label the server has no row for would 404 — so callers pass null for
 * "every charge" when the term on screen has no row behind it.
 *
 * A slower response for a term the user has already switched away from is
 * dropped, so the board can't flash the wrong term's numbers.
 */
export function useDuesBoard(semester: string | null, enabled = true) {
  const [board, setBoard]     = useState<DuesBoard | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const url = semester ? `/api/dues?semester=${encodeURIComponent(semester)}` : "/api/dues";
      const next = await requestJson<DuesBoard>(url);
      if (mine !== seq.current) return;
      setBoard(next);
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      setError(apiErrorMessage(e, "Couldn't load dues. Try again in a moment."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [semester]);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  return { board, error, loading, reload };
}
