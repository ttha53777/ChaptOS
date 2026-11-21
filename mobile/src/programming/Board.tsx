/**
 * The page's views, each the web's own component at phone width:
 *
 *   Lanes          ProgrammingBoard (dusk), stacked: dot, name, eye/padlock, count;
 *                  "Nothing here"; Done shows six, then "+N more wrapped" / "Show less"
 *                  (the "which half the chapter sees" bracket is hidden under 900px)
 *   CalendarView   UndatedRail first ("No date yet", the hint, its rows, the foot line),
 *                  then the month: ‹ month › Today, the legend, SUN…SAT, a dot per event
 *   TimelineStrip  "On the chapter timeline · what everyone sees · N published", the
 *                  published events as tickets in a row you swipe
 *   DayOne         the four figures following one sample event through the lanes, then
 *                  "Write your first idea" (officers) or the member line
 *
 * Every tap opens an event (navigation: no haptic). The drag-to-move and drag-to-date
 * of the desktop board don't exist on a phone (the web's touch board can't drag
 * either), so nothing here drags.
 */
import type { CalEventType, ProgrammingEvent } from "@/lib/api-types";
import { memo, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Icon } from "~/icons/Icon";
import { pressedDim } from "~/motion/press";
import { Button } from "~/paper/Button";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { EventCard } from "./Card";
import {
  BOARD, CALENDAR, DAY_ONE, DONE_LIMIT, STAGES, STAGE_LABELS, STAGE_TONE, TIMELINE, byStage, dayOneInitials, dayOneWhen, eventTime,
  monthShort, monthTitle, ownerShortLabel, publishedOf, stubLine, undatedFoot, undatedOf,
  typeCat,
} from "./model";

type Ev = ProgrammingEvent;

/* ── lanes ─────────────────────────────────────────────────────────────────────── */

export function Lanes({ events, today, types, onOpen }: { events: Ev[]; today: string; types?: CalEventType[]; onOpen: (id: number) => void }) {
  const { c } = useTheme();
  const lanes = useMemo(() => byStage(events), [events]);
  const [allDone, setAllDone] = useState(false);
  return (
    <View style={{ gap: 14 }}>
      {STAGES.map(stage => {
        const items = lanes[stage];
        const pub = stage === "confirmed" || stage === "done";
        const visible = stage === "done" && !allDone ? items.slice(0, DONE_LIMIT) : items;
        const hidden = stage === "done" ? items.length - visible.length : 0;
        const tone = STAGE_TONE[stage];
        return (
          <View key={stage} style={[styles.lane, { borderColor: c.line2, backgroundColor: alpha(c.paper2, 0.6), borderStyle: pub ? "solid" : "dashed" }]}>
            <View style={styles.laneHead} accessibilityRole="header" accessibilityLabel={`${STAGE_LABELS[stage]}, ${items.length}`}>
              <View style={[styles.laneDot, tone ? { borderColor: c.pastel[tone].ink } : { borderColor: c.faint, borderStyle: "dashed" }]} />
              <T v="subhead" size={18}>{STAGE_LABELS[stage]}</T>
              <Icon name={pub ? "eye" : "lock"} size={12} color={pub ? c.pastel.lilac.ink : c.ink3} />
              <View style={{ flex: 1 }} />
              <View style={[styles.count, { borderColor: c.line2, backgroundColor: c.card }]}>
                <T v="mono" size={11} color={c.ink3}>{String(items.length)}</T>
              </View>
            </View>
            {!items.length ? (
              <T v="meta" color={c.ink3} align="center" style={{ paddingVertical: 14 }}>{BOARD.laneEmpty}</T>
            ) : (
              <View style={{ gap: 12 }}>
                {visible.map((e, i) => <EventCard key={e.id} e={e} i={i} today={today} types={types} onPress={() => onOpen(e.id)} />)}
                {hidden > 0 ? <MoreBtn label={BOARD.more(hidden)} onPress={() => setAllDone(true)} /> : null}
                {stage === "done" && allDone && items.length > DONE_LIMIT ? <MoreBtn label={BOARD.less} onPress={() => setAllDone(false)} /> : null}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function MoreBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.more, { borderColor: c.line2 }, pressed && pressedDim]}>
      <T v="buttonSm" color={c.ink3}>{label}</T>
    </Pressable>
  );
}

/* ── calendar ──────────────────────────────────────────────────────────────────── */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({ events, today, types, officer, onOpen }: { events: Ev[]; today: string; types?: CalEventType[]; officer: boolean; onOpen: (id: number) => void }) {
  const { c } = useTheme();
  const [ym, setYm] = useState(today.slice(0, 7));
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const shift = (d: number) => {
    const m0 = month - 1 + d;
    const y = year + Math.floor(m0 / 12);
    const m = ((m0 % 12) + 12) % 12 + 1;
    setYm(`${y}-${String(m).padStart(2, "0")}`);
  };
  const byDay = useMemo(() => {
    const map = new Map<string, Ev[]>();
    for (const e of events) if (e.dueDate) map.set(e.dueDate, [...(map.get(e.dueDate) ?? []), e]);
    return map;
  }, [events]);
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const out: (string | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= days; d++) out.push(`${ym}-${String(d).padStart(2, "0")}`);
    while (out.length % 7) out.push(null);
    return out;
  }, [year, month, ym]);
  const rows = useMemo(() => Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7)), [cells]);

  return (
    <View style={{ gap: 14 }}>
      <UndatedRail events={events} types={types} officer={officer} onOpen={onOpen} />
      <View style={[styles.cal, { borderColor: c.ink, backgroundColor: c.card }, hard(c.pastel.lilac.fill, 4)]}>
        <View style={styles.calHead}>
          <NavBtn icon="chev-l" label="Previous month" onPress={() => shift(-1)} />
          <T v="title" size={21} style={{ flexShrink: 1 }}>{monthTitle(year, month - 1)}</T>
          <NavBtn icon="chev-r" label="Next month" onPress={() => shift(1)} />
          <Pressable onPress={() => setYm(today.slice(0, 7))} accessibilityRole="button"
            style={({ pressed }) => [styles.todayBtn, { borderColor: c.line2, backgroundColor: c.paper2 }, pressed && pressedDim]}>
            <T v="buttonSm" color={c.ink2}>{CALENDAR.today}</T>
          </Pressable>
        </View>
        <View style={styles.key}>
          <View style={styles.keyBit}><View style={[styles.keyBox, { borderColor: c.ink3, borderStyle: "dashed" }]} /><T v="meta" size={12} color={c.ink3}>{CALENDAR.notOn}</T></View>
          <View style={styles.keyBit}><View style={[styles.keyBox, { borderColor: c.ink3 }]} /><T v="meta" size={12} color={c.ink3}>{CALENDAR.on}</T></View>
        </View>
        <View style={[styles.dow, { borderColor: c.line, backgroundColor: c.paper2 }]}>
          {DOW.map(d => <T key={d} v="kicker" size={10} color={c.ink3} align="center" style={{ flex: 1 }}>{d.toUpperCase()}</T>)}
        </View>
        {rows.map((r, ri) => (
          <View key={ri} style={styles.week}>
            {r.map((day, di) => {
              const list = day ? byDay.get(day) ?? [] : [];
              const past = !!day && day < today;
              return (
                <View key={di} style={[styles.cell, { borderColor: c.line, backgroundColor: day == null ? "transparent" : past ? alpha(c.paper2, 0.5) : c.card }, di === 0 && { borderLeftWidth: 0 }]}>
                  {day ? (
                    <>
                      <View style={[styles.dnum, day === today && { backgroundColor: c.ink }]}>
                        <T v="mono" size={11} color={day === today ? c.paper : c.ink3}>{String(Number(day.slice(-2)))}</T>
                      </View>
                      <View style={styles.dots}>
                        {list.map(e => {
                          const cat = typeCat(e.category, types, c);
                          return (
                            <Pressable key={e.id} onPress={() => onOpen(e.id)} hitSlop={6} accessibilityRole="button" accessibilityLabel={e.title} style={({ pressed }) => [pressed && pressedDim]}>
                              <View style={[styles.dot, { backgroundColor: cat.ink }]} />
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function NavBtn({ icon, label, onPress }: { icon: "chev-l" | "chev-r"; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => [styles.nav, { borderColor: c.line2, backgroundColor: c.card }, pressed && pressedDim]}>
      <Icon name={icon} size={14} color={c.ink2} />
    </Pressable>
  );
}

function UndatedRail({ events, types, officer, onOpen }: { events: Ev[]; types?: CalEventType[]; officer: boolean; onOpen: (id: number) => void }) {
  const { c } = useTheme();
  const undated = useMemo(() => undatedOf(events), [events]);
  return (
    <View style={[styles.rail, { borderColor: c.line2, backgroundColor: alpha(c.paper2, 0.6) }]}>
      <View style={styles.laneHead}>
        <T v="subhead" size={18} style={{ flex: 1 }}>{CALENDAR.undated}</T>
        <View style={[styles.count, { borderColor: c.line2, backgroundColor: c.card }]}><T v="mono" size={11} color={c.ink3}>{String(undated.length)}</T></View>
      </View>
      {undated.length > 0 && officer ? <T v="meta" color={c.ink3}>{CALENDAR.dropHint}</T> : null}
      {undated.map(e => {
        const cat = typeCat(e.category, types, c);
        const tone = STAGE_TONE[e.stage];
        return (
          <Pressable key={e.id} onPress={() => onOpen(e.id)} accessibilityRole="button"
            style={({ pressed }) => [styles.railRow, { borderColor: c.line2, backgroundColor: c.card, borderLeftColor: cat.ink }, pressed && pressedDim]}>
            <T v="callout" style={{ fontWeight: "600" }} numberOfLines={1}>{e.title}</T>
            <View style={styles.railMeta}>
              <T v="kicker" size={10} color={tone ? c.pastel[tone].ink : c.ink3}>{STAGE_LABELS[e.stage]}</T>
              <T v="meta" size={12} color={c.ink3} numberOfLines={1} style={{ flexShrink: 1 }}>{ownerShortLabel(e.owner) ?? BOARD.noOwner}</T>
            </View>
          </Pressable>
        );
      })}
      <View style={[styles.railFoot, { borderTopColor: c.line2 }]}>
        <T v="meta" color={c.ink2}>{undatedFoot(undated)}</T>
      </View>
    </View>
  );
}

/* ── timeline strip ────────────────────────────────────────────────────────────── */

export function TimelineStrip({ events, today, types, onOpen }: { events: Ev[]; today: string; types?: CalEventType[]; onOpen: (id: number) => void }) {
  const { c } = useTheme();
  const pub = useMemo(() => publishedOf(events), [events]);
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.tlHead}>
        <T v="title" size={21}>{TIMELINE.label}</T>
        <T v="meta" color={c.ink3}>{TIMELINE.sub}</T>
        <View style={{ flex: 1 }} />
        <T v="mono" size={11.5} color={c.ink3}>{TIMELINE.count(pub.length)}</T>
      </View>
      {!pub.length ? (
        <T v="meta" color={c.ink3}>{TIMELINE.empty}</T>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16, paddingBottom: 6 }}>
          {pub.map(e => <Ticket key={e.id} e={e} today={today} types={types} onPress={() => onOpen(e.id)} />)}
        </ScrollView>
      )}
    </View>
  );
}

const Ticket = memo(function Ticket({ e, today, types, onPress }: { e: Ev; today: string; types?: CalEventType[]; onPress: () => void }) {
  const { c } = useTheme();
  const cat = typeCat(e.category, types, c);
  const done = e.stage === "done";
  const line = stubLine(e, today, eventTime(e));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${e.title}. ${line}`}
      style={({ pressed }) => [styles.ticket, { borderColor: done ? c.line2 : c.ink, backgroundColor: c.card, borderBottomColor: done ? c.line2 : cat.ink }, pressed && pressedDim]}>
      <View style={[styles.stub, { borderRightColor: c.line2, backgroundColor: done ? c.paper2 : cat.soft }]}>
        <T v="kicker" size={10} color={c.ink3}>{e.dueDate ? monthShort(e.dueDate).toUpperCase() : ""}</T>
        <T v="title" size={22}>{e.dueDate ? String(Number(e.dueDate.slice(8, 10))) : ""}</T>
      </View>
      <View style={styles.tkBody}>
        <T v="callout" style={{ fontWeight: "600" }} numberOfLines={1}>{e.title}</T>
        <T v="meta" size={12.5} color={c.ink3} numberOfLines={1}>{line}</T>
      </View>
    </Pressable>
  );
});

/* ── day one ───────────────────────────────────────────────────────────────────── */

export interface DayOneSample { title: string; label: string | null; slug: string | null }

export function DayOne({ sample, owner, today, officer, types, onNew }: {
  sample: DayOneSample; owner: string; today: string; officer: boolean; types?: CalEventType[]; onNew: () => void;
}) {
  const { c } = useTheme();
  const cat = typeCat(sample.slug ?? "", types, c);
  const Type = sample.label ? (
    <View style={styles.d1ty}><View style={[styles.dotSm, { backgroundColor: cat.ink }]} /><T v="meta" size={11.5} color={cat.ink} style={{ fontWeight: "600" }}>{sample.label}</T></View>
  ) : null;
  const figs = [
    <View key="1" style={[styles.d1card, styles.d1idea, { backgroundColor: cat.fill }]}>
      <View style={[styles.tape, { backgroundColor: c.note.fill.butter }]} />
      <T v="callout" color={c.note.ink} style={{ fontWeight: "600" }}>{sample.title}</T>
      {Type}
    </View>,
    <View key="2" style={[styles.d1card, { borderColor: c.line2, borderStyle: "dashed", backgroundColor: c.card }]}>
      <T v="callout" style={{ fontWeight: "600" }}>{sample.title}</T>
      {Type}
      <View style={styles.d1m}>
        <View style={[styles.av, { backgroundColor: c.pastel.butter.fill }]}><T v="mono" size={8.5} color={c.note.ink} style={{ fontWeight: "700" }}>{dayOneInitials(owner)}</T></View>
        <T v="meta" size={12} color={c.ink2} numberOfLines={1}>{owner}</T>
      </View>
    </View>,
    <View key="3" style={[styles.d1card, { borderColor: c.ink, backgroundColor: c.card }, hard(cat.fill, 3)]}>
      <T v="callout" style={{ fontWeight: "600" }}>{sample.title}</T>
      <View style={styles.d1m}><Icon name="cal" size={12} color={c.ink3} /><T v="meta" size={12} color={c.ink2}>{dayOneWhen(today)}</T></View>
      <View style={styles.d1m}><Icon name="pin" size={12} color={c.ink3} /><T v="meta" size={12} color={c.ink2}>{DAY_ONE.place}</T></View>
      <View style={[styles.onTl, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}>
        <Icon name="eye" size={10} color={c.pastel.lilac.ink} />
        <T v="kicker" size={9.5} color={c.pastel.lilac.ink}>{DAY_ONE.onTimeline}</T>
      </View>
    </View>,
    <View key="4" style={[styles.d1card, { borderColor: c.line2, backgroundColor: c.paper2 }]}>
      <View style={[styles.stamp, { borderColor: c.pastel.mint.ink, backgroundColor: c.card }]}><T v="kicker" size={9} color={c.pastel.mint.ink}>{DAY_ONE.stamp}</T></View>
      <T v="callout" color={c.ink2} style={{ fontWeight: "600" }}>{sample.title}</T>
      <T v="mono" size={13} color={c.pastel.butter.ink} accessibilityLabel="4 of 5 stars">{"★★★★"}<T v="mono" size={13} color={c.line2}>★</T></T>
      <T v="meta" size={12} color={c.ink2}>{DAY_ONE.quote}</T>
    </View>,
  ];
  return (
    <View style={{ gap: 22 }}>
      <View style={[styles.d1, { borderColor: c.line2 }]}>
        {DAY_ONE.steps.map((s, i) => (
          <View key={s.title} style={styles.fig} accessible accessibilityLabel={`${s.title}. ${s.sub}`}>
            <View style={styles.figArt}>{figs[i]}</View>
            <T v="subhead" size={17} align="center">{s.title}</T>
            <T v="meta" color={c.ink3} align="center">{s.sub}</T>
          </View>
        ))}
      </View>
      {officer ? (
        <View style={{ alignItems: "center" }}>
          <Button label={DAY_ONE.cta} icon="plus" onPress={onNew} />
        </View>
      ) : (
        <T v="meta" color={c.ink3} align="center">{DAY_ONE.member}</T>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lane: { gap: 12, borderWidth: 1.5, borderRadius: 18, padding: 12 },
  laneHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2 },
  laneDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  count: { minWidth: 24, height: 22, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  more: { alignSelf: "stretch", alignItems: "center", borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, minHeight: 40, justifyContent: "center" },
  cal: { borderWidth: 1.5, borderRadius: 18, overflow: "hidden" },
  calHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  nav: { width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  todayBtn: { marginLeft: "auto", borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, minHeight: 34, justifyContent: "center" },
  key: { flexDirection: "row", justifyContent: "flex-end", gap: 14, paddingHorizontal: 14, paddingBottom: 10 },
  keyBit: { flexDirection: "row", alignItems: "center", gap: 6 },
  keyBox: { width: 16, height: 10, borderRadius: 3, borderWidth: 1.5 },
  dow: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 8 },
  week: { flexDirection: "row" },
  cell: { flex: 1, minHeight: 72, borderLeftWidth: 1, borderBottomWidth: 1, padding: 4, gap: 4 },
  dnum: { alignSelf: "flex-start", minWidth: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  dots: { flexDirection: "row", flexWrap: "wrap", gap: 4, paddingLeft: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotSm: { width: 6, height: 6, borderRadius: 3 },
  rail: { gap: 10, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 18, padding: 14 },
  railRow: { gap: 3, borderWidth: 1.5, borderLeftWidth: 4, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  railMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  railFoot: { borderTopWidth: 1.5, borderStyle: "dashed", paddingTop: 10 },
  tlHead: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 10, rowGap: 4 },
  ticket: { flexDirection: "row", width: 236, borderWidth: 1.5, borderBottomWidth: 4, borderRadius: 12, overflow: "hidden" },
  stub: { width: 58, alignItems: "center", justifyContent: "center", borderRightWidth: 1.5, borderStyle: "dashed", paddingVertical: 10 },
  tkBody: { flex: 1, gap: 3, paddingHorizontal: 12, justifyContent: "center" },
  d1: { gap: 28, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 20, paddingVertical: 24, paddingHorizontal: 16 },
  fig: { alignItems: "center", gap: 6 },
  figArt: { height: 150, alignSelf: "stretch", alignItems: "center", justifyContent: "flex-end", marginBottom: 8 },
  d1card: { width: 150, gap: 5, borderWidth: 1.5, borderRadius: 10, padding: 12 },
  d1idea: { borderWidth: 0, borderRadius: 4, transform: [{ rotate: "-2deg" }] },
  tape: { position: "absolute", top: -8, alignSelf: "center", left: 50, width: 50, height: 14, opacity: 0.85, transform: [{ rotate: "-3deg" }] },
  d1ty: { flexDirection: "row", alignItems: "center", gap: 6 },
  d1m: { flexDirection: "row", alignItems: "center", gap: 6 },
  av: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  onTl: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2 },
  stamp: { position: "absolute", right: -10, top: -10, borderWidth: 1.5, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, transform: [{ rotate: "8deg" }] },
});
