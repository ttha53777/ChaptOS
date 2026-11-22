/**
 * The house ledger's paper (app/paper-parties.css, on the phone):
 *
 *   Wristband   Open (butter) / Closed (lilac), the band you'd get at the door: a notched
 *               tail and a punched hole
 *   Hero        the one task: a rose-flapped envelope sealed with the chapter's initials,
 *               for the oldest party that happened with no figures (officers)
 *   Takings     net this semester, door / spent / avg roll / best night, and the
 *               night-by-night strip: bars grow from the baseline (pop spring, 40ms apart;
 *               reduced, they fade in at size)
 *   Book        every party as a ledger line, a rose margin rule down the book: due rows
 *               rose-washed, upcoming rows hatched, closed rows carry their net
 */
import type { Party } from "@/lib/api-types";
import { memo, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Defs, Line, Path, Pattern, Polygon, Rect } from "react-native-svg";
import { Icon, type IconName } from "~/icons/Icon";
import { pressedDim } from "~/motion/press";
import { Button } from "~/paper/Button";
import { TickingNumber } from "~/paper/TickingNumber";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import {
  PAGE, RECEIPT, barPct, dayNum, dow, fmt$, fmtDate, heroTag, isUpcoming, mon, monDay, needsWrapUp, noteFor, orgInitials, partyTime,
  profit, receiptNet, rollPct, signed$, subLine, upcomingLabel, type Roll, type Takings,
} from "./model";

/* ── Wristband ────────────────────────────────────────────────────────────────── */

export function Wristband({ type, size = "sm" }: { type: Party["partyType"]; size?: "sm" | "md" }) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const h = size === "md" ? 22 : 19;
  const fill = type === "Closed" ? c.note.fill.lilac : c.note.fill.butter;
  return (
    <View style={[styles.band, { height: h, paddingLeft: h * 0.8, paddingRight: h * 0.65 }]} onLayout={e => setW(e.nativeEvent.layout.width)}
      accessible accessibilityLabel={`${type} party`}>
      {w ? (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Path d={`M3 0 H${w} L${w - 6} ${h / 2} L${w} ${h} H3 Q0 ${h} 0 ${h - 3} V3 Q0 0 3 0 Z`} fill={fill} />
        </Svg>
      ) : null}
      <View style={[styles.hole, { left: h * 0.27, top: h / 2 - 2.5, backgroundColor: c.thermal.paper, borderColor: alpha(c.note.ink, 0.3) }]} />
      <T v="kicker" color={c.note.ink} style={{ fontSize: size === "md" ? 10 : 9, letterSpacing: 1 }}>{type}</T>
    </View>
  );
}

/* ── Hero: the one task ───────────────────────────────────────────────────────── */

export function Hero({ party, more, org, today, onClose }: { party: Party; more: number; org: string; today: string; onClose: () => void }) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  return (
    <View style={[styles.hero, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `4px 4px 0 ${c.note.fill.rose}` }]} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {w ? (
        <Svg width={w} height={38} style={styles.flap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Polygon points={`0,0 ${w / 2},34 ${w},0`} fill={c.pastel.rose.soft} stroke={c.ink} strokeWidth={1.5} />
        </Svg>
      ) : null}
      <View style={[styles.seal, { backgroundColor: c.note.fill.rose, borderColor: c.ink }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <T v="kicker" color={c.note.ink} style={{ fontSize: 10, letterSpacing: 0.5 }}>{orgInitials(org)}</T>
      </View>
      <View style={styles.heroBody}>
        <View style={styles.heroTop}>
          <View style={[styles.clockTile, { backgroundColor: c.pastel.rose.soft, borderColor: c.pastel.rose.border }]}>
            <Icon name="clock" size={22} color={c.pastel.rose.ink} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="kicker" color={c.pastel.rose.ink}>{heroTag(party.date, today)}</T>
            <T v="heading" numberOfLines={2}>{party.name}</T>
          </View>
        </View>
        <T v="meta" color={c.ink2}>
          {`${subLine(party)} · `}<T v="meta" color={c.ink} style={{ fontWeight: "600" }}>{`${dow(party.date)}, ${fmtDate(party.date)}`}</T>{PAGE.heroMeta}
        </T>
        {more > 0 ? <T v="mono" color={c.ink3} style={{ fontSize: 11.5 }}>{PAGE.heroMore(more)}</T> : null}
        <Button label={PAGE.heroAct} icon="check" tone="rose" block onPress={onClose} />
      </View>
    </View>
  );
}

/* ── Takings ──────────────────────────────────────────────────────────────────── */

export function TakingsCard({ t, onOpen }: { t: Takings<Party>; onOpen: (id: number) => void }) {
  const { c } = useTheme();
  const neg = t.net < 0;
  return (
    <View style={[styles.takings, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `4px 4px 0 ${c.note.fill.mint}` }]}>
      <View style={[styles.head, { borderBottomColor: c.line2 }]}>
        <T v="label" color={c.ink3}>{PAGE.netK}</T>
        <TickingNumber value={signed$(t.net)} v="figure" color={neg ? c.pastel.rose.ink : c.pastel.mint.ink} accessibilityLabel={`${PAGE.netK} ${signed$(t.net)}`} />
        <T v="mono" color={c.ink3} style={{ fontSize: 11.5 }}>{PAGE.netNote(t.closed.length)}</T>
      </View>
      <View style={styles.grid}>
        <Cell k={PAGE.door} v={fmt$(t.door)} sub={PAGE.doorSub} first />
        <Cell k={PAGE.spent} v={fmt$(t.spent)} sub={PAGE.spentSub(t.keptPct)} right />
        <Cell k={PAGE.avg} v={t.avg != null ? `${t.avg}%` : PAGE.none} sub={PAGE.avgSub(t.avg != null ? t.rolled : null)} first bottom />
        <Cell k={PAGE.best} v={t.best ? signed$(profit(t.best)) : PAGE.none} sub={t.best?.name ?? PAGE.bestNone} right bottom good />
      </View>
      <View style={[styles.strip, { backgroundColor: c.paper2, borderTopColor: c.ink }]}>
        <View style={styles.stripHead}>
          <T v="label" color={c.ink3}>{PAGE.strip}</T>
          <T v="meta" color={c.ink3} style={{ fontSize: 11.5 }}>{PAGE.stripSub}</T>
        </View>
        <Strip chron={t.chron} max={t.maxSwing} onOpen={onOpen} />
      </View>
    </View>
  );
}

function Cell({ k, v, sub, first, right, bottom, good }: { k: string; v: string; sub: string; first?: boolean; right?: boolean; bottom?: boolean; good?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.cell, first && { borderRightWidth: 1, borderRightColor: c.lineSoft }, !bottom && { borderBottomWidth: 1, borderBottomColor: c.lineSoft }, right && { paddingLeft: 14 }]}
      accessible accessibilityLabel={`${k}: ${v}, ${sub}`}>
      <T v="label" color={c.ink3} numberOfLines={1} style={{ fontSize: 9.5 }}>{k}</T>
      <T v="title" color={good ? c.pastel.mint.ink : c.ink} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 20, lineHeight: 24 }}>{v}</T>
      <T v="meta" color={c.ink3} numberOfLines={1} style={{ fontSize: 11.5 }}>{sub}</T>
    </View>
  );
}

const UP = 64, DOWN = 34, BAR_W = 58;

export function Strip({ chron, max, onOpen }: { chron: Party[]; max: number; onOpen: (id: number) => void }) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
      {chron.map((p, i) => <Bar key={p.id} p={p} i={i} max={max} onPress={() => onOpen(p.id)} />)}
    </ScrollView>
  );
}

function Bar({ p, i, max, onPress }: { p: Party; i: number; max: number; onPress: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const n = profit(p);
  const pos = n >= 0;
  const h = barPct(n, max) / 100;
  const g = useSharedValue(m.reduced ? 1 : 0);
  const op = useSharedValue(m.reduced ? 0 : 1);
  useEffect(() => {
    if (m.reduced) { g.value = 1; op.value = withDelay(m.t(i * 30), withTiming(1, m.timing(200, "out"))); return; }
    g.value = withDelay(m.t(200 + Math.min(i, 10) * 40), withSpring(1, m.spring("pop")));
  }, [m, i]); // eslint-disable-line react-hooks/exhaustive-deps
  const grow = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scaleY: Math.max(0, g.value) }] }));
  const ink = pos ? c.pastel.mint.ink : c.pastel.rose.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${p.name} · ${signed$(n)}`} style={({ pressed }) => [{ width: BAR_W, alignItems: "center" }, pressed && { opacity: 0.7 }]}>
      <T v="mono" color={ink} style={{ fontSize: 11, fontWeight: "700", paddingBottom: 4 }} numberOfLines={1} adjustsFontSizeToFit>{signed$(n)}</T>
      <View style={[styles.up, { borderBottomColor: c.ink }]}>
        {pos ? <Animated.View style={[styles.barUp, { height: UP * h, backgroundColor: c.note.fill.mint, borderColor: c.ink, transformOrigin: "bottom" }, grow]} /> : null}
      </View>
      <View style={styles.down}>
        {!pos ? <Animated.View style={[styles.barDown, { height: DOWN * h, backgroundColor: c.note.fill.rose, borderColor: c.ink, transformOrigin: "top" }, grow]} /> : null}
      </View>
      <T v="meta" color={c.ink3} numberOfLines={1} style={{ fontSize: 11, paddingTop: 3 }}>{p.name}</T>
    </Pressable>
  );
}

/* ── the book ─────────────────────────────────────────────────────────────────── */

// At phone width the web drops the column heads, the collab and the day/time (shown in the drawer).
const DATE_W = 56;

export interface BookActs {
  onToggle: (p: Party) => void;
  onWrap: (p: Party) => void;
  onEdit: (p: Party) => void;
  onDelete: (p: Party) => void;
  onTimeline: (eventId: number) => void;
  /** Where a row sits in the book, for the strip's jump. */
  onRowY?: (id: number, y: number) => void;
}

const NOOP_ACTS: BookActs = { onToggle: () => {}, onWrap: () => {}, onEdit: () => {}, onDelete: () => {}, onTimeline: () => {} };

/** Every party as a ledger line; a tap opens its drawer in place (the web's row, at phone width). */
export function Book({ parties, today, officer, org = "", openId = null, rolls, acts = NOOP_ACTS }: {
  parties: Party[]; today: string; officer: boolean; org?: string; openId?: number | null; rolls?: Map<number, Roll>; acts?: BookActs;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.book, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `5px 5px 0 ${c.note.fill.rose}` }]}>
      {parties.map((p, i) => (
        <Row key={p.id} p={p} today={today} officer={officer} org={org} last={i === parties.length - 1} open={openId === p.id} roll={rolls?.get(p.id)} acts={acts} />
      ))}
      <View pointerEvents="none" style={[styles.margin, { backgroundColor: alpha(c.pastel.rose.ink, 0.45) }]} />
    </View>
  );
}

const Row = memo(function Row({ p, today, officer, org, last, open, roll, acts }: {
  p: Party; today: string; officer: boolean; org: string; last: boolean; open: boolean; roll: Roll | undefined; acts: BookActs;
}) {
  const { c } = useTheme();
  const due = needsWrapUp(p, today);
  const up = isUpcoming(p, today);
  const time = partyTime(p);
  const n = profit(p);
  return (
    <View onLayout={acts.onRowY ? e => acts.onRowY!(p.id, e.nativeEvent.layout.y) : undefined}
      style={[!last && { borderBottomWidth: 1, borderBottomColor: c.pastel.sky.border }, due && { backgroundColor: alpha(c.pastel.rose.soft, 0.85) }]}>
      <View style={styles.row}>
        {up ? <Hatch color={alpha(c.pastel.sky.border, 0.55)} /> : null}
        <Pressable onPress={() => acts.onToggle(p)} accessibilityRole="button" accessibilityState={{ expanded: open }}
          accessibilityLabel={`${p.name}, ${monDay(p.date)}${time ? ` · ${time}` : ""}`}
          style={({ pressed }) => [styles.lead, pressed && pressedDim]}>
          <View style={styles.date}>
            <T v="title" style={{ fontSize: 22, lineHeight: 24 }}>{String(dayNum(p.date))}</T>
            <T v="kicker" color={c.ink3} style={{ fontSize: 9 }}>{mon(p.date)}</T>
          </View>
          <View style={styles.main}>
            <View style={styles.nameLine}>
              <View style={[styles.vdot, due ? { backgroundColor: c.pastel.rose.ink, boxShadow: `0 0 0 3px ${c.pastel.rose.soft}` } : up ? { borderWidth: 1.5, borderColor: c.pastel.sky.ink } : { backgroundColor: c.pastel.mint.ink }]} />
              <T v="callout" numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>{p.name}</T>
            </View>
            <View style={styles.sline}>
              <Wristband type={p.partyType} />
              {p.theme ? <T v="meta" color={c.ink3} numberOfLines={1} style={{ fontSize: 12 }}>{p.theme}</T> : null}
            </View>
          </View>
        </Pressable>
        <View style={styles.state}>
          {p.completed ? (
            <View style={{ alignItems: "flex-end" }}>
              <T v="mono" color={n >= 0 ? c.pastel.mint.ink : c.pastel.rose.ink} style={{ fontSize: 14.5, fontWeight: "700" }}>{signed$(n)}</T>
              <T v="kicker" color={c.ink3} style={{ fontSize: 8.5 }}>{PAGE.net}</T>
            </View>
          ) : due && officer ? (
            <Pressable onPress={() => acts.onWrap(p)} accessibilityRole="button" accessibilityLabel={PAGE.wrap} hitSlop={6}
              style={({ pressed }) => [styles.badge, { backgroundColor: c.pastel.rose.soft, borderColor: c.pastel.rose.ink, boxShadow: `${pressed ? 1 : 2}px ${pressed ? 1 : 2}px 0 ${c.note.fill.rose}` }, pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
              <T v="pill" color={c.pastel.rose.ink}>{PAGE.wrap}</T>
            </Pressable>
          ) : due ? (
            <View style={[styles.badge, { backgroundColor: c.pastel.rose.soft, borderColor: c.pastel.rose.border }]}>
              <T v="pill" color={c.pastel.rose.ink}>{PAGE.needs}</T>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: c.pastel.sky.soft, borderColor: c.pastel.sky.border }]}>
              <T v="kicker" color={c.pastel.sky.ink} style={{ fontSize: 9.5 }}>{upcomingLabel(p.date, today)}</T>
            </View>
          )}
          <Pressable onPress={() => acts.onToggle(p)} hitSlop={8} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
            <Icon name="chev-r" size={14} color={c.ink3} />
          </Pressable>
        </View>
      </View>
      {open ? <Drawer p={p} org={org} today={today} officer={officer} roll={roll} acts={acts} /> : null}
    </View>
  );
});

/** The open row: the night's till receipt, then its notes, facts, roll call and actions. */
function Drawer({ p, org, today, officer, roll, acts }: { p: Party; org: string; today: string; officer: boolean; roll: Roll | undefined; acts: BookActs }) {
  const { c } = useTheme();
  const m = useMotion();
  const due = needsWrapUp(p, today);
  const rolled = roll && roll.eligible > 0 ? roll : null;
  return (
    <Animated.View entering={FadeIn.duration(m.t(180))} style={styles.drawer}>
      <View style={[styles.receipt, { backgroundColor: c.thermal.paper, borderColor: alpha(c.thermal.ink, 0.18) }]}>
        <ReceiptLines p={p} org={org} roll={rolled} today={today} />
      </View>
      <View style={{ gap: 14 }}>
        <T v={p.notes ? "heading" : "body"} color={p.notes ? c.ink2 : c.ink3} style={p.notes ? { fontSize: 18, lineHeight: 25 } : undefined}>
          {p.notes ? <><T v="heading" color={c.pastel.rose.ink} style={{ fontSize: 18 }}>“</T>{p.notes}<T v="heading" color={c.pastel.rose.ink} style={{ fontSize: 18 }}>”</T></> : noteFor(p, today)}
        </T>
        <View style={styles.facts}>
          <Wristband type={p.partyType} />
          {p.theme ? <Fact icon="star" text={p.theme} /> : null}
          {p.collabOrg ? <Fact icon="people" text={`with ${p.collabOrg}`} /> : null}
          {p.mandatory ? <Fact icon="check" text={RECEIPT.mandatory} /> : null}
        </View>
        {rolled ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <T v="label" color={c.ink3}>{RECEIPT.whoCame}</T>
              <T v="mono" color={c.ink} style={{ fontWeight: "700" }}>{RECEIPT.of(rolled)}</T>
            </View>
            <RollDots present={rolled.present} eligible={rolled.eligible} />
          </View>
        ) : null}
        <View style={styles.acts}>
          {due && officer ? <Button label={RECEIPT.wrapUp} size="sm" icon="check" tone="rose" onPress={() => acts.onWrap(p)} /> : null}
          {p.attendanceEventId != null ? <Button label={RECEIPT.timeline} size="sm" variant="ghost" icon="timeline" onPress={() => acts.onTimeline(p.attendanceEventId!)} /> : null}
          {officer ? <Button label={RECEIPT.edit} size="sm" variant="ghost" icon="pencil" onPress={() => acts.onEdit(p)} /> : null}
          {officer ? <View style={{ marginLeft: "auto" }}><Button label={RECEIPT.del} size="sm" variant="ghost" icon="trash" tone="rose" onPress={() => acts.onDelete(p)} /></View> : null}
        </View>
      </View>
    </Animated.View>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={14} color={c.ink3} />
      <T v="meta" color={c.ink2} style={{ flexShrink: 1 }}>{text}</T>
    </View>
  );
}

/** Upcoming rows: a pencil hatch across the line (the web's 135° repeating stripe). */
function Hatch({ color }: { color: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="pty-hatch" width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Line x1={0} y1={0} x2={0} y2={10} stroke={color} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#pty-hatch)" />
    </Svg>
  );
}

/* ── the receipt ──────────────────────────────────────────────────────────────── */

export function ReceiptLines({ p, org, roll, today }: { p: Party; org: string; roll: Roll | null; today: string }) {
  const { c } = useTheme();
  const ink = c.thermal.ink, faint = c.thermal.faint;
  const due = needsWrapUp(p, today);
  const time = partyTime(p);
  const n = profit(p);
  const dash = <View style={[styles.rdash, { borderColor: alpha(ink, 0.35) }]} />;
  const ln = (k: string, v: string, o?: { big?: boolean; color?: string }) => (
    <View style={styles.rline}>
      <T v="mono" color={ink} style={{ fontSize: o?.big ? 14.5 : 12, fontWeight: o?.big ? "700" : "500", letterSpacing: 0.6 }}>{k}</T>
      <T v="mono" color={o?.color ?? ink} style={{ fontSize: o?.big ? 14.5 : 12, fontWeight: o?.big ? "700" : "500" }}>{v}</T>
    </View>
  );
  const pct = rollPct(roll);
  return (
    <View style={{ gap: 2 }}>
      <T v="kicker" color={faint} align="center" style={{ fontSize: 9.5 }} numberOfLines={1}>{RECEIPT.head(org)}</T>
      <T v="subhead" color={ink} align="center">{p.name}</T>
      <T v="mono" color={faint} align="center" style={{ fontSize: 11 }}>{`${dow(p.date)} ${monDay(p.date)}${time ? ` · ${time}` : ""}`}</T>
      {dash}
      {p.completed ? (
        <>
          {ln(RECEIPT.door, fmt$(p.doorRevenue))}
          {ln(RECEIPT.spent, `−${fmt$(p.expenses)}`)}
          {dash}
          {ln(RECEIPT.net, receiptNet(n), { big: true, color: n < 0 ? c.thermal.neg : ink })}
        </>
      ) : (
        <View style={{ alignItems: "center", gap: 3, paddingVertical: 2 }}>
          <T v="mono" color={due ? c.thermal.neg : ink} style={{ fontSize: 16, fontWeight: "700", letterSpacing: 3 }}>{due ? RECEIPT.noFigures : RECEIPT.tabOpen}</T>
          <T v="meta" color={faint} align="center" style={{ fontSize: 11.5 }}>{due ? RECEIPT.dueLine : RECEIPT.openLine}</T>
        </View>
      )}
      {roll && pct != null ? <>{dash}{ln(RECEIPT.members, `${roll.present}/${roll.eligible} · ${pct}%`)}</> : null}
      {p.attendance > 0 ? ln(RECEIPT.thru, String(p.attendance)) : null}
      <T v="mono" color={faint} align="center" style={{ fontSize: 10, letterSpacing: 2, marginTop: 8 }}>{p.completed ? RECEIPT.closed : RECEIPT.open}</T>
    </View>
  );
}

/** Who came: a dot per eligible member, filled for each one present. */
export function RollDots({ present, eligible }: { present: number; eligible: number }) {
  const { c } = useTheme();
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: eligible }, (_, i) => (
        <View key={i} style={[styles.rdot, i < present ? { backgroundColor: c.note.fill.mint, borderColor: c.pastel.mint.ink } : { borderColor: alpha(c.ink, 0.25), borderStyle: "dashed" }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center" },
  hole: { position: "absolute", width: 5, height: 5, borderRadius: 2.5, borderWidth: 1 },

  hero: { borderWidth: 1.5, borderTopLeftRadius: 10, borderTopRightRadius: 20, borderBottomRightRadius: 12, borderBottomLeftRadius: 18, overflow: "hidden", paddingTop: 40 },
  flap: { position: "absolute", top: -1.5, left: 0 },
  seal: { position: "absolute", top: 18, alignSelf: "center", width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] },
  heroBody: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 6, gap: 10 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  clockTile: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },

  takings: { borderWidth: 1.5, borderTopLeftRadius: 8, borderTopRightRadius: 18, borderBottomRightRadius: 10, borderBottomLeftRadius: 16, overflow: "hidden" },
  head: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, gap: 6, borderBottomWidth: 1.5, borderStyle: "dashed" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "50%", paddingVertical: 12, paddingHorizontal: 16, gap: 3 },
  strip: { borderTopWidth: 1.5, paddingTop: 12, paddingBottom: 14, paddingHorizontal: 14, gap: 10 },
  stripHead: { gap: 1 },
  up: { height: UP, width: "100%", alignItems: "center", justifyContent: "flex-end", borderBottomWidth: 1.5 },
  down: { height: DOWN, width: "100%", alignItems: "center", justifyContent: "flex-start" },
  barUp: { width: 26, borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  barDown: { width: 26, borderWidth: 1.5, borderTopWidth: 0, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },

  book: { borderWidth: 1.5, borderTopLeftRadius: 8, borderTopRightRadius: 18, borderBottomRightRadius: 10, borderBottomLeftRadius: 16, overflow: "hidden" },
  cols: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1.5 },
  margin: { position: "absolute", left: DATE_W, top: 0, bottom: 0, width: 1.5 },
  row: { flexDirection: "row", alignItems: "center", minHeight: 68, overflow: "hidden" },
  lead: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  date: { width: DATE_W, alignItems: "center", gap: 1 },
  main: { flex: 1, minWidth: 0, paddingLeft: 14, paddingRight: 8, paddingVertical: 10, gap: 5 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  vdot: { width: 8, height: 8, borderRadius: 4 },
  sline: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 3 },
  state: { paddingRight: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, minHeight: 28 },

  drawer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20, gap: 16 },
  receipt: { maxWidth: 280, borderWidth: 1, borderRadius: 4, paddingHorizontal: 18, paddingVertical: 16, transform: [{ rotate: "-0.6deg" }], boxShadow: "0 8px 14px rgba(0,0,0,0.12)" },
  facts: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 18, rowGap: 6 },
  fact: { flexDirection: "row", alignItems: "center", gap: 6 },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rline: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  rdash: { borderTopWidth: 1.5, borderStyle: "dashed", marginVertical: 7 },
  dots: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  rdot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
});
