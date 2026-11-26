/**
 * Settings → Identity (the web's sections/IdentitySection.tsx at phone width), every
 * word and rule from the shared @/lib/settings/identity:
 *
 *   badge      the mark (logo or initials), org type, name, the web address, the
 *              Instagram fact, members, the term, and "The name and web address…"
 *   1 icon     tap to choose (square crop, shrunk to 512px), Remove, the three "Shows up
 *              in" scenes (sidebar header, sign-in card, chapter switcher)
 *   2 Instagram  (MANAGE_SETTINGS and the Media page on) the @ field, its help line,
 *              the "On your Media page" preview
 *   3 words    People / Pages / Time: each key's from → your word field, undo, the
 *              suggestions, and where it shows
 *   also       Add IG task (Media on) · Add task (Tasks on) · ↻ Refresh data
 *   save bar   one bar for everything: "N changes · …", Discard, Save changes
 *
 * Without MANAGE_SETTINGS it's read-only (the lock note; no picker, no Instagram step,
 * no shortcuts). The web's Log revenue and Print shortcuts aren't here: printing isn't a
 * phone action, and Log revenue is the desktop's party quick-add (Parties has the form).
 * Danger zone (org admins) closes the page, as on the web (./DangerZone).
 *
 * Save: the icon first (POST/DELETE /api/orgs/logo); a refusal stops there and shows
 * under the icon. Then handle + words in one PATCH /api/orgs/config, then /me.
 */
import { orgInitials } from "@/lib/org-initials";
import { getOrgType } from "@/lib/org-types";
import {
  HANDLE_MAX, IDENTITY_COPY as C, PICKS, WHERE, WORD_GROUPS, WORD_MAX, changeCount, changedWordsOf, changesOf, cleanHandle,
  handleOk, liveWordsOf, savedOrDraftHandle,
} from "@/lib/settings/identity";
import { DEFAULT_LABELS, type VocabKey, type VocabOverrides } from "@/lib/vocab-keys";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { isApiError } from "~/api/errors";
import { useCalendar } from "~/data/calendar";
import { shrinkPhoto } from "~/data/members";
import { refreshIdentity, saveLogo, saveOrgConfig } from "~/data/settings";
import { useRoster } from "~/data/tasks";
import { DangerZone } from "./DangerZone";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { PostForm } from "~/media/sheets";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { navVisible, plural } from "~/more/model";
import { toast } from "~/shell/toast";
import { TaskForm } from "~/tasks/TaskForm";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { GroupHead, PillBtn, Step } from "./bits";
import { useDirtyGuard } from "./dirty";
import { useFloating } from "./frame";
import { can, siteHost } from "./model";

type LogoDraft = { kind: "same" } | { kind: "new"; uri: string } | { kind: "removed" };

export function IdentitySection() {
  const { c } = useTheme();
  const m = useMotion();
  const me = useEntryOf("ready")?.me ?? null;
  const roster = useRoster();
  const org = me?.org ?? null;
  const canEdit = !!me && can(me, "MANAGE_SETTINGS");
  const orgName = org?.name ?? "Your chapter";
  const workflows = org?.enabledWorkflows ?? [];
  // Shortcuts INTO other pages respect the sidebar's workflow gating, and so does the
  // handle: it only exists for the Media page.
  const igEnabled = navVisible("Instagram", workflows);
  const tasksEnabled = navVisible("Tasks", workflows);
  const cal = useCalendar();

  const savedLogo = org?.logoUrl ?? null;
  const savedHandle = org?.instagramHandle ?? "";
  const savedWords = useMemo(() => (org?.vocabularyOverrides ?? {}) as VocabOverrides, [org?.vocabularyOverrides]);
  const savedKey = JSON.stringify([savedLogo, savedHandle, savedWords]);

  const [logo, setLogo] = useState<LogoDraft>({ kind: "same" });
  const [handle, setHandle] = useState(savedHandle);
  const [words, setWords] = useState<VocabOverrides>(() => ({ ...savedWords }));
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<"ig" | "task" | null>(null);

  // Re-seed the draft when the server copy changes (after a save, or another officer's edit).
  const lastSynced = useRef(savedKey);
  useEffect(() => {
    if (lastSynced.current === savedKey) return;
    lastSynced.current = savedKey;
    setHandle(savedHandle);
    setWords({ ...savedWords });
    setLogo({ kind: "same" });
  }, [savedKey, savedHandle, savedWords]);

  const shownLogo = logo.kind === "new" ? logo.uri : logo.kind === "removed" ? null : savedLogo;
  const draftHandle = cleanHandle(handle);
  const handleBad = !handleOk(draftHandle);
  const changedWords = changedWordsOf(words, savedWords);
  const handleChanged = canEdit && igEnabled && draftHandle !== savedHandle;
  const changes = changesOf({ logo: logo.kind, savedLogo: !!savedLogo, handleChanged, changedWords, words });
  const dirty = canEdit && changes.length > 0;
  useDirtyGuard("identity", dirty);

  const liveWords = useMemo(() => liveWordsOf(words), [words]);
  const memberWord = (n: number) => { const w = liveWords.Member ?? DEFAULT_LABELS.Member; return n === 1 ? w : plural(w); };

  /* ── icon ────────────────────────────────────────────────────────────────── */
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    if (asset.mimeType && !asset.mimeType.startsWith("image/")) { setLogoError(C.notImage); return; }
    try {
      // Square and 512px, so it's always well under the 2 MB the server takes.
      const uri = await shrinkPhoto(asset.uri);
      setLogoError(null);
      setLogo({ kind: "new", uri });
    } catch {
      setLogoError(C.notImage);
    }
  };
  const removeIcon = () => { setLogoError(null); setLogo(savedLogo ? { kind: "removed" } : { kind: "same" }); };

  /* ── save / discard ──────────────────────────────────────────────────────── */
  const discard = () => { setLogo({ kind: "same" }); setHandle(savedHandle); setWords({ ...savedWords }); setLogoError(null); };

  const save = async () => {
    if (saving || handleBad) return;
    setSaving(true);
    try {
      if (logo.kind !== "same") {
        try {
          await saveLogo(logo.kind === "new" ? { uri: logo.uri, name: "icon.jpg", type: "image/jpeg" } : null);
        } catch (e) {
          haptics.error();
          setLogoError(isApiError(e) && e.message ? e.message : C.iconFailed);
          return;
        }
      }
      const body: { instagramHandle?: string; vocabularyOverrides?: VocabOverrides } = {};
      if (handleChanged) body.instagramHandle = draftHandle;
      // Full replace: empty means "use the default", so it's omitted.
      if (changedWords.length > 0) body.vocabularyOverrides = liveWords;
      if (Object.keys(body).length > 0) await saveOrgConfig(body);
      await refreshIdentity().catch(() => undefined);
      setLogo({ kind: "same" });
      haptics.success();
      toast.show(C.saved);
    } catch (e) {
      haptics.error();
      toast.error(isApiError(e, 403) ? C.forbidden : C.failed);
    } finally {
      setSaving(false);
    }
  };

  const refresh = () => {
    refreshIdentity().then(() => toast.show(C.refreshed)).catch(() => toast.error(C.refreshFailed));
  };

  // One save bar for everything, floating over the page (the web's sticky .id-savebar).
  useFloating(canEdit ? (
    <SaveBar shown={dirty} count={changes.length} list={changes.join(", ")} saving={saving} disabled={handleBad} onDiscard={discard} onSave={() => void save()} m={m} />
  ) : null);

  if (!me || !org) return null;

  const initials = orgInitials(orgName);
  const mark = (size: number, thin = false) => (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.28, borderColor: c.ink, borderWidth: thin ? 1.5 : 2, backgroundColor: c.note.fill.lilac }]}>
      {shownLogo
        ? <Image source={{ uri: shownLogo }} style={{ width: size, height: size }} />
        : <T v="title" size={Math.max(9, size * 0.32)} color={c.note.ink}>{initials}</T>}
    </View>
  );
  const typeLabel = getOrgType(org.orgType)?.label ?? "Organization";
  const otherOrg = me.memberships.find(x => x.organizationId !== me.orgId) ?? null;
  const showIg = canEdit && igEnabled;
  const badgeHandle = savedOrDraftHandle(showIg, draftHandle, savedHandle);
  const n = { icon: 1, ig: 2, words: showIg ? 3 : 2 };
  const count = roster.data?.length ?? 0;

  return (
    <View style={{ gap: 26 }}>
      {!canEdit ? (
        <View style={[styles.roNote, { backgroundColor: c.paper2, borderColor: c.line2 }]}>
          <Icon name="lock" size={15} color={c.ink3} />
          <T v="meta" size={13} color={c.ink2} style={{ flex: 1 }}>{C.readOnly}</T>
        </View>
      ) : null}

      {/* the badge: drawn from the real fields, redraws as you edit */}
      <View style={[styles.badge, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `4px 4px 0 ${c.note.fill.lilac}` }]} accessibilityLabel="Your chapter">
        {mark(96)}
        <View style={{ gap: 8 }}>
          <View style={styles.typeRow}>
            <View style={[styles.typeDot, { backgroundColor: c.pastel.lilac.ink }]} />
            <T v="kicker" color={c.ink3}>{typeLabel}</T>
          </View>
          <T v="hero" size={30}>{orgName}</T>
          <View style={styles.facts}>
            <Fact icon="link" text={`${siteHost()}/org/${org.slug}`} mono />
            {igEnabled ? <Fact icon="camera" text={badgeHandle ? `@${badgeHandle}` : C.noInstagram} off={!badgeHandle} /> : null}
            <Fact icon="people" text={`${count} ${memberWord(count)}`} />
            {org.activeTerm ? <Fact icon="cal" text={org.activeTerm.label} /> : null}
          </View>
          <View style={styles.nameNote}>
            <Icon name="alert" size={13} color={c.ink3} />
            <T v="meta" size={12.5} color={c.ink3} style={{ flex: 1 }}>{C.nameNote}</T>
          </View>
        </View>
      </View>

      {/* 1 · icon */}
      <Step n={n.icon} tone="lilac" title={C.iconTitle} sub={C.iconSub}>
        <View style={{ gap: 14 }}>
          {canEdit ? (
            <>
              <Pressable onPress={() => void pick()} disabled={saving} accessibilityRole="button" accessibilityLabel="Upload a chapter icon"
                style={({ pressed }) => [styles.drop, { borderColor: c.line2, backgroundColor: c.paper2 }, pressed && pressedDim]}>
                {mark(104)}
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyStrong" size={14}>Tap to choose</T>
                  <T v="meta" size={12.5} color={c.ink3}>{C.iconHint[2]}</T>
                </View>
              </Pressable>
              {shownLogo ? <PillBtn label="Remove" kind="rose" onPress={removeIcon} disabled={saving} /> : null}
              {logoError ? <T v="meta" size={13} color={c.pastel.rose.ink} accessibilityRole="alert">{logoError}</T> : null}
            </>
          ) : (
            <View style={[styles.drop, { borderColor: c.line2, backgroundColor: c.paper2, borderStyle: "solid" }]}>{mark(104)}</View>
          )}
          <T v="kicker" color={c.ink3}>{C.showsUpIn}</T>
          <View style={styles.places}>
            <Place title={C.places[0].title} sub={C.places[0].sub}>
              <View style={[styles.sbHead, { borderColor: c.line2, backgroundColor: c.card }]}>
                {mark(22, true)}
                <T v="buttonSm" size={12} numberOfLines={1} style={{ flex: 1 }}>{orgName}</T>
                <Icon name="chev-d" size={11} color={c.ink3} />
              </View>
              <View style={[styles.ghost, { width: "70%", backgroundColor: c.line }]} />
              <View style={[styles.ghost, { width: "52%", backgroundColor: c.line }]} />
            </Place>
            <Place title={C.places[1].title} sub={C.places[1].sub}>
              <View style={{ alignItems: "center", gap: 6 }}>
                {mark(30, true)}
                <T v="buttonSm" size={11.5} align="center" numberOfLines={1}>{`Sign in to ${orgName}`}</T>
                <View style={[styles.gbtn, { backgroundColor: c.ink }]}><T v="pill" size={10} color={c.paper}>Continue with Google</T></View>
              </View>
            </Place>
            <Place title={C.places[2].title} sub={C.places[2].sub}>
              <View style={[styles.swRow, { backgroundColor: c.card, borderColor: c.line2 }]}>
                {mark(18, true)}
                <T v="buttonSm" size={11.5} numberOfLines={1} style={{ flex: 1 }}>{orgName}</T>
                <T v="pill" size={11}>✓</T>
              </View>
              <View style={[styles.swRow, { opacity: 0.55, borderColor: "transparent" }]}>
                <View style={[styles.mark, { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.paper2 }]}>
                  <T v="pill" size={8}>{otherOrg ? orgInitials(otherOrg.orgName) : "…"}</T>
                </View>
                <T v="meta" size={11.5} numberOfLines={1} style={{ flex: 1 }}>{otherOrg ? otherOrg.orgName : C.anotherChapter}</T>
              </View>
            </Place>
          </View>
        </View>
      </Step>

      {/* 2 · Instagram */}
      {showIg ? (
        <Step n={n.ig} tone="peach" title={C.igTitle} sub={C.igSub}>
          <View style={{ gap: 12 }}>
            <T v="bodyStrong" size={14}>{C.igLabel}</T>
            <View style={[styles.atField, { borderColor: handleBad ? c.pastel.rose.ink : c.line2, backgroundColor: c.card }]}>
              <T v="body" size={16} color={c.ink3}>@</T>
              <TextInput value={handle} onChangeText={v => setHandle(v.replace(/^@+/, ""))} maxLength={HANDLE_MAX} placeholder={C.igPlaceholder}
                placeholderTextColor={c.ink3} autoCapitalize="none" autoCorrect={false} editable={!saving} accessibilityLabel={C.igLabel}
                style={[styles.atInput, { color: c.ink }]} />
            </View>
            <T v="meta" size={13} color={handleBad ? c.pastel.rose.ink : c.ink3}>{handleBad ? C.igBad : C.igHelp}</T>
            <View style={[styles.igPrev, { backgroundColor: c.paper2, borderColor: c.line2 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <T v="kicker" color={c.ink3}>{C.igPreviewKicker}</T>
              <View style={styles.igHd}>
                <T v="title" size={21}>Media</T>
                {draftHandle && !handleBad ? (
                  <View style={[styles.igChip, { borderColor: c.line2, backgroundColor: c.card }]}>
                    <Icon name="camera" size={12} color={c.ink2} />
                    <T v="pill" size={12}>{`@${draftHandle}`}</T>
                  </View>
                ) : (
                  <View style={[styles.igChip, { borderColor: c.line2, borderStyle: "dashed" }]}><T v="pill" size={12} color={c.ink3}>{C.igHidden}</T></View>
                )}
              </View>
              <View style={styles.tiles}>
                {(["peach", null, "sky", null] as const).map((t, i) => (
                  <View key={i} style={[styles.tile, { backgroundColor: t ? c.pastel[t].soft : c.card, borderColor: c.line2 }]} />
                ))}
              </View>
            </View>
          </View>
        </Step>
      ) : null}

      {/* 3 · words */}
      <Step n={n.words} tone="butter" title={C.wordsTitle} sub={canEdit ? C.wordsSubEdit : C.wordsSubRead}>
        <View style={{ gap: 18 }}>
          {WORD_GROUPS.map(g => (
            <View key={g.label} style={{ gap: 10 }}>
              <GroupHead label={g.label} tone={g.tone} />
              {g.keys.map(k => (
                <WordTag key={k} k={k} value={words[k] ?? ""} canEdit={canEdit} saving={saving}
                  onChange={v => setWords(prev => ({ ...prev, [k]: v }))} />
              ))}
            </View>
          ))}
        </View>
      </Step>

      {canEdit ? (
        <View style={styles.also}>
          <T v="kicker" color={c.ink3}>{C.alsoKicker}</T>
          {igEnabled ? <PillBtn label="Add IG task" onPress={() => setForm("ig")} /> : null}
          {tasksEnabled ? <PillBtn label="Add task" onPress={() => setForm("task")} /> : null}
          <PillBtn label="↻ Refresh data" onPress={refresh} />
        </View>
      ) : null}

      {/* org admins only; renders nothing for everyone else */}
      <DangerZone memberCount={count} />

      {/* room for the floating save bar over the last rows */}
      {dirty ? <View style={{ height: 110 }} /> : null}

      {canEdit && igEnabled ? <PostForm open={form === "ig"} post={null} events={cal.data ?? []} onClose={() => setForm(null)} onSaved={() => setForm(null)} /> : null}
      {canEdit && tasksEnabled ? <TaskForm open={form === "task"} task={null} onClose={() => setForm(null)} onSaved={() => setForm(null)} /> : null}
    </View>
  );
}

function Fact({ icon, text, mono, off }: { icon: "link" | "camera" | "people" | "cal"; text: string; mono?: boolean; off?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.fact, { borderColor: c.line2, borderStyle: off ? "dashed" : "solid", backgroundColor: off ? "transparent" : c.paper2 }]}>
      <Icon name={icon} size={12} color={off ? c.ink3 : c.ink2} />
      <T v={mono ? "mono" : "pill"} size={12} color={off ? c.ink3 : c.ink2} numberOfLines={1}>{text}</T>
    </View>
  );
}

function Place({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.place, { borderColor: c.line2, backgroundColor: c.card }]}>
      <View style={[styles.scene, { backgroundColor: c.paper2, borderBottomColor: c.line2 }]}>{children}</View>
      <View style={{ padding: 10 }}>
        <T v="bodyStrong" size={13.5}>{title}</T>
        <T v="meta" size={12} color={c.ink3}>{sub}</T>
      </View>
    </View>
  );
}

function WordTag({ k, value, canEdit, saving, onChange }: { k: VocabKey; value: string; canEdit: boolean; saving: boolean; onChange: (v: string) => void }) {
  const { c } = useTheme();
  const v = value.trim();
  const changed = !!v && v !== DEFAULT_LABELS[k];
  return (
    <View style={[styles.tag, { backgroundColor: c.card, borderColor: changed ? c.ink : c.line2 }, changed && { boxShadow: `3px 3px 0 ${c.note.fill.butter}` }]}>
      <View style={styles.swap}>
        <T v="mono" size={12.5} color={c.ink3}>{DEFAULT_LABELS[k]}</T>
        <Icon name="arrow-r" size={13} color={c.ink3} />
        <TextInput value={value} onChangeText={onChange} placeholder={DEFAULT_LABELS[k]} placeholderTextColor={alpha(c.ink3, 0.7)} maxLength={WORD_MAX}
          editable={canEdit && !saving} accessibilityLabel={`Your word for ${DEFAULT_LABELS[k]}`}
          style={[styles.wordInput, { color: c.ink, borderBottomColor: c.line2 }]} />
        {canEdit ? (
          <Pressable onPress={() => onChange("")} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Use ${DEFAULT_LABELS[k]}`} style={({ pressed }) => pressed && pressedDim}>
            <Icon name="refresh" size={14} color={c.ink3} />
          </Pressable>
        ) : null}
      </View>
      {canEdit ? (
        <View style={styles.picks}>
          {PICKS[k].map(p => {
            const on = v === p;
            return (
              <Pressable key={p} onPress={() => { haptics.tap(); onChange(on ? "" : p); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={[styles.pick, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.note.fill.butter : c.paper2 }]}>
                <T v="buttonSm" size={12.5} color={on ? c.note.ink : c.ink2}>{p}</T>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {WHERE[k] ? (
        <View style={styles.where}>
          <Icon name="pin" size={12} color={c.ink3} />
          <T v="meta" size={12} color={c.ink3}>{WHERE[k]}</T>
        </View>
      ) : null}
    </View>
  );
}

function SaveBar({ shown, count, list, saving, disabled, onDiscard, onSave, m }: {
  shown: boolean; count: number; list: string; saving: boolean; disabled: boolean; onDiscard: () => void; onSave: () => void; m: ReturnType<typeof useMotion>;
}) {
  const { c } = useTheme();
  const up = useSharedValue(shown ? 1 : 0);
  useEffect(() => {
    up.value = m.reduced ? withTiming(shown ? 1 : 0, m.timing(160, "out")) : withSpring(shown ? 1 : 0, m.spring("settle"));
  }, [shown, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: up.value, transform: [{ translateY: (1 - up.value) * 24 }] }));
  return (
    <Animated.View style={[styles.saveBar, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `3px 3px 0 ${c.note.fill.butter}` }, style]}
      pointerEvents={shown ? "auto" : "none"} accessibilityElementsHidden={!shown} importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
      accessibilityLabel="Unsaved changes">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={[styles.pip, { backgroundColor: c.pastel.butter.ink }]} />
        <T v="meta" size={13} numberOfLines={2} style={{ flex: 1 }}>
          <T v="bodyStrong" size={13}>{changeCount(count)}</T>{` · ${list}`}
        </T>
      </View>
      <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
        <PillBtn label="Discard" onPress={onDiscard} disabled={saving} />
        <PillBtn label={saving ? "Saving…" : "Save changes"} kind="butter" onPress={onSave} disabled={saving || disabled} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  roNote: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, padding: 12 },
  badge: { borderWidth: 1.5, borderRadius: 22, padding: 18, gap: 16 },
  mark: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  typeDot: { width: 7, height: 7, borderRadius: 4 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fact: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, maxWidth: "100%" },
  nameNote: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  drop: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 20, padding: 14 },
  places: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  place: { width: "48%", flexGrow: 1, borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  scene: { padding: 14, gap: 8, minHeight: 104, justifyContent: "center", borderBottomWidth: 1.5 },
  sbHead: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, padding: 7 },
  ghost: { height: 6, borderRadius: 3 },
  gbtn: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  swRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8 },
  atField: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, height: 50 },
  atInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  igPrev: { borderWidth: 1.5, borderRadius: 18, padding: 16, gap: 10 },
  igHd: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  igChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, aspectRatio: 0.8, borderWidth: 1.5, borderRadius: 8 },
  tag: { borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 10 },
  swap: { flexDirection: "row", alignItems: "center", gap: 8 },
  wordInput: { flex: 1, fontSize: 17, paddingVertical: 4, borderBottomWidth: 1.5 },
  picks: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pick: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11 },
  where: { flexDirection: "row", alignItems: "center", gap: 6 },
  also: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  saveBar: { borderWidth: 1.5, borderRadius: 18, padding: 12, gap: 10, marginBottom: 8 },
  pip: { width: 8, height: 8, borderRadius: 4 },
});
