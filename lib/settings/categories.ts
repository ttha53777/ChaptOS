/**
 * Settings → Money categories: the rules and every sentence, shared by the web
 * section (sections/TransactionCategoriesSection.tsx) and the app
 * (mobile/src/settings/Categories.tsx). Pure: no React, Node or Prisma.
 *
 * Two books (income, expense), because `kind` is immutable: which book's Add you
 * press is the choice. Reserved rows (income "Dues", expense "Reimbursement") are
 * rename + recolour only; hidden rows still resolve money already filed under them.
 * Duplicate labels, in-use refusals and the ceiling are the API's to say.
 */
import { isReservedCategory, MAX_CATEGORIES_PER_ORG, slugifyCategory, type CategoryKind } from "@/lib/transaction-categories";

export { MAX_CATEGORIES_PER_ORG, type CategoryKind };
export const CATEGORY_LABEL_MAX = 40;

export interface Book {
  kind: CategoryKind;
  title: string;
  note: string;
  addLabel: string;
  placeholder: string;
}

export const BOOKS: readonly Book[] = [
  {
    kind: "income",
    title: "Money in",
    note: "Offered when you record income, and what the income chart is sliced by.",
    addLabel: "Add income category",
    placeholder: "Alumni donation",
  },
  {
    kind: "expense",
    title: "Money out",
    note: "Offered on expenses, reimbursements and budget lines alike.",
    addLabel: "Add expense category",
    placeholder: "Rush",
  },
];

type CatLike = { id: number; kind: CategoryKind; slug: string; label: string; builtin: boolean; hidden: boolean; displayOrder: number };

/** True when the service will refuse to hide or delete this row. */
export const isLocked = (cat: CatLike) => cat.builtin || isReservedCategory(cat.kind, cat.slug);

/** Each book's rows in display order. */
export function byBook<C extends CatLike>(cats: readonly C[]): Record<CategoryKind, C[]> {
  const sorted = [...cats].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
  return { income: sorted.filter(c => c.kind === "income"), expense: sorted.filter(c => c.kind === "expense") };
}

/** The row's sub-line parts (the slug part is `{ slug }` so it can be set in mono), or none. */
export type SubPart = { slug: string } | string;
export function categorySub(cat: CatLike): SubPart[] {
  const locked = isLocked(cat);
  const parts: SubPart[] = [];
  if (cat.slug !== cat.label) parts.push({ slug: cat.slug });
  if (locked) parts.push("the treasury posts here on its own, so it can't be hidden or removed");
  if (!locked && cat.hidden) parts.push("not offered on new transactions");
  return parts;
}

export const hiddenMessage = (label: string, hidden: boolean) => hidden
  ? `"${label}" hidden — money already filed under it still reads normally`
  : `"${label}" is back in the picker`;

export const previewSlug = (label: string) => slugifyCategory(label) || "category";

export const CATEGORIES_COPY = {
  loading: "Loading…",
  loadFailed: "Failed to load categories",
  builtin: "BUILT-IN",
  hidden: "HIDDEN",
  filedAs: "filed as ",
  edit: "Edit",
  show: "Show",
  hide: "Hide",
  delete: "Delete",
  deleteTitle: (label: string) => `Delete "${label}"?`,
  deleteMessage: "Any transaction, reimbursement or budget line already filed under this category has to be moved first — if some still use it the delete is refused and nothing changes. Hide it instead to retire it without touching the books.",
  label: "Label",
  filedPermanent: "Filed in the books as (permanent)",
  renameNote: "Renaming changes what everyone sees. Every transaction already filed here stays filed here.",
  color: "Color in the charts",
  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",
  saved: (label: string) => `"${label}" saved`,
  saveFailed: "Failed to save category",
  removed: (label: string) => `"${label}" removed`,
  deleteFailed: "Failed to delete category",
  empty: (kind: CategoryKind) => `Nothing here yet — add your first ${kind} category below.`,
  newTitle: (kind: CategoryKind) => ["New ", kind, " category"] as const,
  nameReq: "Name *",
  slugPreview: (slug: string) => ["Filed in the books as ", slug, " — permanent once created, though you can rename what people see any time."] as const,
  create: "Create category",
  creating: "Creating…",
  added: (label: string) => `"${label}" added`,
  createFailed: "Failed to create category",
  maxed: ["Maximum of ", String(MAX_CATEGORIES_PER_ORG), " categories reached across both books. Delete or hide one to add another."] as const,
} as const;
