/**
 * The Fundraisers paper (app/org/[slug]/fundraisers/fundraisers-paper.css, on the phone):
 *
 *   Cal         the desk-calendar day (month over the date)
 *   KindChip    Bake sale / Drink sale / Car wash / Raffle / Something else, in its hue
 *   Dots        the three steps as dots on a card
 *   PriceTag    the tag hanging off a card: MADE / SHORT and the figure, a ghost "?" before
 *   MoneyJar    butter fills to what the supplies cost, mint is what came in above that,
 *               a rose hatch is the gap when it came up short; dashed lines for supplies
 *               and the goal. Pours on mount and whenever the figure changes; a stamp
 *               (WRAPPED / SHORT) can slam onto the lid.
 *   Card        one fundraiser on the list
 *   StepsBar    shopping list → wrap up → what you made, over a fundraiser's page
 */
import type { Fundraiser, FundraiserKind } from "@/lib/api-types";
import { memo, useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Pattern, Rect, Text as SvgText } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import type { Tone } from "~/theme/palette";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import {
  $m, FUNDRAISER_KINDS, JAR, LIST, dayOf, dotsOn, goalClose, jarCap, jarLabel, jarY, mon3, stageOf, type StepState,
} from "./model";

/* ── small paper ──────────────────────────────────────────────────────────────── */

export function Cal({ date, size = 44 }: { date: string | null; size?: number }) {
  const { c } = useTheme();
  return (
    <View style={[styles.cal, { width: size, borderColor: c.ink, backgroundColor: c.card }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.calTop, { backgroundColor: c.pastel.rose.fill, borderBottomColor: c.ink }]}>
        <T v="kicker" color={c.note.ink} style={{ fontSize: 8.5 }}>{date ? mon3(date) : "Day"}</T>
      </View>
      <T v="title" style={{ fontSize: size * 0.45, lineHeight: size * 0.56 }}>{date ? String(dayOf(date)) : "?"}</T>
    </View>
  );
}

export function KindChip({ kind }: { kind: FundraiserKind }) {
  const { c } = useTheme();
  const K = FUNDRAISER_KINDS[kind];
  const p = c.pastel[K.hue as Tone];
  return (
    <View style={[styles.chip, { backgroundColor: p.soft, borderColor: p.border }]}>
      <Icon name={K.icon as IconName} size={12} color={p.ink} />
      <T v="meta" color={p.ink} style={{ fontSize: 12, fontWeight: "600" }}>{K.label}</T>
    </View>
  );
}

export function Chip({ icon, text, tone }: { icon: IconName; text: string; tone?: Tone }) {
  const { c } = useTheme();
  const p = tone ? c.pastel[tone] : null;
  return (
    <View style={[styles.chip, { backgroundColor: p ? p.soft : c.card, borderColor: p ? p.border : c.line2 }]}>
      <Icon name={icon} size={12} color={p ? p.ink : c.ink3} />
      <T v="meta" color={p ? p.ink : c.ink2} style={{ fontSize: 12 }}>{text}</T>
    </View>
  );
}

export function Dots({ f }: { f: Fundraiser }) {
  const { c } = useTheme();
  const n = dotsOn(f);
  return (
    <View style={styles.dots} accessible accessibilityLabel={LIST.step(n)}>
      {[1, 2, 3].map(i => <View key={i} style={[styles.dot, { borderColor: c.ink }, n >= i && { backgroundColor: c.ink }]} />)}
    </View>
  );
}

/** The price tag that hangs off a card. Ghost "?" until wrapped. */
export function PriceTag({ made, rt, size = 64 }: { made: number | null; rt: number; size?: number }) {
  const { c } = useTheme();
  const w = made != null, loss = w && made < 0;
  const fill = !w ? "transparent" : loss ? c.pastel.rose.soft : c.pastel.mint.soft;
  const ink = !w ? c.ink3 : loss ? c.pastel.rose.ink : c.pastel.mint.ink;
  return (
    <View style={{ width: size, height: size * 1.11, transform: [{ rotate: `${rt}deg` }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg viewBox="0 -14 110 136" width="100%" height="100%">
        <Path d="M55 -14C47 -4 63 4 55 22" stroke={c.ink3} strokeWidth={2} fill="none" />
        <Path d="M14 32 55 10l41 22v74a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6Z" fill={fill} stroke={w ? c.ink : c.ink3} strokeWidth={2.4} strokeDasharray={w ? undefined : "5 4"} />
        <Circle cx={55} cy={26} r={4.6} fill={c.paper} stroke={w ? c.ink : c.ink3} strokeWidth={2} />
        <SvgText x={55} y={62} textAnchor="middle" fontSize={13} fontFamily="PlexMono-600" letterSpacing={1.5} fill={ink}>{loss ? "SHORT" : "MADE"}</SvgText>
        <SvgText x={55} y={90} textAnchor="middle" fontSize={w ? 20 : 26} fontFamily="Bricolage-700" fill={w ? c.ink : c.ink3}>{w ? $m(Math.abs(made)) : "?"}</SvgText>
      </Svg>
    </View>
  );
}

/* ── the jar ──────────────────────────────────────────────────────────────────── */

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const HIDE = JAR.h + 20;

/** One layer of money: a tall rect whose top rides to `y` (or drops out of sight). */
function Layer({ y, show, fill, coins, uid }: { y: number; show: boolean; fill: string; coins?: boolean; uid: string }) {
  const m = useMotion();
  const top = useSharedValue(HIDE);
  useEffect(() => {
    const to = show ? y : HIDE;
    top.value = m.reduced ? to : withTiming(to, m.timing(900, "out"));
  }, [y, show, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const props = useAnimatedProps(() => ({ y: JAR.top + top.value }));
  return (
    <>
      <AnimatedRect x={0} width={200} height={200} fill={fill} animatedProps={props} />
      {coins ? <AnimatedRect x={0} width={200} height={200} fill={`url(#fzc${uid})`} opacity={0.12} animatedProps={props} /> : null}
    </>
  );
}

export const MoneyJar = memo(function MoneyJar({ sup, goal, inn, stamp = null, slam = false, width = 150, uid }: {
  sup: number; goal: number | null; inn: number | null; stamp?: "WRAPPED" | "SHORT" | null; slam?: boolean; width?: number; uid: string;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const v = inn ?? 0;
  const cap = jarCap(sup, goal, inn);
  const ty = (x: number) => jarY(x, cap);
  const close = goalClose(sup, goal, cap);
  const butter = c.pastel.butter.fill, mint = c.pastel.mint.fill;

  // The stamp: shown at rest, or slammed down (pop spring) with the success tap on impact.
  const sc = useSharedValue(slam && !m.reduced ? 2.2 : 1);
  const op = useSharedValue(stamp ? (slam ? 0 : 1) : 0);
  useEffect(() => {
    if (!stamp) { op.value = 0; return; }
    if (!slam) { op.value = 1; sc.value = 1; return; }
    if (m.reduced) { op.value = withTiming(1, m.timing(200, "out")); haptics.success(); return; }
    op.value = withDelay(m.t(650), withTiming(1, m.timing(90, "out")));
    sc.value = withDelay(m.t(650), withSequence(withSpring(0.92, m.spring("pop"), () => { scheduleOnRN(haptics.success); }), withSpring(1, m.spring("settle"))));
  }, [stamp, slam]); // eslint-disable-line react-hooks/exhaustive-deps
  const stampSt = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ rotate: "-8deg" }, { scale: sc.value }] }));

  return (
    <View style={{ width, height: width * 1.25 }} accessible accessibilityRole="image" accessibilityLabel={jarLabel(sup, inn)}>
      <Svg viewBox="0 0 200 250" width="100%" height="100%">
        <Defs>
          <ClipPath id={`fzj${uid}`}><Path d={JAR.body} /></ClipPath>
          <Pattern id={`fzc${uid}`} width={24} height={15} patternUnits="userSpaceOnUse">
            <Circle cx={6} cy={5} r={4.2} fill={c.note.ink} /><Circle cx={18} cy={12} r={4.2} fill={c.note.ink} />
          </Pattern>
          <Pattern id={`fzh${uid}`} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <Rect width={8} height={8} fill={c.pastel.rose.soft} /><Path d="M0 0v8" stroke={c.pastel.rose.ink} strokeWidth={2.2} opacity={0.55} />
          </Pattern>
        </Defs>
        <Path d={JAR.body} fill={alpha(c.card, 0.6)} />
        <G clipPath={`url(#fzj${uid})`}>
          <Layer uid={uid} y={ty(sup)} show={inn != null && v < sup} fill={`url(#fzh${uid})`} />
          <Layer uid={uid} y={ty(v)} show={v > sup} fill={mint} coins />
          <Layer uid={uid} y={ty(Math.min(v, sup))} show={v > 0} fill={butter} coins />
        </G>
        <Path d="M44 104v74" stroke={c.card} strokeWidth={6} strokeLinecap="round" opacity={0.7} />
        <Path d={JAR.body} fill="none" stroke={c.ink} strokeWidth={3} strokeLinejoin="round" />
        <Rect x={50} y={16} width={100} height={26} rx={6} fill={c.pastel.peach.fill} stroke={c.ink} strokeWidth={3} />
        <Path d="M56 25h88M56 33h88" stroke={c.ink} strokeWidth={1.5} opacity={0.35} />
        {sup > 0 ? (
          <G transform={`translate(0 ${ty(sup)})`}>
            <Line x1={16} x2={184} y1={JAR.top} y2={JAR.top} stroke={c.ink} strokeWidth={2} strokeDasharray="6 5" />
            <SvgText x={34} y={JAR.top - 6} fontSize={12} fontFamily="PlexMono-500" fill={c.ink2}>{`supplies ${$m(sup)}`}</SvgText>
          </G>
        ) : null}
        {goal ? (
          <G transform={`translate(0 ${ty(goal)})`}>
            <Line x1={16} x2={184} y1={JAR.top} y2={JAR.top} stroke={c.pastel.lilac.ink} strokeWidth={2} strokeDasharray="6 5" />
            <SvgText x={166} y={close ? JAR.top + 14 : JAR.top - 6} textAnchor="end" fontSize={12} fontFamily="PlexMono-500" fill={c.pastel.lilac.ink}>{`goal ${$m(goal)}`}</SvgText>
          </G>
        ) : null}
      </Svg>
      {stamp ? (
        <Animated.View pointerEvents="none" style={[styles.stamp, { left: width * 0.48, top: width * 0.2, borderColor: stamp === "SHORT" ? c.pastel.rose.ink : c.pastel.mint.ink, backgroundColor: alpha(c.card, 0.85) }, stampSt]}>
          <T v="kicker" color={stamp === "SHORT" ? c.pastel.rose.ink : c.pastel.mint.ink} style={{ fontSize: width * 0.085, letterSpacing: 1.5 }}>{stamp}</T>
        </Animated.View>
      ) : null}
    </View>
  );
});

/* ── a card on the list ───────────────────────────────────────────────────────── */

export const Card = memo(function Card({ f, rt, today, onOpen }: { f: Fundraiser; rt: number; today: string; onOpen: (f: Fundraiser) => void }) {
  const { c } = useTheme();
  const st = stageOf({ date: f.date, wrapped: !!f.wrappedAt }, today);
  const m = f.made ?? 0;
  const tone = st === "ready" ? c.pastel.butter : st === "wrapped" ? (m < 0 ? c.pastel.rose : c.pastel.mint) : null;
  let foot: React.ReactNode;
  if (st === "wrapped") {
    foot = <T v="meta" color={c.ink2} style={{ flex: 1 }}>{LIST.cardMade(m)}<T v="mono" color={c.ink} style={{ fontWeight: "700" }}>{$m(Math.abs(m))}</T>{LIST.cardOn[0]}{$m(f.spent)}{LIST.cardOn[1]}</T>;
  } else if (st === "ready") {
    foot = <><T v="meta" color={c.ink2} style={{ flex: 1 }}>{LIST.cardReady[0]}<T v="meta" color={c.ink} style={{ fontWeight: "700" }}>{LIST.cardReady[1]}</T></T><Go text={LIST.cardWrap} /></>;
  } else {
    foot = <><T v="meta" color={c.ink2} style={{ flex: 1 }}>{f.supplies.length ? <>{f.supplies.length}{LIST.cardSupplies}<T v="mono" color={c.ink} style={{ fontWeight: "700" }}>{$m(f.spent)}</T></> : LIST.cardNoList}</T><Go text={LIST.cardOpen} /></>;
  }
  return (
    <Pressable onPress={() => onOpen(f)} accessibilityRole="button" accessibilityLabel={f.name}
      style={({ pressed }) => [styles.card, { backgroundColor: tone ? tone.soft : c.card, borderColor: c.ink, boxShadow: `3px 3px 0 ${tone ? tone.fill : c.line2}` }, pressed && pressedDim]}>
      <View style={styles.tag}><PriceTag made={f.made} rt={rt} size={54} /></View>
      <View style={styles.cardTop}>
        <Cal date={f.date} />
        <View style={{ flex: 1, gap: 6, paddingRight: 52 }}>
          <T v="subhead" numberOfLines={2}>{f.name}</T>
          <View style={styles.meta}>
            <KindChip kind={f.kind} />
            {st !== "wrapped" ? <Chip icon="cal" text={LIST.cardWhen(f, today)} /> : null}
          </View>
        </View>
      </View>
      <View style={[styles.cardFoot, { borderTopColor: alpha(c.ink, 0.15) }]}>
        <Dots f={f} />
        {foot}
      </View>
    </Pressable>
  );
});

function Go({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.go}>
      <T v="buttonSm" color={c.ink}>{text}</T>
      <Icon name="arrow-r" size={13} color={c.ink} />
    </View>
  );
}

/* ── the steps over a fundraiser ──────────────────────────────────────────────── */

export function StepsBar({ steps, count, wrapped }: { steps: { state: StepState; title: string; sub: string }[]; count: number; wrapped: boolean }) {
  const { c } = useTheme();
  const mark = (i: number, s: StepState) => {
    if (i === 0 && count) return <Icon name="check" size={13} color={c.ink} />;
    if (i === 1 && wrapped) return <Icon name="check" size={13} color={c.ink} />;
    if (i === 2 && wrapped) return <Icon name="star" size={13} color={c.ink} />;
    return <T v="buttonSm" color={s === "now" ? c.ink : c.ink3}>{String(i + 1)}</T>;
  };
  return (
    <View style={styles.steps}>
      {steps.map((s, i) => {
        const fill = s.state === "done" ? c.pastel.mint.fill : s.state === "now" ? c.pastel.butter.fill : s.state === "win" ? c.pastel.mint.fill : s.state === "miss" ? c.pastel.rose.fill : c.card;
        return (
          <View key={i} style={[styles.step, { borderColor: s.state ? c.ink : c.line2 }]}>
            <View style={[styles.stepN, { backgroundColor: fill, borderColor: s.state ? c.ink : c.line2 }]}>{mark(i, s.state)}</View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T v="callout" color={s.state ? c.ink : c.ink3} style={{ fontWeight: "700" }} numberOfLines={1}>{s.title}</T>
              <T v="meta" color={c.ink3} style={{ fontSize: 12 }} numberOfLines={1}>{s.sub}</T>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cal: { borderWidth: 1.5, borderRadius: 8, overflow: "hidden", alignItems: "center", paddingBottom: 2 },
  calTop: { alignSelf: "stretch", alignItems: "center", paddingVertical: 2, borderBottomWidth: 1.5 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: "flex-start" },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  stamp: { position: "absolute", borderWidth: 2.5, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  card: { borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 12 },
  tag: { position: "absolute", right: 10, top: -6 },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, borderTopWidth: 1.5, borderStyle: "dashed" },
  go: { flexDirection: "row", alignItems: "center", gap: 4 },
  steps: { gap: 8 },
  step: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  stepN: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
