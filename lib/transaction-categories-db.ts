/**
 * The DB-backed half of the category registry: the gate every financial write
 * runs before it stores a category.
 *
 * Split from lib/transaction-categories.ts because that module is reachable from
 * the client bundle (via lib/org-types.ts) and must stay free of @/lib/db and
 * @/lib/errors. Everything here is server-only.
 */

import type { db } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import type { CategoryKind } from "@/lib/transaction-categories";

/** Org-scoped data accessor (same shape as ctx.db) — matches lib/dues.ts. */
type Scoped = ReturnType<typeof db>;

/**
 * Throw unless `slug` is a category this org defined on this side of the ledger.
 *
 * Takes the scoped accessor rather than a RequestContext so every service can
 * share one implementation without one service calling another (see AGENTS.md).
 * Reads deliberately never call this: a category that was hidden or deleted after
 * rows referenced it must still render on those rows, which is why the list
 * endpoint returns hidden rows and why there is no FK.
 */
export async function assertCategoryExists(
  scoped: Scoped,
  kind: CategoryKind,
  slug: string,
): Promise<void> {
  await assertCategoriesExist(scoped, kind, [slug]);
}

/**
 * Batched form — one query for N slugs, so a budget's whole allocation list costs
 * a single round trip instead of one per line.
 *
 * `hidden` is deliberately NOT considered. Hiding is a picker hint; rejecting a
 * hidden category here would 400 a client holding a slightly stale list and would
 * make an archived category impossible to correct a typo out of. Existing is the
 * whole test.
 */
export async function assertCategoriesExist(
  scoped: Scoped,
  kind: CategoryKind,
  slugs: readonly string[],
): Promise<void> {
  const wanted = [...new Set(slugs)];
  if (wanted.length === 0) return;

  const rows = await scoped.transactionCategory.findMany({
    where:  { kind, slug: { in: wanted } },
    select: { slug: true },
  });

  const found = new Set(rows.map(r => r.slug));
  const missing = wanted.filter(s => !found.has(s));
  if (missing.length > 0) {
    throw new ValidationError(
      `Not one of this org's ${kind} categories: ${missing.map(s => `"${s}"`).join(", ")}`,
      { kind, missing },
    );
  }
}
