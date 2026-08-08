/**
 * The org's income and expense vocabulary: starter sets, slug derivation, colors,
 * and the one assertion every financial write runs.
 *
 * Posture mirrors `lib/event-types.ts`: the starter template lives in code (small,
 * churns rarely, reviewable as a PR); each org gets an editable *copy* as
 * TransactionCategory rows at creation (provisionOrg) and via the backfill
 * migration. Officers may rename/recolor/reorder any category and add their own.
 *
 * This replaces INCOME_CATEGORIES / EXPENSE_CATEGORIES in `app/data.ts`, which
 * made every org on the platform file its money under one fraternity's words.
 *
 * The stored key is `slug`, and it is IMMUTABLE. For rows that predate this
 * table the slug is the string the ledger already contained — literally
 * "Party Supplies", space and capitals and all — which is why no financial row
 * had to be rewritten and why `DUES_CATEGORY` stayed the literal "Dues". Slugs
 * derived for new categories are kebab-case (see `slugifyCategory`), so format
 * is a derivation-time concern, never a stored constraint.
 *
 * KEEP THIS MODULE PURE. It is reached from the client bundle (lib/org-types.ts →
 * lib/workflow-features.ts → the dashboard page), so importing anything that
 * touches @/lib/db, @/lib/errors or @/lib/dues from here pulls the Prisma runtime
 * into the browser and the build fails on `node:module`. The DB-backed half lives
 * in lib/transaction-categories-db.ts.
 */

import { EVENT_TYPE_PALETTE, type EventTypeColor, type EventTypeColorId } from "@/lib/event-types";

/** Which book a category belongs to. Mirrors TransactionType without importing it. */
export type CategoryKind = "income" | "expense";

export interface CategorySeed {
  kind: CategoryKind;
  /** Stable stored key. Matches Transaction.category. Never renamed. */
  slug: string;
  label: string;
  /** Light-theme hex (ivory). */
  color: string;
  /** Dark-theme hex (dusk); null falls back to `color`. */
  colorDark: string | null;
}

/**
 * Slugs the app itself writes, which therefore cannot be deleted out from under
 * it. Renaming their *label* is fine and encouraged — an org that calls dues
 * "Contributions" relabels this row; the stored slug stays "Dues" so every
 * existing aggregation still matches (see the doc comment on DUES_CATEGORY).
 *
 *   Dues          — minted by transaction-service.recordDuesPayment; the whole
 *                   dues↔ledger invariant is keyed on it.
 *   Reimbursement — reimbursement-service's fallback bucket when an approved
 *                   request names no category.
 *
 * Both are also SEEDED into every org (and backfilled onto every legacy one), so
 * the assertion below stays a plain lookup with no special cases — "reserved"
 * governs deletion and hiding, never validation.
 */
/** reimbursement-service's fallback bucket. One definition, imported there. */
export const FALLBACK_EXPENSE_CATEGORY = "Reimbursement";

export const RESERVED_CATEGORY_SLUGS: Readonly<Record<CategoryKind, readonly string[]>> = {
  // "Dues" is spelled out rather than imported from lib/dues.ts, which reaches the
  // Prisma client — see the module header. lib/dues.ts imports back from here and
  // types DUES_CATEGORY against this entry, so the two still can't drift.
  income:  ["Dues"],
  expense: [FALLBACK_EXPENSE_CATEGORY],
};

/**
 * Keyed by kind, not a flat list: an org is free to name an *expense* stream
 * "Dues" (a chapter that pays dues up to a national), and that row is ordinary —
 * only the income-side "Dues" carries the ledger invariant.
 */
export function isReservedCategory(kind: CategoryKind, slug: string): boolean {
  return RESERVED_CATEGORY_SLUGS[kind].includes(slug);
}

// ── Colors ───────────────────────────────────────────────────────────────────
// Both books draw from EVENT_TYPE_PALETTE — one palette for the whole app, so a
// seeded color is always one an officer could have picked — but in opposite
// orders, so money in reads cool and money out reads warm without either list
// running out of colors.

const BY_ID = Object.fromEntries(EVENT_TYPE_PALETTE.map(c => [c.id, c])) as Record<EventTypeColorId, EventTypeColor>;

const order = (...ids: EventTypeColorId[]): readonly EventTypeColor[] => ids.map(id => BY_ID[id]);

export const INCOME_PALETTE  = order("green", "teal", "sky", "blue", "purple", "orchid", "gold", "rose", "clay");
export const EXPENSE_PALETTE = order("clay", "gold", "rose", "orchid", "purple", "blue", "teal", "sky", "green");

export function categoryPalette(kind: CategoryKind): readonly EventTypeColor[] {
  return kind === "income" ? INCOME_PALETTE : EXPENSE_PALETTE;
}

/**
 * The first color in this book's palette not already spoken for, cycling once
 * every entry is used. What "add a category" pre-selects so two new streams on
 * the same side never land the same dot. Mirrors `nextPaletteColor` in
 * lib/event-types.ts but is per-book.
 */
export function nextCategoryColor(kind: CategoryKind, taken: readonly string[]): EventTypeColor {
  const palette = categoryPalette(kind);
  const used = new Set(taken.map(c => c.toLowerCase()));
  return palette.find(c => !used.has(c.color.toLowerCase())) ?? palette[taken.length % palette.length]!;
}

const seed = (kind: CategoryKind, slug: string, c: EventTypeColor): CategorySeed =>
  ({ kind, slug, label: slug, color: c.color, colorDark: c.colorDark });

/**
 * Fallback starter set for an org type that declares no `categorySeeds` of its
 * own. Intentionally generic and small — an org is expected to add its own words,
 * and a short honest list invites that more than a long borrowed one.
 *
 * Deliberately NOT the 14 legacy constants: those are fraternity vocabulary and
 * live on only where they already have data, seeded by this table's backfill
 * migration. New orgs start from neutral ground.
 *
 * The reserved slugs are appended by `resolveCategorySeeds`, not listed here, so
 * a template can't forget one.
 */
export const DEFAULT_CATEGORY_SEEDS: readonly CategorySeed[] = [
  seed("income",  "Dues",        INCOME_PALETTE[0]!),
  seed("income",  "Fundraiser",  INCOME_PALETTE[1]!),
  seed("income",  "Donations",   INCOME_PALETTE[2]!),
  seed("expense", "Events",      EXPENSE_PALETTE[0]!),
  seed("expense", "Equipment",   EXPENSE_PALETTE[1]!),
  seed("expense", "Operations",  EXPENSE_PALETTE[2]!),
] as const;

/**
 * The rows a brand-new org is seeded with: the template's starter pack, plus any
 * reserved slug the pack didn't already include, appended at the end. Pure — no
 * DB access — so provisionOrg can call it inside its transaction and the
 * onboarding client can mirror it.
 */
export function resolveCategorySeeds(packSeeds?: readonly CategorySeed[]): CategorySeed[] {
  const seeds = [...(packSeeds && packSeeds.length > 0 ? packSeeds : DEFAULT_CATEGORY_SEEDS)];

  for (const kind of ["income", "expense"] as const) {
    for (const slug of RESERVED_CATEGORY_SLUGS[kind]) {
      if (seeds.some(s => s.kind === kind && s.slug === slug)) continue;
      const taken = seeds.filter(s => s.kind === kind).map(s => s.color);
      seeds.push(seed(kind, slug, nextCategoryColor(kind, taken)));
    }
  }

  return seeds;
}

/**
 * Derive a stored key from a display name: "League Fees!" → "league-fees".
 *
 * Only ever applied to NEW categories. Existing slugs are whatever the ledger
 * already contained and are never re-derived — that is the entire reason this
 * migration touched no financial rows.
 *
 * Returns "" for a label with nothing slug-able in it (e.g. "🎉"); callers fall
 * back to the label itself rather than storing an empty key.
 */
export function slugifyCategory(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
