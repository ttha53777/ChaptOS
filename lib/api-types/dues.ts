// Dues wire shapes: charges, each member's standing, a member's tab line by line.
// Type-only: see lib/api-types/index.ts for the rules. Money is dollars (a number
// with at most two decimals), like every other amount the API sends.

/** Where a member stands. See lib/dues-ledger.ts summarize(). */
export type DuesStanding = "overdue" | "due" | "paid" | "none";

/** lib/state/dues-audience.ts. */
export type DuesAudienceKind = "all" | "role" | "pick" | "single" | "carryover";

/** One live charge, with how collection on it is going. */
export interface DuesChargeSummary {
  id: number;
  name: string;
  /** YYYY-MM-DD, or null for "no due date" (never overdue). */
  dueDate: string | null;
  note: string | null;
  audienceKind: DuesAudienceKind;
  /** "Everyone", "By role", "3 people" — frozen when it was handed out. */
  audienceLabel: string;
  semesterId: number | null;
  createdAt: string;
  /** People billed on it, and how many of them have it covered. */
  people: number;
  paidPeople: number;
  total: number;
  outstanding: number;
  /** Past its due date with money still out. */
  overdue: boolean;
  /** The distinct per-person amounts, low to high: [140] or [90, 140]. */
  amounts: number[];
}

/** One member's position over the charges in view. */
export interface MemberDuesStanding {
  brotherId: number;
  standing: DuesStanding;
  billed: number;
  paid: number;
  owes: number;
  overdue: number;
  /** Days past the earliest overdue due date; 0 when nothing is overdue. */
  lateDays: number;
  /** The open charge next in line to be paid. */
  nextChargeId: number | null;
  nextDueDate: string | null;
  /** What's still open, per charge, in the order payments will cover it. */
  open: { chargeId: number; rest: number }[];
}

/** GET /api/dues?semester=<label>. Without `semester`: every live charge. */
export interface DuesBoard {
  /** The chapter's today (its own time zone) — what "overdue" was judged against. */
  today: string;
  /** The term in view, or null for every charge. */
  term: { id: number; label: string } | null;
  charges: DuesChargeSummary[];
  members: MemberDuesStanding[];
  totals: { billed: number; paid: number; owes: number; overdue: number };
  /** The signed-in member's own position in this view, or null if they're not on the roster. */
  viewer: MemberDuesStanding | null;
}

/** One row of a member's tab. Positive adds to what they owe, negative takes off. */
export interface DuesBookEntry {
  kind: "charge" | "payment" | "waiver";
  /** YYYY-MM-DD. */
  date: string;
  title: string;
  /** "Due Oct 1" · the payment method · the waiver's reason. */
  detail: string | null;
  amount: number;
  chargeId: number | null;
  /** The DuesChargeLine / Transaction / DuesWaiver id, for undo. */
  refId: number;
}

/** GET /api/dues/members/[brotherId]. */
export interface MemberDuesBook {
  brotherId: number;
  standing: MemberDuesStanding;
  /** Oldest first. */
  entries: DuesBookEntry[];
  open: { chargeId: number; name: string; dueDate: string | null; rest: number }[];
}

/**
 * POST /api/dues/charges/preview — the receipt, resolved server-side against the
 * live roster with the same code that writes the charge.
 */
export interface DuesChargePreview {
  audienceLabel: string;
  /** Everyone the audience selects, before the duplicate skip. */
  selected: number;
  people: number;
  total: number;
  lines: { brotherId: number; amount: number; parts: { key: number | "base" | "none"; amount: number }[] | null }[];
  /** A live charge of the same name this term, if there is one. */
  duplicateOf: { id: number; name: string; createdAt: string } | null;
  /** Selected people who already have it, and how many of them are being left off. */
  already: number;
  skipped: number;
  /** By role: people billed on two or more rows (they pay the sum). */
  stacked: number;
}

/** POST /api/dues/charges. */
export interface DuesChargeIssued {
  id: number;
  name: string;
  people: number;
  total: number;
  /** Left off because they already had a same-named charge. */
  skipped: number;
}

/** POST /api/dues/waivers. */
export interface DuesWaived {
  waiverId: number;
  brotherId: number;
  duesOwed: number;
}
