/**
 * More → Docs (read; mock `#docs`): search first, then the pinned shelf (taped index
 * cards in a horizontal row that snaps card by card), then the folders as manila folders
 * that open in place (the contents fade in and everything below glides down: a 320ms
 * layout transition), then everything not in a folder. Tapping a doc opens its link in
 * the in-app browser. Members can't add or move docs, so there are no edit controls.
 *
 * Reads GET /api/docs and /api/docs/folders.
 */
import type { Doc, DocFolder } from "@/lib/api-types";
import * as WebBrowser from "expo-web-browser";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { useDocFolders, useDocs } from "~/data/more";
import { Icon } from "~/icons/Icon";
import { EASE } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { Tape } from "~/paper/bits";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

const host = (url: string) => url.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0] ?? url;

function openDoc(d: Doc) {
  haptics.tap();
  if (!/^https?:\/\//i.test(d.url)) { toast.error("Can't open that link", { detail: "It isn't a web address." }); return; }
  void WebBrowser.openBrowserAsync(d.url).catch(() => toast.error("Couldn't open that link"));
}

export default function DocsPage() {
  const { c } = useTheme();
  const m = useMotion();
  const docs = useDocs();
  const folders = useDocFolders();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const refresh = () => Promise.all([docs.refetch(), folders.refetch()]);

  const all = docs.data;
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!all || !s) return null;
    return all.filter(d => [d.title, d.description ?? "", d.url, d.createdByName ?? ""].some(x => x.toLowerCase().includes(s)));
  }, [all, q]);
  const pinned = (all ?? []).filter(d => d.pinnedAt).sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""));
  const loose = (all ?? []).filter(d => d.folderId == null && !d.pinnedAt);
  const inFolder = (f: DocFolder) => (all ?? []).filter(d => d.folderId === f.id);
  const layout = m.reduced ? undefined : LinearTransition.duration(m.t(320)).easing(EASE.spring).reduceMotion(ReduceMotion.Never);

  return (
    <Screen title="Docs" back="More" onRefresh={refresh}>
      {all ? <StaleNote updatedAt={docs.dataUpdatedAt} failed={docs.isError} onRetry={() => void refresh()} /> : null}
      {!all ? (docs.isError ? <ErrorState title="Couldn't load the docs." error={docs.error} onRetry={() => void refresh()} /> : <SkeletonCard height={180} />)
        : !all.length ? (
          <EmptyState pictures={[{ icon: "folder", tone: "butter", label: "Folders" }, { icon: "pin", tone: "rose", label: "Pinned up top" }, { icon: "link", tone: "sky", label: "One tap to open" }]}
            title="No docs yet." line="Bylaws, the officer sheet, the rush schedule. When an officer adds a link, it lands here." />
        ) : (
          <>
            <View style={[styles.search, { borderColor: c.line2, backgroundColor: c.card }]}>
              <Icon name="search" size={16} color={c.ink3} />
              <TextInput value={q} onChangeText={setQ} placeholder={`Search ${all.length} docs`} placeholderTextColor={c.ink3} autoCorrect={false}
                returnKeyType="search" accessibilityLabel="Search docs" style={[styles.searchInput, { color: c.ink }]} />
              {q ? <Pressable onPress={() => setQ("")} hitSlop={10} accessibilityLabel="Clear search"><Icon name="x" size={15} color={c.ink3} /></Pressable> : null}
            </View>

            {hits ? (
              hits.length ? <DocList docs={hits} folders={folders.data} /> : <T v="callout" color={c.ink2} style={{ textAlign: "center", paddingVertical: 20 }}>Nothing matches “{q.trim()}”.</T>
            ) : (
              <>
                {pinned.length ? (
                  <View style={{ gap: 10 }}>
                    <T v="label" color={c.ink3} accessibilityRole="header">Pinned</T>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={CARD_W + 12} decelerationRate="fast"
                      contentContainerStyle={{ gap: 12, paddingVertical: 12, paddingRight: 18 }} style={{ marginHorizontal: -18 }} contentInset={{ left: 18 }}
                      contentOffset={{ x: -18, y: 0 }}>
                      {pinned.map((d, i) => <PinnedCard key={d.id} d={d} i={i} />)}
                    </ScrollView>
                  </View>
                ) : null}

                {(folders.data ?? []).length ? (
                  <View style={{ gap: 14 }}>
                    <T v="label" color={c.ink3} accessibilityRole="header">Folders</T>
                    {(folders.data ?? []).map((f, i) => {
                      const isOpen = open.has(f.id);
                      const inside = inFolder(f);
                      return (
                        <Animated.View key={f.id} layout={layout}>
                          <Pressable onPress={() => { haptics.select(); setOpen(s => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; }); }}
                            accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={`${f.name} folder, ${inside.length} docs`}>
                            <View style={[styles.tab, { marginLeft: `${[0, 30, 12][i % 3]}%`, backgroundColor: c.note.fill.butter, borderColor: c.ink }]}>
                              <T v="subhead" color={c.note.ink} numberOfLines={1} style={{ fontSize: 13.5 }}>{f.name}</T>
                            </View>
                            <View style={[styles.folder, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `3px 3px 0 ${c.note.fill.butter}` }]}>
                              <View style={styles.folderHead}>
                                <Icon name="folder" size={16} color={c.ink3} />
                                <T v="meta" color={c.ink3} style={{ flex: 1 }}>{inside.length} {inside.length === 1 ? "doc" : "docs"}</T>
                                <Icon name={isOpen ? "chev-u" : "chev-d"} size={15} color={c.ink3} />
                              </View>
                              {isOpen ? (
                                <Animated.View entering={FadeIn.duration(m.t(220)).reduceMotion(ReduceMotion.Never)} exiting={FadeOut.duration(m.t(140)).reduceMotion(ReduceMotion.Never)}>
                                  {inside.length ? <DocList docs={inside} bare /> : <T v="meta" color={c.ink3} style={{ paddingBottom: 12 }}>Nothing filed here yet.</T>}
                                </Animated.View>
                              ) : null}
                            </View>
                          </Pressable>
                        </Animated.View>
                      );
                    })}
                  </View>
                ) : null}

                {loose.length ? (
                  <Animated.View layout={layout} style={{ gap: 10 }}>
                    <T v="label" color={c.ink3} accessibilityRole="header">Everything else</T>
                    <DocList docs={loose} />
                  </Animated.View>
                ) : null}
              </>
            )}
          </>
        )}
    </Screen>
  );
}

const CARD_W = 168;

function PinnedCard({ d, i }: { d: Doc; i: number }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => openDoc(d)} accessibilityRole="link" accessibilityLabel={`${d.title}, pinned. Opens ${host(d.url)}`}
      style={({ pressed }) => [styles.pinned, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `3px 3px 0 ${c.pastel[(["rose", "sky", "mint"] as const)[i % 3]!].fill}`,
        transform: [{ rotate: `${[-1.5, 1, -0.5][i % 3]}deg` }, { scale: pressed ? 0.97 : 1 }] }]}>
      <Tape width={40} rotate={[-6, 4, -2][i % 3]} style={{ position: "absolute", top: -9, alignSelf: "center" }} />
      <T v="subhead" numberOfLines={3}>{d.title}</T>
      {d.description ? <T v="meta" color={c.ink3} numberOfLines={2}>{d.description}</T> : null}
      <View style={{ flex: 1 }} />
      <T v="mono" color={c.ink3} numberOfLines={1} style={{ fontSize: 10 }}>{host(d.url)}</T>
    </Pressable>
  );
}

function DocList({ docs, folders, bare }: { docs: Doc[]; folders?: DocFolder[]; bare?: boolean }) {
  const { c } = useTheme();
  const folderName = (id: number | null) => (id == null ? null : folders?.find(f => f.id === id)?.name ?? null);
  return (
    <View style={bare ? undefined : [styles.list, { borderColor: c.line, backgroundColor: c.card }]}>
      {docs.map((d, i) => {
        const f = folderName(d.folderId);
        return (
          <Pressable key={d.id} onPress={() => openDoc(d)} accessibilityRole="link" accessibilityLabel={`${d.title}. Opens ${host(d.url)}`}
            style={({ pressed }) => [styles.row, i > 0 && { borderTopColor: c.line, borderTopWidth: 1 }, { opacity: pressed ? 0.6 : 1 }]}>
            <Icon name="doc" size={16} color={c.pastel.sky.ink} />
            <View style={{ flex: 1 }}>
              <T v="callout" numberOfLines={1}>{d.title}</T>
              <T v="meta" color={c.ink3} numberOfLines={1}>{[f, host(d.url), d.createdByName].filter(Boolean).join(" · ")}</T>
            </View>
            <Icon name="out" size={14} color={c.ink3} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, height: 46 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  pinned: { width: CARD_W, minHeight: 150, gap: 6, padding: 14, paddingTop: 16, borderWidth: 1.5, borderRadius: 6, borderTopRightRadius: 12 },
  tab: { alignSelf: "flex-start", maxWidth: "60%", paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4, borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: -1.5, zIndex: 1 },
  folder: { borderWidth: 1.5, borderRadius: 14, borderTopLeftRadius: 4, paddingHorizontal: 14 },
  folderHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  list: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
});
