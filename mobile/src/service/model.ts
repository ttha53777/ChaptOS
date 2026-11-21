/**
 * Service's rules and words come from lib/service/ledger (shared with the web page,
 * app/org/[slug]/service). This file adds what only the app needs: who can manage, the
 * standing tones, and how a refused write is put into words.
 */
import type { MeResponse } from "@/lib/api-types";
import { ApiError, NetworkError } from "~/api/errors";
import type { Tone } from "~/theme/palette";
import type { Standing } from "@/lib/service/ledger";

export * from "@/lib/service/ledger";

const MANAGE_SERVICE = 1 << 5;
export const canService = (me: MeResponse) => me.isAdmin || (me.permissions & MANAGE_SERVICE) !== 0;

/** A punch card's stock: on track mint, halfway butter, under half peach (the web's --pc). */
export const STANDING_TONE: Record<Standing, Tone> = { ok: "mint", watch: "butter", risk: "peach" };

/**
 * The web's resolveMutationError (app/hooks/useSemesterErrorHandler): no active semester,
 * a dropped connection, the server's own sentence when it wrote one, else the fallback.
 * (The web also routes to semester setup; the app has no Settings page yet.)
 */
export function mutationMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.code === "NO_ACTIVE_SEMESTER") return "Set up an active semester before adding dated items.";
  if (err instanceof NetworkError || !(err instanceof ApiError)) return "Couldn't reach the server. Check your connection and try again.";
  return err.code && err.message.trim() ? err.message : fallback;
}
