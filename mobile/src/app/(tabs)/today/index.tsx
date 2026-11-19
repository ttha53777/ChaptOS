/**
 * Home: the web dashboard as it lays out on a phone (docs/mobile-web-parity-plan.md,
 * Phase 2), with the real widgets. One round trip (GET /api/dashboard) feeds the same
 * lib/dashboard derivations the web page runs (~/dash/model), so standing, health, the
 * plate, the week, the numbers and the phone order agree with chaptos.com.
 *
 *   toolbar   kicker "Dashboard", the org (its stamp opens the switcher), your avatar
 *   briefing  date pill · week of, "Good morning, Maya." + wave, the digest line
 *   billing   the admin-only billing alert (no link: billing stays on chaptos.com)
 *   check-in  the live band while a window is open (opens the full-screen check-in,
 *             an app-only keep), with the officer row under it for MANAGE_ATTENDANCE
 *   invite    "Get chapter events in your own calendar" while the feed is on
 *   top       the pinned note (web PinnedAnnouncement), if the org keeps it in the top spot
 *   numbers   the org's headline numbers row
 *   cards     Up next · On your plate · This week, then the org's opt-in cards (Money,
 *             Dues, Service, Grades, Media, custom metrics), in the web's phone order
 *   kpi       a number's tap opens its page or the web's KPI drawer as a sheet
 *   glances   Members / Activity / Treasury / Docs folded to tiles; a tap opens the card
 *   footer    the org's name, small and mono
 *
 * States: first load = skeletons in the cards' shapes; an error with nothing cached =
 * ErrorState; a failed refresh over cached data = StaleNote.
 */
import type { CalendarEvent, LiveCheckIn } from "@/lib/api-types";
import type { DashCardId } from "@/lib/dashboard-layout";
import type { NumberFact, NumberTarget } from "@/lib/dashboard/numbers";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useEventTypes } from "~/data/calendar";
import { useDashboard, useDigest } from "~/data/dashboard";
import { useAnnouncement, useLiveCheckIn, useScreenFocused } from "~/data/home";
import { BillingAlert, CalendarInvite, LiveOfficer } from "~/dash/Bands";
import { Brief } from "~/dash/Brief";
import { GlanceSheet, GlanceTile, type GlanceCtx } from "~/dash/Glances";
import { KpiSheet, type KpiCtx, type KpiKey } from "~/dash/KpiSheet";
import { dashModel } from "~/dash/model";
import { NumbersRow } from "~/dash/Numbers";
import { PinnedNote } from "~/dash/PinnedNote";
import { PlateCard } from "~/dash/PlateCard";
import { DuesCard, GradesCard, MediaCard, MetricCard, MoneyCard, ServiceCard } from "~/dash/TrackCards";
import { UpNextCard } from "~/dash/UpNextCard";
import { WeekCard } from "~/dash/WeekCard";
import { useEntryOf } from "~/entry/EntryContext";
import { runWindow } from "~/meetings/CheckIn";
import { EventForm } from "~/meetings/EventForm";
import { canAttendance, canEvents } from "~/meetings/model";
import { MemberCard } from "~/members/MemberCard";
import { Avatar } from "~/paper/bits";
import { Screen } from "~/shell/Screen";
import { ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { viewerOf } from "~/tasks/model";
import { EventSheet } from "~/timeline/EventSheet";
import { SlotView, useSlot } from "~/shell/slot";
import { useTheme } from "~/theme/PaperProvider";
import { CheckInBand } from "~/today/CheckInBand";
import { bandVisible, useNow } from "~/today/live";
import { canPin, noteOn, NoteEditor } from "~/today/NoteEditor";
import { T } from "~/ui/T";

const toTimeline = () => router.navigate("/(tabs)/timeline");
const toMembers = () => router.navigate("/(tabs)/members");

export default function Home() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const focused = useScreenFocused();
  const dash = useDashboard();
  const live = useLiveCheckIn(focused);
  const note = useAnnouncement();
  const types = useEventTypes();
  const [writing, setWriting] = useState(false);
  // Sheets open off slots, so opening one doesn't re-render every card under it (~/shell/slot).
  const card = useSlot<true>();
  const glance = useSlot<DashCardId>();
  const peek = useSlot<CalendarEvent>();
  const [adding, setAdding] = useState(false);
  const kpi = useSlot<KpiKey>();

  const me = entry?.me;
  const d = dash.data;
  const model = useMemo(() => (me && d ? dashModel(me, d) : null), [me, d]);
  const viewer = useMemo(() => (me ? viewerOf(me) : null), [me]);
  const people = useMemo(() => new Map((d?.brothers ?? []).map(b => [b.id, b] as const)), [d?.brothers]);
  const digest = useDigest(model?.week ?? null, model?.igEnabled ?? false);

  if (!entry || !me || !viewer) return null;
  const officerA = canAttendance(me);
  const officerE = canEvents(me) && !!me.org?.enabledWorkflows.includes("events");
  const openCheckIn = async (e: CalendarEvent) => { if (await runWindow(e, "open")) void live.refetch(); };
  const pin = canPin(me);
  const first = me.name.trim().split(/\s+/)[0] || null;
  const mine = d?.brothers.find(b => b.id === me.id) ?? null;
  const refresh = () => Promise.all([dash.refetch(), live.refetch(), note.refetch()]);

  // Where the web's number goes: the page, or its KPI drawer (a sheet here).
  const openNumber = (t: NumberTarget, _f: NumberFact) => {
    if (t.kind === "page") return t.page === "brothers" ? toMembers() : router.push(`/more/${t.page}` as Href);
    if (t.kind === "metric") return kpi.set(`metric:${t.definitionId}`);
    return kpi.set(t.drawer);
  };
  const k: KpiCtx | null = model && d ? {
    brothers: d.brothers, tasks: d.tasks, metrics: d.metrics, duesStandings: d.duesStandings, thresholds: model.thresholds,
    hasDuesData: model.roster.hasDuesData, canTreasury: model.canTreasury, financeEnabled: model.financeEnabled,
    words: { dues: model.words.dues, meetings: model.words.meetings, members: model.words.members, treasury: model.words.treasury },
  } : null;

  const g: GlanceCtx | null = model && d ? {
    data: d, thresholds: model.thresholds, measured: model.roster.measured, standing: model.standing,
    pendingJoins: model.canBrothers ? me.org?.pendingJoinRequestCount ?? 0 : 0,
    words: { members: model.words.members, service: model.words.service },
  } : null;

  const renderCard = (id: DashCardId, i: number) => {
    if (!model || !d) return null;
    switch (id) {
      case "announcement":
        if (!note.isSuccess || !noteOn(me)) return null;
        return <PinnedNote key={id} a={note.data ?? null} word={me.org?.vocabularyOverrides.Announcement ?? "Announcement"} onEdit={pin ? () => setWriting(true) : undefined} />;
      case "next": return (
        <UpNextCard key={id} events={d.calendar} types={types.data} today={d.today} live={live.data ?? null} onSelect={peek.set} onAll={toTimeline}
          onOpenCheckIn={officerA ? openCheckIn : undefined} onAddEvent={officerE ? () => setAdding(true) : undefined} i={i} />
      );
      case "needs": return (
        <PlateCard key={id} items={model.plate} today={d.today} data={d} hasData={model.roster.hasAnyData} roleNames={model.plateRoles}
          duesWord={model.words.dues} memberWord={p => (p ? model.words.members : model.words.member)} i={i} />
      );
      case "week": return (
        <WeekCard key={id} agenda={model.week.agenda} deadlines={model.week.deadlinesDue} start={model.week.start} end={model.week.end}
          today={d.today} types={types.data} calendarEmpty={d.calendar.length === 0} onAll={toTimeline} onEvent={toTimeline} i={i} />
      );
      case "money": return <MoneyCard key={id} balance={d.treasury?.balance ?? null} today={d.today} onOpen={() => router.push("/more/treasury" as Href)} i={i} />;
      case "dues": return <DuesCard key={id} label={model.words.dues} brothers={d.brothers} standings={d.duesStandings} onOpen={() => router.push("/more/treasury" as Href)} i={i} />;
      case "service": return <ServiceCard key={id} label={model.words.service} brothers={d.brothers} goal={model.thresholds.serviceHoursGoal} onOpen={() => router.push("/more/service" as Href)} i={i} />;
      case "gpa": return <GradesCard key={id} brothers={d.brothers} atRisk={model.thresholds.gpaAtRisk} onOpen={() => kpi.set("gpa")} i={i} />;
      case "social": return <MediaCard key={id} tasks={d.instagram} today={d.today} onOpen={() => router.push("/more/media" as Href)} i={i} />;
      default: {
        const snap = id.startsWith("metric:") ? d.metrics.find(m => `metric:${m.definitionId}` === id) : undefined;
        return snap ? <MetricCard key={id} snap={snap} onOpen={() => kpi.set(`metric:${snap.definitionId}`)} i={i} /> : null;
      }
    }
  };

  const avatar = (
    <Pressable onPress={() => card.set(true)} accessibilityRole="button" accessibilityLabel="Your card"
      style={({ pressed }) => [styles.me, { borderColor: c.ink, backgroundColor: c.card, boxShadow: pressed ? undefined : `2px 2px 0 ${c.pastel.mint.fill}` }, pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
      <Avatar name={me.name} uri={me.avatarUrl} tone="mint" px={30} />
    </Pressable>
  );

  return (
    <Screen title="Dashboard" toolbar={{ kicker: "Dashboard", title: me.org?.name ?? "" }} right={avatar} onRefresh={refresh}>
      {d ? <StaleNote updatedAt={dash.dataUpdatedAt} failed={dash.isError} onRetry={() => void dash.refetch()} /> : null}

      {model && d && g ? (
        <View style={{ gap: 14 }}>
          <Brief firstName={first} start={model.week.start} end={model.week.end}
            digest={digest.data ?? null} digestLoading={digest.isFetching && !digest.data} quiet={!model.week.hasSignal} />
          {/* No health dial: the web hides it on phones (dashboard-ledger.css, "Hide the Chapter Health dial on phones"). */}
          <BillingAlert me={me} />
          {live.data ? <LiveBand live={live.data} fetchedAt={live.dataUpdatedAt} ticking={focused} officer={officerA} /> : null}
          <CalendarInvite />
          {model.phone.top.map((id, i) => renderCard(id, i))}
          <NumbersRow facts={model.numbers} onOpen={openNumber} />
          {model.phone.cards.map((id, i) => renderCard(id, i + 1))}
          {model.phone.tiles.length ? (
            <View style={styles.tiles}>
              {model.phone.tiles.map((id, i) => (
                <GlanceTile key={id} id={id} g={g} wide={id === model.phone.loneTile} i={model.phone.cards.length + 1 + i} onPress={() => glance.set(id)} />
              ))}
            </View>
          ) : null}
          <View style={[styles.foot, { borderTopColor: c.line }]}>
            <T v="kicker" size={10} color={c.ink3}>{me.org?.name ?? ""}</T>
          </View>
        </View>
      ) : dash.isError ? (
        <ErrorState title="Couldn't load the dashboard." error={dash.error} onRetry={() => void dash.refetch()} />
      ) : (
        <View style={styles.sk}>
          <SkeletonCard height={120} lines={2} title={false} radius={20} />
          <SkeletonCard height={260} lines={3} lead radius={22} />
          <SkeletonCard lines={3} radius={22} />
          <SkeletonCard lines={2} radius={22} />
        </View>
      )}

      {pin ? <NoteEditor open={writing} current={note.data} onClose={() => setWriting(false)} /> : null}
      {g ? <SlotView slot={glance}>{(id, close) => <GlanceSheet id={id} g={g} onClose={close} />}</SlotView> : null}
      {k ? <SlotView slot={kpi}>{(id, close) => <KpiSheet id={id} k={k} onClose={close} />}</SlotView> : null}
      <SlotView slot={peek}>{(e, close) => <EventSheet event={e} task={null} types={types.data} viewer={viewer} today={d?.today ?? ""} roster={people} onClose={close} />}</SlotView>
      {officerE ? <EventForm open={adding} kind="event" onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void refresh(); }} /> : null}
      {mine ? <SlotView slot={card}>{(on, close) => <MemberCard member={on ? mine : null} me={me} roster={d?.brothers ?? []} onClose={close} />}</SlotView> : null}
    </Screen>
  );
}

/** The band with its own one-second clock, so only it re-renders as the window counts down. */
function LiveBand({ live, fetchedAt, ticking, officer }: { live: LiveCheckIn; fetchedAt: number; ticking: boolean; officer: boolean }) {
  const now = useNow(ticking);
  if (!bandVisible(live, fetchedAt, now)) return null;
  // A member has nothing to do with a cancelled window: it never reaches their record.
  if (live.cancelledAt && !officer) return null;
  return (
    <View style={{ gap: 10 }}>
      <CheckInBand live={live} fetchedAt={fetchedAt} now={now} onPress={() => router.push("/checkin")} />
      {officer ? <LiveOfficer live={live} fetchedAt={fetchedAt} now={now} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  me: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10, rowGap: 12 },
  foot: { alignItems: "center", paddingTop: 18, marginTop: 8, borderTopWidth: 1.5 },
  sk: { gap: 12 },
});
