/**
 * The Docs page's rules, shared by the web (app/org/[slug]/docs/*) and the native app
 * (mobile/src/docs/*), so both build the same shelf, sections, filters, counts and words.
 *
 * Pure and client-safe: no React, no server imports, no Temporal. "Now" is injected
 * (`now: Date`), never read here. On the app's SHARED list (scripts/lint-mobile-imports.py),
 * so it must also compile under mobile's noUncheckedIndexedAccess.
 */
import type { Doc, DocFolder } from "../api-types/docs";

/** What the rules read from a doc (the web page's local Doc type has the same fields). */
export type DocLike = Pick<Doc, "id" | "title" | "url" | "description" | "createdAt" | "createdById" | "folderId" | "pinnedAt" | "position">;
export type FolderLike = Pick<DocFolder, "id" | "name" | "pinnedAt" | "position">;

// ── kinds ─────────────────────────────────────────────────────────────────────
/** A small, recognizable "source" type inferred from the URL. */
export type Kind = "doc" | "sheet" | "form" | "drive" | "link";

export function kindOf(url: string): Kind {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    path = u.pathname;
  } catch {
    return "link";
  }
  if (host === "forms.gle" || /\/forms\//.test(path) || /forms\.google/.test(host)) return "form";
  if (/\/spreadsheets\//.test(path) || host.includes("sheets.google")) return "sheet";
  if (host.includes("drive.google")) return "drive";
  if (/\/document\//.test(path) || host.includes("docs.google")) return "doc";
  return "link";
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

export const KIND_LABEL: Record<Kind, string> = { doc: "Doc", sheet: "Sheet", form: "Form", drive: "Drive", link: "Link" };

/** "Jun 27", with the year once the date falls outside `now`'s year. */
export function fmtDate(iso: string, now: Date): string {
  try {
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString("en-US", opts);
  } catch {
    return "";
  }
}

/** Paper folder colours, assigned by section order (pinned first, then the hand order).
 *  The Add sheet's folder picker uses the same index, so a folder's tab there wears the
 *  colour of its section on the page. */
export const FOLDER_HUES = ["lilac", "rose", "mint", "peach", "sky", "butter"] as const;
export type FolderHue = (typeof FOLDER_HUES)[number];
export const folderHue = (index: number): FolderHue => FOLDER_HUES[index % FOLDER_HUES.length]!;

// ── filters and sorts ─────────────────────────────────────────────────────────
export type KindFilter = "all" | "doc" | "sheet" | "form" | "link";
export const FILTERS: { id: KindFilter; label: string }[] = [
  { id: "all",   label: "All" },
  { id: "doc",   label: "Docs" },
  { id: "sheet", label: "Sheets" },
  { id: "form",  label: "Forms" },
  { id: "link",  label: "Links" },
];

export type SortId = "manual" | "newest" | "name" | "kind";
export const SORTS: { id: SortId; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "newest", label: "Newest" },
  { id: "name",   label: "Name" },
  { id: "kind",   label: "Kind" },
];
export const isSortId = (s: unknown): s is SortId => s === "manual" || s === "newest" || s === "name" || s === "kind";

/** Drive and plain links both surface under "Links". */
export function bucketOf(url: string): KindFilter {
  const k = kindOf(url);
  return k === "drive" ? "link" : k;
}

/** A search hit: title, description or URL (the query already trimmed + lowercased). */
export function matches(d: DocLike, q: string): boolean {
  return !q
    || d.title.toLowerCase().includes(q)
    || (d.description?.toLowerCase().includes(q) ?? false)
    || d.url.toLowerCase().includes(q);
}
export const normQuery = (query: string) => query.trim().toLowerCase();

/** Newest first, always: the meta-line measures read this whatever the display sort. */
export function newestFirstOf<D extends DocLike>(docs: D[]): D[] {
  return [...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}

/** The display order inside a section. Manual: hand-ordered docs first, in their order;
 *  never-dragged docs fall to the bottom in newest order. */
export function sortDocs<D extends DocLike>(newestFirst: D[], sort: SortId): D[] {
  const arr = [...newestFirst];
  if (sort === "name") arr.sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id);
  else if (sort === "kind") arr.sort((a, b) =>
    kindOf(a.url).localeCompare(kindOf(b.url)) || a.title.localeCompare(b.title) || a.id - b.id);
  else if (sort === "manual") arr.sort((a, b) => {
    const ap = a.position, bp = b.position;
    if (ap != null && bp != null) return ap - bp || a.id - b.id;
    if (ap != null) return -1;
    if (bp != null) return 1;
    return 0;
  });
  return arr;
}

/** The shelf: pinned docs, most recently pinned first. Honors the search but not the kind
 *  filter (the shelf stays put while the ledgers filter). */
export function pinnedShelf<D extends DocLike>(docs: D[], query: string): D[] {
  const q = normQuery(query);
  return docs
    .filter(d => d.pinnedAt != null)
    .sort((a, b) => b.pinnedAt!.localeCompare(a.pinnedAt!) || b.id - a.id)
    .filter(d => matches(d, q));
}

/** Per-kind counts for the filter segment, over the unpinned library. */
export function kindCounts(unpinned: DocLike[]): Record<KindFilter, number> {
  const c: Record<KindFilter, number> = { all: unpinned.length, doc: 0, sheet: 0, form: 0, link: 0 };
  for (const d of unpinned) {
    const k = kindOf(d.url);
    if (k === "doc") c.doc++;
    else if (k === "sheet") c.sheet++;
    else if (k === "form") c.form++;
    else c.link++;
  }
  return c;
}

export function filterDocs<D extends DocLike>(unpinned: D[], query: string, filter: KindFilter): D[] {
  const q = normQuery(query);
  return unpinned.filter(d => (filter === "all" || bucketOf(d.url) === filter) && matches(d, q));
}

/** Visible rows by section. Docs pointing at a folder we don't have fall back to Unfiled. */
export function groupByFolder<D extends DocLike>(filtered: D[], folderIds: Set<number>): Map<number | null, D[]> {
  const m = new Map<number | null, D[]>();
  for (const d of filtered) {
    const key = d.folderId != null && folderIds.has(d.folderId) ? d.folderId : null;
    const arr = m.get(key);
    if (arr) arr.push(d); else m.set(key, [d]);
  }
  return m;
}

/** Section order: pinned folders first (most recently pinned), then hand-ordered folders,
 *  then the rest by name. */
export function sortFolders<F extends FolderLike>(folders: F[]): F[] {
  return [...folders].sort((a, b) => {
    if (a.pinnedAt && b.pinnedAt) return b.pinnedAt.localeCompare(a.pinnedAt);
    if (a.pinnedAt) return -1;
    if (b.pinnedAt) return 1;
    const ap = a.position, bp = b.position;
    if (ap != null && bp != null) return ap - bp || a.id - b.id;
    if (ap != null) return -1;
    if (bp != null) return 1;
    return a.name.localeCompare(b.name) || a.id - b.id;
  });
}

/** "N docs" on a section head: unpinned docs, unfiltered. */
export function folderCounts(docs: DocLike[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const d of docs) if (d.pinnedAt == null && d.folderId != null) m.set(d.folderId, (m.get(d.folderId) ?? 0) + 1);
  return m;
}

/** Everything a folder delete releases, pinned docs included (the confirm never understates). */
export function folderTotals(docs: DocLike[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const d of docs) if (d.folderId != null) m.set(d.folderId, (m.get(d.folderId) ?? 0) + 1);
  return m;
}

/** Unfiled renders whenever unpinned root (or orphaned) docs exist at all. */
export function unfiledCount(docs: DocLike[], folderIds: Set<number>): number {
  return docs.filter(d => d.pinnedAt == null && (d.folderId == null || !folderIds.has(d.folderId))).length;
}

/** The Move sheet's folders, by name. */
export function moveTargets<F extends FolderLike>(folders: F[]): F[] {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name));
}

/** The page's states. */
export function pageState(o: { loading: boolean; loadError: boolean; docs: number; folders: number; query: string; filter: KindFilter; filtered: number; pinned: number }) {
  const hasDocs = o.docs > 0;
  const dayOne = !o.loading && !o.loadError && !hasDocs && o.folders === 0;
  const queryActive = o.query.trim() !== "" || o.filter !== "all";
  const nothingMatches = queryActive && hasDocs && o.filtered === 0 && o.pinned === 0;
  return { hasDocs, dayOne, queryActive, nothingMatches };
}

/** Would a just-added doc show under the current search and filter? (If not, both clear.) */
export function shownUnder(d: DocLike, query: string, filter: KindFilter): boolean {
  return (filter === "all" || bucketOf(d.url) === filter) && matches(d, normQuery(query));
}

// ── the briefing ──────────────────────────────────────────────────────────────
/** "2d", "Today", "3w": the compact age of the newest doc. */
export function relDays(iso: string, now: Date): string {
  try {
    const then = new Date(iso).getTime();
    const days = Math.floor((now.getTime() - then) / 86_400_000);
    if (days <= 0) return "Today";
    if (days === 1) return "1d";
    if (days < 14) return `${days}d`;
    if (days < 60) return `${Math.round(days / 7)}w`;
    return `${Math.round(days / 30)}mo`;
  } catch {
    return "—";
  }
}

/** The meta line's measures. */
export function glanceOf(newestFirst: DocLike[], now: Date) {
  const kinds = new Set(newestFirst.map(d => {
    const k = kindOf(d.url);
    return k === "drive" || k === "link" ? "link" : k;
  }));
  const contributors = new Set(newestFirst.map(d => d.createdById).filter((x): x is number => x != null));
  const first = newestFirst[0];
  const newest = first?.createdAt ? relDays(first.createdAt, now) : "—";
  return { total: newestFirst.length, kinds: kinds.size, contributors: contributors.size, newest };
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export const numWord = (n: number): string => (n <= 10 ? WORDS[n]! : String(n));

/** The one-line digest, derived from what's in the library. */
export function digestLine(docs: DocLike[], orgName: string, now: Date): string {
  if (docs.length === 0) {
    return `${orgName}'s reference library is empty — pin the documents the chapter reaches for most.`;
  }
  const recent = docs.filter(d => {
    try { return (now.getTime() - new Date(d.createdAt).getTime()) < 7 * 86_400_000; } catch { return false; }
  }).length;
  const noun = docs.length === 1 ? "reference is" : "references are";
  const tail = recent > 0
    ? ` ${recent === 1 ? "One was" : `${recent} were`} added this week.`
    : "";
  return `${cap(numWord(docs.length))} ${noun} pinned for the chapter to reach for.${tail}`;
}

// ── menus, sheets and words ───────────────────────────────────────────────────
export type DocAction = "copy" | "pin" | "edit" | "move" | "refresh" | "delete";
/** The doc menu: Copy link for everyone; the rest need MANAGE_DOCS. */
export function docMenu(pinned: boolean, canManage: boolean): { id: DocAction; label: string; danger?: boolean }[] {
  const items: { id: DocAction; label: string; danger?: boolean }[] = [{ id: "copy", label: "Copy link" }];
  if (canManage) {
    items.push(
      { id: "pin", label: pinned ? "Unpin" : "Pin to top" },
      { id: "edit", label: "Edit" },
      { id: "move", label: "Move to folder…" },
      { id: "refresh", label: "Refresh preview" },
      { id: "delete", label: "Delete", danger: true },
    );
  }
  return items;
}

export type FolderAction = "pin" | "rename" | "delete";
export function folderMenu(pinned: boolean): { id: FolderAction; label: string; danger?: boolean }[] {
  return [
    { id: "pin", label: pinned ? "Unpin" : "Pin to top" },
    { id: "rename", label: "Rename" },
    { id: "delete", label: "Delete", danger: true },
  ];
}

/** Folder-delete confirm copy, with the live doc count it will release. */
export function folderDeleteMessage(name: string, count: number): string {
  if (count === 0) return `"${name}" will be deleted. It has no docs.`;
  const docs = count === 1 ? "Its 1 doc returns" : `Its ${count} docs return`;
  return `"${name}" will be deleted. ${docs} to Unfiled — they aren't deleted.`;
}

export const docDeleteMessage = (title: string) => `"${title}" will be removed from the docs page.`;

/** The Add sheet's "Lands in <b>name</b>…" line, as its bold part and the rest. */
export function landsIn(dest: FolderLike | null, destCount: number): { name: string; tail: string } {
  if (!dest) return { name: "Unfiled", tail: ". You can move it any time." };
  return { name: dest.name, tail: destCount > 0 ? ` with ${destCount} other${destCount === 1 ? "" : "s"}.` : ", its first doc." };
}

/** The section's empty line, or null when rows (or the ghost add row) fill it. */
export function sectionNone(o: { folderName: string | null; visible: number; queryActive: boolean; canManage: boolean }): string | null {
  if (o.visible > 0) return null;
  if (o.queryActive) return o.folderName != null ? `Nothing in ${o.folderName} matches this filter.` : "Nothing unfiled matches this filter.";
  if (!(o.canManage && o.folderName != null)) return "Nothing filed here yet.";
  return null;
}

export const docCountLabel = (n: number) => (n === 1 ? "1 doc" : `${n} docs`);

/** Toasts, word for word. */
export const SAY = {
  added: (title: string) => `Added "${title}".`,
  updated: "Doc updated.",
  deleted: (title: string) => `Deleted "${title}".`,
  copied: "Link copied.",
  copyFailed: "Couldn't copy the link.",
  refreshed: "Preview refreshed.",
  folderCreated: (name: string) => `Created folder "${name}".`,
  folderRenamed: "Folder renamed.",
  folderDeleted: (name: string) => `Deleted folder "${name}".`,
  moved: (dest: string) => `Moved to ${dest}.`,
  pinned: (title: string, on: boolean) => (on ? `Pinned "${title}".` : `Unpinned "${title}".`),
  fail: {
    add: "Failed to add doc.", update: "Failed to update doc.", delete: "Failed to delete doc.", refresh: "Failed to refresh preview.",
    folderCreate: "Failed to create folder.", folderRename: "Failed to rename folder.", folderDelete: "Failed to delete folder.",
    move: "Failed to move doc.", pinDoc: "Failed to pin doc.", pinFolder: "Failed to pin folder.", load: "Could not load docs. Please refresh.",
  },
} as const;
