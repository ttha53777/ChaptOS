/**
 * The event form (the web's MeetingForm and the dashboard's New event, one sheet):
 *
 *   kind "meeting"   a chapter meeting: required by default, Repeat (weekly / every other
 *                    week through the end of the term), and the agenda it starts from
 *   kind "event"     New event from Create: a type chip row (the org's creatable types,
 *                    their workflow switched on), required follows the type's default
 *   editing          the same sheet filled from the event; no repeat, no agenda
 *
 * The title is typed onto the sheet like a ticket's name. When: a strip of day stubs
 * across the term (the meeting's usual weekday underlined) and a clock you step in
 * quarter hours, with the usual times one tap away, or "No set time". Times are the
 * chapter's (its zone), said under the clock when this phone is somewhere else.
 *
 * Saves go to POST /api/calendar or PATCH /api/calendar/[id] (MANAGE_EVENTS) with a
 * structured schedule; the server answers with words for anything it refuses (outside
 * the term, a name taken), shown under the button.
 */
import type { CalendarEvent } from "@/lib/api-types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from "react-native";
import Animated, { FadeIn, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { errorMessage } from "~/api/errors";
import { useCalendar, useEventTypes } from "~/data/calendar";
import { localDay } from "~/data/home";
import { createEvent, updateEvent, useAgendaTemplates, type EventBody, type NewEventBody } from "~/data/meetings";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { alpha, type Tone } from "~/theme/palette";
import { resolveType } from "~/theme/type";
import { useFontScale, useMotion, useTheme } from "~/theme/PaperProvider";
import { TickingNumber } from "~/paper/TickingNumber";
import { toneOf } from "~/timeline/model";
import { Field } from "~/ui/Field";
import { Segmented } from "~/ui/Segmented";
import { Switch } from "~/ui/Switch";
import { T } from "~/ui/T";
import {
  addDays, clock12, deviceZone, draftOf, eventDraft, isMeeting, meetingDraft, repeatDates, shortDate, wallToInstant, zoneName, type Draft,
} from "./model";

export type FormKind = "meeting" | "event";

const QUICK = [18 * 60, 18 * 60 + 30, 19 * 60, 19 * 60 + 30, 20 * 60, 20 * 60 + 30, 21 * 60];
type RepeatMode = "off" | "1" | "2";

export function EventForm({ open, kind, editing, onClose, onSaved }: {
  open: boolean; kind: FormKind; editing?: CalendarEvent | null; onClose: () => void;
  /** After a successful save (the sheet has closed): the new event's id. */
  onSaved?: (id: number) => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const me = useEntryOf("ready")?.me ?? null;
  const cal = useCalendar();
  const types = useEventTypes();
  const isNew = !editing;
  const asMeeting = kind === "meeting" || (!!editing && isMeeting(editing));
  const templates = useAgendaTemplates(open && isNew && asMeeting);
  const today = localDay();
  const term = me?.org?.activeTerm ?? null;
  const zone = me?.org?.timeZone || deviceZone();

  const [d, setD] = useState<Draft>(() => eventDraft(today));
  const [category, setCategory] = useState<string>("chapter");
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [agenda, setAgenda] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const titleTouched = useRef(false);

  const creatable = useMemo(() => {
    const wf = me?.org?.enabledWorkflows ?? [];
    return (types.data ?? []).filter(t => t.creatable && !t.hidden && (!t.workflowId || wf.includes(t.workflowId)))
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }, [types.data, me]);

  // fresh draft each time it opens
  useEffect(() => {
    if (!open) return;
    titleTouched.current = !!editing;
    setErr(null); setBusy(false); setRepeat("off");
    if (editing) { setD(draftOf(editing, zone)); setCategory(editing.category); return; }
    if (asMeeting) { setD(meetingDraft(cal.data ?? [], today, term)); setCategory("chapter"); return; }
    const first = creatable.find(t => t.slug !== "chapter") ?? creatable[0];
    setCategory(first?.slug ?? "chapter");
    setD({ ...eventDraft(today), mandatory: first?.mandatoryDefault ?? false });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // the default agenda, once the templates arrive; the title follows it until typed over
  useEffect(() => {
    if (!open || !isNew || !asMeeting || !templates.data) return;
    const t = templates.data.find(x => x.isDefault);
    setAgenda(t ? t.id : "");
    if (t && !titleTouched.current) setD(x => ({ ...x, title: t.name }));
  }, [open, templates.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const takenDates = useMemo(() => new Set((cal.data ?? []).filter(isMeeting).filter(e => e.id !== editing?.id).map(e => e.date)), [cal.data, editing]);
  const usualDow = useMemo(() => {
    const n = new Map<number, number>();
    for (const e of (cal.data ?? []).filter(isMeeting)) { const k = new Date(`${e.date}T12:00:00`).getDay(); n.set(k, (n.get(k) ?? 0) + 1); }
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [cal.data]);

  // the rooms this chapter uses most (for its meetings, or for this kind of event), one tap each
  const rooms = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of cal.data ?? []) {
      if (asMeeting ? !isMeeting(e) : e.category !== category) continue;
      const r = (e.location ?? "").trim();
      if (r) n.set(r, (n.get(r) ?? 0) + 1);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r).filter(r => r !== d.location.trim()).slice(0, 3);
  }, [cal.data, asMeeting, category, d.location]);

  const until = term?.endDate ?? addDays(d.date, 7 * 12);
  const dates = repeat === "off" ? [d.date] : repeatDates(d.date, repeat === "1" ? 1 : 2, until);
  const doubled = repeat === "off" ? [] : dates.filter(x => takenDates.has(x));
  const outside = !!term && (d.date < term.startDate || d.date > term.endDate);
  const canSave = !!d.title.trim() && !busy && !outside;

  const save = async () => {
    if (!canSave || !me) return;
    setBusy(true); setErr(null);
    const schedule: EventBody["schedule"] = d.minutes == null
      ? { kind: "allDay", start: d.date, end: addDays(d.date, 1) }
      : { kind: "timed", start: wallToInstant(d.date, d.minutes, zone), timeZone: zone };
    const base: EventBody = {
      title: d.title.trim(), date: d.date, schedule,
      time: d.minutes == null ? null : `${String(Math.floor(d.minutes / 60)).padStart(2, "0")}:${String(d.minutes % 60).padStart(2, "0")}`,
      location: d.location.trim() || null, mandatory: d.mandatory,
    };
    try {
      if (editing) {
        await updateEvent(editing.id, base);
        haptics.success();
        onClose();
        toast.show(asMeeting ? "Meeting updated" : "Event updated", { detail: `${base.title} · ${shortDate(base.date)}` });
        onSaved?.(editing.id);
      } else {
        const body: NewEventBody = {
          ...base, category: asMeeting ? "chapter" : category, description: "",
          ...(asMeeting ? { agendaTemplateId: agenda === "" ? null : agenda } : {}),
          ...(repeat !== "off" && d.minutes != null ? { repeat: { every: repeat === "1" ? 1 : 2, until } } : {}),
        };
        const r = await createEvent(body);
        haptics.success();
        onClose();
        const last = r.series[r.series.length - 1];
        toast.show(r.series.length
          ? `${r.series.length + 1} meetings added`
          : asMeeting ? "Meeting added" : "Event added",
        { detail: r.series.length && last ? `${shortDate(r.date)} to ${shortDate(last.date)} · on the Timeline too.` : `${shortDate(r.date)} · it's on the Timeline too.` });
        onSaved?.(r.id);
      }
    } catch (e) {
      haptics.error();
      setErr(errorMessage(e, "Couldn't save that. Try again."));
      setBusy(false);
    }
  };

  const label = editing ? "Save changes" : repeat !== "off" && d.minutes != null && dates.length > 1 ? `Add ${dates.length} meetings` : asMeeting ? "Add meeting" : "Add event";
  const tone: Tone = asMeeting ? "sky" : toneOf(category);

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone={tone} icon={asMeeting ? "gavel" : "cal"}
      kicker={editing ? (asMeeting ? "Edit meeting" : "Edit event") : asMeeting ? "New chapter meeting" : "New event"}
      title={editing ? editing.title : asMeeting ? "Add meeting" : "New event"}
      footer={
        <View style={{ flex: 1, gap: 6 }}>
          {err ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T> : null}
          <Button label={busy ? "Saving…" : label} icon={editing ? "check" : "plus"} tone={tone} block onPress={() => void save()} disabled={!canSave} />
        </View>
      }>
      <View style={{ gap: 20 }}>
        <TitleLine value={d.title} placeholder={asMeeting ? "Meeting name" : "What's happening"}
          onChange={t => { titleTouched.current = true; setD(x => ({ ...x, title: t })); }} autoFocus={!editing && !asMeeting} />

        {!asMeeting && isNew && creatable.length ? (
          <Row icon="flag" label="Kind">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
              {creatable.map(t => {
                const on = t.slug === category;
                const p = c.pastel[toneOf(t.slug)];
                return (
                  <Pressable key={t.slug} onPress={() => { haptics.select(); setCategory(t.slug); setD(x => ({ ...x, mandatory: t.mandatoryDefault })); }}
                    accessibilityRole="radio" accessibilityState={{ selected: on }}
                    style={[styles.chip, { borderColor: on ? c.ink : p.border, backgroundColor: on ? p.soft : c.card }]}>
                    <View style={[styles.dot, { backgroundColor: p.ink }]} />
                    <T v="pill" color={on ? c.ink : c.ink2}>{t.label}</T>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Row>
        ) : null}

        <Row icon="cal" label="Day">
          <DayStrip value={d.date} onChange={date => setD(x => ({ ...x, date }))} today={today} term={term} usualDow={usualDow} taken={takenDates} editing={!!editing} open={open} />
          {outside ? <T v="meta" color={c.pastel.rose.ink}>{`That's outside ${term?.label ?? "the term"}. Pick a day inside it.`}</T> : null}
        </Row>

        <Row icon="clock" label="Time">
          <Clock minutes={d.minutes} onChange={minutes => setD(x => ({ ...x, minutes }))} tone={tone} />
          {zone !== deviceZone() ? <T v="meta" color={c.ink3}>{`In the chapter's time (${zoneName(zone)}).`}</T> : null}
        </Row>

        {isNew && asMeeting ? (
          <Row icon="refresh" label="Repeat">
            <Segmented<RepeatMode> label="Repeat" value={repeat} onChange={v => setRepeat(v)}
              options={[{ value: "off", label: "Once" }, { value: "1", label: "Weekly" }, { value: "2", label: "Every other week" }]} />
            {repeat !== "off" ? (
              <Animated.View key={repeat} entering={FadeIn.duration(m.t(180)).reduceMotion(ReduceMotion.Never)}>{d.minutes == null
                ? <T v="meta" color={c.ink3}>Pick a time to repeat it.</T>
                : <T v="meta" color={doubled.length ? c.pastel.rose.ink : c.ink3}>
                    {`${dates.length} meetings, ${shortDate(dates[0]!)} to ${shortDate(dates[dates.length - 1]!)}${term ? `, through ${term.label}` : ""}.`}
                    {doubled.length ? ` ${doubled.map(shortDate).join(", ")} already ${doubled.length === 1 ? "has" : "have"} a meeting.` : ""}
                  </T>}</Animated.View>
            ) : null}
          </Row>
        ) : null}

        <View style={{ gap: 8 }}>
          <Field label="Where" value={d.location} onChangeText={t => setD(x => ({ ...x, location: t }))} placeholder="Chapter room" maxLength={200} />
          {rooms.length ? (
            <View style={styles.rooms}>
              {rooms.map(r => (
                <Pressable key={r} onPress={() => { haptics.select(); setD(x => ({ ...x, location: r })); }} accessibilityRole="button" accessibilityLabel={`Use ${r}`}
                  style={({ pressed }) => [styles.room, { borderColor: pressed ? c.ink : c.line2, backgroundColor: c.card }]}>
                  <Icon name="pin" size={12} color={c.ink3} />
                  <T v="pill" color={c.ink2} numberOfLines={1} style={{ maxWidth: 180 }}>{r}</T>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View style={[styles.req, { borderColor: d.mandatory ? c.pastel.peach.border : c.line, backgroundColor: c.card }]}>
          <Wash on={d.mandatory} color={c.pastel.peach.soft} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="callout">Required attendance</T>
            <T v="meta" color={c.ink3}>{d.mandatory ? "Counts toward standing; excuses go to review." : "Optional: no roll, and nobody's standing moves."}</T>
          </View>
          <Switch value={d.mandatory} onChange={v => setD(x => ({ ...x, mandatory: v }))} tone="peach" label="Required attendance" />
        </View>

        {isNew && asMeeting && templates.data && templates.data.length ? (
          <Row icon="sheet" label="Agenda">
            <View style={{ gap: 8 }}>
              {[...templates.data.map(t => ({ id: t.id as number | "", name: t.name, line: t.description || `${sectionsIn(t.body)} sections`, star: t.isDefault })),
                { id: "" as const, name: "Blank", line: "The notes start empty", star: false }].map(t => {
                const on = agenda === t.id;
                return (
                  <Pressable key={String(t.id)} onPress={() => {
                    haptics.select(); setAgenda(t.id);
                    if (!titleTouched.current) setD(x => ({ ...x, title: t.id === "" ? "Chapter Meeting" : t.name }));
                  }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                    style={[styles.agenda, { borderColor: on ? c.ink : c.line, backgroundColor: on ? c.pastel.sky.soft : c.card }]}>
                    <Icon name={t.id === "" ? "note" : "sheet"} size={16} color={on ? c.pastel.sky.ink : c.ink3} />
                    <View style={{ flex: 1 }}>
                      <T v="callout" numberOfLines={1}>{t.name}{t.star ? "  ★" : ""}</T>
                      <T v="meta" color={c.ink3} numberOfLines={1}>{t.line}</T>
                    </View>
                    {on ? <Icon name="check" size={15} color={c.ink} /> : null}
                  </Pressable>
                );
              })}
              <T v="meta" color={c.ink3}>The agenda is copied into the meeting's notes, with its date, time and place filled in.</T>
            </View>
          </Row>
        ) : null}
      </View>
    </Sheet>
  );
}

/** A tint that fades in under a card when it turns on (opacity only, so it rides the switch). */
function Wash({ on, color }: { on: boolean; color: string }) {
  const m = useMotion();
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => { v.value = withTiming(on ? 1 : 0, m.timing(m.reduced ? 140 : 220, "out")); }, [on, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]} />;
}

const sectionsIn = (body: string) => body.split("\n").filter(l => /^\s{0,3}#{1,6}\s/.test(l)).length;

/* ── pieces ───────────────────────────────────────────────────────────────────── */

function TitleLine({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (t: string) => void; placeholder: string; autoFocus?: boolean }) {
  const { c } = useTheme();
  const scale = useFontScale();
  return (
    <View style={[styles.titleWrap, { borderBottomColor: c.ink }]}>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.faint} maxLength={200} autoFocus={autoFocus}
        accessibilityLabel="Title" returnKeyType="done"
        style={[resolveType("title", scale), { color: c.ink, paddingVertical: 6 }]} />
    </View>
  );
}

function Row({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.rowHead}>
        <Icon name={icon} size={14} color={c.ink3} />
        <T v="label" color={c.ink3}>{label}</T>
      </View>
      {children}
    </View>
  );
}

/**
 * Day stubs across the term: weekday, the date, the month when it turns. The chosen stub
 * inks in (an ink layer fading up) and tips −3° on the pop spring; the strip glides to
 * centre it. It re-centres on the chosen day every time the sheet opens.
 * Reduced: the ink fades, no tilt or glide.
 */
const STUB = 54, GAP = 8;

export function DayStrip({ value, onChange, today, term, usualDow, taken, editing, open }: {
  value: string; onChange: (d: string) => void; today: string; term: { startDate: string; endDate: string } | null;
  usualDow: number | null; taken: Set<string>; editing: boolean; open: boolean;
}) {
  const m = useMotion();
  const ref = useRef<ScrollViewInstance>(null);
  const [w, setW] = useState(0);
  const start = term ? (editing ? term.startDate : (today > term.startDate ? today : term.startDate)) : addDays(today, editing ? -60 : 0);
  const end = term ? term.endDate : addDays(today, 120);
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = start; d <= end && out.length < 200; d = addDays(d, 1)) out.push(d);
    if (!out.includes(value)) out.unshift(value);
    return out;
  }, [start, end, value]);
  const center = (i: number, animated: boolean) => ref.current?.scrollTo({ x: Math.max(0, i * (STUB + GAP) - (w - STUB) / 2), animated });
  useEffect(() => {
    if (!open || !w) return;
    const t = setTimeout(() => center(Math.max(0, days.indexOf(value)), false), 0);
    return () => clearTimeout(t);
  }, [open, w]); // eslint-disable-line react-hooks/exhaustive-deps

  const long = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} onLayout={e => setW(e.nativeEvent.layout.width)}
      contentContainerStyle={{ gap: GAP, paddingVertical: 6, paddingHorizontal: 2 }} accessibilityLabel={`Day, ${long(value)}`}>
      {days.map((d, i) => (
        <DayStub key={d} d={d} on={d === value} first={i === 0 || d.slice(8) === "01"}
          usual={usualDow != null && new Date(`${d}T12:00:00`).getDay() === usualDow} taken={taken.has(d)} label={long(d)}
          onPress={() => { if (d === value) return; haptics.select(); onChange(d); center(i, !m.reduced); }} />
      ))}
    </ScrollView>
  );
}

function DayStub({ d, on, first, usual, taken, label, onPress }: { d: string; on: boolean; first: boolean; usual: boolean; taken: boolean; label: string; onPress: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    v.value = m.reduced ? withTiming(on ? 1 : 0, m.timing(140, "out")) : on ? withSpring(1, m.spring("pop")) : withTiming(0, m.timing(160, "out"));
  }, [on, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const ink = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, v.value)) }));
  const lift = useAnimatedStyle(() => (m.reduced ? {} : { transform: [{ rotate: `${-3 * v.value}deg` }, { translateY: -2 * v.value }] }));
  const dt = new Date(`${d}T12:00:00`);
  const fg = on ? c.paper : c.ink;
  return (
    <Animated.View style={lift}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}${taken ? ", has a meeting" : ""}`} accessibilityState={{ selected: on }}
        style={({ pressed }) => [styles.stub, { width: STUB, borderColor: on ? c.ink : pressed ? c.line2 : c.line, backgroundColor: c.card }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.ink, borderRadius: 11.5 }, ink]} />
        <T v="kicker" color={on ? alpha(c.paper, 0.8) : first ? c.pastel.sky.ink : c.ink3} style={{ fontSize: 9.5 }}>
          {first ? dt.toLocaleDateString(undefined, { month: "short" }) : dt.toLocaleDateString(undefined, { weekday: "short" })}
        </T>
        <T v="title" color={fg} style={{ fontSize: 20, lineHeight: 24 }}>{String(dt.getDate())}</T>
        <View style={[styles.mark, { backgroundColor: taken ? (on ? c.paper : c.pastel.sky.ink) : usual ? alpha(on ? c.paper : c.ink, 0.22) : "transparent" }]} />
      </Pressable>
    </Animated.View>
  );
}

/**
 * The clock: a figure that ticks (only the changed digits roll, up when later, down when
 * earlier), stepped a quarter hour per tap; hold a step button and it keeps going, a
 * detent haptic per quarter. The usual evening times are chips; or no set time.
 */
export function Clock({ minutes, onChange, tone }: { minutes: number | null; onChange: (m: number | null) => void; tone: Tone }) {
  const { c } = useTheme();
  const cur = useRef(minutes);
  cur.current = minutes;
  const [dir, setDir] = useState<1 | -1>(1);
  const step = (n: number) => {
    haptics.select();
    const next = ((cur.current ?? 19 * 60) + n + 1440) % 1440;
    cur.current = next;
    setDir(n > 0 ? 1 : -1);
    onChange(next);
  };
  const pick = (q: number | null) => {
    if (q === minutes) return;
    haptics.select();
    if (q != null && minutes != null) setDir(q > minutes ? 1 : -1);
    onChange(q);
  };
  const face = minutes == null ? null : clock12(minutes);
  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.clock, { borderColor: c.ink, backgroundColor: c.card }]}>
        <StepBtn glyph="−" label="Fifteen minutes earlier" onStep={() => step(-15)} />
        <View style={{ flex: 1, alignItems: "center" }} accessible accessibilityLiveRegion="polite" accessibilityLabel={face ?? "No set time"}>
          {face ? (
            <View style={styles.face}>
              <TickingNumber value={face.replace(/ (AM|PM)$/, "")} v="figure" direction={dir} />
              <T v="mono" color={c.ink3} style={styles.ampm}>{face.slice(-2)}</T>
            </View>
          ) : <T v="title" color={c.ink3} style={{ paddingVertical: 8 }}>All day</T>}
        </View>
        <StepBtn glyph="+" label="Fifteen minutes later" onStep={() => step(15)} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingHorizontal: 1 }}>
        {QUICK.map(q => {
          const on = minutes === q;
          return (
            <Pressable key={q} onPress={() => pick(q)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={clock12(q)}
              style={[styles.qt, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel[tone].soft : c.card }]}>
              <T v="mono" color={on ? c.ink : c.ink2} style={{ fontSize: 12.5 }}>{clock12(q).replace(":00", "")}</T>
            </Pressable>
          );
        })}
        <Pressable onPress={() => pick(minutes == null ? 19 * 60 : null)} accessibilityRole="radio" accessibilityState={{ selected: minutes == null }}
          style={[styles.qt, { borderColor: minutes == null ? c.ink : c.line2, backgroundColor: minutes == null ? c.pastel[tone].soft : c.card, borderStyle: minutes == null ? "solid" : "dashed" }]}>
          <T v="mono" color={minutes == null ? c.ink : c.ink2} style={{ fontSize: 12.5 }}>No set time</T>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** A round step button: a tap is one step; held, it repeats every 120ms until let go. */
function StepBtn({ glyph, label, onStep }: { glyph: string; label: string; onStep: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const press = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stop, []);
  const face = useAnimatedStyle(() => ({ transform: [{ translateX: 2 * press.value }, { translateY: 2 * press.value }] }));
  return (
    <Pressable onPress={onStep} delayLongPress={380}
      onLongPress={() => { stop(); timer.current = setInterval(onStep, 120); }}
      onPressIn={() => { press.value = withTiming(1, m.timing(70, "out")); }}
      onPressOut={() => { stop(); press.value = withTiming(0, m.timing(m.reduced ? 90 : 200, "spring")); }}
      accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Hold to keep stepping" hitSlop={6}>
      <View style={[styles.step, { backgroundColor: c.note.fill[glyph === "+" ? "mint" : "peach"], borderColor: c.ink, position: "absolute", left: 2, top: 2 }]} />
      <Animated.View style={[styles.step, { borderColor: c.ink, backgroundColor: c.card }, face]}>
        <T v="title" style={{ fontSize: 22, lineHeight: 26 }}>{glyph}</T>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleWrap: { borderBottomWidth: 1.5, paddingBottom: 2 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 13, minHeight: 38 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stub: { alignItems: "center", paddingTop: 7, paddingBottom: 6, borderRadius: 13, borderWidth: 1.5, gap: 1, overflow: "hidden" },
  mark: { width: 16, height: 3, borderRadius: 2, marginTop: 3 },
  clock: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingLeft: 10, paddingRight: 12, borderRadius: 18, borderWidth: 1.5 },
  step: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  face: { flexDirection: "row", alignItems: "flex-end", gap: 5 },
  ampm: { fontSize: 13, marginBottom: 7, letterSpacing: 1 },
  rooms: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  room: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 11, minHeight: 32 },
  qt: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, minHeight: 34, justifyContent: "center" },
  req: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, overflow: "hidden" },
  agenda: { flexDirection: "row", alignItems: "center", gap: 11, padding: 12, borderRadius: 14, borderWidth: 1.5 },
});
