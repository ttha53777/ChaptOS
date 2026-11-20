/**
 * Media (the web's content calendar, app/org/[slug]/media), reached from More → Media:
 *
 *   briefing   "What's going out.": the digest (what's overdue, what lands this week,
 *              when the last post went up); Ask what to post next (opens Ask Chapt with
 *              the web's question waiting in the composer)
 *   measures   Queued · Overdue · This week · Cadence. On the web a measure scrolls to
 *              its lane; on the phone it narrows the list to that lane (Queued = every
 *              open lane), and Cadence opens the month view
 *   find       search titles and formats; Lanes / Month
 *   lanes      Overdue · This week · Upcoming · Posted, each as the web sorts it; a row
 *              opens the post sheet (Mark posted, Edit, Delete for officers)
 *   month      posting days marked by format, quiet stretches of 5+ days hatched; a day
 *              opens its post (or a list when it has several)
 *   day one    no posts: three snapshots, Plan the first post + the web's four ideas
 *              (officers, MANAGE_INSTAGRAM)
 *
 * "Promoting" opens the Timeline's own event sheet on top.
 */
import type { InstagramPost } from "@/lib/api-types";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useCalendar, useEventTypes } from "~/data/calendar";
import { localDay } from "~/data/home";
import { useMedia } from "~/data/media";
import { useRoster } from "~/data/tasks";
import { Icon } from "~/icons/Icon";
import { LaneHead, MeasureTile, Month, PostRow } from "~/media/bits";
import { digest, IDEAS, lanes, mediaDate, measures, shortDay, type Lane, type Measure } from "~/media/model";
import { DayPosts, DeletePost, PostForm, PostSheet, useMediaBits, type PostSeed } from "~/media/sheets";
import { navLabel } from "~/more/model";
import { haptics } from "~/motion/haptics";
import { Highlighter } from "~/paper/stationery";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonCard, SkeletonList } from "~/shell/states";
import { viewerOf } from "~/tasks/model";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { EventSheet as TimelineSheet } from "~/timeline/EventSheet";
import { Segmented } from "~/ui/Segmented";
import { T } from "~/ui/T";
import { pressedDim } from "~/motion/press";

const ASK = "What should we post on Instagram next? Consider our upcoming events and content calendar.";
type Narrow = "open" | Lane | null;
const NARROW_LABEL: Record<Exclude<Narrow, null>, string> = { open: "Queued", overdue: "Overdue", week: "This week", upcoming: "Upcoming", posted: "Posted" };

export default function Media() {
  const { c } = useTheme();
  const m = useMotion();
  const { me, today, officer } = useMediaBits();
  const q = useMedia();
  const cal = useCalendar();
  const types = useEventTypes();
  const [view, setView] = useState<"lanes" | "month">("lanes");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [find, setFind] = useState("");
  const [narrow, setNarrow] = useState<Narrow>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<{ post: InstagramPost | null; seed?: PostSeed } | null>(null);
  const [del, setDel] = useState<number | null>(null);
  const [day, setDay] = useState<{ date: string; posts: InstagramPost[] } | null>(null);
  const [tl, setTl] = useState<number | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  useEffect(() => { if (fresh == null) return; const t = setTimeout(() => setFresh(null), 2400); return () => clearTimeout(t); }, [fresh]);

  const roster = useRoster(tl != null);
  const rosterMap = useMemo(() => new Map((roster.data ?? []).map(b => [b.id, b])), [roster.data]);
  const events = cal.data ?? [];
  const evTitle = useMemo(() => new Map(events.map(e => [e.id, e.title])), [events]);
  const tlEvent = tl == null ? null : events.find(e => e.id === tl) ?? null;

  if (!me) return null;
  const all = q.data ?? null;
  const byId = (id: number | null) => (id == null ? null : all?.find(p => p.id === id) ?? null);
  const handle = me.org?.instagramHandle ? `@${me.org.instagramHandle.replace(/^@/, "")}` : null;
  const add = (seed?: PostSeed) => setForm({ post: null, seed });

  const right = officer ? (
    <Pressable onPress={() => add()} accessibilityRole="button" accessibilityLabel="Add post" hitSlop={8}
      style={({ pressed }) => [styles.plus, { backgroundColor: c.ink, boxShadow: `${pressed ? 1 : 2}px ${pressed ? 1 : 2}px 0 ${c.note.fill.lilac}` }, pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
      <Icon name="plus" size={16} color={c.paper} />
    </Pressable>
  ) : null;

  const onMeasure = (x: Measure) => {
    haptics.select();
    if (x.key === "cadence") { setView("month"); setMonth(today.slice(0, 7)); setNarrow(null); return; }
    setView("lanes");
    const next: Narrow = x.key === "queued" ? "open" : x.key;
    setNarrow(n => (n === next ? null : next));
  };

  let body: React.ReactNode;
  if (!all) {
    body = q.isError
      ? <ErrorState title="Couldn't load the content calendar." error={q.error} onRetry={() => void q.refetch()} />
      : <><SkeletonCard height={120} /><SkeletonList count={5} /></>;
  } else if (!all.length) {
    body = (
      <>
        <Briefing handle={handle} today={today} text={digest(all, today)} />
        <EmptyState
          pictures={[{ icon: "camera", tone: "rose", label: "Plan a Story" }, { icon: "cal", tone: "lilac", label: "It lands in its lane" }, { icon: "check", tone: "mint", label: "Mark it posted" }]}
          title="No posts on the calendar."
          line={officer ? "Plan the first one and it lands in its lane by date, and on the month view." : "Ask an officer to plan the first post."}
          action={officer ? { label: "Plan the first post", icon: "plus", onPress: () => add() } : undefined} />
        {officer ? (
          <View style={{ gap: 8 }}>
            <T v="label" color={c.ink3}>Or start from an idea</T>
            <View style={styles.ideas}>
              {IDEAS.map(i => (
                <Pressable key={i.title} onPress={() => add({ title: i.title, type: i.type })} accessibilityRole="button" accessibilityLabel={`Plan ${i.title}, a ${i.type}`}
                  style={({ pressed }) => [styles.idea, { borderColor: pressed ? c.ink : c.line2, backgroundColor: c.card }]}>
                  <T v="callout" color={c.ink}>{i.title}</T>
                  <T v="meta" color={c.ink3}>{i.type}</T>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </>
    );
  } else {
    const needle = find.trim().toLowerCase();
    const shown = needle ? all.filter(p => p.title.toLowerCase().includes(needle) || p.type.toLowerCase().includes(needle)) : all;
    const grouped = lanes(shown, today).filter(l => narrow == null || (narrow === "open" ? l.lane.id !== "posted" : l.lane.id === narrow));
    const rise = (i: number) => (m.reduced ? FadeIn.duration(m.t(160)) : FadeInDown.delay(m.t(i * 50)).duration(m.t(260)).springify().damping(18)).reduceMotion(ReduceMotion.Never);
    body = (
      <>
        <Briefing handle={handle} today={today} text={digest(all, today)} />
        <View style={styles.measures}>
          {measures(all, today).map(x => <MeasureTile key={x.key} m={x} onPress={() => onMeasure(x)} />)}
        </View>

        <View style={[styles.search, { borderColor: c.line2, backgroundColor: c.card }]}>
          <Icon name="search" size={16} color={c.ink3} />
          <TextInput value={find} onChangeText={setFind} placeholder="Search posts and formats" placeholderTextColor={c.ink3}
            autoCorrect={false} autoCapitalize="none" returnKeyType="search" accessibilityLabel="Search posts"
            style={[styles.searchInput, { color: c.ink }]} />
          {find ? (
            <Pressable onPress={() => setFind("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <Icon name="x" size={15} color={c.ink3} />
            </Pressable>
          ) : null}
        </View>
        <Segmented label="View" value={view} onChange={v => setView(v)} options={[{ value: "lanes", label: "Lanes" }, { value: "month", label: "Month" }]} />

        {view === "month" ? (
          <Month posts={shown} events={events} today={today} month={month} onMonth={setMonth}
            onDay={(list, date) => (list.length === 1 ? setOpen(list[0]!.id) : setDay({ date, posts: list }))} />
        ) : (
          <View style={{ gap: 22 }}>
            {narrow ? (
              <Pressable onPress={() => setNarrow(null)} accessibilityRole="button" accessibilityLabel={`Showing ${NARROW_LABEL[narrow]} only. Show every lane`}
                style={({ pressed }) => [[styles.narrow, { borderColor: c.ink, backgroundColor: c.card }], pressed && pressedDim]}>
                <T v="callout" color={c.ink}>{`Showing ${NARROW_LABEL[narrow]}`}</T>
                <Icon name="x" size={13} color={c.ink2} />
              </Pressable>
            ) : null}
            {grouped.length ? grouped.map((l, i) => (
              <Animated.View key={l.lane.id} entering={rise(i)} style={{ gap: 10 }}>
                <LaneHead label={l.lane.label} note={l.lane.note} count={l.posts.length} tone={l.lane.tone} />
                {l.posts.map(p => (
                  <PostRow key={p.id} post={p} lane={l.lane.id} today={today} fresh={fresh === p.id}
                    event={p.calendarEventId != null ? evTitle.get(p.calendarEventId) ?? null : null} onPress={() => setOpen(p.id)} />
                ))}
              </Animated.View>
            )) : (
              <T v="body" color={c.ink3} align="center" style={{ paddingVertical: 24 }}>
                {needle ? `No posts match "${find.trim()}".` : narrow === "overdue" ? "Nothing overdue. All caught up." : narrow === "week" ? "Nothing due in the next 7 days." : "Nothing queued."}
              </T>
            )}
          </View>
        )}
      </>
    );
  }

  return (
    <Screen title={navLabel(me, "Instagram")} large back="More" right={right} onRefresh={() => Promise.all([q.refetch(), cal.refetch()])} subtitle={me.org?.activeTerm?.label}>
      {body}
      <PostSheet post={byId(open)} events={events} onClose={() => setOpen(null)}
        onEdit={p => setForm({ post: p })} onDelete={p => setDel(p.id)} onTimeline={setTl} />
      <DayPosts day={day} onClose={() => setDay(null)} onPick={p => { setDay(null); setOpen(p.id); }} />
      {officer ? (
        <>
          <PostForm open={!!form} post={form?.post ?? null} seed={form?.seed ?? null} events={events} onClose={() => setForm(null)}
            onSaved={p => { if (!form?.post) { setFresh(p.id); setNarrow(null); setFind(""); if (view === "month") setMonth(p.dueDate.slice(0, 7)); } }} />
          <DeletePost post={byId(del)} onClose={() => setDel(null)} onDeleted={() => setOpen(null)} />
        </>
      ) : null}
      <TimelineSheet event={tlEvent} task={null} types={types.data} viewer={viewerOf(me)} today={localDay()} roster={rosterMap} onClose={() => setTl(null)} />
    </Screen>
  );
}

function Briefing({ handle, today, text }: { handle: string | null; today: string; text: { bold: string | null; rest: string } }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <T v="kicker" color={c.ink3}>{[`${shortDay(today)} ${mediaDate(today)}`, "Content calendar", handle].filter(Boolean).join(" · ")}</T>
      <View style={styles.h1}>
        <T v="title">What's </T>
        <Highlighter tone="lilac"><T v="title">going out</T></Highlighter>
        <T v="title">.</T>
      </View>
      <T v="body" color={c.ink2} style={{ lineHeight: 23 }}>
        {text.bold ? <T v="body" color={c.ink} style={{ fontWeight: "700" }}>{text.bold}</T> : null}{text.rest}
      </T>
      <Pressable onPress={() => router.push({ pathname: "/ask", params: { q: ASK } })} accessibilityRole="button" accessibilityHint="Opens Ask Chapt with the question ready to send"
        style={({ pressed }) => [styles.ask, { borderColor: pressed ? c.pastel.lilac.ink : c.line2, backgroundColor: pressed ? c.pastel.lilac.soft : "transparent" }]}>
        <Icon name="spark" size={14} color={c.pastel.lilac.ink} />
        <T v="callout" color={c.ink2}>Ask what to post next</T>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  plus: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  h1: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap" },
  ask: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 999, paddingHorizontal: 14, minHeight: 40 },
  measures: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, minHeight: 44 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  narrow: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, minHeight: 36 },
  ideas: { gap: 8 },
  idea: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, paddingHorizontal: 14, minHeight: 48 },
});
