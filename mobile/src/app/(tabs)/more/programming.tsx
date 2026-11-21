/**
 * Programming (the web's events page at phone width), reached from More, in the
 * web's order:
 *
 *   briefing   the date pill · the term; "The programme." (day one: "Events, one
 *              step at a time"); the status line: what's next, then the counts you can
 *              go and change (each a link; the wrap-up count only for officers)
 *   actions    New idea · New event (officers; New event waits for day two) · ? (the
 *              help, for everyone, after day one)
 *   measures   On the slate · Next 14 days · Unowned ideas · Average stars
 *   toolbar    Board | Calendar, the type chips (any number), Search events…
 *   the view   the four lanes stacked, or the undated rail and the month; "No events
 *              match." when the filters hide everything
 *   timeline   what the chapter actually sees
 *   day one    no events: the four figures, then Write your first idea (officers)
 *
 * A card opens the event sheet; moves route through the gates as the web's do.
 * Writes are MANAGE_EVENTS; members read it all.
 */
import type { CalendarEvent, ProgrammingEvent } from "@/lib/api-types";
import { catalogOf } from "@/lib/treasury/ledger";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from "react-native";
import { useEventTypes } from "~/data/calendar";
import { localDay } from "~/data/home";
import { useCategories, useSemesters } from "~/data/money";
import { eventTxnsMoved, useProgramming, useRoles } from "~/data/programming";
import { useRoster } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { navLabel } from "~/more/model";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { CalendarView, DayOne, Lanes, TimelineStrip, type DayOneSample } from "~/programming/Board";
import { EventSheet } from "~/programming/EventSheet";
import {
  DAY_ONE, NO_MATCH, PAGE, canEnter, canManage, eventsTermStats, filterEvents, filterTypes, leadTail, longDate, managedTypes, measures,
  needsWrapUp, nextOnDeckEvent, noMatchBits, noMatchLine, readyToConfirmCount, starterIdeas, statusBits, termLabel, type StatusBit,
  typeCat,
} from "~/programming/model";
import { DeleteEvent, EventForm, FixStep, HelpSheet, NewIdea, WrapUp, type Opened } from "~/programming/steps";
import { Screen } from "~/shell/Screen";
import { ErrorState, SkeletonCard } from "~/shell/states";
import { useFontScale, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { resolveType } from "~/theme/type";
import { LedgerTxForm } from "~/treasury/Sheets";
import { PageBrief, type BriefPart } from "~/ui/PageBrief";
import { Segmented } from "~/ui/Segmented";
import { T } from "~/ui/T";

type View_ = "board" | "calendar";
const EMPTY: never[] = [];

export default function Programming() {
  const { c } = useTheme();
  const scale = useFontScale();
  const me = useEntryOf("ready")?.me ?? null;
  const officer = !!me && canManage(me);
  const q = useProgramming();
  const typesQ = useEventTypes();
  const roster = useRoster(officer);
  const roles = useRoles(officer);
  const catq = useCategories(officer);
  const semq = useSemesters(officer);
  const today = localDay();
  const scroll = useRef<ScrollViewInstance | null>(null);
  const viewY = useRef(0);

  const [view, setView] = useState<View_>("board");
  const [typeSet, setTypeSet] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [idea, setIdea] = useState(false);
  const [form, setForm] = useState<{ editing: ProgrammingEvent | null } | null>(null);
  const [doomed, setDoomed] = useState<ProgrammingEvent | null>(null);
  const [help, setHelp] = useState(false);
  const [step, setStep] = useState<Opened | null>(null);
  const [logFor, setLogFor] = useState<ProgrammingEvent | null>(null);

  const events = q.data ?? EMPTY;
  const types = typesQ.data;
  const workflows = me?.org?.enabledWorkflows ?? EMPTY;
  const formTypes = useMemo(() => managedTypes(types, workflows), [types, workflows]);
  const chipTypes = useMemo(() => filterTypes(types), [types]);
  const filtered = useMemo(() => filterEvents(events, search, typeSet), [events, search, typeSet]);
  const stats = useMemo(() => eventsTermStats(events, today), [events, today]);
  const onDeck = useMemo(() => nextOnDeckEvent(events, today), [events, today]);
  const ready = useMemo(() => readyToConfirmCount(events), [events]);
  const toWrap = useMemo(() => (officer ? events.filter(e => needsWrapUp(e, today)).length : 0), [events, today, officer]);
  const status = useMemo(() => statusBits(onDeck, ready, stats.unownedIdeas, today, toWrap), [onDeck, ready, stats.unownedIdeas, today, toWrap]);
  const sample = useMemo<DayOneSample | null>(() => {
    if (!types) return null;
    const st = starterIdeas(formTypes.map(t => ({ slug: t.slug, label: t.label })))[0];
    const opt = formTypes.find(t => t.slug === st?.category) ?? formTypes[0];
    return { title: st?.title ?? DAY_ONE.fallbackTitle, label: opt?.label ?? null, slug: opt?.slug ?? null };
  }, [types, formTypes]);
  const catalog = useMemo(() => catalogOf(catq.data ?? EMPTY), [catq.data]);

  const act = useCallback((kind: StatusBit["kind"]) => {
    if (kind === "wrap") {
      const next = events.filter(e => needsWrapUp(e, today)).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];
      if (next) { setOpen(next.id); setStep({ kind: "wrap", e: next }); }
      return;
    }
    setView("board");
    if (kind === "ready") {
      const next = events.find(e => e.stage === "planning" && canEnter(e, "confirmed"));
      if (next) setOpen(next.id);
      return;
    }
    // the Idea lane is the first on the board
    requestAnimationFrame(() => scroll.current?.scrollTo({ y: Math.max(0, viewY.current - 12), animated: true }));
  }, [events, today]);

  if (!me) return null;
  const loading = !q.data;
  const dayOne = !loading && events.length === 0;
  const pill = longDate(today);
  const kicker = termLabel(me.org?.activeTerm?.label, me.org?.name);

  const statusLine: React.ReactNode = loading ? (
    <T v="body" size={15.2} lh={1.5} color={c.ink3}>{PAGE.loading}</T>
  ) : status.lead || status.bits.length ? (
    <T v="body" size={15.2} lh={1.5} color={c.ink2}>
      {status.lead ? <><T v="bodyStrong" size={15.2} lh={1.5} color={c.ink}>{status.lead.title}</T>{leadTail(status.lead.when)}</> : null}
      {status.bits.map(b => (
        <T key={b.text} v="body" size={15.2} lh={1.5} color={c.ink2}>
          {" "}
          {b.kind !== "wrap" || officer ? (
            <T v="body" size={15.2} lh={1.5} color={c.pastel.butter.ink} style={styles.act} onPress={() => act(b.kind)} accessibilityRole="link">{b.text}</T>
          ) : <T v="body" size={15.2} lh={1.5} color={c.pastel.butter.ink} style={{ fontWeight: "600" }}>{b.text}</T>}
        </T>
      ))}
    </T>
  ) : null;

  const toggleType = (slug: string) => {
    haptics.select();
    setTypeSet(s => { const n = new Set(s); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
  };

  let body: React.ReactNode;
  if (loading) {
    body = q.isError
      ? <ErrorState title="Could not load programming events." error={q.error} onRetry={() => void q.refetch()} />
      : <><SkeletonCard height={180} /><SkeletonCard height={320} /></>;
  } else if (dayOne) {
    body = sample ? (
      <DayOne sample={sample} owner={officer ? me.name ?? "You" : DAY_ONE.memberOwner} today={today} officer={officer} types={types} onNew={() => setIdea(true)} />
    ) : null;
  } else {
    const labels = chipTypes.filter(t => typeSet.has(t.slug)).map(t => t.label);
    body = (
      <>
        <View style={styles.measures}>
          {measures(stats).map(m => (
            <View key={m.label} style={[styles.measure, { borderColor: c.line2, backgroundColor: c.card }]} accessible accessibilityLabel={`${m.label}: ${m.value}${m.unit ?? ""}. ${m.note}`}>
              <T v="kicker" size={10.5} color={c.ink3} numberOfLines={1}>{m.label}</T>
              <T v="hero" size={30} ls={-0.03}>{m.value}{m.unit ? <T v="body" size={15} color={c.ink3}>{m.unit}</T> : null}</T>
              <T v="mono" size={11.5} color={m.warn ? c.pastel.rose.ink : m.good ? c.pastel.mint.ink : c.ink3}>{m.note}</T>
            </View>
          ))}
        </View>

        <View style={styles.toolbar}>
          <Segmented<View_> value={view} label="View" onChange={v => { if (v !== view) { haptics.select(); setView(v); } }}
            options={[{ value: "board", label: PAGE.views.board }, { value: "calendar", label: PAGE.views.calendar }]} />
          {chipTypes.map(t => {
            const on = typeSet.has(t.slug);
            const cat = typeCat(t.slug, types, c);
            return (
              <Pressable key={t.slug} onPress={() => toggleType(t.slug)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={[styles.chip, { borderColor: on ? cat.bd : c.line2, backgroundColor: on ? cat.soft : c.card }]}>
                <View style={[styles.dot, { backgroundColor: cat.ink }]} />
                <T v="pill" color={on ? cat.ink : c.ink2}>{t.label}</T>
              </Pressable>
            );
          })}
          <View style={[styles.search, { borderColor: c.line2, backgroundColor: c.card }]}>
            <Icon name="search" size={15} color={c.ink3} />
            <TextInput value={search} onChangeText={setSearch} placeholder={PAGE.search} placeholderTextColor={c.faint} accessibilityLabel={PAGE.search}
              returnKeyType="search" style={[resolveType("body", scale), { flex: 1, color: c.ink, paddingVertical: 8 }]} />
          </View>
        </View>

        <View onLayout={e => { viewY.current = e.nativeEvent.layout.y; }}>
          {filtered.length === 0 ? (
            <View style={[styles.nomatch, { borderColor: c.line2 }]}>
              <T v="subhead">{NO_MATCH.title}</T>
              <T v="body" color={c.ink2}>{noMatchLine(noMatchBits(labels, search), events.length)}</T>
              <Pressable onPress={() => { setSearch(""); setTypeSet(new Set()); }} accessibilityRole="button"
                style={({ pressed }) => [styles.ghost, { borderColor: c.line2 }, pressed && pressedDim]}>
                <T v="buttonSm" color={c.ink2}>{NO_MATCH.clear}</T>
              </Pressable>
            </View>
          ) : view === "board" ? (
            <Lanes events={filtered} today={today} types={types} onOpen={setOpen} />
          ) : (
            <CalendarView events={filtered} today={today} types={types} officer={officer} onOpen={setOpen} />
          )}
        </View>

        <TimelineStrip events={events} today={today} types={types} onOpen={setOpen} />
      </>
    );
  }

  const calEvent = logFor?.calendarEventId
    ? [{ id: logFor.calendarEventId, title: logFor.title, date: logFor.dueDate ?? today, category: logFor.category } as unknown as CalendarEvent]
    : EMPTY;

  return (
    <Screen title={navLabel(me, "Programming")} back="More" scrollRef={scroll} onRefresh={() => Promise.all([q.refetch(), typesQ.refetch()])}>
      {dayOne ? (
        <PageBrief pill={pill} kicker={kicker} lead={PAGE.dayOneParts[0]} mark={PAGE.dayOneParts[1]} tail="" markTone="lilac" digest={null}
          quiet={null} sub={PAGE.dayOneLine} />
      ) : (
        <PageBrief pill={pill} kicker={kicker} lead={PAGE.titleParts[0]} mark={PAGE.titleParts[1]} tail={PAGE.titleParts[2]} markTone="lilac"
          sub={statusLine ? null : PAGE.nothing} />
      )}
      {!dayOne && statusLine ? <View style={{ marginTop: -6 }}>{statusLine}</View> : null}

      <View style={styles.acts}>
        {officer ? (
          <>
            <Pressable onPress={() => setIdea(true)} accessibilityRole="button"
              style={({ pressed }) => [styles.add, { borderColor: c.ink, backgroundColor: c.card }, pressed ? { transform: [{ translateX: 1 }, { translateY: 1 }] } : hard(c.note.fill.butter, 3)]}>
              <Icon name="plus" size={15} color={c.ink} />
              <T v="button" size={14} color={c.ink}>{PAGE.newIdea}</T>
            </Pressable>
            {!dayOne ? (
              <Pressable onPress={() => setForm({ editing: null })} accessibilityRole="button"
                style={({ pressed }) => [styles.add, { borderColor: c.ink, backgroundColor: c.ink }, pressed ? { transform: [{ translateX: 1 }, { translateY: 1 }] } : hard(c.pastel.lilac.fill, 3)]}>
                <Icon name="plus" size={15} color={c.paper} />
                <T v="button" size={14} color={c.paper}>{PAGE.newEvent}</T>
              </Pressable>
            ) : null}
          </>
        ) : null}
        {!dayOne ? (
          <Pressable onPress={() => setHelp(true)} accessibilityRole="button" accessibilityLabel={PAGE.help}
            style={({ pressed }) => [styles.help, { borderColor: c.line2 }, pressed && pressedDim]}>
            <T v="button" size={15} color={c.ink2}>?</T>
          </Pressable>
        ) : null}
      </View>

      {body}

      <EventSheet id={open} roster={roster.data ?? EMPTY} roles={roles.data ?? EMPTY} types={types} onClose={() => setOpen(null)}
        onEdit={e => setForm({ editing: e })} onDelete={setDoomed} onOpen={setStep} onLogTx={setLogFor} />
      <HelpSheet open={help} onClose={() => setHelp(false)} />
      {officer ? (
        <>
          <NewIdea open={idea} types={formTypes} onClose={() => setIdea(false)} onAdded={e => setOpen(e.id)} />
          <EventForm open={form != null} editing={form?.editing ?? null} types={formTypes} onClose={() => setForm(null)}
            onSaved={e => { if (!form?.editing) setOpen(e.id); }} />
          <FixStep target={step?.kind === "fix" ? step : null} roster={roster.data ?? EMPTY} roles={roles.data ?? EMPTY} types={formTypes} onClose={() => setStep(null)} />
          <WrapUp e={step?.kind === "wrap" ? step.e : null} onClose={() => setStep(null)} />
          <DeleteEvent e={doomed} onClose={() => setDoomed(null)} onDeleted={id => { if (open === id) setOpen(null); }} />
          <LedgerTxForm open={logFor != null} tx={null} catalog={catalog} terms={semq.data ?? EMPTY} activeTerm={me.org?.activeTerm?.label ?? null}
            events={calEvent} onClose={() => setLogFor(null)} lockType="expense" lockEventIds={logFor?.calendarEventId ? [logFor.calendarEventId] : []}
            initialDate={logFor?.dueDate ?? today} onSaved={() => { if (logFor?.calendarEventId) eventTxnsMoved(logFor.calendarEventId); }} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  act: { fontWeight: "600", textDecorationLine: "underline", textDecorationStyle: "dashed" },
  acts: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  add: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5 },
  help: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  measures: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  measure: { flexBasis: "47%", flexGrow: 1, gap: 6, borderWidth: 1.5, borderRadius: 18, padding: 16 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, minHeight: 38 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, minHeight: 42, width: "62%" },
  nomatch: { gap: 10, padding: 20, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", alignItems: "flex-start" },
  ghost: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, minHeight: 38, justifyContent: "center" },
});
