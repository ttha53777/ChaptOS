// Who a dues charge was handed out to — the mode the "Hand out dues" sheet was
// in, plus the two kinds no sheet makes. DB CHECK: dues_charge_audience_kind in
// prisma/migrations/20261019000001_dues_charges.
//
//   all       — the whole roster, minus anyone left out
//   role      — a rate per role; a member holding several roles pays the sum
//   pick      — hand-picked people (fines, a shirt, a retreat seat)
//   single    — one person, from adjustDues (Spotlight's "charge")
//   carryover — the "Earlier balance" the cutover minted from pre-charge duesOwed
export const DuesAudience = {
  All:       "all",
  Role:      "role",
  Pick:      "pick",
  Single:    "single",
  Carryover: "carryover",
} as const;

export type DuesAudience = (typeof DuesAudience)[keyof typeof DuesAudience];

export const DUES_AUDIENCES: readonly DuesAudience[] = Object.values(DuesAudience);

export function isDuesAudience(value: unknown): value is DuesAudience {
  return typeof value === "string" && (DUES_AUDIENCES as readonly string[]).includes(value);
}
