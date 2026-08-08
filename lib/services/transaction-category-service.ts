import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import {
  isReservedCategory,
  nextCategoryColor,
  slugifyCategory,
  type CategoryKind,
} from "@/lib/transaction-categories";
import type {
  CreateTransactionCategoryInput,
  UpdateTransactionCategoryInput,
} from "@/lib/validation/transaction-categories";

// Both books combined. Generous — an org with 60 named money streams has a
// bookkeeping problem, not a product problem — but it bounds the picker payload.
const MAX_CATEGORIES_PER_ORG = 60;

export interface TransactionCategoryDTO {
  id: number;
  organizationId: number;
  kind: string;
  slug: string;
  label: string;
  color: string;
  colorDark: string | null;
  builtin: boolean;
  hidden: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * The ledger's vocabulary belongs to whoever keeps the ledger.
 *
 * Deliberately MANAGE_TREASURY rather than the org-admin gate event types use:
 * the person who needs to add "Rush" at 11pm is the treasurer, who already holds
 * MANAGE_TREASURY for POST /api/transactions. Gating this on admin would let them
 * post a transaction but not create the bucket to post it into — a dead end
 * requiring a round trip to the president.
 */
function requireTreasury(ctx: RequestContext) {
  const allowed = ctx.isPlatformAdmin || ctx.isOrgAdmin || hasPermission(ctx.permissions, "MANAGE_TREASURY");
  if (!allowed) throw new ForbiddenError("Only a treasurer can manage categories");
}

function toDTO(row: {
  id: number; organizationId: number; kind: string; slug: string; label: string;
  color: string; colorDark: string | null; builtin: boolean; hidden: boolean;
  displayOrder: number; createdAt: Date; updatedAt: Date;
}): TransactionCategoryDTO {
  return {
    id:             row.id,
    organizationId: row.organizationId,
    kind:           row.kind,
    slug:           row.slug,
    label:          row.label,
    color:          row.color,
    colorDark:      row.colorDark,
    builtin:        row.builtin,
    hidden:         row.hidden,
    displayOrder:   row.displayOrder,
    createdAt:      row.createdAt.toISOString(),
    updatedAt:      row.updatedAt.toISOString(),
  };
}

/**
 * All of the org's categories — including hidden ones. Every member needs the full
 * set to resolve the label and color of transactions already on the books (which
 * render regardless of whether their category is still offered); the client filters
 * the picker itself on `!hidden`. No permission gate, matching listEventTypes.
 */
export async function listTransactionCategories(ctx: RequestContext): Promise<TransactionCategoryDTO[]> {
  const rows = await ctx.db.transactionCategory.findMany({
    orderBy: [{ kind: "asc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toDTO);
}

export async function createTransactionCategory(
  ctx: RequestContext,
  input: CreateTransactionCategoryInput,
): Promise<TransactionCategoryDTO> {
  requireTreasury(ctx);

  const total = await ctx.db.transactionCategory.count();
  if (total >= MAX_CATEGORIES_PER_ORG) {
    throw new ValidationError(`Org has reached the limit of ${MAX_CATEGORIES_PER_ORG} categories`);
  }

  const kind = input.kind as CategoryKind;

  // One read serving three purposes: the duplicate-label guard, slug de-duping,
  // and picking a color nobody on this side of the ledger is using.
  const siblings = await ctx.db.transactionCategory.findMany({
    where:  { kind },
    select: { slug: true, label: true, color: true },
  });

  // Guard on the LABEL, not just the slug. A pure slug check would happily accept a
  // second row labelled "dues" next to the reserved "Dues" — different slugs
  // ("dues" vs "Dues"), indistinguishable in a dropdown.
  const folded = input.label.toLowerCase();
  if (siblings.some(s => s.label.toLowerCase() === folded)) {
    throw new ValidationError(`A ${kind} category called "${input.label}" already exists`);
  }

  const taken = new Set(siblings.map(s => s.slug));
  const base = slugifyCategory(input.label) || `category`;
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

  // Belt and braces: slugifyCategory lowercases, so it cannot produce "Dues" or
  // "Reimbursement" — but if the reserved set ever grows a lowercase entry, a
  // custom row must not be able to impersonate it.
  if (isReservedCategory(kind, slug)) {
    throw new ValidationError(`"${slug}" is reserved`);
  }

  const color = input.color ?? nextCategoryColor(kind, siblings.map(s => s.color)).color;

  const row = await ctx.db.transactionCategory.create({
    data: {
      kind,
      slug,
      label:        input.label,
      color,
      colorDark:    input.colorDark ?? null,
      builtin:      false,
      hidden:       false,
      displayOrder: input.displayOrder ?? siblings.length,
    },
  });

  await emit(ctx, "transaction_category.created", { type: "TransactionCategory", id: row.id }, {
    kind: row.kind, slug: row.slug, label: row.label,
  });

  return toDTO(row);
}

export async function updateTransactionCategory(
  ctx: RequestContext,
  id: number,
  input: UpdateTransactionCategoryInput,
): Promise<TransactionCategoryDTO> {
  requireTreasury(ctx);

  const existing = await ctx.db.transactionCategory.findFirst({ where: { id } });
  if (!existing) throw new NotFoundError("Category");

  const reserved = existing.builtin || isReservedCategory(existing.kind as CategoryKind, existing.slug);

  // A reserved row can be renamed and recolored freely — an org that calls dues
  // "Contributions" relabels this row and the stored slug stays "Dues", so every
  // aggregation keeps matching. It just can't be taken out of circulation, because
  // the server posts to it whether or not a picker offers it.
  if (input.hidden === true && reserved) {
    throw new ValidationError(
      `"${existing.label}" can't be hidden — the treasury posts to it automatically. Rename it instead.`,
    );
  }

  const changedFields: string[] = [];
  const data: Record<string, unknown> = {};
  const fields = ["label", "color", "colorDark", "hidden", "displayOrder"] as const;
  for (const f of fields) {
    if (f in input && input[f] !== undefined) {
      data[f] = input[f] ?? null;
      changedFields.push(f);
    }
  }

  if (typeof data.label === "string") {
    const clash = await ctx.db.transactionCategory.findFirst({
      where: {
        kind:  existing.kind,
        id:    { not: id },
        label: { equals: data.label, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (clash) {
      throw new ValidationError(`A ${existing.kind} category called "${data.label}" already exists`);
    }
  }

  const row = await ctx.db.transactionCategory.update({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where: { id }, data: data as any,
  });

  if (changedFields.length === 1 && changedFields[0] === "hidden") {
    await emit(ctx, "transaction_category.hidden", { type: "TransactionCategory", id: row.id }, {
      kind: row.kind, slug: row.slug, label: row.label, hidden: row.hidden,
    });
  } else {
    await emit(ctx, "transaction_category.updated", { type: "TransactionCategory", id: row.id }, {
      kind: row.kind, slug: row.slug, label: row.label, changedFields,
    });
  }

  return toDTO(row);
}

export async function deleteTransactionCategory(ctx: RequestContext, id: number): Promise<void> {
  requireTreasury(ctx);

  const existing = await ctx.db.transactionCategory.findFirst({ where: { id } });
  if (!existing) throw new NotFoundError("Category");

  const kind = existing.kind as CategoryKind;
  if (existing.builtin || isReservedCategory(kind, existing.slug)) {
    throw new ValidationError(
      `"${existing.label}" can't be deleted — the treasury posts to it automatically.`,
    );
  }

  // Nothing backs these columns with a foreign key (see the schema comment), so
  // check every table that stores a category string and refuse to orphan any of
  // them. `deletedAt: null` is deliberate: "in use" means live money is filed here.
  // Voided rows are terminal history and degrade gracefully — they render the raw
  // slug once the category is gone.
  const [txs, reimbursements, allocations] = await Promise.all([
    ctx.db.transaction.count({ where: { type: existing.kind, category: existing.slug, deletedAt: null } }),
    kind === "expense" ? ctx.db.reimbursement.count({ where: { category: existing.slug } }) : Promise.resolve(0),
    kind === "expense" ? ctx.db.budgetAllocation.count({ where: { category: existing.slug } }) : Promise.resolve(0),
  ]);

  const uses = [
    txs            && `${txs} transaction${txs === 1 ? "" : "s"}`,
    reimbursements && `${reimbursements} reimbursement${reimbursements === 1 ? "" : "s"}`,
    allocations    && `${allocations} budget line${allocations === 1 ? "" : "s"}`,
  ].filter(Boolean);

  if (uses.length > 0) {
    throw new ValidationError(
      `"${existing.label}" is used by ${uses.join(" and ")} — reassign or remove them first, or hide it instead`,
    );
  }

  await ctx.db.transactionCategory.delete({ where: { id } });

  await emit(ctx, "transaction_category.deleted", { type: "TransactionCategory", id }, {
    kind: existing.kind, slug: existing.slug, label: existing.label,
  });
}
