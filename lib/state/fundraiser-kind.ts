// What a fundraiser is — only picks the "usually on a … list" suggestions
// (lib/fundraisers.ts FUNDRAISER_KINDS). Guessed from the name at create.
// DB CHECK: fundraiser_kind in prisma/migrations/20261022000001_fundraisers.
export const FundraiserKind = {
  Bake:   "bake",
  Drink:  "drink",
  Wash:   "wash",
  Raffle: "raffle",
  Other:  "other",
} as const;

export type FundraiserKind = (typeof FundraiserKind)[keyof typeof FundraiserKind];

export const FUNDRAISER_KINDS_LIST: readonly FundraiserKind[] = Object.values(FundraiserKind);

export function isFundraiserKind(value: unknown): value is FundraiserKind {
  return typeof value === "string" && (FUNDRAISER_KINDS_LIST as readonly string[]).includes(value);
}
