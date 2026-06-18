"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiErrorCode } from "../lib/api";
import { useOrgPath } from "./useOrgPath";

/**
 * Translates a failed dated-item mutation into the right user-facing action,
 * matching the semester guards in lib/services/semester-bounds.ts:
 *
 *   NO_ACTIVE_SEMESTER  → route the user to semester setup (Settings).
 *   DATE_OUTSIDE_SEMESTER → surface the API's specific message inline.
 *   anything else        → surface the provided fallback message.
 *
 * Usage:
 *   const handleSemesterError = useSemesterErrorHandler();
 *   ...
 *   .catch(err => handleSemesterError(err, setMutationError,
 *     "Calendar event could not be saved."));
 */
export function useSemesterErrorHandler() {
  const router = useRouter();
  const orgPath = useOrgPath();

  return useCallback(
    (err: unknown, showMessage: (msg: string) => void, fallback: string) => {
      const code = apiErrorCode(err);
      if (code === "NO_ACTIVE_SEMESTER") {
        showMessage("Set up an active semester before adding dated items.");
        router.push(`${orgPath("/settings")}#set-semesters`);
        return;
      }
      if (code === "DATE_OUTSIDE_SEMESTER" && err instanceof ApiError) {
        const apiMsg = (err.body as { error?: unknown } | null)?.error;
        showMessage(typeof apiMsg === "string" ? apiMsg : fallback);
        return;
      }
      showMessage(fallback);
    },
    [router, orgPath],
  );
}
