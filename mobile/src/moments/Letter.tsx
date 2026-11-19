/**
 * The join request as a sealed letter (U2 awaiting screen, and the "Join approved"
 * signature moment: "sealed envelope opens; chapter card slides out", success haptic).
 *
 * Sealed: an envelope seen from the back, flap down with a wax seal at its tip, addressed
 * in the member's own name ("as the chapter will know you"), and postmarked with the
 * chapter's mark and the date the request went in.
 *
 * Opening (`open` goes true), ~1.3s:
 *   0–200ms     the seal lifts (−14px, ×1.2) and fades
 *   150–520ms   the flap folds back about its top edge (rotateX 0 → 160°), fading as it
 *               passes edge-on
 *   480–1080ms  the card (`card`) slides up out of the pocket (−y, spring) to stand above
 *               it; success haptic as it clears
 *   1000–1300ms the envelope drops 30px and fades, leaving the card
 * then `onOpened`. Reduced motion: envelope and card cross-fade (180ms); the haptic lands.
 * Transform and opacity only.
 */
import { useEffect, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { ChapterMark } from "~/entry/ChapterMark";
import { Icon } from "~/icons/Icon";
import { DUR } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export const LETTER_OPEN_MS = 1300;
const BASE_W = 300, BASE_H = 190;
/** Room above the envelope for the card to stand in once it's out. */
export const LETTER_HEADROOM = 230;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export function postmarkDate(iso: string): string {
  const [y, mo, d] = iso.slice(0, 10).split("-").map(Number);
  return y && mo && d ? `${MONTHS[mo - 1]} ${d}` : "";
}

export function SealedLetter({ chapter, logoUrl, to, requestedAt, open = false, card, onOpened, headroom = LETTER_HEADROOM }: {
  chapter: string;
  logoUrl: string | null;
  to: string;
  requestedAt: string;
  open?: boolean;
  /** What slides out: drawn at the envelope's width minus a margin. */
  card?: ReactNode;
  onOpened?: () => void;
  /** Space above the envelope the card rises into (0 when it never opens here). */
  headroom?: number;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const { width: screenW } = useWindowDimensions();
  const W = Math.min(BASE_W, screenW - 48);
  const k = W / BASE_W;
  const H = BASE_H * k;
  const cardW = W - 36 * k;

  const seal = useSharedValue(0);
  const flap = useSharedValue(0);
  const rise = useSharedValue(0);
  const drop = useSharedValue(0);
  const fade = useSharedValue(0);

  const done = () => onOpened?.();
  const buzz = () => haptics.success();

  useEffect(() => {
    if (!open) return;
    if (m.reduced) {
      fade.value = withTiming(1, m.timing(DUR.fade, "out"), fin => { if (fin) { scheduleOnRN(buzz); scheduleOnRN(done); } });
      return;
    }
    seal.value = withTiming(1, m.timing(200, "out"));
    flap.value = withDelay(m.t(150), withTiming(1, m.timing(370, "standard")));
    rise.value = withDelay(m.t(480), withTiming(1, m.timing(600, "spring"), fin => { if (fin) scheduleOnRN(buzz); }));
    drop.value = withDelay(m.t(1000), withTiming(1, m.timing(300, "standard"), fin => { if (fin) scheduleOnRN(done); }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sealSt = useAnimatedStyle(() => ({ opacity: 1 - seal.value, transform: [{ translateY: -14 * seal.value }, { scale: 1 + 0.2 * seal.value }] }));
  const flapSt = useAnimatedStyle(() => ({
    opacity: flap.value < 0.5 ? 1 : 1 - (flap.value - 0.5) * 2,
    transform: [{ perspective: 700 }, { rotateX: `${flap.value * 160}deg` }],
  }));
  const envSt = useAnimatedStyle(() => ({
    opacity: m.reduced ? 1 - fade.value : 1 - drop.value,
    transform: [{ translateY: 30 * drop.value }],
  }));
  // Hidden until the flap is past edge-on, so nothing peeks while sealed.
  const cardSt = useAnimatedStyle(() => m.reduced
    ? { opacity: fade.value }
    : { opacity: flap.value > 0.5 ? 1 : 0, transform: [{ translateY: -(headroom - 6) * rise.value + 24 * drop.value }, { scale: 0.94 + 0.06 * rise.value }] });

  const ink = c.ink;
  const stock = c.card;
  const inner = c.paper2;
  const pm = c.pastel.rose.ink;

  return (
    <View style={{ width: W, height: headroom + H, alignSelf: "center" }}
      accessible accessibilityLabel={`A sealed letter to ${chapter}, from ${to}, postmarked ${postmarkDate(requestedAt)}${open ? ". Opened" : ""}`}>
      {/* the back of the envelope, behind the card */}
      <Animated.View style={[styles.abs, { top: headroom, width: W, height: H }, envSt]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: inner, borderColor: ink, borderWidth: 1.5, borderRadius: 8 * k }]} />
      </Animated.View>

      {card ? (
        <Animated.View style={[styles.abs, { top: headroom + 10 * k, left: (W - cardW) / 2, width: cardW }, cardSt]}>{card}</Animated.View>
      ) : null}

      {/* the pocket (front), the flap, the seal, the postmark */}
      <Animated.View pointerEvents="none" style={[styles.abs, { top: headroom, width: W, height: H }, envSt]}>
        <Svg width={W} height={H} viewBox={`0 0 ${BASE_W} ${BASE_H}`} style={StyleSheet.absoluteFill}>
          <Path d={`M1 40 L150 118 L299 40 L299 182 Q299 189 292 189 L8 189 Q1 189 1 182 Z`} fill={stock} stroke={ink} strokeWidth={1.5} strokeLinejoin="round" />
          <Path d="M1 189 L118 100 M299 189 L182 100" stroke={alpha(ink, 0.18)} strokeWidth={1} />
          <Path d="M176 136 q7 -5 14 0 t14 0 t14 0 M176 150 q7 -5 14 0 t14 0 t14 0" stroke={pm} strokeWidth={1.4} fill="none" opacity={0.6} />
        </Svg>
        <View style={[styles.addr, { left: 18 * k, bottom: 16 * k, maxWidth: 160 * k }]}>
          <T v="meta" color={c.ink3} style={{ fontSize: 10 }}>From</T>
          <T v="subhead" numberOfLines={1} style={{ fontSize: 15 * Math.max(k, 0.9) }}>{to}</T>
          <T v="meta" color={c.ink3} numberOfLines={1}>to the officers of {chapter}</T>
        </View>
        <View style={[styles.abs, { right: 14 * k, bottom: 12 * k, width: 74 * k, height: 74 * k, transform: [{ rotate: "-12deg" }] }]}>
          <Svg width={74 * k} height={74 * k} viewBox="0 0 74 74" style={StyleSheet.absoluteFill}>
            <Circle cx={37} cy={37} r={33} fill="none" stroke={pm} strokeWidth={1.6} strokeDasharray="3 2" opacity={0.85} />
            <Circle cx={37} cy={37} r={26} fill="none" stroke={pm} strokeWidth={1} opacity={0.6} />
          </Svg>
          <View style={styles.pmIn}>
            <ChapterMark name={chapter} logoUrl={logoUrl} size={24 * k} rotate={0} style={{ boxShadow: "none" }} />
            <T v="mono" color={pm} style={{ fontSize: 9.5, lineHeight: 12, marginTop: 2 }}>{postmarkDate(requestedAt)}</T>
          </View>
        </View>
        <Animated.View style={[styles.abs, { top: 0, width: W, height: 112 * k, transformOrigin: "top" }, flapSt]}>
          <Svg width={W} height={112 * k} viewBox="0 0 300 112">
            <Path d="M1 1 L150 110 L299 1 Z" fill={stock} stroke={ink} strokeWidth={1.5} strokeLinejoin="round" />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.seal, { top: 84 * k, left: W / 2 - 17, backgroundColor: c.pastel.rose.fill, borderColor: c.pastel.rose.ink }, sealSt]}>
          <Icon name="lock" size={14} color={c.pastel.rose.ink} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: "absolute", left: 0 },
  addr: { position: "absolute", gap: 1 },
  pmIn: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  seal: { position: "absolute", width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
