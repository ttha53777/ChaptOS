// The Dues tab's words and ordering live in lib/treasury/dues.ts, shared with the app.
import type { DuesChargeSummary } from "@/lib/api-types/dues";
import { chargeToneKey } from "@/lib/treasury/dues";

export {
  STANDING, STANDING_ORDER, STRIP_ORDER, money, fmtDay, plural, chargeAmounts, standingLine, dueLine, initials,
} from "@/lib/treasury/dues";

/** Each charge's stub colour: stable per charge, neutral for the carried-over balance. */
export function chargeTone(c: Pick<DuesChargeSummary, "id" | "audienceKind">): string {
  const k = chargeToneKey(c);
  return k === "card" ? "var(--card-3)" : `var(--pp-${k})`;
}
