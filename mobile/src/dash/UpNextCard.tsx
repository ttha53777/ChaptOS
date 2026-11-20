/**
 * Up next: the web's dashboard card (app/components/dashboard/ledger/UpNext.tsx) as it
 * lays out on a phone (core-cards.css, `@container (max-width: 560px)`), not Today's old
 * ticket.
 *
 *   header   "Up next" · "in 2 days →" (whenLabel)
 *   ticket   stub (weekday, day, month on the type's hatched wash) | body (type chip and
 *            Required, title, time and place on their own lines, the first two facts),
 *            then the countdown along the bottom: "2 days", "3h 40m to go", "Now under
 *            way", "All day", with Open check-in on the day for anyone who can take it
 *   after    "After that" rule and the next two as small stubs: "in 5 days · 9:30 AM"
 *   empty    a dashed blank ticket: the last event, and Add an event for officers
 *
 * The rules (countdown, facts, agenda, when) are lib/dashboard/up-next, the web's own;
 * colours are lib/event-hue's, so a Social event is butter here and there. What reads a
 * schedule (start, over) is done with Date: a timed schedule's start/end are instants.
 *
 * Motion: the ticket lands like the web's `un-in` (rise 8px from -0.4°, spring); the
 * rows follow 70ms apart. Pressing pushes the ticket into its shadow, with a select
 * haptic. Reduced motion: no rise, a short fade.
 */
import type { CalEventType, CalendarEvent, LiveCheckIn } from "@/lib/api-types";
import { PAPER_HUE } from "@/lib/event-hue";
import {
  PHONE_FACTS, agendaPreview, countdownFrom, daysBetween, factsOf, untilLabel, whenLabel, type Fact,
} from "@/lib/dashboard/up-next";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { type Palette, type Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { clockLabel, startOf } from "~/today/time";
import { useNow } from "~/today/live";
import { T } from "~/ui/T";
import { DashCard } from "./Card";

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const FALLBACK = "#8a8f98";
/** A phone shows two after the next one (`.un-mini:nth-child(n + 3)` is hidden). */
const AFTER = 2;
const STUB = 92;
const DEFAULT_MINUTES = 60;

const FACT_ICON: Record<Fact["kind"], IconName> = {
  dress: "spark", theme: "star", guests: "people", capacity: "door", collabs: "hand", supplies: "bag", directions: "key",
  checklist: "check", budget: "wallet", contact: "chat", links: "link", custom: "note",
};

// ── when an event starts and ends, without Temporal ────────────────────────────────

type Sched = { kind: "allDay"; start: string; end: string } | { kind: "timed"; start: string; end?: string; timeZone: string };
const schedOf = (e: CalendarEvent) => (e.schedule ?? null) as Sched | null;

/** The start instant, or null for an all-day event / one with no readable time (lib/event-time startInstant). */
export function startAt(e: CalendarEvent): Date | null {
  const s = schedOf(e);
  if (s) return s.kind === "timed" ? new Date(s.start) : null;
  return startOf(e.date, e.time);
}

/** lib/event-time isEventOver: a schedule's end (start + an hour when none), else the day passing. */
export function isOver(e: CalendarEvent, today: string, now: number): boolean {
  const s = schedOf(e);
  if (!s) return e.date < today;
  if (s.kind === "allDay") return s.end <= today;
  const end = s.end ? Date.parse(s.end) : Date.parse(s.start) + DEFAULT_MINUTES * 60_000;
  return end <= now;
}

/** Chronological: date, then start, then id (lib/event-time compareEvents). */
export const byStart = (a: CalendarEvent, b: CalendarEvent) =>
  a.date.localeCompare(b.date) || (startAt(a)?.getTime() ?? 0) - (startAt(b)?.getTime() ?? 0) || a.id - b.id;

/** lib/up-next upcoming: still to come, soonest first, minus the event the live band carries. */
export function upcomingOf(events: CalendarEvent[], today: string, now: number, liveEventId: number | null): CalendarEvent[] {
  return events.filter(e => e.date >= today && !isOver(e, today, now) && e.id !== liveEventId).sort(byStart);
}

function lastPastOf(events: CalendarEvent[], today: string, now: number) {
  const past = events.filter(e => e.date <= today && isOver(e, today, now)).sort(byStart);
  const event = past[past.length - 1];
  return event ? { event, daysAgo: Math.max(0, daysBetween(event.date, today)) } : null;
}

/** "7:00 – 9:00 PM" (lib/event-time formatEventTime): the schedule in its own zone, else the typed time. */
export function timeText(e: CalendarEvent): string | null {
  const s = schedOf(e);
  if (s?.kind === "allDay") return null;
  if (s?.kind === "timed") {
    const wall = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: s.timeZone });
    if (!s.end) return wall(s.start);
    const [a, am] = wall(s.start).split(" "), [b, bm] = wall(s.end).split(" ");
    return am === bm ? `${a} – ${b} ${bm}` : `${a} ${am} – ${b} ${bm}`;
  }
  return clockLabel(e.time) ?? (e.time?.trim() || null);
}

// ── colour: lib/event-hue paperCatVars ─────────────────────────────────────────────

type Cat = { ink: string; fill: string; soft: string; bd: string };

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => { const x = h.replace("#", ""); const f = x.length === 3 ? x.split("").map(ch => ch + ch).join("") : x; return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16)); };
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v * t + B[i]! * (1 - t))).join(",")})`;
}

/** The pastel family the web names for built-in types; any other type mixed from its own colour. */
export function catOf(slug: string, type: CalEventType | undefined, c: Palette): Cat {
  const hue = PAPER_HUE[slug] as Tone | undefined;
  if (hue) { const p = c.pastel[hue]; return { ink: p.ink, fill: p.fill, soft: p.soft, bd: p.border }; }
  const hex = type?.colorDark ?? type?.color ?? FALLBACK;
  return { ink: mix(hex, c.ink, 0.82), fill: mix(hex, c.card, 0.38), soft: mix(hex, c.card, 0.1), bd: mix(hex, c.card, 0.3) };
}

// ── the card ───────────────────────────────────────────────────────────────────────

export function UpNextCard({ events, types, today, live, onSelect, onAll, onOpenCheckIn, onAddEvent, i }: {
  events: CalendarEvent[];
  types: CalEventType[] | undefined;
  today: string;
  live: LiveCheckIn | null;
  onSelect: (e: CalendarEvent) => void;
  onAll: () => void;
  /** Officers who can take attendance: Open check-in on the day. */
  onOpenCheckIn?: (e: CalendarEvent) => Promise<void>;
  /** Officers who can add events, with the events workflow on. */
  onAddEvent?: () => void;
  i: number;
}) {
  const now = useNow(true, false);
  const liveId = live && live.state !== "closed" ? live.event.id : null;
  const list = upcomingOf(events, today, now, liveId);
  const next = list[0];
  const typeOf = (slug: string) => types?.find(t => t.slug === slug);

  return (
    <DashCard icon="clock" tone="sky" title="Up next" i={i} onHead={onAll} right={next ? <AllLink label={whenLabel(next.date, today)} /> : undefined}>
      {!next ? (
        <Blank events={events} today={today} now={now} onAddEvent={onAddEvent} />
      ) : (
        <>
          <Ticket key={next.id} event={next} type={typeOf(next.category)} today={today} now={now} onSelect={onSelect} onOpenCheckIn={onOpenCheckIn} />
          {list.length > 1 ? <After events={list.slice(1, 1 + AFTER)} today={today} typeOf={typeOf} onSelect={onSelect} /> : null}
        </>
      )}
    </DashCard>
  );
}

/** `.rd-all`: the header's "in 2 days →", Inter 600 in the muted ink (not the mono kicker). */
function AllLink({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <T v="buttonSm" size={12.48} color={c.ink3}>{label}</T>
      <Icon name="arrow-r" size={12} color={c.ink3} />
    </View>
  );
}

/** The web's `un-in`: up 8px from a hair of tilt, on the spring. */
function useLand(delay: number) {
  const m = useMotion();
  const p = useSharedValue(0);
  useEffect(() => { p.value = withDelay(delay, withTiming(1, m.reduced ? m.timing(160, "out") : m.timing(500, "spring"))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const reduced = m.reduced;
  return useAnimatedStyle(() => ({
    opacity: p.value,
    transform: reduced ? [] : [{ translateY: (1 - p.value) * 8 }, { rotate: `${(1 - p.value) * -0.4}deg` }],
  }));
}

function Ticket({ event, type, today, now, onSelect, onOpenCheckIn }: {
  event: CalendarEvent; type: CalEventType | undefined; today: string; now: number;
  onSelect: (e: CalendarEvent) => void; onOpenCheckIn?: (e: CalendarEvent) => Promise<void>;
}) {
  const { c } = useTheme();
  const land = useLand(0);
  const [rowH, setRowH] = useState(0);
  const [busy, setBusy] = useState(false);
  const cat = catOf(event.category, type, c);
  const d = utc(event.date);
  const time = timeText(event);
  const facts = factsOf(event.details).slice(0, PHONE_FACTS);
  const bare = !factsOf(event.details).length && !agendaPreview(event.notesSeed);
  const cd = countdownFrom(event.date, startAt(event), today, new Date(now));
  const canOpen = cd.kind === "today" && !!onOpenCheckIn;

  const big = cd.kind === "days"
    ? { b: String(cd.days), s: cd.days === 1 ? "day" : "days", t: false }
    : cd.minutes == null ? { b: "All day", s: null, t: false }
    : cd.minutes > 0 ? { b: untilLabel(cd.minutes), s: "to go", t: true }
    : { b: "Now", s: "under way", t: false };

  const open = async () => {
    if (!onOpenCheckIn || busy) return;
    setBusy(true);
    await onOpenCheckIn(event);
    setBusy(false);
  };

  return (
    <Animated.View style={land}>
      <Pressable onPress={() => { haptics.select(); onSelect(event); }} accessibilityRole="button"
        accessibilityLabel={`${event.title}, ${whenLabel(event.date, today)}${time ? `, ${time}` : ""}${event.location ? `, ${event.location}` : ""}. ${big.b}${big.s ? ` ${big.s}` : ""}.`}
        accessibilityHint="Opens the event"
        style={({ pressed }) => [styles.tix, { borderColor: c.ink, backgroundColor: c.card, boxShadow: `${pressed ? 1 : 3}px ${pressed ? 1 : 3}px 0 ${cat.fill}` },
          pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
        <View style={styles.row} onLayout={e => setRowH(e.nativeEvent.layout.height)}>
          {/* the stub: weekday · day · month on the hatched wash */}
          <View style={[styles.stub, { backgroundColor: cat.soft }]}>
            <Hatch color={cat.ink} />
            <T v="kicker" size={10.56} ls={0.14} color={cat.ink}>{WD[d.getUTCDay()]!}</T>
            <T v="figure" size={36.8} lh={0.95} ls={-0.06} style={{ fontFamily: "Bricolage-700" }}>{String(d.getUTCDate())}</T>
            <T v="kicker" size={10.56} ls={0.14} color={cat.ink}>{MON[d.getUTCMonth()]!}</T>
          </View>
          {/* the body */}
          <View style={[styles.bd, bare && { justifyContent: "center", gap: 10 }]}>
            {type || event.mandatory ? (
              <View style={styles.tags}>
                {type ? (
                  <View style={[styles.tag, { borderColor: cat.bd, backgroundColor: cat.soft }]}>
                    <View style={[styles.dot, { backgroundColor: cat.ink }]} />
                    <T v="pill" size={11.2} color={cat.ink}>{type.label}</T>
                  </View>
                ) : null}
                {event.mandatory ? (
                  <View style={[styles.tag, { borderColor: c.pastel.rose.border, backgroundColor: c.pastel.rose.soft }]}>
                    <T v="pill" size={11.2} color={c.pastel.rose.ink}>Required</T>
                  </View>
                ) : null}
              </View>
            ) : null}
            <T v="title" size={bare ? 20.8 : 18.4} lh={1.1} ls={-0.035} numberOfLines={2}>{event.title}</T>
            <View style={{ gap: 3 }}>
              <Meta icon="clock" text={time ?? "All day"} />
              {event.location ? <Meta icon="pin" text={event.location} /> : null}
            </View>
            {facts.length ? (
              <View style={styles.facts}>
                {facts.map(f => (
                  <View key={f.kind} style={[styles.fact, f.open
                    ? { borderStyle: "dashed", borderColor: c.pastel.butter.border, backgroundColor: c.pastel.butter.soft }
                    : { borderColor: c.line, backgroundColor: c.card2 }]}>
                    <Icon name={FACT_ICON[f.kind]} size={14} color={f.open ? c.pastel.butter.ink : cat.ink} />
                    <T v="meta" size={12.48} color={c.ink2} style={{ flexShrink: 1 }}>
                      {`${f.label} `}<T v="meta" size={12.48} color={c.ink} style={{ fontFamily: "Inter-600" }}>{f.value}</T>
                    </T>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
        {/* the countdown, along the bottom */}
        <View style={styles.cd}>
          <View style={styles.big}>
            <T v="figure" size={big.t ? 30.4 : 21.6} lh={1} ls={-0.05} style={{ fontFamily: "Bricolage-700" }}>{big.b}</T>
            {big.s ? <T v="callout" size={13.76} color={c.ink2}>{big.s}</T> : null}
          </View>
          {canOpen ? (
            <Pressable onPress={() => void open()} disabled={busy} accessibilityRole="button" accessibilityLabel={`Open check-in for ${event.title}`}
              style={({ pressed }) => [styles.btn, { backgroundColor: c.ink, borderColor: c.ink, boxShadow: pressed ? undefined : `2px 2px 0 ${c.pastel.mint.fill}` },
                pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }, busy && { opacity: 0.6 }]}>
              <T v="buttonSm" size={13.1} color={c.paper}>{busy ? "Opening…" : "Open check-in"}</T>
            </Pressable>
          ) : null}
        </View>
        {/* the perforation: the stub's seam, the countdown's tear line, and the two punched notches */}
        {rowH ? <Perforation rowH={rowH} /> : null}
      </Pressable>
    </Animated.View>
  );
}

function Meta({ icon, text }: { icon: IconName; text: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.meta}>
      <Icon name={icon} size={14} color={c.ink3} />
      <T v="meta" size={13.12} color={c.ink2} numberOfLines={1} style={{ flexShrink: 1 }}>{text}</T>
    </View>
  );
}

/** `repeating-linear-gradient(-45deg, transparent 0 9px, ink 7% 9px 10px)`. */
function Hatch({ color }: { color: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <Pattern id="un-hatch" width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Line x1={9.5} y1={0} x2={9.5} y2={10} stroke={color} strokeOpacity={0.07} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#un-hatch)" />
    </Svg>
  );
}

/**
 * Dashed seams in ink and the notches (18px, card-filled, ink-rimmed, half shown) where
 * the seam meets the ticket's top edge and the tear line. Drawn over everything, as the
 * web's `.un-stub::before/::after` sit at z-index 2.
 */
function Perforation({ rowH }: { rowH: number }) {
  const { c } = useTheme();
  const x = STUB - 0.75;
  return (
    <>
      <Svg style={[StyleSheet.absoluteFill, { zIndex: 2 }]} width="100%" height="100%" pointerEvents="none">
        <Line x1={x} y1={0} x2={x} y2={rowH} stroke={c.ink} strokeWidth={1.5} strokeDasharray="4 3" />
        <Line x1={0} y1={rowH + 0.75} x2="100%" y2={rowH + 0.75} stroke={c.ink} strokeWidth={1.5} strokeDasharray="4 3" />
      </Svg>
      <View pointerEvents="none" style={[styles.notch, { top: -1.5, left: x - 9 }]}>
        <View style={[styles.hole, { top: -8.25, borderColor: c.ink, backgroundColor: c.card }]} />
      </View>
      <View pointerEvents="none" style={[styles.notch, { top: rowH - 8.25, left: x - 9 }]}>
        <View style={[styles.hole, { top: 0, borderColor: c.ink, backgroundColor: c.card }]} />
      </View>
    </>
  );
}

function After({ events, today, typeOf, onSelect }: {
  events: CalendarEvent[]; today: string; typeOf: (slug: string) => CalEventType | undefined; onSelect: (e: CalendarEvent) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: 16 }}>
      <View style={styles.afterH}>
        <T v="kicker" size={9.6} ls={0.14} color={c.ink3}>After that</T>
        <Svg height={2} style={{ flex: 1 }}>
          <Line x1={0} y1={1} x2="100%" y2={1} stroke={c.line2} strokeWidth={1.5} strokeDasharray="4 3" />
        </Svg>
      </View>
      <View style={{ gap: 10 }}>
        {events.map((e, i) => <Mini key={e.id} e={e} i={i} today={today} cat={catOf(e.category, typeOf(e.category), c)} onSelect={onSelect} />)}
      </View>
    </View>
  );
}

function Mini({ e, i, today, cat, onSelect }: { e: CalendarEvent; i: number; today: string; cat: Cat; onSelect: (e: CalendarEvent) => void }) {
  const { c } = useTheme();
  const land = useLand(i * 70 + 120);
  const d = utc(e.date);
  const line = [whenLabel(e.date, today), timeText(e) ?? "All day"].join(" · ");
  return (
    <Animated.View style={land}>
      <Pressable onPress={() => { haptics.select(); onSelect(e); }} accessibilityRole="button" accessibilityLabel={`${e.title}, ${line}`}
        style={({ pressed }) => [styles.mini, { borderColor: pressed ? c.ink : c.line, backgroundColor: c.card }, pressed && { transform: [{ translateY: 1 }] }]}>
        <View style={[styles.miniD, { backgroundColor: cat.soft, borderColor: cat.bd }]}>
          <T v="kicker" size={8.32} ls={0.1} color={cat.ink}>{WD[d.getUTCDay()]!}</T>
          <T v="figure" size={17.6} lh={1} ls={-0.04} style={{ fontFamily: "Bricolage-700", marginTop: 2 }}>{String(d.getUTCDate())}</T>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <T v="callout" size={13.44} style={{ fontFamily: "Inter-600" }} numberOfLines={1}>{e.title}</T>
          <T v="meta" size={11.52} color={c.ink3} numberOfLines={1}>{line}</T>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** `.un-blank` on a phone: no stub, a dashed outline, the last event, and Add an event. */
function Blank({ events, today, now, onAddEvent }: { events: CalendarEvent[]; today: string; now: number; onAddEvent?: () => void }) {
  const { c } = useTheme();
  const last = lastPastOf(events, today, now);
  const ago = !last ? "" : last.daysAgo === 0 ? "earlier today" : last.daysAgo === 1 ? "yesterday" : `${last.daysAgo} days ago`;
  return (
    <View style={[styles.blank, { borderColor: c.line2 }]}>
      <T v="title" size={20} lh={1.1} ls={-0.035}>{events.length ? "Nothing coming up" : "Nothing on the calendar yet"}</T>
      <T v="meta" size={13.76} color={c.ink2}>
        {last ? (
          <>
            {"The last thing was "}<T v="meta" size={13.76} color={c.ink} style={{ fontFamily: "Inter-600" }}>{last.event.title}</T>
            {`, ${ago}.${onAddEvent ? " Add the next one and it shows up here for everyone." : ""}`}
          </>
        ) : onAddEvent ? "Add the first event and it shows up here for everyone." : "When an officer adds an event, it shows up here."}
      </T>
      {onAddEvent ? (
        <Pressable onPress={onAddEvent} accessibilityRole="button" accessibilityLabel="Add an event"
          style={({ pressed }) => [styles.btn, styles.addBtn, { backgroundColor: c.ink, borderColor: c.ink, boxShadow: pressed ? undefined : `2px 2px 0 ${c.pastel.mint.fill}` },
            pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
          <Icon name="plus" size={13} color={c.paper} />
          <T v="buttonSm" size={12.8} color={c.paper}>Add an event</T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tix: { borderWidth: 1.5, borderRadius: 18 },
  row: { flexDirection: "row" },
  stub: { width: STUB, alignItems: "center", justifyContent: "center", gap: 1, paddingVertical: 16, paddingHorizontal: 8, borderTopLeftRadius: 16.5, overflow: "hidden" },
  bd: { flex: 1, minWidth: 0, paddingTop: 13, paddingRight: 14, paddingBottom: 13, paddingLeft: 16, gap: 6 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  fact: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 5, paddingLeft: 7, paddingRight: 10, borderRadius: 10, borderWidth: 1, maxWidth: "100%" },
  cd: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 14 },
  big: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap", flex: 1 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5 },
  notch: { position: "absolute", width: 18, height: 9.75, overflow: "hidden", zIndex: 3 },
  hole: { position: "absolute", left: 0, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5 },
  afterH: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  mini: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingLeft: 8, paddingRight: 10, borderRadius: 12, borderWidth: 1.5 },
  miniD: { width: 40, alignItems: "center", paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  blank: { gap: 6, paddingVertical: 18, paddingHorizontal: 18, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", minHeight: 150, justifyContent: "center" },
  addBtn: { alignSelf: "flex-start", marginTop: 6 },
});
