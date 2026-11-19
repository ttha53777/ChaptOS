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
 * States: first load = skeleton rows; nothing loaded and an error = ErrorState; offline or a
 * failed refresh over last-known data = StaleNote; nobody but you = the day-one empty; no
 * search hits = a line saying so.
 */
import type { Brother } from "@/lib/api-types";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useRoster } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Avatar, Tape } from "~/paper/bits";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonList, StaleNote } from "~/shell/states";
import { MemberCard } from "~/members/MemberCard";
import { groupByLetter, matches, titleOf, vocab } from "~/members/model";
import { navLabel } from "~/more/model";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export default function Members() {
  const entry = useEntryOf("ready");
  const roster = useRoster();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const list = roster.data;
  const groups = useMemo(() => groupByLetter((list ?? []).filter(b => matches(b, q))), [list, q]);

  if (!entry) return null;
  const me = entry.me;
  const mine = list?.find(b => b.id === me.id) ?? null;
  const open = openId != null ? list?.find(b => b.id === openId) ?? null : null;
  const openCard = (b: Brother) => { haptics.select(); setOpenId(b.id); };

  const children: ReactNode[] = [];
  const sticky: number[] = [];
  if (list) {
    children.push(<StaleNote key="stale" updatedAt={roster.dataUpdatedAt} failed={roster.isError} onRetry={() => void roster.refetch()} />);
    if (mine) children.push(<YourRow key="you" b={mine} avatar={me.avatarUrl ?? mine.avatarUrl ?? null} onPress={() => openCard(mine)} />);
    if (list.length > 1) children.push(<Search key="search" value={q} onChange={setQ} count={list.length} />);
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
      children.push(<LetterHead key={`h${g.letter}`} letter={g.letter} />);
      children.push(
        <View key={`g${g.letter}`} style={{ gap: 0 }}>
          {g.people.map((b, i) => <PersonRow key={b.id} b={b} first={i === 0} you={b.id === me.id} onPress={() => openCard(b)} />)}
        </View>,
      );
    }
  }

  const heading = navLabel(me, "Brotherhood");
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

function NoMatch({ q, onClear }: { q: string; onClear: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 6, paddingVertical: 24 }}>
      <T v="callout" color={c.ink2}>No one matches “{q.trim()}”.</T>
      <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button"><T v="meta" color={c.pastel.sky.ink}>Clear the search</T></Pressable>
    </View>
  );
}

function YourRow({ b, avatar, onPress }: { b: Brother; avatar: string | null; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Your card. ${b.name}, ${titleOf(b)}`} accessibilityHint="Change your photo or your name"
      style={({ pressed }) => [styles.you, { backgroundColor: c.note.fill.peach, borderColor: c.ink, transform: [{ rotate: "-0.6deg" }, { scale: pressed ? 0.985 : 1 }] }]}>
      <Tape width={46} rotate={5} style={{ position: "absolute", top: -9, right: 26 }} />
      <Avatar name={b.name} uri={avatar} tone="peach" size="md" style={{ width: 46, height: 46, borderRadius: 23 }} />
      <View style={{ flex: 1, gap: 1 }}>
        <T v="kicker" color={c.pastel.peach.ink} style={{ fontSize: 10 }}>Your card</T>
        <T v="callout" numberOfLines={1} style={{ fontSize: 16.5 }}>{b.name}</T>
        <T v="meta" color={c.ink3} numberOfLines={1}>{titleOf(b)} · photo and name</T>
      </View>
      <Icon name="chev-r" size={16} color={c.ink3} />
    </Pressable>
  );
}

function Search({ value, onChange, count }: { value: string; onChange: (s: string) => void; count: number }) {
  const { c } = useTheme();
  return (
    <View style={[styles.search, { borderColor: c.line2, backgroundColor: c.card }]}>
      <Icon name="search" size={16} color={c.ink3} />
      <TextInput value={value} onChangeText={onChange} placeholder={`Search ${count} members`} placeholderTextColor={c.ink3}
        autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="never" accessibilityLabel="Search members"
        style={[styles.searchInput, { color: c.ink }]} />
      {value ? (
        <Pressable onPress={() => onChange("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
          <Icon name="x" size={15} color={c.ink3} />
        </Pressable>
      ) : null}
    </View>
  );
}

function LetterHead({ letter }: { letter: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.head, { backgroundColor: c.paper }]} accessibilityRole="header" accessibilityLabel={letter === "#" ? "Other" : letter}>
      <T v="heading" color={c.ink2} style={{ width: 24 }}>{letter}</T>
      <View style={[styles.headRule, { backgroundColor: c.line }]} />
    </View>
  );
}

function PersonRow({ b, first, you, onPress }: { b: Brother; first: boolean; you: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const roles = [...(b.roles ?? [])].sort((x, y) => y.rank - x.rank);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${b.name}${you ? ", you" : ""}. ${titleOf(b)}`}
      style={({ pressed }) => [styles.row, !first && { borderTopColor: c.line, borderTopWidth: 1 }, { opacity: pressed ? 0.6 : 1 }]}>
      <Avatar name={b.name} uri={b.avatarUrl ?? null} size="md" />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="callout" numberOfLines={1}>{b.name}{you ? <T v="meta" color={c.ink3}>  you</T> : null}</T>
        {roles.length ? (
          <View style={styles.tags}>
            {roles.slice(0, 2).map(r => (
              <View key={r.id} style={[styles.tag, { borderColor: r.color ?? c.ink2 }]}>
                <T v="pill" color={c.ink2} style={{ fontSize: 11 }}>{r.name}</T>
              </View>
            ))}
            {roles.length > 2 ? <T v="meta" color={c.ink3}>+{roles.length - 2}</T> : null}
          </View>
        ) : <T v="meta" color={c.ink3} numberOfLines={1}>{titleOf(b)}</T>}
      </View>
      <Icon name="chev-r" size={14} color={c.line2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  you: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, marginTop: 6 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, height: 46 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4, paddingBottom: 6 },
  headRule: { flex: 1, height: 1.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  tags: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
  tag: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, borderWidth: 1.5 },
});
