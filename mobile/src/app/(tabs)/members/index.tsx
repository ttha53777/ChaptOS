/**
 * Members: the web's member roster (app/org/[slug]/brothers/page.tsx) at phone width,
 * on the same rules (lib/dashboard/roster.ts, lib/dashboard/standing.ts).
 *
 *   brief         "<org> · <Member> Roster", "The <Members>.", and the summary sentence:
 *                 "13 members active. 7 at risk and 2 on watch — 3 owe $420 in dues and
 *                 8 sit below the 80% attendance line." Day one (≤ 1 member): the web's
 *                 "It's just you so far…" and How joining works
 *   actions       Export (the roster as CSV through the share sheet) and Ask who's
 *                 slipping (Ask Chapt, question ready)
 *   join band     MANAGE_BROTHERS: requests waiting, review/approve (role) and decline
 *   measures      the ledger tiles; a tile filters or sorts the roster and scrolls to it
 *   standing      band bar, legend chips, faces ringed by standing
 *   roster        band chips, search, rows (excuse clip for attendance officers, dues with
 *                 "Nd late", Pay for treasury, status tag), the foot
 *   card          a row or a face opens the Member card (~/members/MemberCard)
 *
 * The web shows every member the same roster numbers; only Pay (MANAGE_TREASURY), the excuse
 * clip (MANAGE_ATTENDANCE) and the join band (MANAGE_BROTHERS) are gated, and so they are here.
 *
 * Reads: GET /api/brothers, /api/dues (lateness), /api/excuses?status=pending (attendance
 * officers), /api/join-requests and /api/roles (MANAGE_BROTHERS).
 */
import type { Brother, JoinRequestRow } from "@/lib/api-types";
import { filterRoster, rosterCsv, rosterKpis, rosterSummary, standingHint, statusCounts, type StatusFilter } from "@/lib/dashboard/roster";
import { router } from "expo-router";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, type ScrollViewInstance, Share, StyleSheet, View, Pressable } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { usePendingExcuses } from "~/data/meetings";
import { useDuesBoard, useJoinRequests } from "~/data/members";
import { useRoles } from "~/data/programming";
import { useRoster } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { DeclineSheet, JoinBand, ReviewSheet } from "~/members/JoinRequests";
import { MemberCard } from "~/members/MemberCard";
import { measuredOf, trackedOf, vocab } from "~/members/model";
import { PayDues } from "~/members/PayDues";
import { HowJoining, Measures, RosterCard, StandingCard, type Focus } from "~/members/Roster";
import { navLabel, plural } from "~/more/model";
import { Screen } from "~/shell/Screen";
import { ErrorState, SkeletonList, StaleNote } from "~/shell/states";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { SlotView, useSlot } from "~/shell/slot";
import { PageBrief } from "~/ui/PageBrief";
import { T } from "~/ui/T";

const BROTHERS = 1 << 0, TREASURY = 1 << 1, ATTENDANCE = 1 << 6;
type SortKey = "attendance" | "gpa" | "serviceHours" | "duesOwed";
const SORT_LABEL: Record<SortKey, string> = { attendance: "attendance, lowest first", gpa: "GPA, lowest first", serviceHours: "hours, fewest first", duesOwed: "dues, most owed first" };

export default function Members() {
  const entry = useEntryOf("ready");
  const me = entry?.me ?? null;
  const has = (bit: number) => !!me && (me.isAdmin || (me.permissions & bit) !== 0);
  const canBrothers = has(BROTHERS), canTreasury = has(TREASURY), canAttendance = has(ATTENDANCE);

  const roster = useRoster();
  const dues = useDuesBoard(!!me);
  const joins = useJoinRequests(canBrothers);
  const roles = useRoles(canBrothers);
  const pending = usePendingExcuses(canAttendance);

  const { c } = useTheme();
  const m = useMotion();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const rosterY = useRef(0);
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [sort, setSort] = useState<SortKey | null>(null);
  const [q, setQ] = useState("");
  // Which member's card / pay sheet is up lives outside the screen's state: opening one
  // then re-renders only its slot, not the whole roster under the sheet sliding up.
  const cardSlot = useSlot<number>();
  const paySlot = useSlot<number>();
  const [review, setReview] = useState<JoinRequestRow | null>(null);
  const [decline, setDecline] = useState<JoinRequestRow | null>(null);

  const list = roster.data;
  const t = me?.org?.thresholds;
  const tracked = useMemo(() => trackedOf(me?.org?.disabledFeatures), [me?.org?.disabledFeatures]);
  const measured = useMemo(() => measuredOf(tracked, list ?? []), [tracked, list]);
  const nothingMeasured = !Object.values(measured).some(Boolean);
  const late = useMemo(() => {
    const byId = new Map((dues.data?.members ?? []).map(s => [s.brotherId, s]));
    return (id: number) => { const s = byId.get(id); return s?.standing === "overdue" ? s.lateDays : 0; };
  }, [dues.data]);
  const excuses = useMemo(() => {
    if (!pending.data) return null;
    const out: Record<number, number> = {};
    for (const e of pending.data) out[e.brotherId] = (out[e.brotherId] ?? 0) + 1;
    return out;
  }, [pending.data]);

  // Typing in the search re-filters off a deferred copy (the field stays responsive on a
  // long roster), and the counts and KPIs don't depend on it, so they aren't recomputed —
  // or the cards above re-rendered — per keystroke.
  const dq = useDeferredValue(q);
  const summary0 = useMemo(() => {
    if (!list || !t) return null;
    return { counts: statusCounts(list, t, measured), kpis: rosterKpis(list, t, tracked, measured, dues.data ? late : undefined) };
  }, [list, t, tracked, measured, late, dues.data]);
  const shown = useMemo(() => {
    if (!list || !t) return null;
    const out = filterRoster(list, dq, filter, t, measured);
    if (!sort) return out;
    const dir = sort === "duesOwed" ? -1 : 1;
    return [...out].sort((a, b) => (a[sort] - b[sort]) * dir || a.name.localeCompare(b.name));
  }, [list, t, measured, dq, filter, sort]);
  const derived = useMemo(() => (summary0 && shown ? { ...summary0, shown } : null), [summary0, shown]);

  const openCard = useCallback((b: Brother) => cardSlot.set(b.id), [cardSlot]);
  const openPay = useCallback((b: Brother) => paySlot.set(b.id), [paySlot]);

  if (!me || !t) return null;
  const org = me.org;
  const memberWord = vocab(me, "Member");
  const members = plural(memberWord);
  const duesWord = vocab(me, "Dues");
  const serviceWord = vocab(me, "Service");
  const meetingsWord = vocab(me, "Meetings");
  const dayOne = !!list && list.length <= 1;
  const seatsLeft = org?.seats ? Math.max(0, org.seats.capacity - org.seats.used) : null;
  const toRoster = () => scrollRef.current?.scrollTo({ y: Math.max(0, rosterY.current - 70), animated: !m.reduced });

  const focus = (f: Focus) => {
    haptics.select();
    if (f === "good") { setFilter("Good"); setSort(null); } else setSort(f);
    toRoster();
  };
  const exportCsv = async () => {
    if (!derived) return;
    try {
      await Share.share({ title: `${org?.name ?? "Chapter"} roster.csv`, message: rosterCsv(derived.shown, t, measured) });
    } catch { toast.show("Couldn't open the share sheet."); }
  };
  const askWho = () => router.push({ pathname: "/ask", params: { q: `Which ${members.toLowerCase()} are slipping, and why?` } });

  const summary = derived?.kpis
    ? dayOne
      ? [{ text: "It’s just you so far. Share an invite link — people sign in with Google, ask to join, and you approve them right here." }]
      : rosterSummary(derived.kpis, derived.counts, nothingMeasured, t, { members, dues: duesWord })
    : null;
  const pill = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  let body;
  if (!list && roster.isError) body = <ErrorState title="Couldn't load the roster." error={roster.error} onRetry={() => void roster.refetch()} />;
  else if (!list || !derived) body = <SkeletonList count={7} />;
  else body = (
    <View style={{ gap: 16 }}>
      {joins.data ? <JoinBand page={joins.data} seatsLeft={seatsLeft} onReview={setReview} onDecline={setDecline} /> : null}
      {dayOne ? <HowJoining /> : null}
      {derived.kpis ? (
        <Measures k={derived.kpis} roster={list} t={t} tracked={tracked} measured={measured} good={derived.counts.Good}
          nothingMeasured={nothingMeasured} words={{ meetings: meetingsWord, dues: duesWord, service: serviceWord, members }} onFocus={focus} />
      ) : null}
      {derived.kpis && !dayOne ? (
        <StandingCard roster={list} counts={derived.counts} t={t} measured={measured} nothingMeasured={nothingMeasured}
          hint={standingHint(t, tracked, { dues: duesWord, service: serviceWord })}
          filter={filter} onFilter={f => { setFilter(f); toRoster(); }} onOpen={openCard} meId={me.id} myPhoto={me.avatarUrl ?? null} />
      ) : null}
      <View onLayout={(e: LayoutChangeEvent) => { rosterY.current = e.nativeEvent.layout.y; }} style={{ gap: 10 }}>
        {sort ? (
          <Animated.View entering={m.reduced ? undefined : FadeInDown.duration(180).reduceMotion(ReduceMotion.System)} style={styles.sortLine}>
            <Icon name="updown" size={13} color={c.ink3} />
            <T v="callout" size={13} color={c.ink3} style={{ flex: 1 }}>{`Sorted by ${SORT_LABEL[sort]}`}</T>
            <Pressable onPress={() => { haptics.select(); setSort(null); }} accessibilityRole="button" hitSlop={8}>
              <T v="callout" size={13} color={c.ink} style={{ fontWeight: "600" }}>Clear</T>
            </Pressable>
          </Animated.View>
        ) : null}
        <RosterCard roster={list} shown={derived.shown} counts={derived.counts} t={t} tracked={tracked} measured={measured}
          nothingMeasured={nothingMeasured} filter={filter} onFilter={setFilter} q={q} onQ={setQ}
          lateDays={late} excuses={canAttendance ? excuses : null} canPay={canTreasury} onPay={openPay} onOpen={openCard}
          meId={me.id} myPhoto={me.avatarUrl ?? null} words={{ members, dues: duesWord, service: serviceWord }} />
      </View>
    </View>
  );

  const refresh = () => Promise.all([roster.refetch(), dues.refetch(), canBrothers ? joins.refetch() : null, canAttendance ? pending.refetch() : null]);

  return (
    <Screen title={navLabel(me, "Brotherhood")} large org onRefresh={refresh} scrollRef={scrollRef}>
      {list ? <StaleNote key="stale" updatedAt={roster.dataUpdatedAt} failed={roster.isError} onRetry={() => void roster.refetch()} /> : null}
      <PageBrief key="brief" pill={pill} kicker={`${org?.name ?? "Chapter"} · ${memberWord} Roster`}
        lead="The " mark={members} markTone="peach" sub={summary} />
      {list && derived ? (
        <View key="acts" style={styles.acts}>
          <Pressable accessibilityRole="button" onPress={exportCsv}
            style={({ pressed }) => [styles.act, { borderColor: c.ink, backgroundColor: c.card }, pressed ? null : hard(c.pastel.peach.fill, 3)]}>
            <Icon name="out" size={15} color={c.ink} />
            <T v="button" size={14} color={c.ink}>Export</T>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityHint="Opens Ask Chapt with the question ready to send" onPress={askWho}
            style={({ pressed }) => [styles.ask, { borderColor: c.pastel.lilac.border, backgroundColor: pressed ? c.pastel.lilac.soft : "transparent" }]}>
            <Icon name="spark" size={13} color={c.pastel.lilac.ink} />
            <T v="callout" size={13.5} color={c.ink2}>Ask who’s slipping</T>
          </Pressable>
        </View>
      ) : null}
      {body}

      <SlotView slot={cardSlot}>{(id, close) => <MemberCard member={byId(list, id)} me={me} roster={list ?? []} onClose={close} />}</SlotView>
      <SlotView slot={paySlot}>{(id, close) => <PayDues member={byId(list, id)} onClose={close} />}</SlotView>
      <ReviewSheet row={review} roles={roles.data ?? []} rolesState={roles.isError ? "error" : roles.data ? "ok" : "loading"}
        maxRank={me.maxRank} memberWord={memberWord} onClose={() => setReview(null)} onDecline={r => { setReview(null); setDecline(r); }} />
      <DeclineSheet row={decline} onClose={() => setDecline(null)} onDeclined={() => setDecline(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  acts: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  act: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5 },
  ask: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderStyle: "dashed" },
  sortLine: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 },
});

const byId = (list: Brother[] | undefined, id: number | null) => (id != null ? list?.find(b => b.id === id) ?? null : null);
