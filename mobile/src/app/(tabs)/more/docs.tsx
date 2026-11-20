/**
 * Docs (the web's app/org/[slug]/docs/page.tsx at phone width), reached from More, every
 * rule from the shared @/lib/docs/library:
 *
 *   brief     REFERENCE LIBRARY, "The chapter’s reading room.", the digest, the meta line
 *             (N references · N kinds · N contributors · newest …); day one: DOCS, "Your
 *             links, all in one place." and its sentence
 *   actions   Add doc · New folder (MANAGE_DOCS; New folder not on day one) · Ask where a
 *             doc lives (opens Ask Chapt with "Where do we keep ")
 *   toolbar   search, All/Docs/Sheets/Forms/Links with counts, Sort, "N of M"
 *   shelf     Pinned · N · stays put while you filter: the taped cards (search applies,
 *             the kind filter doesn't)
 *   sections  the folders as manila tabs in section order (pinned, hand order, name), then
 *             Unfiled; each folds (held open while a search/filter is on); officers get
 *             "Add to {folder}…" and the folder menu (Pin to top / Rename / Delete)
 *   states    Couldn't load the library · Nothing matches (Clear filters) · day one
 *
 * Rows open the link in the in-app browser. The ⋯ menus are sheets with the web's items:
 * Copy link (everyone), then Pin to top/Unpin, Edit, Move to folder…, Refresh preview,
 * Delete (MANAGE_DOCS). The web's drag to file/reorder is a desktop pointer gesture (it
 * doesn't run on a phone), so filing is Move to folder…, as on the web phone.
 *
 * Gate: the "docs" workflow (OrganizationConfig.enabledWorkflows). Off, More has no Docs
 * tile and this route goes back to More, as the web sidebar hides the page.
 *
 * Reads GET /api/docs and /api/docs/folders; writes in ~/data/docs.
 */
import type { Doc, DocFolder } from "@/lib/api-types";
import {
  digestLine, docDeleteMessage, docMenu, FILTERS, filterDocs, folderCounts, folderDeleteMessage, folderHue, folderMenu, folderTotals,
  glanceOf, groupByFolder, isSortId, kindCounts, newestFirstOf, pageState, pinnedShelf, SAY, sectionNone, shownUnder, sortDocs,
  SORTS, sortFolders, unfiledCount, type DocAction, type FolderAction, type KindFilter, type SortId,
} from "@/lib/docs/library";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { Redirect, router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { createDoc, createFolder, deleteDoc, deleteFolder, moveDoc, pinDoc, pinFolder, refreshDoc, renameFolder, updateDoc } from "~/data/docs";
import { useDocFolders, useDocs } from "~/data/more";
import { ActionSheet, FolderSection, GhostAdd, LedgerRow, NoneLine, PinnedCard } from "~/docs/bits";
import { DocsDayOne } from "~/docs/DayOne";
import { ConfirmSheet, DocSheet, FolderSheet, MoveSheet, type DocDraft } from "~/docs/Sheets";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { Screen } from "~/shell/Screen";
import { SlotView, useSlot } from "~/shell/slot";
import { ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { PageBrief } from "~/ui/PageBrief";
import { T } from "~/ui/T";
import { TrBtn } from "~/treasury/bits";

const MANAGE_DOCS = 1 << 9;
const SORT_PREF_KEY = "chaptos-docs-sort";
const COLLAPSE_PREF_KEY = "chaptos-docs-collapsed";
const EMPTY_DRAFT: DocDraft = { title: "", url: "", description: "" };
const EMPTY: never[] = [];

type AddTarget = { kind: "add"; folderId: number | null } | { kind: "edit"; doc: Doc };
type Doomed = { kind: "doc"; doc: Doc } | { kind: "folder"; folder: DocFolder };
type Menu = { kind: "doc"; doc: Doc } | { kind: "folder"; folder: DocFolder } | { kind: "sort" };
type FolderTarget = { kind: "new" } | { kind: "rename"; folder: DocFolder };

const fail = (e: unknown, fallback: string) => { haptics.error(); toast.error(errorMessage(e, fallback)); };

export default function DocsPage() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const me = entry?.me ?? null;
  const allowed = !me || !!me.org?.enabledWorkflows.includes("docs");
  const canManage = !!me && (me.isAdmin || (me.permissions & MANAGE_DOCS) !== 0);
  const docsQ = useDocs(allowed);
  const foldersQ = useDocFolders(allowed);
  const refresh = () => Promise.all([docsQ.refetch(), foldersQ.refetch()]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortId>("newest");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const form = useSlot<AddTarget>();
  const folderForm = useSlot<FolderTarget>();
  const doomed = useSlot<Doomed>();
  const moving = useSlot<Doc>();
  const menu = useSlot<Menu>();

  useEffect(() => {
    AsyncStorage.multiGet([SORT_PREF_KEY, COLLAPSE_PREF_KEY]).then(pairs => {
      const s = pairs[0]?.[1], raw = pairs[1]?.[1];
      if (isSortId(s)) setSort(s);
      if (raw) { try { setCollapsed(prev => ({ ...prev, ...(JSON.parse(raw) as Record<string, boolean>) })); } catch { /* malformed */ } }
    }).catch(() => {});
  }, []);
  const changeSort = (id: SortId) => { setSort(id); AsyncStorage.setItem(SORT_PREF_KEY, id).catch(() => {}); };
  const toggleSection = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      AsyncStorage.setItem(COLLAPSE_PREF_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const docs = docsQ.data ?? EMPTY;
  const folders = foldersQ.data ?? EMPTY;
  const now = useMemo(() => new Date(), [docs]); // eslint-disable-line react-hooks/exhaustive-deps
  const newestFirst = useMemo(() => newestFirstOf(docs), [docs]);
  const sorted = useMemo(() => sortDocs(newestFirst, sort), [newestFirst, sort]);
  const pinned = useMemo(() => pinnedShelf(docs, query), [docs, query]);
  const unpinned = useMemo(() => sorted.filter(d => d.pinnedAt == null), [sorted]);
  const counts = useMemo(() => kindCounts(unpinned), [unpinned]);
  const filtered = useMemo(() => filterDocs(unpinned, query, filter), [unpinned, query, filter]);
  const folderIds = useMemo(() => new Set(folders.map(f => f.id)), [folders]);
  const byFolder = useMemo(() => groupByFolder(filtered, folderIds), [filtered, folderIds]);
  const sections = useMemo(() => sortFolders(folders), [folders]);
  const fCounts = useMemo(() => folderCounts(docs), [docs]);
  const totals = useMemo(() => folderTotals(docs), [docs]);
  const unfiled = useMemo(() => unfiledCount(docs, folderIds), [docs, folderIds]);
  const glance = useMemo(() => glanceOf(newestFirst, now), [newestFirst, now]);
  const orgName = me?.org?.name ?? "ChaptOS";

  const loading = !docsQ.data && !docsQ.isError;
  const loadError = !docsQ.data && docsQ.isError;
  const { hasDocs, dayOne, queryActive, nothingMatches } = pageState({
    loading, loadError, docs: docs.length, folders: folders.length, query, filter, filtered: filtered.length, pinned: pinned.length,
  });

  /* ── writes (the web page's handlers, word for word) ────────────────────────── */

  const onSubmitDoc = async (target: AddTarget, d: DocDraft, folderId: number | null): Promise<boolean> => {
    const body = { title: d.title.trim(), url: d.url.trim(), description: d.description.trim() || null };
    try {
      if (target.kind === "add") {
        const created = await createDoc({ ...body, folderId }, me?.name ?? null);
        // If the active search/kind filter would hide the new doc, clear both.
        if (!shownUnder(created, query, filter)) { setQuery(""); setFilter("all"); }
        toast.show(SAY.added(created.title));
      } else {
        await updateDoc(target.doc.id, body);
        toast.show(SAY.updated);
      }
      haptics.success();
      form.set(null);
      return true;
    } catch (e) {
      fail(e, target.kind === "add" ? SAY.fail.add : SAY.fail.update);
      return false;
    }
  };

  const makeFolder = async (name: string): Promise<DocFolder | null> => {
    try {
      const created = await createFolder(name);
      toast.show(SAY.folderCreated(created.name));
      haptics.success();
      return created;
    } catch (e) {
      fail(e, SAY.fail.folderCreate);
      return null;
    }
  };

  const onSubmitFolder = async (target: FolderTarget, name: string): Promise<boolean> => {
    if (target.kind === "new") {
      const made = await makeFolder(name);
      if (made) folderForm.set(null);
      return !!made;
    }
    try {
      await renameFolder(target.folder.id, name);
      toast.show(SAY.folderRenamed);
      haptics.success();
      folderForm.set(null);
      return true;
    } catch (e) {
      fail(e, SAY.fail.folderRename);
      return false;
    }
  };

  const move = async (doc: Doc, folderId: number | null): Promise<boolean> => {
    // Already there: just close, no request or toast.
    if ((doc.folderId ?? null) === folderId) { moving.set(null); return true; }
    try {
      await moveDoc(doc.id, folderId);
      moving.set(null);
      const dest = folderId == null ? "Unfiled" : (folders.find(f => f.id === folderId)?.name ?? "folder");
      toast.show(SAY.moved(dest));
      haptics.success();
      return true;
    } catch (e) {
      fail(e, SAY.fail.move);
      return false;
    }
  };

  const createAndMove = async (doc: Doc, name: string): Promise<boolean> => {
    try {
      const created = await createFolder(name);
      // The move reads the folder name from the cache the create just filled.
      await moveDoc(doc.id, created.id);
      moving.set(null);
      toast.show(SAY.moved(created.name));
      haptics.success();
      return true;
    } catch (e) {
      fail(e, SAY.fail.folderCreate);
      return false;
    }
  };

  const onDelete = async (d: Doomed) => {
    try {
      if (d.kind === "doc") { await deleteDoc(d.doc.id); toast.show(SAY.deleted(d.doc.title)); }
      else { await deleteFolder(d.folder.id); toast.show(SAY.folderDeleted(d.folder.name)); }
      haptics.success();
    } catch (e) {
      fail(e, d.kind === "doc" ? SAY.fail.delete : SAY.fail.folderDelete);
    }
  };

  const onDocAction = async (doc: Doc, a: DocAction) => {
    if (a === "copy") {
      try { await Clipboard.setStringAsync(doc.url); toast.show(SAY.copied); }
      catch { toast.error(SAY.copyFailed); }
    } else if (a === "edit") form.set({ kind: "edit", doc });
    else if (a === "move") moving.set(doc);
    else if (a === "delete") doomed.set({ kind: "doc", doc });
    else if (a === "pin") {
      const on = doc.pinnedAt == null;
      try { await pinDoc(doc.id, on); toast.show(SAY.pinned(doc.title, on)); haptics.success(); }
      catch (e) { fail(e, SAY.fail.pinDoc); }
    } else if (a === "refresh") {
      try { await refreshDoc(doc.id); toast.show(SAY.refreshed); haptics.success(); }
      catch (e) { fail(e, SAY.fail.refresh); }
    }
  };

  const onFolderAction = async (folder: DocFolder, a: FolderAction) => {
    if (a === "rename") folderForm.set({ kind: "rename", folder });
    else if (a === "delete") doomed.set({ kind: "folder", folder });
    else {
      const on = folder.pinnedAt == null;
      try { await pinFolder(folder.id, on); toast.show(SAY.pinned(folder.name, on)); haptics.success(); }
      catch (e) { fail(e, SAY.fail.pinFolder); }
    }
  };

  const openMenu = useCallback((doc: Doc) => menu.set({ kind: "doc", doc }), [menu]);

  if (!allowed) return <Redirect href="/more" />;

  /* ── render ──────────────────────────────────────────────────────────────── */

  const section = (folder: DocFolder | null, i: number) => {
    const key = folder ? `f-${folder.id}` : "unfiled";
    const rows = byFolder.get(folder ? folder.id : null) ?? EMPTY;
    const none = sectionNone({ folderName: folder?.name ?? null, visible: rows.length, queryActive, canManage });
    return (
      <FolderSection key={key} folder={folder} name={folder ? folder.name : "Unfiled"} hue={folder ? folderHue(i) : null}
        count={folder ? fCounts.get(folder.id) ?? 0 : unfiled} open={queryActive || !collapsed[key]} canFold={!queryActive}
        onToggle={() => toggleSection(key)} onMenu={canManage && folder ? () => menu.set({ kind: "folder", folder }) : null}>
        {none ? <NoneLine text={none} /> : null}
        {rows.map((d, j) => <LedgerRow key={d.id} doc={d} first={j === 0} onMenu={openMenu} />)}
        {canManage && folder ? <GhostAdd name={folder.name} onPress={() => form.set({ kind: "add", folderId: folder.id })} /> : null}
      </FolderSection>
    );
  };

  return (
    <Screen title="Docs" back="More" onRefresh={refresh}>
      {docsQ.data ? <StaleNote updatedAt={docsQ.dataUpdatedAt} failed={docsQ.isError} onRetry={() => void refresh()} /> : null}

      <View>
        {dayOne ? (
          <PageBrief kicker="Docs" lead="Your links, " mark="all in one place"
            sub="Paste a link to anything the chapter uses. It turns into a card here that everyone can open." />
        ) : (
          <PageBrief kicker="Reference Library" lead="The chapter’s " mark="reading room" spark digest={digestLine(sorted, orgName, now)} />
        )}
        {hasDocs ? (
          <T v="meta" size={11.5} color={c.ink3} style={{ marginTop: 14 }}>
            <T v="mono" size={11.5} color={c.ink3}><B n={glance.total} />{` ${glance.total === 1 ? "reference" : "references"}  ·  `}<B n={glance.kinds} />{` ${glance.kinds === 1 ? "kind" : "kinds"}  ·  `}<B n={glance.contributors} />{` ${glance.contributors === 1 ? "contributor" : "contributors"}  ·  `}{glance.newest === "Today" ? <>newest <B s="today" /></> : <>newest <B s={glance.newest} /> ago</>}</T>
          </T>
        ) : null}
      </View>

      {canManage || !dayOne ? (
        <View style={styles.actions}>
          {canManage ? <TrBtn label="Add doc" icon="plus" onPress={() => form.set({ kind: "add", folderId: null })} /> : null}
          {canManage && !dayOne ? <TrBtn kind="card" tone="peach" label="New folder" icon="folder" onPress={() => folderForm.set({ kind: "new" })} /> : null}
          {!dayOne ? <TrBtn kind="ask" label="Ask where a doc lives" icon="spark" kbd="⌘K" hint="Opens Ask Chapt"
            onPress={() => router.push({ pathname: "/ask", params: { q: "Where do we keep " } })} /> : null}
        </View>
      ) : null}

      {hasDocs ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          <View style={[styles.search, { borderColor: c.line2, backgroundColor: c.card }]}>
            <Icon name="search" size={15} color={c.ink3} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search the library…" placeholderTextColor={c.ink3} autoCorrect={false}
              autoCapitalize="none" returnKeyType="search" accessibilityLabel="Search docs" style={[styles.searchInput, { color: c.ink }]} />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear search" style={({ pressed }) => pressed && pressedDim}>
                <Icon name="x" size={14} color={c.ink3} />
              </Pressable>
            ) : <View style={[styles.kbd, { borderColor: c.line2, backgroundColor: c.paper2 }]}><T v="mono" size={10.5} color={c.ink3}>/</T></View>}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={[styles.seg, { borderColor: c.line, backgroundColor: c.paper2 }]} accessibilityRole="tablist" accessibilityLabel="Filter by kind">
              {FILTERS.map(f => {
                const on = filter === f.id;
                return (
                  <Pressable key={f.id} onPress={() => { if (!on) { haptics.select(); setFilter(f.id); } }} accessibilityRole="tab" accessibilityState={{ selected: on }}
                    style={[styles.segBtn, on && { backgroundColor: c.card, borderColor: c.ink }]}>
                    <T v="buttonSm" size={13} color={on ? c.ink : c.ink3}>{f.label}</T>
                    <T v="mono" size={10.5} color={on ? c.ink2 : c.ink3}>{String(counts[f.id])}</T>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.sortRow}>
            <T v="buttonSm" size={12.5} color={c.ink3}>Sort</T>
            <Pressable onPress={() => menu.set({ kind: "sort" })} accessibilityRole="button" accessibilityLabel={`Sort docs: ${SORTS.find(s => s.id === sort)?.label}`}
              style={({ pressed }) => [[styles.sortPill, { borderColor: c.line, backgroundColor: c.paper2 }], pressed && pressedDim]}>
              <T v="buttonSm" size={13}>{SORTS.find(s => s.id === sort)?.label ?? ""}</T>
              <Icon name="updown" size={12} color={c.ink2} />
            </Pressable>
            <View style={{ flex: 1 }} />
            <T v="mono" size={11.5} color={c.ink3}>{`${filtered.length} of ${unpinned.length}`}</T>
          </View>
        </View>
      ) : null}

      {loading ? <SkeletonCard height={180} /> : null}
      {loadError ? <ErrorState title="Couldn't load the library" error={SAY.fail.load} onRetry={() => void refresh()} /> : null}

      {dayOne ? <DocsDayOne canManage={canManage} onAdd={() => form.set({ kind: "add", folderId: null })} /> : null}

      {!loading && !loadError && nothingMatches ? (
        <View style={[styles.empty, { borderColor: c.line2 }]}>
          <View style={[styles.emptyIc, { backgroundColor: c.note.fill.butter, borderColor: c.note.ink }]}><Icon name="search" size={20} color={c.note.ink} /></View>
          <T v="title" size={24} ls={-0.03} align="center">Nothing matches</T>
          <T v="body" size={14.5} color={c.ink2} align="center">Try a different search or filter.</T>
          <Pressable onPress={() => { setQuery(""); setFilter("all"); }} accessibilityRole="button"
            style={({ pressed }) => [[styles.clear, { borderColor: c.line2 }], pressed && pressedDim]}>
            <T v="buttonSm" size={13}>Clear filters</T>
          </Pressable>
        </View>
      ) : null}

      {!loading && !loadError && !nothingMatches && pinned.length ? (
        <View>
          <View style={styles.shelfLabel}>
            <View style={{ transform: [{ rotate: "-12deg" }] }}><Icon name="tack" size={18} color={c.pastel.rose.ink} /></View>
            <T v="title" size={23} ls={-0.03}>Pinned</T>
            <View style={[styles.dash, { borderTopColor: c.line2 }]} />
            <T v="mono" size={11.5} color={c.ink3}>{`${pinned.length} · stays put while you filter`}</T>
          </View>
          <View style={{ gap: 22, marginTop: 22 }}>
            {pinned.map((d, i) => <PinnedCard key={d.id} doc={d} index={i} onMenu={openMenu} />)}
          </View>
        </View>
      ) : null}

      {!loading && !loadError && !nothingMatches ? (
        <View style={{ marginTop: -14 }}>
          {sections.map((f, i) => section(f, i))}
          {unfiled > 0 ? section(null, 0) : null}
        </View>
      ) : null}

      <SlotView slot={menu}>{(m, close) => (
        <ActionSheet<string> open={!!m} onClose={close}
          title={m?.kind === "doc" ? "Doc actions" : m?.kind === "folder" ? "Folder actions" : "Sort"}
          items={!m ? [] : m.kind === "doc" ? docMenu(m.doc.pinnedAt != null, canManage) : m.kind === "folder" ? folderMenu(m.folder.pinnedAt != null)
            : SORTS.map(s => ({ id: s.id, label: s.id === sort ? `${s.label}  ✓` : s.label }))}
          onPick={a => {
            if (!m) return;
            if (m.kind === "doc") void onDocAction(m.doc, a as DocAction);
            else if (m.kind === "folder") void onFolderAction(m.folder, a as FolderAction);
            else if (isSortId(a) && a !== sort) { haptics.select(); changeSort(a); }
          }} />
      )}</SlotView>

      {canManage ? <>
        <SlotView slot={form}>{(t, close) => (
          <DocSheet open={!!t} onClose={close} mode={t?.kind === "edit" ? "edit" : "add"}
            initial={t?.kind === "edit" ? { title: t.doc.title, url: t.doc.url, description: t.doc.description ?? "" } : EMPTY_DRAFT}
            startFolder={t?.kind === "add" ? t.folderId : null} folders={sections} totals={totals}
            onSubmit={(d, folderId) => (t ? onSubmitDoc(t, d, folderId) : Promise.resolve(false))} onCreateFolder={makeFolder} />
        )}</SlotView>
        <SlotView slot={folderForm}>{(t, close) => (
          <FolderSheet open={!!t} onClose={close} mode={t?.kind === "rename" ? "rename" : "new"} initial={t?.kind === "rename" ? t.folder.name : ""}
            onSubmit={name => (t ? onSubmitFolder(t, name) : Promise.resolve(false))} />
        )}</SlotView>
        <SlotView slot={moving}>{(d, close) => (
          <MoveSheet open={!!d} onClose={close} title={d?.title ?? ""} folders={folders} current={d?.folderId ?? null}
            onMove={id => { if (d) void move(d, id); }} onCreateAndMove={name => (d ? createAndMove(d, name) : Promise.resolve(false))} />
        )}</SlotView>
        <SlotView slot={doomed}>{(d, close) => (
          <ConfirmSheet open={!!d} onClose={close}
            title={d?.kind === "folder" ? "Delete this folder?" : "Delete this doc?"}
            message={!d ? "" : d.kind === "folder" ? folderDeleteMessage(d.folder.name, totals.get(d.folder.id) ?? 0) : docDeleteMessage(d.doc.title)}
            confirmLabel={d?.kind === "folder" ? "Delete folder" : "Delete"}
            onConfirm={() => { if (d) void onDelete(d); }} />
        )}</SlotView>
      </> : null}
    </Screen>
  );
}

/** The meta line's bold figure. */
function B({ n, s }: { n?: number; s?: string }) {
  const { c } = useTheme();
  return <T v="mono" size={11.5} color={c.ink} style={{ fontWeight: "600" }}>{s ?? String(n)}</T>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  search: { flexDirection: "row", alignItems: "center", gap: 9, paddingLeft: 13, paddingRight: 8, borderRadius: 999, borderWidth: 1.5, height: 42 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  kbd: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  seg: { flexDirection: "row", borderWidth: 1.5, borderRadius: 999, padding: 3 },
  segBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11, borderWidth: 1.5, borderColor: "transparent" },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sortPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  empty: { alignItems: "center", gap: 8, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 30, paddingTop: 34, paddingHorizontal: 30, paddingBottom: 30, marginTop: 10 },
  emptyIc: { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }], marginBottom: 6 },
  clear: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 13, marginTop: 6 },
  shelfLabel: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  dash: { flex: 1, minWidth: 12, borderTopWidth: 1.5, borderStyle: "dashed" },
});
