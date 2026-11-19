/**
 * Members (U6): the register. Your own card first (a taped row; tap for your card, where
 * you change your photo and name), a search field, then everyone A to Z under letter
 * heads that stick under the bar. Search matches names, office titles, roles and custom
 * fields ("econ" finds the Economics majors). Tap anyone for their card (~/members/MemberCard).
 *
 * Reads GET /api/brothers (shared with Tasks and Timeline) and, on a card,
 * GET /api/brothers/[id]/profile. Standing shows only on your own card or for officers
 * who manage people; the register itself never shows anyone's numbers.
 *
 * Look: your card is a taped peach note on a lilac hard shadow; each letter's people sit on
 * one index card, ruled between rows.
 *
 * Motion:
 *   arrive   your card, the search and then each letter's card rise 10pt and fade in,
 *            40ms apart (capped at eight), DUR.move on the out curve. While searching,
 *            cards just fade (no rise, no stagger) so typing stays quiet. Reduced: fades
 *   press    your card sinks 1pt and its shadow tucks under; a person's row takes a
 *            faded paper tint (opacity only). Reduced: the same tint, no sink
 *
 * States: first load = skeleton rows; nothing loaded and an error = ErrorState; offline or a
 * failed refresh over last-known data = StaleNote; nobody but you = the day-one empty; no
 * search hits = a line saying so.
 */
import type { Brother } from "@/lib/api-types";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useRoster } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { DUR } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { Avatar, Tape } from "~/paper/bits";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonList, StaleNote } from "~/shell/states";
import { MemberCard } from "~/members/MemberCard";
import { groupByLetter, matches, titleOf, vocab } from "~/members/model";
import { navLabel } from "~/more/model";
import { useMotion, useTheme, type Motion } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export default function Members() {
  const entry = useEntryOf("ready");
  const roster = useRoster();
  const m = useMotion();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const list = roster.data;
  const groups = useMemo(() => groupByLetter((list ?? []).filter(b => matches(b, q))), [list, q]);

  if (!entry) return null;
  const me = entry.me;
  const mine = list?.find(b => b.id === me.id) ?? null;
  const open = openId != null ? list?.find(b => b.id === openId) ?? null : null;
  const openCard = (b: Brother) => { haptics.select(); setOpenId(b.id); };
  const heading = navLabel(me, "Brotherhood");
  const searching = q.trim().length > 0;
  let step = 0;
  const rise = (quiet = false) => arrive(m, quiet ? 0 : step++, quiet);

  const children: ReactNode[] = [];
  const sticky: number[] = [];
  if (list) {
    children.push(<StaleNote key="stale" updatedAt={roster.dataUpdatedAt} failed={roster.isError} onRetry={() => void roster.refetch()} />);
    if (mine) children.push(<Animated.View key="you" entering={rise()}><YourRow b={mine} avatar={me.avatarUrl ?? mine.avatarUrl ?? null} onPress={() => openCard(mine)} /></Animated.View>);
    if (list.length > 1) children.push(<Animated.View key="search" entering={rise()}><Search value={q} onChange={setQ} count={list.length} noun={heading.toLowerCase()} /></Animated.View>);
    if (list.length <= 1) {
      children.push(
        <EmptyState key="empty" compact
          pictures={[
            { icon: "people", tone: "lilac", label: "Everyone, A to Z" },
            { icon: "camera", tone: "peach", label: "Photos on the cards" },
            { icon: "envelope", tone: "sky", label: "Email in one tap" },
          ]}
          title="It's just you so far."
          line="When officers approve people's requests to join, they show up here." />,
      );
    } else if (!groups.length) {
      children.push(<NoMatch key="none" q={q} onClear={() => setQ("")} />);
    }
    for (const g of groups) {
      sticky.push(children.length);
      children.push(<LetterHead key={`h${g.letter}`} letter={g.letter} count={g.people.length} />);
      children.push(
        <Animated.View key={`g${g.letter}`} entering={rise(searching)}>
          <GroupCard>
            {g.people.map((b, i) => <PersonRow key={b.id} b={b} first={i === 0} you={b.id === me.id} onPress={() => openCard(b)} />)}
          </GroupCard>
        </Animated.View>,
      );
    }
  }

  const subtitle = list ? `${list.length} ${(list.length === 1 ? vocab(me, "Member") : heading).toLowerCase()}` : undefined;
  const body: ReactNode = list ? null
    : roster.isError ? <ErrorState title="Couldn't load the roster." error={roster.error} onRetry={() => void roster.refetch()} />
    : <SkeletonList count={7} />;

  return (
    <Screen title={heading} subtitle={subtitle} large org onRefresh={() => roster.refetch()} sticky={body ? undefined : sticky}>
      {body ?? children}
      <MemberCard member={open} me={me} roster={list ?? []} onClose={() => setOpenId(null)} />
    </Screen>
  );
}

const STAGGER = 40, STAGGER_MAX = 8;

/** The arrival: rise 10pt + fade, `i` steps of 40ms in; `quiet` = a short fade only. */
function arrive(m: Motion, i: number, quiet: boolean) {
  const still = m.reduced || quiet;
  const cfg = m.timing(still ? DUR.fade : DUR.move, "out");
  const delay = still ? 0 : m.t(Math.min(i, STAGGER_MAX) * STAGGER);
  const from = still ? 0 : 10;
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateY: from }] },
      animations: { opacity: withDelay(delay, withTiming(1, cfg)), transform: [{ translateY: withDelay(delay, withTiming(0, cfg)) }] },
    };
  };
}

function NoMatch({ q, onClear }: { q: string; onClear: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 6, paddingVertical: 24 }}>
      <T v="callout" color={c.ink2}>No one matches “{q.trim()}”.</T>
      <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button"><T v="meta" color={c.pastel.sky.ink} style={{ textDecorationLine: "underline" }}>Clear the search</T></Pressable>
    </View>
  );
}

function YourRow({ b, avatar, onPress }: { b: Brother; avatar: string | null; onPress: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const press = useSharedValue(0);
  const face = useAnimatedStyle(() => ({
    transform: [{ rotate: "-0.6deg" }, { translateX: m.reduced ? 0 : 2 * press.value }, { translateY: m.reduced ? 0 : 2 * press.value }],
    opacity: m.reduced ? 1 - 0.15 * press.value : 1,
  }));
  return (
    <View style={styles.youWrap}>
      <View style={[styles.you, styles.youShadow, { backgroundColor: c.note.fill.lilac, borderColor: c.ink }]} />
      <Animated.View style={face}>
        <Pressable onPress={onPress}
          onPressIn={() => { press.value = withTiming(1, m.timing(80, "out")); }}
          onPressOut={() => { press.value = withTiming(0, m.timing(m.reduced ? 120 : 240, "spring")); }}
          accessibilityRole="button" accessibilityLabel={`Your card. ${b.name}, ${titleOf(b)}`} accessibilityHint="Change your photo or your name"
          style={[styles.you, { backgroundColor: c.note.fill.peach, borderColor: c.ink }]}>
          <Tape width={46} rotate={5} style={{ position: "absolute", top: -9, right: 26 }} />
          <Avatar name={b.name} uri={avatar} tone="peach" px={46} ring={c.ink} />
          <View style={{ flex: 1, gap: 1 }}>
            <T v="kicker" color={c.pastel.peach.ink} style={{ fontSize: 10 }}>Your card</T>
            <T v="callout" numberOfLines={1} style={{ fontSize: 16.5 }}>{b.name}</T>
            <T v="meta" color={c.ink2} numberOfLines={1}>{titleOf(b)} · photo and name</T>
          </View>
          <Icon name="chev-r" size={16} color={c.ink2} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function Search({ value, onChange, count, noun }: { value: string; onChange: (s: string) => void; count: number; noun: string }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={[styles.search, { borderColor: focus ? c.ink : c.line2, backgroundColor: c.card }]}>
      <Icon name="search" size={16} color={focus ? c.ink2 : c.ink3} />
      <TextInput value={value} onChangeText={onChange} placeholder={`Search ${count} ${noun}`} placeholderTextColor={c.faint}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} selectionColor={c.ink}
        autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="never" accessibilityLabel={`Search ${noun}`}
        style={[styles.searchInput, { color: c.ink }]} />
      {value ? (
        <Pressable onPress={() => { haptics.select(); onChange(""); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search"
          style={[styles.clear, { backgroundColor: c.paper2 }]}>
          <Icon name="x" size={12} color={c.ink2} />
        </Pressable>
      ) : null}
    </View>
  );
}

function LetterHead({ letter, count }: { letter: string; count: number }) {
  const { c } = useTheme();
  return (
    <View style={[styles.head, { backgroundColor: c.paper }]} accessibilityRole="header" accessibilityLabel={`${letter === "#" ? "Other" : letter}, ${count}`}>
      <T v="heading" color={c.ink} style={{ minWidth: 22 }}>{letter}</T>
      <View style={[styles.headRule, { backgroundColor: c.line }]} />
      <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{count}</T>
    </View>
  );
}

/** One letter's people on an index card. */
function GroupCard({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <View style={[styles.group, { backgroundColor: c.card, borderColor: c.line }]}>{children}</View>;
}

function PersonRow({ b, first, you, onPress }: { b: Brother; first: boolean; you: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const press = useSharedValue(0);
  const tint = useAnimatedStyle(() => ({ opacity: press.value }));
  const roles = [...(b.roles ?? [])].sort((x, y) => y.rank - x.rank);
  return (
    <Pressable onPress={onPress}
      onPressIn={() => { press.value = withTiming(1, m.timing(70, "out")); }}
      onPressOut={() => { press.value = withTiming(0, m.timing(m.reduced ? 120 : 260, "out")); }}
      accessibilityRole="button" accessibilityLabel={`${b.name}${you ? ", you" : ""}. ${titleOf(b)}`}>
      <Animated.View pointerEvents="none" style={[styles.tint, { backgroundColor: c.paper2 }, tint]} />
      <View style={[styles.row, !first && { borderTopColor: c.lineSoft, borderTopWidth: 1 }]}>
        <Avatar name={b.name} uri={b.avatarUrl ?? null} size="md" px={38} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.nameLine}>
            <T v="callout" numberOfLines={1} style={{ flexShrink: 1 }}>{b.name}</T>
            {you ? <View style={[styles.youTag, { backgroundColor: c.note.fill.peach }]}><T v="label" color={c.pastel.peach.ink} style={{ fontSize: 9 }}>You</T></View> : null}
          </View>
          {roles.length ? (
            <View style={styles.tags}>
              {roles.slice(0, 2).map(r => (
                <View key={r.id} style={[styles.tag, { borderColor: r.color ?? c.ink2 }]}>
                  <View style={[styles.tagDot, { backgroundColor: r.color ?? c.ink2 }]} />
                  <T v="pill" color={c.ink2} style={{ fontSize: 11 }}>{r.name}</T>
                </View>
              ))}
              {roles.length > 2 ? <T v="meta" color={c.ink3} style={{ fontSize: 12 }}>+{roles.length - 2}</T> : null}
            </View>
          ) : <T v="meta" color={c.ink3} numberOfLines={1}>{titleOf(b)}</T>}
        </View>
        <Icon name="chev-r" size={14} color={c.ink3} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  youWrap: { marginTop: 8, marginRight: 3, marginBottom: 3 },
  you: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5 },
  youShadow: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, transform: [{ rotate: "-0.6deg" }, { translateX: 3 }, { translateY: 3 }] },
  search: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, height: 46 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  clear: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 8, paddingBottom: 6 },
  headRule: { flex: 1, height: 1.5 },
  group: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  tint: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, marginHorizontal: 12, minHeight: 60 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  youTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 },
  tags: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, borderWidth: 1.5 },
  tagDot: { width: 5, height: 5, borderRadius: 3 },
});
