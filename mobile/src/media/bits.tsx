/**
 * Media's paper (app/org/[slug]/media/instagram-paper.css, on the phone):
 *
 *   Snap        the format as a tiny print: Story (rose, 9:16, progress bars), Reel
 *               (lilac, 9:16, play), Carousel (sky, square, a second print behind, dots).
 *               While it's still planned the print is "developing": dashed edge, faded
 *               photo, no shadow. Decorative, never a preview of real media
 *   MeasureTile the four at-a-glance counts; each one jumps somewhere
 *   LaneHead    a lane's dot, name, note, dashed rule and count
 *   PostRow     snapshot · title · format chip + date + promoted event · due pill
 *   Month       the month view: posting days marked by format, today inked, quiet
 *               stretches of 5+ days hatched
 */
import type { InstagramPost } from "@/lib/api-types";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, Line, Pattern, Polygon, Rect } from "react-native-svg";
import { Icon } from "~/icons/Icon";
import { alpha, type Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { duePill, formatTone, gaps, mediaDate, monthTitle, PILL_TONE, postedOn, shortDay, type Lane, type Measure } from "./model";

/* ── Snap ─────────────────────────────────────────────────────────────────────── */

const SNAP_W = { sm: 30, md: 46, lg: 132 } as const;

export function Snap({ type, developing, size = "sm", style }: { type: string; developing?: boolean; size?: keyof typeof SNAP_W; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const tone = formatTone(type);
  const carousel = type === "Carousel";
  const w = SNAP_W[size] * (carousel ? (size === "lg" ? 1.3 : 1.35) : 1);
  const h = carousel ? w : w * (16 / 9);
  const pad = size === "lg" ? 6 : 3;
  const r = size === "lg" ? 10 : 6;
  const fill = tone ? c.note.fill[tone] : c.paper3;
  const ink = tone ? c.pastel[tone].ink : c.ink3;
  const sh = size === "lg" ? 5 : 2;
  const edge = developing ? { borderColor: c.ink3, borderStyle: "dashed" as const } : { borderColor: c.ink, boxShadow: `${sh}px ${sh}px 0 ${fill}` };
  const white = alpha(c.thermal.paper, 0.9);
  const big = size === "lg";
  return (
    <View style={[{ width: w + (carousel ? 4 : 0), height: h + (carousel ? 4 : 0), justifyContent: "flex-end" }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {carousel ? (
        <View style={[styles.snap, { width: w, height: h, borderRadius: r, backgroundColor: c.card, position: "absolute", left: 4, top: 0, transform: [{ rotate: "3deg" }] },
          developing ? { borderColor: c.line2, borderStyle: "dashed" } : { borderColor: c.ink }]} />
      ) : null}
      <View style={[styles.snap, { width: w, height: h, borderRadius: r, padding: pad, backgroundColor: c.card }, edge]}>
        <View style={[styles.ph, { borderRadius: r / 2, backgroundColor: fill, opacity: developing ? 0.6 : 1 }]}>
          <View style={[styles.hill, { backgroundColor: alpha(ink, 0.32) }]} />
          {type === "Story" ? (
            <View style={[styles.bars, { top: big ? 8 : 3, left: big ? 8 : 3, right: big ? 8 : 3 }]}>
              {[0, 1, 2].map(i => <View key={i} style={{ flex: 1, height: big ? 3 : 1.5, borderRadius: 2, backgroundColor: white }} />)}
            </View>
          ) : null}
          {type === "Reel" ? (
            <View style={StyleSheet.absoluteFill}>
              <View style={styles.center}>
                <Svg width={big ? 26 : 10} height={big ? 32 : 12}><Polygon points={big ? "0,0 26,16 0,32" : "0,0 10,6 0,12"} fill={white} /></Svg>
              </View>
            </View>
          ) : null}
          {carousel ? (
            <View style={[styles.dots, { bottom: big ? 10 : 4, gap: big ? 4 : 2 }]}>
              {[0, 1, 2].map(i => <View key={i} style={{ width: big ? 6 : 3, height: big ? 6 : 3, borderRadius: 3, backgroundColor: i === 0 ? c.thermal.paper : alpha(c.thermal.paper, 0.7) }} />)}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** "· Story" in its tone: a dot and the format's name. */
export function FormatChip({ type }: { type: string }) {
  const { c } = useTheme();
  const tone = formatTone(type);
  return (
    <View style={[styles.chip, { backgroundColor: tone ? c.pastel[tone].soft : c.paper2, borderColor: tone ? c.pastel[tone].border : c.line }]}>
      <View style={[styles.chipDot, { backgroundColor: tone ? c.pastel[tone].ink : c.ink3 }]} />
      <T v="pill" color={c.ink2}>{type}</T>
    </View>
  );
}

export function DuePill({ post, today }: { post: InstagramPost; today: string }) {
  const { c } = useTheme();
  const p = duePill(post, today);
  const tone = PILL_TONE[p.kind];
  return (
    <View style={[styles.due, { backgroundColor: tone ? c.pastel[tone].soft : c.paper2, borderColor: tone ? c.pastel[tone].border : c.line }]}>
      <T v="mono" color={tone ? c.pastel[tone].ink : c.ink3} style={{ fontSize: 11.5, fontWeight: "700" }}>{p.label}</T>
    </View>
  );
}

/* ── measures ─────────────────────────────────────────────────────────────────── */

export function MeasureTile({ m, onPress }: { m: Measure; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${m.label}: ${m.value}${m.unit ? " days" : ""}, ${m.note}`}
      style={({ pressed }) => [styles.measure, { borderColor: pressed ? c.ink : c.line, backgroundColor: c.card }, pressed && { transform: [{ translateY: 1 }] }]}>
      <View style={styles.mk}>
        <Icon name={m.icon} size={12} color={c.pastel[m.tone].ink} />
        <T v="kicker" color={c.ink3} numberOfLines={1} style={{ fontSize: 9, flex: 1 }}>{m.label}</T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        <T v="title" color={m.warn ? c.pastel.peach.ink : c.ink} style={{ fontSize: 24, lineHeight: 28 }}>{m.value}</T>
        {m.unit ? <T v="mono" color={c.ink3} style={{ marginBottom: 4, marginLeft: 1 }}>{m.unit}</T> : null}
      </View>
      <T v="meta" color={c.ink3} numberOfLines={1} style={{ fontSize: 11 }}>{m.note}</T>
    </Pressable>
  );
}

/* ── lanes ────────────────────────────────────────────────────────────────────── */

export function LaneHead({ label, note, count, tone }: { label: string; note: string; count: number; tone: Tone | null }) {
  const { c } = useTheme();
  return (
    <View style={styles.lh} accessibilityRole="header" accessible accessibilityLabel={`${label}, ${count} post${count === 1 ? "" : "s"}, ${note}`}>
      <View style={[styles.lhDot, { backgroundColor: tone ? c.note.fill[tone] : c.paper3, borderColor: tone ? c.pastel[tone].ink : c.ink3 }]} />
      <T v="heading" style={{ fontSize: 18 }}>{label}</T>
      <T v="meta" color={c.ink3} numberOfLines={1} style={{ flexShrink: 1 }}>{note}</T>
      <View style={[styles.rule, { borderColor: c.line2 }]} />
      <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{`${count} post${count === 1 ? "" : "s"}`}</T>
    </View>
  );
}

export function PostRow({ post, lane, today, event, fresh, onPress }: { post: InstagramPost; lane: Lane; today: string; event: string | null; fresh?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const posted = post.status === "posted";
  const tone = formatTone(post.type);
  const when = posted ? `Posted ${mediaDate(postedOn(post))}` : `Due ${shortDay(post.dueDate)}, ${mediaDate(post.dueDate)}`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${post.title}, ${post.type}, ${when}${event ? `, promoting ${event}` : ""}`}
      style={({ pressed }) => [styles.row, { borderColor: pressed ? c.ink : c.line, backgroundColor: fresh ? c.pastel.butter.soft : c.card },
        pressed && tone ? { boxShadow: `3px 3px 0 ${c.note.fill[tone]}` } : null]}>
      <View style={styles.sn}><Snap type={post.type} developing={!posted} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <T v="callout" numberOfLines={1} color={lane === "posted" ? c.ink2 : c.ink} style={{ fontWeight: "600" }}>{post.title}</T>
        <View style={styles.meta}>
          <FormatChip type={post.type} />
          <T v="meta" color={c.ink3} style={{ fontSize: 12 }}>{when}</T>
          {event ? (
            <View style={styles.ev}>
              <Icon name="cal" size={11} color={c.ink3} />
              <T v="meta" color={c.ink3} numberOfLines={1} style={{ fontSize: 12, flexShrink: 1 }}>{event}</T>
            </View>
          ) : null}
        </View>
      </View>
      <DuePill post={post} today={today} />
    </Pressable>
  );
}

/* ── month ────────────────────────────────────────────────────────────────────── */

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export function Month({ posts, events, today, month, onMonth, onDay }: {
  posts: InstagramPost[]; events: { id: number; title: string; date: string }[]; today: string; month: string;
  onMonth: (m: string) => void; onDay: (posts: InstagramPost[], date: string) => void;
}) {
  const { c } = useTheme();
  const [year, mo] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(year, mo - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, mo, 0)).getUTCDate();
  const move = (d: number) => onMonth(new Date(Date.UTC(year, mo - 1 + d, 1)).toISOString().slice(0, 7));
  const byDay = new Map<number, InstagramPost[]>();
  for (const p of posts) if (p.dueDate.startsWith(month)) { const d = Number(p.dueDate.slice(8)); byDay.set(d, [...(byDay.get(d) ?? []), p]); }
  const linked = new Set(posts.map(p => p.calendarEventId));
  const evDays = new Set(events.filter(e => linked.has(e.id) && e.date.startsWith(month)).map(e => Number(e.date.slice(8))));
  const { hatched, longest } = gaps([...byDay.keys()]);
  const cells = Array.from({ length: Math.ceil((first + length) / 7) * 7 }, (_, i) => (i < first || i >= first + length ? null : i - first + 1));
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.mh}>
        <Pressable onPress={() => move(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Previous month" style={[styles.navBtn, { borderColor: c.line2 }]}><Icon name="chev-l" size={16} color={c.ink2} /></Pressable>
        <T v="heading" style={{ flex: 1 }} accessibilityRole="header">{monthTitle(month)} <T v="heading" color={c.ink3}>{String(year)}</T></T>
        {month !== today.slice(0, 7) ? (
          <Pressable onPress={() => onMonth(today.slice(0, 7))} hitSlop={6} accessibilityRole="button" style={[styles.todayBtn, { borderColor: c.line2 }]}><T v="pill" color={c.ink2}>Today</T></Pressable>
        ) : null}
        <Pressable onPress={() => move(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next month" style={[styles.navBtn, { borderColor: c.line2 }]}><Icon name="chev-r" size={16} color={c.ink2} /></Pressable>
      </View>
      {longest > 0 ? <T v="meta" color={c.ink3}>{"Longest quiet stretch this month: "}<T v="meta" color={c.ink} style={{ fontWeight: "700" }}>{`${longest} day${longest === 1 ? "" : "s"}`}</T>{longest >= 5 ? ", hatched" : ""}</T> : null}
      <View style={[styles.cal, { borderColor: c.ink, backgroundColor: c.card, boxShadow: `4px 4px 0 ${c.note.fill.lilac}` }]}>
        <View style={[styles.calRow, { backgroundColor: c.paper2, borderBottomColor: c.line }]}>
          {DOW.map((d, i) => <T key={i} v="kicker" color={c.ink3} align="center" style={{ flex: 1, fontSize: 9, paddingVertical: 6 }}>{d}</T>)}
        </View>
        {rows.map((row, ri) => (
          <View key={ri} style={[styles.calRow, ri < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.paper3 }]}>
            {row.map((d, i) => {
              if (d == null) return <View key={i} style={[styles.cell, { backgroundColor: c.paper }, i < 6 && { borderRightWidth: 1, borderRightColor: c.paper3 }]} />;
              const date = `${month}-${String(d).padStart(2, "0")}`;
              const list = byDay.get(d) ?? [];
              const isToday = date === today;
              return (
                <Pressable key={i} disabled={!list.length} onPress={() => onDay(list, date)}
                  accessibilityRole={list.length ? "button" : undefined}
                  accessibilityLabel={`${mediaDate(date, true)}${list.length ? `, ${list.map(p => `${p.title}, ${p.type}${p.status === "posted" ? ", posted" : ""}`).join("; ")}` : ""}`}
                  style={({ pressed }) => [styles.cell, i < 6 && { borderRightWidth: 1, borderRightColor: c.paper3 }, pressed && { backgroundColor: c.paper2 }]}>
                  {hatched.has(d) ? <Hatch color={alpha(c.note.fill.peach, 0.5)} /> : null}
                  <View style={[styles.dn, isToday && { backgroundColor: c.ink }]}>
                    <T v="mono" color={isToday ? c.paper : c.ink2} style={{ fontSize: 11.5, fontWeight: "700" }}>{String(d)}</T>
                  </View>
                  <View style={styles.marks}>
                    {list.slice(0, 4).map(p => {
                      const tone = formatTone(p.type);
                      const done = p.status === "posted";
                      return <View key={p.id} style={[styles.mark, done ? { borderWidth: 1.5, borderColor: tone ? c.pastel[tone].ink : c.ink3, borderStyle: "dashed" } : { backgroundColor: tone ? c.pastel[tone].ink : c.ink3 }]} />;
                    })}
                    {evDays.has(d) ? <View style={[styles.mark, { borderWidth: 1.5, borderColor: c.ink3 }]} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        {(["Story", "Reel", "Carousel"] as const).map(t => <FormatChip key={t} type={t} />)}
        <View style={styles.ev}><View style={[styles.mark, { borderWidth: 1.5, borderColor: c.ink3 }]} /><T v="meta" color={c.ink3} style={{ fontSize: 12 }}>event promoted</T></View>
      </View>
    </View>
  );
}

function Hatch({ color }: { color: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="igp-gap" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <Line x1={0} y1={0} x2={0} y2={8} stroke={color} strokeWidth={2} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#igp-gap)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  snap: { borderWidth: 1.5 },
  ph: { flex: 1, overflow: "hidden" },
  hill: { position: "absolute", left: "-10%", right: "-10%", bottom: "-18%", height: "46%", borderTopLeftRadius: 999, borderTopRightRadius: 999 },
  bars: { position: "absolute", flexDirection: "row", gap: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingLeft: 2 },
  dots: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center" },

  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  due: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },

  measure: { width: "48.5%", gap: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5 },
  mk: { flexDirection: "row", alignItems: "center", gap: 5 },

  lh: { flexDirection: "row", alignItems: "center", gap: 8 },
  lhDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  rule: { flex: 1, minWidth: 12, borderTopWidth: 1.5, borderStyle: "dashed" },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingLeft: 10, paddingRight: 12, borderRadius: 14, borderWidth: 1.5 },
  sn: { width: 46, height: 56, alignItems: "center", justifyContent: "center" },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 3 },
  ev: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" },

  mh: { flexDirection: "row", alignItems: "center", gap: 8 },
  navBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  todayBtn: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, minHeight: 32, justifyContent: "center" },
  cal: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  calRow: { flexDirection: "row" },
  cell: { flex: 1, minHeight: 58, padding: 4, gap: 4, overflow: "hidden" },
  dn: { alignSelf: "flex-start", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8 },
  marks: { flexDirection: "row", flexWrap: "wrap", gap: 3, paddingHorizontal: 2 },
  mark: { width: 8, height: 8, borderRadius: 4 },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
});
