/**
 * This week (web ledger/ThisWeek.tsx + week-card.css, phone sizes): the week's agenda
 * from lib/dashboard/week.ts (every calendar entry, parties included) merged with the
 * deadlines due this week.
 *
 *   header  cal tile, "This week", the range in mono, "All →" (opens Timeline)
 *   strip   seven day chips: weekday (TODAY on today), the date, up to three dots in
 *           the type's colour (butter for a deadline). Today wears butter; the picked
 *           day an ink border with a butter hard shadow; past dates go muted.
 *   list    the picked day: time (or "Due"), a colour bar, title with DEADLINE / type /
 *           ENDED pills, meta (place · mandatory, or who it's assigned to)
 *   empty   blank week (butter hello) · quiet week · "Nothing on today. Next up: …"
 *
 * Starts on today if it has anything, else the next busy day. Haptic: select on a day.
 */
import type { CalEventType, CalendarEvent, Task } from "@/lib/api-types";
import { taskAssigneeLabel } from "@/lib/dashboard/plate";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { inkOf } from "~/timeline/model";
import { clockLabel, startOf } from "~/today/time";
import { T } from "~/ui/T";
import { weekRange } from "./Brief";
import { DashCard, HeadSub } from "./Card";

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const utc = (iso: string) => { const [y = 0, m = 1, d = 1] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const days7 = (start: string) => Array.from({ length: 7 }, (_, i) => new Date(utc(start).getTime() + i * 86_400_000).toISOString().slice(0, 10));

interface Item { key: string; date: string; title: string; when: string; meta: string; kind: "event" | "deadline"; over: boolean; type: CalEventType | null; sort: string; event?: CalendarEvent }

export function WeekCard({ agenda, deadlines, start, end, today, types, calendarEmpty, onAll, onEvent, i }: {
  agenda: CalendarEvent[]; deadlines: Task[]; start: string; end: string; today: string;
  types: CalEventType[] | undefined; calendarEmpty: boolean;
  onAll: () => void; onEvent: (e: CalendarEvent) => void; i: number;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const now = Date.now();
  const typeOf = (slug: string) => types?.find(t => t.slug === slug) ?? null;
  const colorOf = (t: CalEventType | null, slug: string) => (t ? (c.scheme === "dark" ? t.colorDark ?? t.color : t.color) : inkOf(slug, c));

  const items: Item[] = [
    ...agenda.map((e): Item => ({
      key: `e${e.id}`, date: e.date, title: e.title, event: e,
      when: clockLabel(e.time) ?? "All day",
      meta: [e.location, e.mandatory ? "mandatory" : null].filter(Boolean).join(" · "),
      kind: "event", type: typeOf(e.category),
      over: (() => { const s = startOf(e.date, e.time); return e.date < today || (!!s && e.date === today && !!e.time && s.getTime() + 2 * 3600_000 < now); })(),
      sort: `${e.date} ${e.time ?? "00:00"}`,
    })),
    ...deadlines.filter(d => d.dueDate != null).map((d): Item => ({
      key: `d${d.id}`, date: d.dueDate!, title: d.title, when: "Due", meta: taskAssigneeLabel(d),
      kind: "deadline", over: false, type: null, sort: `${d.dueDate} ${d.dueTime ?? "23:59"}`,
    })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  const days = days7(start);
  const byDay = new Map(days.map(d => [d, items.filter(x => x.date === d)]));
  const home = days.includes(today) ? today : days[0]!;
  const firstBusy = days.find(d => d >= home && (byDay.get(d)?.length ?? 0) > 0);
  const [picked, setPicked] = useState<string | null>(null);
  const sel = picked && days.includes(picked) ? picked : byDay.get(home)?.length ? home : firstBusy ?? home;
  const selItems = byDay.get(sel) ?? [];
  const sd = utc(sel);
  const selLabel = sel === today ? "Today" : `${WD_LONG[sd.getUTCDay()]}, ${MON[sd.getUTCMonth()]} ${sd.getUTCDate()}`;
  const nextUp = items.find(x => x.date > today && !x.over);

  return (
    <DashCard icon="cal" tone="butter" title="This week" i={i} bodyStyle={{ paddingHorizontal: 12, gap: 14 }}
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <HeadSub label={weekRange(start, end)} />
          <Pressable onPress={onAll} accessibilityRole="button" accessibilityLabel="All, open Timeline" hitSlop={8} style={styles.lnk}>
            <T v="buttonSm" size={12.6}>All</T>
            <Icon name="arrow-r" size={12} color={c.ink} />
          </Pressable>
        </View>
      }>
      <View style={styles.strip} accessibilityRole="tablist">
        {days.map(d => {
          const dt = utc(d);
          const its = byDay.get(d) ?? [];
          const isToday = d === today, isSel = d === sel, past = d < today;
          return (
            <Pressable key={d} onPress={() => { if (!isSel) { haptics.select(); setPicked(d); } }}
              accessibilityRole="tab" accessibilityState={{ selected: isSel }}
              accessibilityLabel={`${WD_LONG[dt.getUTCDay()]}${its.length ? `, ${its.length} item${its.length === 1 ? "" : "s"}` : ""}`}
              style={({ pressed }) => [styles.day, {
                backgroundColor: isToday ? c.pastel.butter.soft : c.card,
                borderColor: isSel ? c.ink : isToday ? c.pastel.butter.border : c.line,
                boxShadow: isSel ? `2.5px 2.5px 0 ${c.pastel.butter.fill}` : undefined,
              }, pressed && { transform: [{ translateY: 1 }] }]}>
              <T v="kicker" size={8.6} ls={0.04} color={isToday ? c.pastel.butter.ink : c.ink3}>{isToday ? "TODAY" : WD[dt.getUTCDay()]}</T>
              <T v="title" size={17.6} lh={1} color={past ? c.ink3 : c.ink}>{String(dt.getUTCDate())}</T>
              <View style={styles.dots}>
                {its.slice(0, 3).map(x => (
                  <View key={x.key} style={[styles.dot, { backgroundColor: x.kind === "deadline" ? c.pastel.butter.ink : colorOf(x.type, x.event?.category ?? "") }]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Animated.View key={sel} entering={FadeIn.duration(m.t(180)).reduceMotion(ReduceMotion.Never)} style={styles.list}>
        <T v="callout" size={12.5} color={c.ink3} style={{ fontFamily: "Inter-600", paddingLeft: 2 }}>{selLabel}</T>
        {selItems.length ? selItems.map(x => {
          const color = x.kind === "deadline" ? c.pastel.butter.ink : colorOf(x.type, x.event?.category ?? "");
          const body = (
            <>
              <T v="mono" size={11.8} color={x.over ? c.ink3 : c.ink2} style={styles.tm} numberOfLines={1}>{x.when}</T>
              <View style={[styles.bar, { backgroundColor: color, opacity: x.over ? 0.4 : 1 }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.ttlRow}>
                  <T v="bodyStrong" size={14.7} numberOfLines={1} color={x.over ? c.ink3 : c.ink} style={{ flexShrink: 1 }}>{x.title}</T>
                  {x.kind === "deadline" ? <Pill label="DEADLINE" bg={c.pastel.rose.soft} fg={c.pastel.rose.ink} bd={c.pastel.rose.border} /> : null}
                  {x.type ? <Pill label={x.type.label.toUpperCase()} bg="transparent" fg={color} bd={color} /> : null}
                  {x.over ? <Pill label="ENDED" bg={c.paper2} fg={c.ink3} bd={c.line} /> : null}
                </View>
                {x.meta ? <T v="meta" size={12.5} color={c.ink3} numberOfLines={1}>{x.meta}</T> : null}
              </View>
            </>
          );
          return x.event ? (
            <Pressable key={x.key} onPress={() => onEvent(x.event!)} accessibilityRole="button" accessibilityLabel={`${x.when}, ${x.title}`}
              style={({ pressed }) => [styles.ev, { borderColor: pressed ? c.line2 : c.line, backgroundColor: pressed ? c.card2 : c.card }]}>{body}</Pressable>
          ) : (
            <View key={x.key} style={[styles.ev, { borderColor: c.line, backgroundColor: c.card }]}>{body}</View>
          );
        }) : calendarEmpty && !items.length ? (
          <View style={[styles.empty, { borderStyle: "solid", borderColor: c.pastel.butter.border, backgroundColor: c.pastel.butter.soft }]}>
            <Icon name="sun" size={16} color={c.pastel.butter.ink} />
            <T v="meta" size={13.8} color={c.ink2} style={{ flex: 1 }}>A blank week, all yours. Events land on their day once they're on the calendar.</T>
          </View>
        ) : !items.length ? (
          <View style={[styles.empty, { borderStyle: "solid", borderColor: c.line, backgroundColor: c.card2 }]}>
            <Icon name="mug" size={16} color={c.ink3} />
            <T v="meta" size={13.8} color={c.ink3}>Quiet week. Nothing on the agenda.</T>
          </View>
        ) : (
          <View style={[styles.empty, { borderColor: c.line2 }]}>
            <T v="meta" size={13.8} color={c.ink3} style={{ flex: 1 }}>
              {`Nothing on ${sel === today ? "today" : "this day"}.`}
              {nextUp && sel <= today ? <> Next up: <T v="meta" size={13.8} style={{ fontFamily: "Inter-600" }}>{nextUp.title}</T>{`, ${WD_LONG[utc(nextUp.date).getUTCDay()]}.`}</> : null}
            </T>
          </View>
        )}
      </Animated.View>
    </DashCard>
  );
}

function Pill({ label, bg, fg, bd }: { label: string; bg: string; fg: string; bd: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: bd }]}>
      <T v="kicker" size={8.6} color={fg}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  lnk: { flexDirection: "row", alignItems: "center", gap: 4 },
  strip: { flexDirection: "row", gap: 4 },
  day: { flex: 1, minWidth: 0, alignItems: "center", gap: 4, paddingTop: 8, paddingBottom: 7, borderRadius: 11, borderWidth: 1.5 },
  dots: { flexDirection: "row", gap: 3, height: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  list: { gap: 8, paddingHorizontal: 6 },
  ev: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1.5, borderRadius: 14 },
  tm: { width: 52 },
  bar: { width: 4, height: 28, borderRadius: 3 },
  ttlRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  pill: { paddingVertical: 1, paddingHorizontal: 6, borderRadius: 5, borderWidth: 1 },
  empty: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14 },
});
