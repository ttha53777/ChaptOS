/**
 * The Treasury's two instruments, as the web's PaperTreasury.tsx draws them on a phone
 * (paper-treasury.css at max-width 560px), from the shared model in @/lib/treasury/chart:
 *
 *   BalanceChart  the delta pill and "N scheduled → $X by Dec 5"; the running balance as a
 *                 step line, solid to today on a mint wash, dashed peach through what's
 *                 scheduled; y labels in k, month initials (every other past six months);
 *                 today's dot + flag ("Today · $2,288"), the scheduled end's flag; drag
 *                 across to scrub (the day, the balance, up to three entries)
 *   Breakdown     the inked ring ("$440 came in"), the lede, a row per category (tap to see
 *                 its entries), or the uncharged ring with the org's ready categories
 */
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, Line, Path } from "react-native-svg";
import type { ChartEntry } from "@/lib/treasury/ledger";
import {
  balanceMarks, balanceModel, breakdownLede, dayAtFraction, fmtD, kfmt, liftHex, m0, m2, scrubAt, todayFlag,
  type BreakdownRow, type ChartRange,
} from "@/lib/treasury/chart";
import { Icon } from "~/icons/Icon";
import { TONES } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";

const H = 170, LEFT = 46, BOTTOM = 22;

/** A flag that sits above (or below) a point, nudged in from the edges like the web's .r/.l. */
function Flag({ x, y, text, kind, w }: { x: number; y: number; text: string; kind: "today" | "end"; w: number }) {
  const { c } = useTheme();
  const [fw, setFw] = useState(0);
  const pct = w ? x / w : 0;
  const left = kind === "end" ? x - fw * 0.8 : pct > 0.8 ? x - fw + 8 : pct < 0.12 ? x - 8 : x - fw / 2;
  const top = kind === "end" ? y + 12 : y - 12 - 18;
  return (
    <View onLayout={e => setFw(e.nativeEvent.layout.width)} pointerEvents="none"
      style={[styles.flag, { left, top, opacity: fw ? 1 : 0 },
        kind === "end" ? { backgroundColor: c.pastel.peach.soft, borderColor: c.pastel.peach.border, borderWidth: 1 } : { backgroundColor: c.ink }]}>
      <T v="mono" size={10} style={{ fontFamily: "PlexMono-600" }} color={kind === "end" ? c.pastel.peach.ink : c.paper} numberOfLines={1}>{text}</T>
    </View>
  );
}

export function BalanceChart({ opening, posted, scheduled, termStart, asOf, isToday, range, ghost, onScheduled }: {
  opening: number; posted: ChartEntry[]; scheduled: ChartEntry[]; termStart: string; asOf: string; isToday: boolean;
  range: ChartRange; ghost?: boolean; onScheduled?: () => void;
}) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const model = useMemo(() => balanceModel(opening, posted, scheduled, termStart, asOf, range), [opening, posted, scheduled, termStart, asOf, range]);
  const mk = useMemo(() => balanceMarks(model), [model]);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  if (ghost) {
    return (
      <View>
        <View style={styles.delta}>
          <View style={[styles.pill, { backgroundColor: c.paper2, borderColor: c.line2 }]}>
            <T v="buttonSm" size={12} color={c.ink2}>Opening balance{termStart ? ` · ${fmtD(termStart)}` : ""}</T>
          </View>
          <T v="body" size={13.5} color={c.ink2}>Nothing has moved yet.</T>
        </View>
        <View style={[styles.chart, { height: H }]} onLayout={onLayout}>
          {w ? <Svg width={w} height={H} style={StyleSheet.absoluteFill}><Line x1={0} x2={w} y1={H / 2} y2={H / 2} stroke={c.line2} strokeWidth={1.5} strokeDasharray="4 5" /></Svg> : null}
          <View style={styles.ghostCapWrap} pointerEvents="none">
            <View style={[styles.ghostCap, { backgroundColor: c.card, borderColor: c.line2 }]}>
              <T v="meta" color={c.ink3}>The line starts with your first entry</T>
            </View>
          </View>
        </View>
      </View>
    );
  }

  const pw = Math.max(0, w - LEFT), ph = H - BOTTOM;
  const sx = pw / 1000, sy = ph / 200;
  const scale = (d: string) => d.replace(/([MHV])(-?[\d.]+)(?: (-?[\d.]+))?/g, (_, cmd: string, a: string, b?: string) =>
    cmd === "M" ? `M${(+a * sx).toFixed(1)} ${(+b! * sy).toFixed(1)}` : cmd === "H" ? `H${(+a * sx).toFixed(1)}` : `V${(+a * sy).toFixed(1)}`);
  const px = (iso: string) => model.X(iso) * sx, py = (v: number) => model.Y(v) * sy;
  const tx = px(model.asOf), ty = py(mk.bal);
  const hv = hover ? scrubAt(model, hover) : null;

  const pan = Gesture.Pan().activeOffsetX([-6, 6]).failOffsetY([-14, 14]).runOnJS(true)
    .onBegin(e => { if (pw) setHover(dayAtFraction(model, (e.x - LEFT) / pw)); })
    .onUpdate(e => { if (pw) setHover(dayAtFraction(model, (e.x - LEFT) / pw)); })
    .onFinalize(() => setHover(null));

  return (
    <View>
      <View style={styles.delta}>
        <View style={[styles.pill, mk.delta >= 0
          ? { backgroundColor: c.pastel.mint.soft, borderColor: c.pastel.mint.border }
          : { backgroundColor: c.pastel.peach.soft, borderColor: c.pastel.peach.border }]}>
          <T v="buttonSm" size={12} color={mk.delta >= 0 ? c.pastel.mint.ink : c.pastel.peach.ink}>{mk.deltaText}</T>
        </View>
        {mk.projText ? (
          <Pressable onPress={onScheduled} accessibilityRole="button" style={styles.proj} hitSlop={6}>
            <Icon name="clock" size={13} color={c.ink3} />
            <T v="body" size={13.5} color={c.ink2}>{mk.projText.n} scheduled → <T v="bodyStrong" size={13.5}>{mk.projText.to}</T> by {mk.projText.by}</T>
          </Pressable>
        ) : null}
      </View>
      <GestureDetector gesture={pan}>
        <View style={[styles.chart, { height: H }]} onLayout={onLayout} accessible accessibilityRole="image"
          accessibilityLabel={`Running balance from ${fmtD(model.st)} to ${fmtD(model.asOf)}, ${m0(mk.bal)} ${isToday ? "today" : "at the close"}`}>
          {w ? <>
            <Svg width={pw} height={ph} style={{ position: "absolute", left: LEFT, top: 0 }}>
              {mk.grid.map(v => <Line key={v} x1={0} x2={pw} y1={py(v)} y2={py(v)} stroke={c.line} strokeWidth={1} strokeDasharray="3 4" />)}
              <Path d={scale(mk.area)} fill={c.pastel.mint.soft} />
              {mk.hasFut ? <Path d={scale(mk.fut)} fill="none" stroke={c.pastel.peach.ink} strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" opacity={0.85} /> : null}
              <Path d={scale(mk.line)} fill="none" stroke={c.pastel.mint.ink} strokeWidth={2.2} strokeLinejoin="round" />
              <Line x1={tx} x2={tx} y1={0} y2={ph} stroke={c.line2} strokeWidth={1.5} strokeDasharray="4 4" />
              {hv ? <Line x1={hv.x * 10 * sx} x2={hv.x * 10 * sx} y1={0} y2={ph} stroke={c.ink} strokeWidth={1.5} /> : null}
            </Svg>
            {mk.grid.map(v => (
              <T key={v} v="mono" size={10} color={c.ink3} align="right" style={[styles.yl, { top: py(v) - 7 }]}>{kfmt(v)}</T>
            ))}
            {mk.months.map((m, i) => i % 2 && mk.months.length > 6 ? null : (
              <T key={m} v="mono" size={10} color={c.ink3} style={[styles.xl, { left: LEFT + px(m) - 12 }]}>{fmtD(m).split(" ")[0]}</T>
            ))}
            <View style={{ position: "absolute", left: LEFT, top: 0, width: pw, height: ph }} pointerEvents="none">
              {mk.hasFut ? <>
                <View style={[styles.dot, styles.dotEnd, { left: px(mk.lf[0]) - 5.5, top: py(mk.lf[1]) - 5.5, backgroundColor: c.card, borderColor: c.pastel.peach.ink, boxShadow: `0 0 0 4px ${c.pastel.peach.soft}` }]} />
                <Flag kind="end" x={px(mk.lf[0])} y={py(mk.lf[1])} w={pw} text={mk.endFlag} />
              </> : null}
              <View style={[styles.dot, { left: tx - 6.5, top: ty - 6.5, backgroundColor: c.card, borderColor: c.pastel.mint.ink, boxShadow: `0 0 0 4px ${c.pastel.mint.soft}` }]} />
              <Flag kind="today" x={tx} y={ty} w={pw} text={todayFlag(model, isToday, mk.bal)} />
              {hv ? <>
                <View style={[styles.cross, { left: hv.x * 10 * sx - 5.5, top: hv.y * 2 * sy - 5.5, backgroundColor: c.ink, borderColor: c.card }]} />
                <View style={[styles.tip, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.mint.fill, 3),
                  hv.x > 58 ? { right: pw - hv.x * 10 * sx + 14 } : { left: hv.x * 10 * sx + 14 }]}>
                  <T v="kicker" size={10} ls={0.06} color={c.ink3}>{hv.day}</T>
                  <T v="title" size={17} ls={-0.025}>{m2(hv.v)}</T>
                  {hv.ents.slice(0, 3).map((e, i) => (
                    <View key={i} style={styles.tipE}>
                      <T v="meta" size={12.5} color={c.ink2} numberOfLines={1} style={{ flexShrink: 1 }}>{e.label.length > 26 ? `${e.label.slice(0, 25)}…` : e.label}</T>
                      <T v="mono" size={11.5} color={e.amount >= 0 ? c.pastel.mint.ink : c.pastel.peach.ink}>{e.amount >= 0 ? "+" : "−"}{m0(Math.abs(e.amount))}</T>
                    </View>
                  ))}
                  {hv.ents.length > 3 ? <T v="meta" size={12.5} color={c.ink2}>+{hv.ents.length - 3} more</T> : null}
                  {hv.isFut ? <T v="buttonSm" size={11} color={c.pastel.peach.ink} style={{ marginTop: 4 }}>Projected · scheduled entries</T> : null}
                </View>
              </> : null}
            </View>
          </> : null}
        </View>
      </GestureDetector>
    </View>
  );
}

/* ── Breakdown ───────────────────────────────────────────────────────────────── */

const RING = 132, HOLE = 24;

export function Breakdown({ kind, rows, ready, ghost, onPick }: {
  kind: "income" | "expense"; rows: BreakdownRow[]; ready: { slug: string; label: string; color: string | null }[]; ghost?: boolean;
  onPick?: (slug: string) => void;
}) {
  const { c } = useTheme();
  const night = c.scheme === "dark";
  const ramp = TONES.map(t => c.pastel[t].fill);
  const RAMP = [ramp[2]!, ramp[0]!, ramp[1]!, ramp[3]!, ramp[4]!, ramp[5]!]; // mint, peach, sky, butter, lilac, rose
  const col = (r: { color: string | null }, i: number) => r.color ? liftHex(r.color, night ? 0.74 : 0.87, night ? 0.7 : 0.6) : RAMP[i % RAMP.length]!;
  const ld = breakdownLede(kind, rows);

  if (ghost || !ld.charged) {
    return (
      <View>
        <View style={styles.donut}>
          <View style={[styles.ring, { borderColor: c.line2 }]}>
            <View style={[styles.hole, { borderColor: c.line2, backgroundColor: c.card }]}>
              <T v="title" size={19} color={c.ink3}>—</T>
              <T v="label" size={9} ls={0.09} color={c.ink3}>{kind === "income" ? "in" : "out"}</T>
            </View>
          </View>
          <T v="body" size={14} lh={1.5} color={c.ink2}>
            {ghost
              ? `Fills in once money moves — there’s no split to show yet.${ready.length > 0 ? " Your categories are ready:" : ""}`
              : `Nothing ${kind === "income" ? "has come in" : "has gone out"} this term yet.${ready.length > 0 ? " It’ll split across:" : ""}`}
          </T>
        </View>
        {ready.length ? (
          <View style={styles.ready}>
            {ready.map((r, i) => (
              <View key={r.slug} style={[styles.cpill, { borderColor: col(r, i), backgroundColor: c.card }]}>
                <View style={[styles.cdot, { backgroundColor: col(r, i) }]} />
                <T v="buttonSm" size={12} color={c.ink2}>{r.label}</T>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  // The conic ring: each category's arc, then a thin ink seam (0.7%) where it ends.
  const IN = RING - 3, SW = HOLE, RAD = IN / 2 - SW / 2;
  const circ = 2 * Math.PI * RAD;
  let acc = 0;
  const arcs = rows.flatMap((r, i) => {
    const a = acc, b = acc + r.value / ld.total; acc = b;
    const seam = rows.length > 1 ? 0.007 : 0;
    return [
      { key: `${r.slug}`, from: a, len: Math.max(0, b - a - seam), color: col(r, i) },
      ...(seam ? [{ key: `${r.slug}-s`, from: b - seam, len: seam, color: c.ink }] : []),
    ];
  });

  return (
    <View>
      <View style={styles.donut}>
        <View style={[styles.ring, { borderColor: c.ink }, hard(c.line2, 3)]}>
          <Svg width={IN} height={IN} style={{ position: "absolute", top: 0, left: 0, transform: [{ rotate: "-90deg" }] }}>
            {arcs.map(a => (
              <Circle key={a.key} cx={IN / 2} cy={IN / 2} r={RAD} fill="none" stroke={a.color} strokeWidth={SW}
                strokeDasharray={`${a.len * circ} ${circ}`} strokeDashoffset={-a.from * circ} />
            ))}
          </Svg>
          <View style={[styles.hole, { borderColor: c.ink, backgroundColor: c.card }]}>
            <T v="title" size={19} ls={-0.035}>{m0(ld.total)}</T>
            <T v="label" size={9} ls={0.09} color={c.ink3}>{ld.word}</T>
          </View>
        </View>
        <T v="body" size={14} lh={1.5} color={c.ink2}>
          {ld.single
            ? <>All of it is <T v="bodyStrong" size={14}>{ld.top!.label}</T> so far — {m0(ld.top!.value)}.</>
            : <><T v="bodyStrong" size={14}>{ld.top!.label}</T> is the biggest — {m0(ld.top!.value)}, {ld.topPct}% of everything that {ld.word}.</>}
        </T>
      </View>
      <View style={styles.cats}>
        {rows.map((r, i) => {
          const p = (r.value / ld.total) * 100;
          return (
            <Pressable key={r.slug} onPress={() => onPick?.(r.slug)} accessibilityRole="button" accessibilityLabel={`See ${r.label} entries, ${m0(r.value)}, ${Math.round(p)}%`}
              style={({ pressed }) => [styles.cat, pressed && { backgroundColor: c.paper2 }]}>
              <View style={styles.catRow}>
                <View style={[styles.sw, { backgroundColor: col(r, i), borderColor: c.note.ink }]} />
                <T v="bodyStrong" size={14} numberOfLines={1} style={{ flex: 1 }}>{r.label}</T>
                <T v="mono" size={12.5} color={c.ink2}>{m0(r.value)}<T v="mono" size={12.5} color={c.ink3}>{`  ${Math.round(p)}%`}</T></T>
              </View>
              <View style={[styles.bar, { backgroundColor: c.paper3 }]}><View style={{ width: `${p}%`, height: "100%", borderRadius: 3, backgroundColor: col(r, i) }} /></View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  delta: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 8 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  proj: { flexDirection: "row", alignItems: "center", gap: 6 },
  chart: { marginTop: 16, position: "relative" },
  ghostCapWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingBottom: H * 0.16 },
  ghostCap: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  yl: { position: "absolute", left: 0, width: 40 },
  xl: { position: "absolute", bottom: 0, width: 24, textAlign: "center" },
  dot: { position: "absolute", width: 13, height: 13, borderRadius: 7, borderWidth: 2.5 },
  dotEnd: { width: 11, height: 11, borderRadius: 6 },
  flag: { position: "absolute", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  cross: { position: "absolute", width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  tip: { position: "absolute", top: -6, maxWidth: 230, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, zIndex: 3 },
  tipE: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 4 },
  donut: { gap: 18, paddingHorizontal: 18, paddingVertical: 6, alignItems: "flex-start" },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  hole: { position: "absolute", top: HOLE, left: HOLE, right: HOLE, bottom: HOLE, borderRadius: RING, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  ready: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 16 },
  cpill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  cdot: { width: 6, height: 6, borderRadius: 3 },
  cats: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 14, gap: 2 },
  cat: { paddingHorizontal: 8, paddingVertical: 7, borderRadius: 11, gap: 4 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  sw: { width: 12, height: 12, borderRadius: 4, borderWidth: 1.5 },
  bar: { marginLeft: 23, height: 5, borderRadius: 3, overflow: "hidden" },
});
