/**
 * Media (the web's content calendar, app/org/[slug]/media, as its phone renders it),
 * reached from More → Media. Top to bottom, as the web:
 *
 *   brief      the date chip, "Content calendar · @handle", "What’s going out.", the
 *              digest (✦ DIGEST once there are posts)
 *   actions    Add post (MANAGE_INSTAGRAM) · Ask what to post next (Ask Chapt, with the
 *              web's question waiting)
 *   measures   Queued · Overdue · This week · Cadence: a measure jumps to its lane (or
 *              says it's empty, in the web's words); Cadence opens this month
 *   tools      Search posts… · Lanes / Month
 *   lanes      Overdue · This week · Upcoming · Posted, as the web sorts them; a row
 *              opens Post detail (Mark posted, Edit, Delete for officers)
 *   month      one pill per post, quiet stretches hatched; a pill opens its post
 *   day one    three snapshots, "No posts on the calendar.", Plan the first post and
 *              the four ideas (officers), or the member line
 *
 * Every rule and word comes from lib/media/calendar (shared with the web page).
 * "Promoting" opens the Timeline's own event sheet on top.
 */
import type { InstagramPost } from "@/lib/api-types";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type ScrollViewInstance } from "react-native";
import { useCalendar, useEventTypes } from "~/data/calendar";
import { localDay } from "~/data/home";
import { useMedia } from "~/data/media";
import { useRoster } from "~/data/tasks";
import { Icon } from "~/icons/Icon";
import { LaneHead, MeasureTile, Month, PostRow, Snap } from "~/media/bits";
import {
  ASK_NEXT, digestParts, filterPosts, formatTone, IDEAS, instagramLane, kickerChip, LANE_TONE, lanePosts, LANES, metricTarget, metrics, SAY, type Lane, type Measure,
} from "~/media/model";
import { DeletePost, PostForm, PostSheet, useMediaBits, type PostSeed } from "~/media/sheets";
import { navLabel } from "~/more/model";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { Screen } from "~/shell/Screen";
import { ErrorState, SkeletonCard, SkeletonList } from "~/shell/states";
import { toast } from "~/shell/toast";
import { viewerOf } from "~/tasks/model";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { EventSheet as TimelineSheet } from "~/timeline/EventSheet";
import { TrBtn } from "~/treasury/bits";
import { PageBrief } from "~/ui/PageBrief";
import { T } from "~/ui/T";

type View_ = "lanes" | "month";

export default function Media() {
  const { c } = useTheme();
  const m = useMotion();
  const { me, today, officer } = useMediaBits();
  const q = useMedia();
  const cal = useCalendar();
  const types = useEventTypes();
  const scroll = useRef<ScrollViewInstance | null>(null);
  const [view, setView] = useState<View_>("lanes");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [find, setFind] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<{ post: InstagramPost | null; seed?: PostSeed } | null>(null);
  const [del, setDel] = useState<number | null>(null);
  const [tl, setTl] = useState<number | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const [jump, setJump] = useState<{ lane: Lane } | { post: number } | null>(null);
  useEffect(() => { if (fresh == null) return; const t = setTimeout(() => setFresh(null), 2600); return () => clearTimeout(t); }, [fresh]);

  // Where things sit in the scroll: the lanes block, each lane in it, each row in its lane.
  const at = useRef({ block: 0, lane: new Map<Lane, number>(), row: new Map<number, { lane: Lane; y: number }>() });
  useEffect(() => {
    if (!jump) return;
    const t = setTimeout(() => {
      const a = at.current;
      const y = "lane" in jump ? a.block + (a.lane.get(jump.lane) ?? 0)
        : (() => { const r = a.row.get(jump.post); return r ? a.block + (a.lane.get(r.lane) ?? 0) + r.y - 120 : null; })();
      if (y != null) scroll.current?.scrollTo({ y: Math.max(0, y - 70), animated: !m.reduced });
      setJump(null);
    }, 60);
    return () => clearTimeout(t);
  }, [jump, m.reduced]);

  const roster = useRoster(tl != null);
  const rosterMap = useMemo(() => new Map((roster.data ?? []).map(b => [b.id, b])), [roster.data]);
  const events = useMemo(() => cal.data ?? [], [cal.data]);
  const evTitle = useMemo(() => new Map(events.map(e => [e.id, e.title])), [events]);
  const all = q.data ?? null;
  const shown = useMemo(() => (all ? filterPosts(all, find) : []), [all, find]);
  const grouped = useMemo(() => LANES.map(lane => ({ lane, posts: lanePosts(shown, lane.id, today) })).filter(l => l.posts.length), [shown, today]);
  const tiles = useMemo(() => (all ? metrics(all, today) : []), [all, today]);
  const retryEvents = useCallback(() => void cal.refetch(), [cal]);

  if (!me) return null;
  const tlEvent = tl == null ? null : events.find(e => e.id === tl) ?? null;
  const byId = (id: number | null) => (id == null ? null : all?.find(p => p.id === id) ?? null);
  const handle = me.org?.instagramHandle ? me.org.instagramHandle.replace(/^@/, "") : null;
  const add = (seed?: PostSeed) => setForm({ post: null, seed });
  const loading = !all;

  const onMeasure = (x: Measure) => {
    if (!all) return;
    setFind("");
    const target = metricTarget(x.key, all, today);
    if (target.kind === "month") { setView("month"); setMonth(today.slice(0, 7)); return; }
    setView("lanes");
    if (target.kind === "lane") setJump({ lane: target.lane });
    else toast.show(target.say);
  };

  const d = all ? digestParts(all, today) : null;
  const brief = (
    <PageBrief pill={kickerChip(today)} kicker={`Content calendar${handle ? ` · @${handle}` : ""}`} kickerSep={false}
      lead="What’s " mark="going out." tail="" markTone="rose" spark
      digest={all?.length && d ? [...(d.bold ? [{ text: d.bold.join(""), bold: true }] : []), { text: d.rest.join("") }] : null}
      sub={loading ? "Loading your content calendar…" : !all.length && d ? d.rest.join("") : null} />
  );
  const actions = (
    <View style={styles.actions}>
      {officer ? <TrBtn label="Add post" icon="plus" onPress={() => add()} /> : null}
      <TrBtn kind="ask" block label="Ask what to post next" icon="spark" kbd="⌘K" hint="Opens Ask Chapt with the question ready to send"
        onPress={() => router.push({ pathname: "/ask", params: { q: ASK_NEXT } })} />
    </View>
  );

  let body: React.ReactNode;
  if (!all) {
    body = q.isError
      ? <ErrorState title={SAY.loadFail} error={q.error} onRetry={() => void q.refetch()} />
      : <><SkeletonCard height={120} /><SkeletonList count={5} /></>;
  } else if (!all.length) {
    body = <DayOne officer={officer} onAdd={add} />;
  } else {
    body = (
      <>
        <View style={styles.measures} accessibilityLabel="Calendar at a glance">
          {tiles.map(x => <MeasureTile key={x.key} m={x} onPress={() => onMeasure(x)} />)}
        </View>

        <View style={[styles.search, { borderColor: c.line2, backgroundColor: c.card }]}>
          <Icon name="search" size={16} color={c.ink3} />
          <TextInput value={find} onChangeText={setFind} placeholder="Search posts…" placeholderTextColor={c.ink3}
            autoCorrect={false} autoCapitalize="none" returnKeyType="search" accessibilityLabel="Search posts"
            style={[styles.searchInput, { color: c.ink }]} />
        </View>
        <ViewTabs value={view} onChange={setView} />

        {!shown.length ? (
          <NoMatch query={find} onClear={() => setFind("")} />
        ) : view === "month" ? (
          <Month posts={shown} events={events} today={today} month={month} onMonth={setMonth} onDay={list => { if (list[0]) setOpen(list[0].id); }} />
        ) : (
          <View style={{ gap: 26, marginTop: 6 }} onLayout={e => { at.current.block = e.nativeEvent.layout.y; }}>
            {grouped.map(l => (
              <View key={l.lane.id} style={{ gap: 10 }} onLayout={e => { at.current.lane.set(l.lane.id, e.nativeEvent.layout.y); }}>
                <LaneHead label={l.lane.label} note={l.lane.note} count={l.posts.length} tone={LANE_TONE[l.lane.id]} />
                {l.posts.map(p => (
                  <View key={p.id} onLayout={e => { at.current.row.set(p.id, { lane: l.lane.id, y: e.nativeEvent.layout.y }); }}>
                    <PostRow post={p} lane={l.lane.id} today={today} fresh={fresh === p.id}
                      event={p.calendarEventId != null ? evTitle.get(p.calendarEventId) ?? null : null} onPress={() => setOpen(p.id)} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </>
    );
  }

  return (
    <Screen title={navLabel(me, "Instagram")} back="More" scrollRef={scroll} onRefresh={() => Promise.all([q.refetch(), cal.refetch()])}>
      <View style={{ gap: 18 }}>
        {brief}
        {actions}
        {body}
        {cal.isError && open == null ? (
          <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">
            {"Linked events couldn't be loaded. "}
            <T v="meta" color={c.pastel.rose.ink} onPress={retryEvents} accessibilityRole="button" style={{ textDecorationLine: "underline" }}>Try again</T>
          </T>
        ) : null}
      </View>
      <PostSheet post={byId(open)} events={events} eventsError={cal.isError} onRetryEvents={retryEvents} onClose={() => setOpen(null)}
        onEdit={p => setForm({ post: p })} onDelete={p => { setOpen(null); setDel(p.id); }} onTimeline={setTl} />
      {officer ? (
        <>
          <PostForm open={!!form} post={form?.post ?? null} seed={form?.seed ?? null} events={events} eventsError={cal.isError} eventsLoading={cal.isLoading} onRetryEvents={retryEvents}
            onClose={() => setForm(null)}
            onSaved={p => {
              setFresh(p.id);
              if (form?.post) return;
              setFind("");
              if (view === "month") setMonth(p.dueDate.slice(0, 7)); else setJump({ post: p.id });
            }} />
          <DeletePost post={byId(del)} onClose={() => setDel(null)} onDeleted={() => setOpen(null)} />
        </>
      ) : null}
      <TimelineSheet event={tlEvent} task={null} types={types.data} viewer={viewerOf(me)} today={localDay()} roster={rosterMap} onClose={() => setTl(null)} />
    </Screen>
  );
}

/** Lanes | Month (the web's .igp-tabs). */
function ViewTabs({ value, onChange }: { value: View_; onChange: (v: View_) => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.tabs, { backgroundColor: c.paper2, borderColor: c.line }]} accessibilityRole="radiogroup" accessibilityLabel="Calendar view">
      {(["lanes", "month"] as const).map(v => {
        const on = value === v;
        return (
          <Pressable key={v} onPress={() => { if (!on) { haptics.select(); onChange(v); } }} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={[styles.tab, on && { backgroundColor: c.card, boxShadow: `0 1px 2px ${c.line2}` }]}>
            <Icon name={v === "lanes" ? "menu" : "cal"} size={14} color={on ? c.ink : c.ink3} />
            <T v="buttonSm" color={on ? c.ink : c.ink3}>{v === "lanes" ? "Lanes" : "Month"}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

function NoMatch({ query, onClear }: { query: string; onClear: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.nomatch, { borderColor: c.line2 }]}>
      <View style={[styles.nmArt, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}><Icon name="search" size={18} color={c.pastel.lilac.ink} /></View>
      <View style={{ flex: 1, gap: 4 }}>
        <T v="subhead" size={16}>{`No posts match “${query}”.`}</T>
        <T v="meta" color={c.ink3}>Search looks at titles and formats.</T>
        <View style={{ alignSelf: "flex-start", marginTop: 8 }}><TrBtn kind="ghost" small label="Clear search" onPress={onClear} /></View>
      </View>
    </View>
  );
}

function DayOne({ officer, onAdd }: { officer: boolean; onAdd: (seed?: PostSeed) => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: c.line2 }]}>
      <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Snap type="Story" developing size="md" style={{ transform: [{ rotate: "-6deg" }] }} />
        <Snap type="Carousel" size="md" />
        <Snap type="Reel" developing size="md" style={{ transform: [{ rotate: "6deg" }] }} />
      </View>
      <T v="title" size={23} align="center">No posts on the calendar.</T>
      <T v="body" color={c.ink2} align="center" style={{ lineHeight: 23 }}>Plan the chapter’s feed a few weeks out — each post gets a date and a format, and can promote an event so nobody forgets to hype it.</T>
      {officer ? (
        <>
          <Pressable onPress={() => onAdd()} accessibilityRole="button"
            style={({ pressed }) => [styles.first, { backgroundColor: c.ink }, !pressed && hard(c.pastel.lilac.fill, 3), pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
            <Icon name="plus" size={15} color={c.paper} />
            <T v="button" color={c.paper}>Plan the first post</T>
          </Pressable>
          <View style={[styles.ideas, { borderTopColor: c.line2 }]}>
            <T v="kicker" size={10.5} color={c.ink3} align="center">A first week of posts</T>
            {IDEAS.map(i => {
              const tone = formatTone(i.type) ?? "lilac";
              return (
                <Pressable key={i.title} onPress={() => onAdd({ title: i.title, type: i.type })} accessibilityRole="button"
                  style={({ pressed }) => [styles.idea, { backgroundColor: c.pastel[tone].soft, borderColor: c.pastel[tone].border }, pressed && pressedDim]}>
                  <View style={[styles.ideaDot, { backgroundColor: c.pastel[tone].ink }]} />
                  <T v="callout" color={c.ink}>{i.title}</T>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : <T v="body" color={c.ink2} align="center">Ask an officer to plan the first post.</T>}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 12, alignItems: "flex-start" },
  measures: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, minHeight: 46 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  tabs: { alignSelf: "flex-start", flexDirection: "row", gap: 2, padding: 3, borderRadius: 999, borderWidth: 1.5 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, minHeight: 34, borderRadius: 999 },
  nomatch: { flexDirection: "row", gap: 14, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 18, padding: 18 },
  nmArt: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 14, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 24, paddingVertical: 28, paddingHorizontal: 22 },
  art: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginBottom: 4 },
  first: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 999, minHeight: 46, marginTop: 6 },
  ideas: { alignSelf: "stretch", alignItems: "center", gap: 10, borderTopWidth: 1.5, borderStyle: "dashed", paddingTop: 18, marginTop: 4 },
  idea: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, minHeight: 34 },
  ideaDot: { width: 7, height: 7, borderRadius: 4 },
});
