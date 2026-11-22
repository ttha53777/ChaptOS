/**
 * Parties' rules and words come from lib/parties/ledger (shared with the web page,
 * app/org/[slug]/parties). This file adds what only the app needs: who can manage.
 * Writes are MANAGE_PARTIES (1<<3), what the routes check.
 */
import type { MeResponse } from "@/lib/api-types";

export * from "@/lib/parties/ledger";

const MANAGE_PARTIES = 1 << 3;
export const canManage = (me: MeResponse) => me.isAdmin || (me.permissions & MANAGE_PARTIES) !== 0;
