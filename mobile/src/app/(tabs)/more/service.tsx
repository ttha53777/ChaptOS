/**
 * Service (the web's app/org/[slug]/service, PaperService, as its phone renders it),
 * reached from More → Service. Top to bottom, as the web:
 *
 *   brief      "FRI · NOV 20", "The service log · FA26", "Hours, by the event.", the
 *              digest (hours logged, who's short of the goal, what's next)
 *   actions    New service event (MANAGE_SERVICE) · Log my hours (once an event has
 *              happened) · Ask who's behind (Ask Chapt, the web's question waiting)
 *   measures   Hours logged · Service events · On track · Avg / member
 *   tools      Search events… / Search members… · Events | Members · "n of m"
 *   events     Coming up (soonest first) and Logged (newest first); a card opens onto
 *              its sign-in sheet, with Log hours · Edit · Delete for officers
 *   members    punch cards, most hours first; a card opens the member's hours by event
 *   day one    the three steps, Plan your first service event (officers) or the member line
 *
 * Every rule and word comes from lib/service/ledger (shared with the web page). The
 * signature moment: Log my hours, once the server has it, punches my card's new holes.
 */
import type { Brother, ServiceEvent, ServiceParticipationRow } from "@/lib/api-types";
import { roleTitle } from "@/lib/dashboard/roster";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeInDown, LinearTransition, SlideOutRight } from "react-native-reanimated";
import { localDay } from "~/data/home";
import { refreshRoster } from "~/data/members";
import {
  createServiceEvent, deleteServiceEvent, dropEventRows, dropRow, editServiceEvents, logHours, logMyHours, patchServiceEvent, putEventRows,
  removeParticipation, useParticipation, useServiceEvents,
} from "~/data/more";
import { useRoster } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { navLabel } from "~/more/model";
import { haptics } from "~/motion/haptics";
import { Calm, DayOne, EventCard, Legend, Measure, MemberCard, SectionHead } from "~/service/bits";
import {
  DAY_ONE, MEASURES, PAGE, SAY, avgHours, canService as canServiceOf, dateParts, digestEmpty, digestRest, dow3, ledgerStats, logEntries, loggable,
  mineHours, mon3, mutationMessage, nextWhen, r1, rankMembers, rowsByEvent, splitEvents,
} from "~/service/model";
import { LogHours, LogMine, MemberSheet, PunchMoment, ServiceForm, type Punch, type ServiceFormBody } from "~/service/sheets";
import { Screen } from "~/shell/Screen";
import { ErrorState, SkeletonCard, SkeletonList } from "~/shell/states";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { TrBtn } from "~/treasury/bits";
import { PageBrief, type BriefPart } from "~/ui/PageBrief";
import { T } from "~/ui/T";

type View_ = "events" | "members";
const byDateDesc = (a: ServiceEvent, b: ServiceEvent) => b.date.localeCompare(a.date);
/** Past this many cards, no per-card layout animation. */
const ANIMATE_UP_TO = 40;

export default function Service() {
  const { c } = useTheme();
  const m = useMotion();
  const entry = useEntryOf("ready");
  const evQ = useServiceEvents();
  const partQ = useParticipation();
  const rosterQ = useRoster();
  const [view, setView] = useState<View_>("events");
  const [find, setFind] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [form, setForm] = useState<{ editing: ServiceEvent | null } | null>(null);
  const [logFor, setLogFor] = useState<ServiceEvent | null>(null);
  const [mineOpen, setMineOpen] = useState(false);
  const [member, setMember] = useState<Brother | null>(null);
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [fresh, setFresh] = useState<number | null>(null);
  const [punch, setPunch] = useState<Punch | null>(null);

  const today = localDay();
  const events = useMemo(() => evQ.data ?? [], [evQ.data]);
  const rows = useMemo(() => partQ.data ?? [], [partQ.data]);
  const roster = useMemo(() => rosterQ.data ?? [], [rosterQ.data]);
  const byEvent = useMemo(() => rowsByEvent(events, rows), [events, rows]);
  const split = useMemo(() => splitEvents(events, find, today), [events, find, today]);
  const ranked = useMemo(() => rankMembers(roster, find), [roster, find]);
  const mineList = useMemo(() => loggable(events.filter(e => !pending.has(e.id))), [events, pending]);

  const toggle = useCallback((id: number) => setOpenId(o => (o === id ? null : id)), []);
  const onEdit = useCallback((ev: ServiceEvent) => setForm({ editing: ev }), []);
  const onLog = useCallback((ev: ServiceEvent) => setLogFor(ev), []);
  const onMember = useCallback((b: Brother) => setMember(b), []);

  const onDelete = useCallback(async (ev: ServiceEvent) => {
    const undoEvents = editServiceEvents(list => list.filter(e => e.id !== ev.id));
    const keep = rows.filter(r => r.serviceEventId === ev.id);
    dropEventRows(ev.id);
    try {
      await deleteServiceEvent(ev.id);
      haptics.success();
      toast.show(SAY.deleted(ev.title));
      // Deleting an event recomputes totals server-side; refresh the roster.
      void refreshRoster();
    } catch {
      undoEvents();
      putEventRows(ev.id, keep);
      haptics.error();
      toast.error(SAY.deleteFail);
    }
  }, [rows]);

  const onRemove = useCallback(async (_eventId: number, p: ServiceParticipationRow) => {
    const undo = dropRow(p.id);
    try {
      await removeParticipation(p.id);
      void refreshRoster();
    } catch {
      undo();
      haptics.error();
      toast.error(SAY.removeFail);
    }
  }, []);

  if (!entry) return null;
  const me = entry.me;
  const officer = canServiceOf(me);
  const goal = me.org?.thresholds.serviceHoursGoal ?? 10;
  const term = me.org?.activeTerm?.label ?? null;
  const orgName = me.org?.name ?? "ChaptOS";
  const eventsLoading = !evQ.data;
  const rosterLoading = !rosterQ.data;
  const stats = ledgerStats(roster, events, goal, today);
  const tp = dateParts(today);
  const refresh = () => Promise.all([evQ.refetch(), partQ.refetch(), rosterQ.refetch()]);
  const myTotal = roster.find(b => b.id === me.id)?.serviceHours ?? 0;

  /* ── writes ── */
  const save = async (body: ServiceFormBody) => {
    const editing = form?.editing ?? null;
    setForm(null);
    if (!editing) {
      // On the page now, inert until the save lands.
      const tempId = -Date.now();
      const draft: ServiceEvent = {
        id: tempId, organizationId: 0, title: body.title, date: body.date, location: body.location, notes: body.notes, calendarEventId: null,
        createdAt: new Date().toISOString(), schedule: body.schedule ?? null, time: null,
      };
      editServiceEvents(list => [...list, draft].sort(byDateDesc));
      setPending(s => new Set(s).add(tempId));
      setFresh(tempId);
      try {
        const saved = await createServiceEvent(body);
        editServiceEvents(list => list.map(e => (e.id === tempId ? saved : e)).sort(byDateDesc));
        putEventRows(saved.id, []);
        setFresh(saved.id);
        haptics.success();
        toast.show(SAY.added(saved.title));
      } catch (err) {
        editServiceEvents(list => list.filter(e => e.id !== tempId));
        haptics.error();
        toast.error(mutationMessage(err, SAY.addFail));
      } finally {
        setPending(s => { const n = new Set(s); n.delete(tempId); return n; });
      }
      return;
    }
    const undo = editServiceEvents(list => list.map(e => (e.id === editing.id ? { ...e, ...body, schedule: body.schedule !== undefined ? body.schedule : e.schedule } : e)).sort(byDateDesc));
    try {
      const saved = await patchServiceEvent(editing.id, body);
      editServiceEvents(list => list.map(e => (e.id === editing.id ? saved : e)).sort(byDateDesc));
      haptics.success();
      toast.show(SAY.updated);
    } catch (err) {
      undo();
      haptics.error();
      toast.error(mutationMessage(err, SAY.saveFail));
    }
  };

  const saveLog = async (ev: ServiceEvent, draft: Record<number, string>): Promise<boolean> => {
    const entries = logEntries(draft);
    if (!entries.length) return true;
    try {
      const fresh = await logHours(ev.id, entries);
      putEventRows(ev.id, fresh);
      haptics.success();
      toast.show(SAY.logged);
      void refreshRoster();
      return true;
    } catch {
      haptics.error();
      toast.error(SAY.logFail);
      return false;
    }
  };

  const saveMine = async (eventId: number, val: string): Promise<boolean> => {
    const hours = mineHours(val);
    try {
      const fresh = await logMyHours(eventId, hours);
      putEventRows(eventId, fresh);
      haptics.success();
      toast.show(SAY.mineLogged);
      // The punch shows the server's new total (it recomputes from the sign-in sheets),
      // and only when whole holes were added.
      const from = myTotal;
      void rosterQ.refetch().then(r => {
        const self = r.data?.find(b => b.id === me.id);
        if (self && Math.floor(self.serviceHours) > Math.floor(from)) {
          setPunch({ name: me.name, role: roleTitle(self), from, to: self.serviceHours, goal });
        }
      });
      return true;
    } catch {
      haptics.error();
      toast.error(SAY.mineFail);
      return false;
    }
  };

  /* ── day one ── */
  if (evQ.data && !events.length) {
    return (
      <Screen title={navLabel(me, "Service")} back="More" onRefresh={refresh}>
        <View style={{ gap: 18 }}>
          <PageBrief pill={term} pillAfter kicker={DAY_ONE.kicker} lead={DAY_ONE.greet} mark={DAY_ONE.greetHi} tail="" markTone="mint" sub={DAY_ONE.digest} />
          {rosterLoading ? <SkeletonCard height={300} /> : (
            <>
              {officer ? <View style={styles.actions}><TrBtn label={PAGE.newEvent} icon="plus" onPress={() => setForm({ editing: null })} /></View> : null}
              <DayOne goal={goal} officer={officer} onNew={() => setForm({ editing: null })} />
            </>
          )}
        </View>
        {officer ? <ServiceForm open={!!form} editing={form?.editing ?? null} onClose={() => setForm(null)} onSave={b => void save(b)} /> : null}
      </Screen>
    );
  }

  /* ── the page ── */
  let digest: BriefPart[] | null = null;
  if (!eventsLoading && !rosterLoading) {
    digest = roster.length === 0 || !stats.hasEvents
      ? [{ text: digestEmpty(orgName, roster.length) }]
      : [
        { text: `${r1(stats.total)} hours`, bold: true },
        { text: digestRest(stats, events.length, goal).join("") },
        ...(stats.next ? [{ text: PAGE.nextUp }, { text: stats.next.title, bold: true }, { text: `, ${nextWhen(stats.next.date, today)}.` }] : []),
      ];
  }

  const card = (ev: ServiceEvent, i: number) => (
    <Animated.View key={ev.id} layout={i < ANIMATE_UP_TO && !m.reduced ? LinearTransition : undefined}
      entering={fresh === ev.id && !m.reduced ? FadeInDown : undefined} exiting={i < ANIMATE_UP_TO && !m.reduced ? SlideOutRight : undefined}>
      <EventCard ev={ev} today={today} open={openId === ev.id} pending={pending.has(ev.id)} rows={byEvent[ev.id]} canService={officer} selfId={me.id}
        onToggle={toggle} onLog={onLog} onEdit={onEdit} onDelete={onDelete} onRemove={onRemove} />
    </Animated.View>
  );

  let body: React.ReactNode;
  if (view === "events") {
    if (eventsLoading) {
      body = evQ.isError ? <ErrorState title={SAY.loadFail} error={evQ.error} onRetry={() => void evQ.refetch()} /> : <SkeletonList count={4} />;
    } else if (!split.matched.length) {
      body = <Calm title={PAGE.noMatch} line={PAGE.noMatchLine} onClear={() => setFind("")} />;
    } else {
      body = (
        <View style={{ gap: 10 }}>
          {split.up.length ? <><SectionHead title={PAGE.comingUp} count={String(split.up.length)} />{split.up.map(card)}</> : null}
          {split.past.length ? <><SectionHead title={PAGE.logged} count={`${split.past.length} · ${PAGE.newestFirst}`} />{split.past.map((e, i) => card(e, i + split.up.length))}</> : null}
        </View>
      );
    }
  } else if (rosterLoading) {
    body = rosterQ.isError ? <ErrorState title="Couldn't load members." error={rosterQ.error} onRetry={() => void rosterQ.refetch()} /> : <SkeletonList count={5} />;
  } else if (!ranked.length) {
    body = <Calm title={PAGE.noMembers} line={PAGE.noMembersLine} />;
  } else {
    body = (
      <View style={{ gap: 12 }}>
        <Legend goal={goal} />
        {ranked.map(b => <MemberCard key={b.id} b={b} goal={goal} you={b.id === me.id} onPress={onMember} />)}
      </View>
    );
  }

  const M = MEASURES;
  return (
    <Screen title={navLabel(me, "Service")} back="More" onRefresh={refresh}>
      <View style={{ gap: 18 }}>
        <PageBrief pill={`${dow3(tp.dow)} · ${mon3(tp.m)} ${tp.d}`} kicker={`${PAGE.kicker}${term ? ` · ${term}` : ""}`} kickerSep={false}
          lead={PAGE.greet} mark={PAGE.greetHi} tail="" markTone="mint" spark digest={stats.hasEvents ? digest : null} quiet={!stats.hasEvents && digest ? digest[0]?.text ?? null : null} />

        <View style={styles.actions}>
          <View style={styles.actRow}>
            {officer ? <TrBtn label={PAGE.newEvent} icon="plus" onPress={() => setForm({ editing: null })} /> : null}
            <TrBtn kind="card" tone="peach" label={PAGE.logMine} icon="clock" disabled={!stats.hasPast} hint={stats.hasPast ? undefined : PAGE.logMineNone} onPress={() => setMineOpen(true)} />
          </View>
          <TrBtn kind="ask" label={PAGE.ask} icon="spark" kbd="⌘K" hint="Opens Ask Chapt with the question ready to send"
            onPress={() => router.push({ pathname: "/ask", params: { q: PAGE.askQ } })} />
        </View>

        <View style={styles.measures}>
          {!stats.hasEvents ? (
            <>
              <Measure unset label={M.hours.label} icon={M.hours.icon} tone={M.hours.tone} value="—" note={M.hours.why} />
              <Measure unset label={M.events.label} icon={M.events.icon} tone={M.events.tone} value="—" note={M.events.why} />
              <Measure unset label={M.onTrack.label} icon={M.onTrack.icon} tone={M.onTrack.tone} value="—" note={M.onTrack.why(goal)} />
              <Measure unset label={M.avg.label} icon={M.avg.icon} tone={M.avg.tone} value="—" note={M.avg.why} />
            </>
          ) : (
            <>
              <Measure label={M.hours.label} icon={M.hours.icon} tone={M.hours.tone} value={r1(stats.total)} unit="h" note={M.hours.note} />
              <Measure label={M.events.label} icon={M.events.icon} tone={M.events.tone} value={String(events.length)} note={M.events.note(stats.upcoming)} />
              <Measure label={M.onTrack.label} icon={M.onTrack.icon} tone={M.onTrack.tone} value={String(stats.onTrack)} unit={`/${roster.length}`} note={M.onTrack.note(goal)}
                warn={roster.length > 0 && stats.onTrack < roster.length} />
              <Measure label={M.avg.label} icon={M.avg.icon} tone={M.avg.tone} value={r1(avgHours(stats.total, roster.length))} unit="h" note={M.avg.note} />
            </>
          )}
        </View>

        <View style={{ gap: 12 }}>
          <View style={[styles.search, { borderColor: c.line2, backgroundColor: c.card }]}>
            <Icon name="search" size={16} color={c.ink3} />
            <TextInput value={find} onChangeText={setFind} placeholder={view === "events" ? PAGE.searchEvents : PAGE.searchMembers} placeholderTextColor={c.ink3}
              autoCorrect={false} autoCapitalize="none" returnKeyType="search" accessibilityLabel="Search" style={[styles.searchIn, { color: c.ink }]} />
          </View>
          <View style={styles.toolRow}>
            <View style={[styles.tabs, { backgroundColor: c.paper2, borderColor: c.line }]} accessibilityRole="tablist" accessibilityLabel="View">
              {(["events", "members"] as const).map(k => {
                const on = view === k;
                return (
                  <Pressable key={k} onPress={() => { if (!on) { haptics.select(); setView(k); setFind(""); } }} accessibilityRole="tab" accessibilityLabel={k === "events" ? PAGE.events : PAGE.members} accessibilityState={{ selected: on }}
                    style={[styles.tab, on && { backgroundColor: c.card, boxShadow: `0 1px 2px ${c.line2}` }]}>
                    <T v="buttonSm" color={on ? c.ink : c.ink3}>{k === "events" ? PAGE.events : PAGE.members}</T>
                  </Pressable>
                );
              })}
            </View>
            <T v="mono" color={c.ink3} style={{ fontSize: 11.5 }}>{view === "events" ? `${split.matched.length} of ${events.length}` : `${ranked.length} of ${roster.length}`}</T>
          </View>
        </View>

        {body}
      </View>

      {officer ? (
        <>
          <ServiceForm open={!!form} editing={form?.editing ?? null} onClose={() => setForm(null)} onSave={b => void save(b)} />
          <LogHours event={logFor} roster={roster} rows={logFor ? byEvent[logFor.id] : undefined} onClose={() => setLogFor(null)} onSave={saveLog} />
        </>
      ) : null}
      <LogMine open={mineOpen} events={mineList} rows={rows} selfId={me.id} myTotal={myTotal} goal={goal} onClose={() => setMineOpen(false)} onSave={saveMine} />
      <MemberSheet member={member} goal={goal} events={events} byEvent={byEvent} onClose={() => setMember(null)} />
      <PunchMoment punch={punch} onDone={() => setPunch(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 12, alignItems: "flex-start" },
  actRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  measures: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, minHeight: 46 },
  searchIn: { flex: 1, fontSize: 16, paddingVertical: 10 },
  toolRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  tabs: { flexDirection: "row", gap: 2, padding: 3, borderRadius: 999, borderWidth: 1.5 },
  tab: { paddingHorizontal: 14, minHeight: 34, borderRadius: 999, justifyContent: "center" },
});
