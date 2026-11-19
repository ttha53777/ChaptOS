/**
 * The Timeline's Calendar view on a phone (TimelineCalendar + DayDetail, timeline-ledger.css
 * ≤640px): a wall-calendar page with two binder rings, the month on a sky highlighter,
 * Today / ‹ / › and a Sunday-first grid. On a phone the cells are too small for chips,
 * so each holds its number and up to four category dots; today's number is inked in with
 * the Today pill's peach offset. Tapping a day opens it in a sheet (DayDetail): the day,
 * "N on the books · attendance taken" or "An open day.", and its events; tap one to open it.
 *
 * Motion: paging a month slides the grid 16pt the way you went and fades it in. Reduced:
 * a fade. Paging is a select haptic; opening a day is navigation (none).
 */
import type { CalEventType, CalendarEvent } from "@/lib/api-types";
import { DAY_NAMES, DAY_NAMES_LONG, MONTH_NAMES, relWhen } from "@/lib/timeline/rows";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, ReduceMotion, SlideInLeft, SlideInRight } from "react-native-reanimated";
import { byStart, catOf, timeText } from "~/dash/UpNextCard";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Sheet } from "~/shell/sheets";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { catLabel, typeOf } from "./Line";

export interface Ym { year: number; month: number }
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function MonthGrid({ events, types, month, onMonth, today, picked, onDay, dir }: {
  events: CalendarEvent[]; types: CalEventType[] | undefined; month: Ym; onMonth: (m: Ym, dir: 1 | -1) => void;
  today: string; picked: string | null; onDay: (d: string) => void; dir: 1 | -1 | 0;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const byDay = useMemo(() => {
    const out = new Map<string, CalendarEvent[]>();
    for (const e of [...events].sort(byStart)) { const l = out.get(e.date); if (l) l.push(e); else out.set(e.date, [e]); }
    return out;
  }, [events]);
  const cells = useMemo(() => {
    const first = new Date(month.year, month.month, 1);
    const start = new Date(month.year, month.month, 1 - first.getDay());
    const daysIn = new Date(month.year, month.month + 1, 0).getDate();
    const weeks = Math.ceil((first.getDay() + daysIn) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date: iso(d), day: d.getDate(), dow: d.getDay(), inMonth: d.getMonth() === month.month };
    });
  }, [month]);

  const prefix = `${month.year}-${pad(month.month + 1)}`;
  const monthEvents = events.filter(e => e.date.startsWith(prefix));
  const isThisMonth = today.startsWith(prefix);
  const step = (delta: 1 | -1) => { haptics.select(); const d = new Date(month.year, month.month + delta, 1); onMonth({ year: d.getFullYear(), month: d.getMonth() }, delta); };
  const goToday = () => { haptics.select(); const [y, mo] = today.split("-").map(Number) as [number, number]; onMonth({ year: y, month: mo - 1 }, prefix < today ? 1 : -1); };

  const enter = m.reduced || dir === 0 ? FadeIn.duration(200) : (dir > 0 ? SlideInRight : SlideInLeft).duration(m.t(280)).reduceMotion(ReduceMotion.System);
  const NavBtn = ({ icon, label, onPress }: { icon: "chev-l" | "chev-r"; label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => [styles.nav, { borderColor: pressed ? c.ink : c.line2, backgroundColor: c.card }]}>
      <Icon name={icon} size={15} color={c.ink} />
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      {/* the two pages under this one */}
      <View style={[styles.under, { left: 11, right: 11, top: 12, backgroundColor: c.paper2, borderColor: c.line, boxShadow: c.sh1 }]} />
      <View style={[styles.under, { left: 5, right: 5, top: 6, backgroundColor: c.paper2, borderColor: c.line }]} />
      <View style={[styles.sheet, { backgroundColor: c.card, borderColor: c.line2, boxShadow: c.sh2 }]}>
        <Ring side="l" />
        <Ring side="r" />
        <View style={styles.head}>
          <View style={styles.title} accessibilityRole="header">
            <View>
              <View style={[styles.mark, { backgroundColor: c.pastel.sky.fill, opacity: c.markOp }]} />
              <T v="hero" size={30} ls={-0.04} lh={1.05}>{MONTH_NAMES[month.month]}</T>
            </View>
            <T v="hero" size={12.5} color={c.ink3} style={{ marginLeft: 8, marginBottom: 4, fontWeight: "500" }}>{month.year}</T>
          </View>
          <View style={styles.navs}>
            {!isThisMonth ? (
              <Pressable onPress={goToday} accessibilityRole="button" style={[styles.nav, styles.todayBtn, { backgroundColor: c.ink, borderColor: c.ink }, hard(c.pastel.peach.fill, 2)]}>
                <T v="buttonSm" color={c.paper}>Today</T>
              </Pressable>
            ) : null}
            <NavBtn icon="chev-l" label="Previous month" onPress={() => step(-1)} />
            <NavBtn icon="chev-r" label="Next month" onPress={() => step(1)} />
          </View>
        </View>

        <View style={styles.dowRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {DAY_NAMES.map((n, i) => (
            <T key={n} v="mono" size={9} align="center" color={i === 0 || i === 6 ? alpha(c.pastel.rose.ink, 0.8) : c.ink3} style={{ flex: 1, fontWeight: "600", letterSpacing: 0.6 }}>{n.toUpperCase()}</T>
          ))}
        </View>

        <Animated.View key={prefix} entering={enter} style={[styles.grid, { backgroundColor: c.line, borderColor: c.line }]}
          accessibilityLabel={`${MONTH_NAMES[month.month]} ${month.year}, ${monthEvents.length} event${monthEvents.length === 1 ? "" : "s"}`}>
          {Array.from({ length: cells.length / 7 }, (_, w) => (
            <View key={w} style={styles.week}>
              {cells.slice(w * 7, w * 7 + 7).map(cell => {
                const list = byDay.get(cell.date) ?? [];
                const isToday = cell.date === today;
                const isPicked = cell.date === picked;
                const we = cell.dow === 0 || cell.dow === 6;
                return (
                  <Pressable key={cell.date} onPress={() => onDay(cell.date)} accessibilityRole="button"
                    accessibilityState={{ selected: isPicked }}
                    accessibilityLabel={`${cell.day} ${MONTH_NAMES[Number(cell.date.slice(5, 7)) - 1]}, ${list.length} event${list.length === 1 ? "" : "s"}`}
                    style={({ pressed }) => [styles.cell,
                      { backgroundColor: cell.inMonth ? (we ? c.paper2 : c.card) : c.paper },
                      pressed && { backgroundColor: c.paper2 },
                      isPicked && { backgroundColor: c.pastel.lilac.soft, borderColor: c.ink, borderWidth: 2 }]}>
                    <View style={[styles.num, isToday && [{ backgroundColor: c.ink, transform: [{ rotate: "-3deg" }] }, hard(c.pastel.peach.fill, 2)]]}>
                      <T v="hero" size={15} ls={-0.03} align="center"
                        color={isToday ? c.paper : !cell.inMonth ? alpha(c.ink3, 0.6) : cell.date < today ? c.ink3 : c.ink}>{cell.day}</T>
                    </View>
                    {list.length ? (
                      <View style={[styles.dots, !cell.inMonth && { opacity: 0.55 }]}>
                        {list.slice(0, 4).map(e => <View key={e.id} style={[styles.dot, { backgroundColor: catOf(e.category, typeOf(types, e.category), c).ink }]} />)}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

function Ring({ side }: { side: "l" | "r" }) {
  const { c } = useTheme();
  return (
    <View pointerEvents="none" style={[styles.ring, side === "l" ? { left: "22%" } : { right: "22%" }, { borderColor: c.ink2, borderBottomColor: "transparent" }]}>
      <View style={[styles.hole, { backgroundColor: c.paper }]} />
    </View>
  );
}

/** DayDetail in a sheet: the picked day and what it holds. */
export function DaySheet({ date, events, types, today, doneById, onClose, onOpen, onAdd }: {
  date: string | null; events: CalendarEvent[]; types: CalEventType[] | undefined; today: string;
  doneById: ReadonlyMap<number, boolean>; onClose: () => void; onOpen: (e: CalendarEvent) => void; onAdd?: () => void;
}) {
  const { c } = useTheme();
  const list = date ? events.filter(e => e.date === date).sort(byStart) : [];
  const d = date ? new Date(`${date}T12:00:00`) : null;
  const rel = date ? (date === today ? "Today" : relWhen(date, today)) : "";
  return (
    <Sheet open={date != null} onClose={onClose} size="half" tone="lilac" icon="cal"
      kicker={d ? `${DAY_NAMES_LONG[d.getDay()]} · ${rel}` : ""} title={d ? `${MONTH_NAMES[d.getMonth()]!.slice(0, 3)} ${d.getDate()}` : ""}>
      <T v="body" color={c.ink2} style={{ marginBottom: 14 }}>
        {list.length ? `${list.length} on the books${list.some(e => e.mandatory) ? " · attendance taken" : ""}.` : "An open day."}
      </T>
      {list.length === 0 ? (
        <View style={[styles.empty, { borderColor: c.line2 }]}>
          <T v="callout" color={c.ink3}>Nothing on the books this day.</T>
          {onAdd ? (
            <Pressable onPress={onAdd} accessibilityRole="button" hitSlop={8}>
              <T v="callout" color={c.ink} style={{ fontWeight: "600" }}>Add event →</T>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={[styles.then, { backgroundColor: c.card, borderColor: c.line }]}>
          {list.map((e, i) => {
            const cat = catOf(e.category, typeOf(types, e.category), c);
            const start = timeText(e)?.split(/\s*[–-]\s*/)[0] ?? "All day";
            return (
              <Pressable key={e.id} onPress={() => onOpen(e)} accessibilityRole="button"
                style={({ pressed }) => [styles.thenRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.lineSoft }, pressed && { backgroundColor: cat.soft }]}>
                <View style={[styles.thenBar, { backgroundColor: cat.ink }]} />
                <T v="mono" size={11.5} color={c.ink3} style={{ width: 62 }}>{start}</T>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T v="bodyStrong" numberOfLines={1} style={doneById.get(e.id) ? { textDecorationLine: "line-through" } : undefined}>{e.title}</T>
                  <T v="meta" color={c.ink3} numberOfLines={1}>
                    {`${catLabel(types, e.category)}${e.mandatory ? " · Required" : ""}${e.location ? ` · ${e.location}` : ""}`}
                  </T>
                </View>
                <Icon name="chev-r" size={14} color={c.ink3} />
              </Pressable>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 14, paddingBottom: 14 },
  under: { position: "absolute", bottom: -12, borderWidth: 1.5, borderTopLeftRadius: 10, borderTopRightRadius: 22, borderBottomRightRadius: 14, borderBottomLeftRadius: 20 },
  sheet: { borderWidth: 1.5, borderTopLeftRadius: 10, borderTopRightRadius: 22, borderBottomRightRadius: 14, borderBottomLeftRadius: 20 },
  ring: { position: "absolute", top: -13, zIndex: 2, width: 14, height: 26, borderRadius: 8, borderWidth: 2.5 },
  hole: { position: "absolute", left: 0.5, bottom: -6, width: 9, height: 9, borderRadius: 5 },
  head: { flexDirection: "row", alignItems: "center", paddingTop: 18, paddingHorizontal: 14, paddingBottom: 10, gap: 10 },
  title: { flex: 1, flexDirection: "row", alignItems: "flex-end" },
  mark: { position: "absolute", left: -2, right: -2, bottom: 2, height: "42%", borderTopLeftRadius: 10, borderTopRightRadius: 14, borderBottomLeftRadius: 9, borderBottomRightRadius: 15, transform: [{ rotate: "-0.8deg" }] },
  navs: { flexDirection: "row", gap: 8 },
  nav: { height: 36, minWidth: 36, borderRadius: 999, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  todayBtn: { paddingHorizontal: 14 },
  dowRow: { flexDirection: "row", paddingHorizontal: 8, paddingBottom: 6 },
  grid: { marginHorizontal: 6, marginBottom: 10, borderWidth: 1.5, borderRadius: 12, overflow: "hidden", gap: 1.5 },
  week: { flexDirection: "row", gap: 1.5 },
  cell: { flex: 1, minHeight: 52, paddingVertical: 5, paddingHorizontal: 2, alignItems: "center", gap: 4 },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  empty: { alignItems: "flex-start", gap: 10, padding: 16, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" },
  then: { borderRadius: 16, borderWidth: 1.5, overflow: "hidden" },
  thenRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingRight: 14, paddingLeft: 16 },
  thenBar: { position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2 },
});
