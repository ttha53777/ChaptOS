/**
 * Reimbursement sent (signature moment, motion plan table): the taped receipt print slides
 * down into a manila envelope until only its top edge peeks out, the envelope gives a
 * little (soft haptic), then a SENT stamp lands on the pocket (success haptic on impact)
 * and `onDone` fires once the ink has settled. ~1s in all.
 *
 *   state "ready"    the print above the open envelope (while the request is on its way)
 *   state "sent"     play it
 *
 * The envelope is three layers so the slide is transform-only: the back, the print, then
 * the pocket drawn over it; the stage clips whatever slides past the envelope's foot.
 *
 * Reduced motion: the print fades out where it is (180ms), the stamp fades in, done.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "~/motion/haptics";
import { Tape } from "~/paper/bits";
import { Stamp, type StampState } from "~/paper/Stamp";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";

export type EnvelopeState = "ready" | "sent";

const W = 240;
const H = 250;
const BACK_TOP = 118;
const POCKET_TOP = 150;
const PRINT_W = 168;
const PRINT_H = 142;
const SLIDE = 130; // the print (top 10) ends with 10pt peeking over the pocket (top 150)
export const ENVELOPE_MS = 1050;

export function Envelope({ state, print, onDone }: { state: EnvelopeState; print: ReactNode; onDone?: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const y = useSharedValue(0);
  const rot = useSharedValue(-2.5);
  const op = useSharedValue(1);
  const give = useSharedValue(0);
  const [stamp, setStamp] = useState<StampState>("hidden");
  const done = useRef(onDone);
  done.current = onDone;
  const finish = () => { setTimeout(() => done.current?.(), m.t(380)); };
  const tucked = () => { haptics.soft(); setStamp("in"); };

  useEffect(() => {
    if (state !== "sent") return;
    if (m.reduced) {
      op.value = withTiming(0, m.timing(180, "out"), fin => { if (fin) scheduleOnRN(tucked); });
      return;
    }
    rot.value = withTiming(0, m.timing(260, "standard"));
    y.value = withTiming(SLIDE, m.timing(440, "flight"), fin => { if (fin) scheduleOnRN(tucked); });
    give.value = withSequence(withTiming(0, { duration: m.t(400) }), withTiming(3, m.timing(90, "out")), withTiming(0, m.timing(200, "spring")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const printSt = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: y.value }, { rotate: `${rot.value}deg` }] }));
  const envSt = useAnimatedStyle(() => ({ transform: [{ translateY: give.value }] }));
  const manila = c.pastel.butter;
  const fold = alpha(c.ink, 0.16);

  return (
    <View style={styles.stage} accessible accessibilityLabel={stamp === "hidden" ? "Your request, ready to send" : "Sent"} accessibilityLiveRegion="polite">
      <Animated.View style={[StyleSheet.absoluteFill, envSt]}>
        <View style={[styles.back, { backgroundColor: manila.fill, borderColor: c.ink }]} />
      </Animated.View>
      <Animated.View style={[styles.print, { backgroundColor: c.thermal.paper, boxShadow: `0 2px 0 ${c.thermal.shadow}` }, printSt]}>
        <View style={styles.printInner}>{print}</View>
        <Tape width={52} rotate={-4} style={{ position: "absolute", top: -9, alignSelf: "center" }} />
      </Animated.View>
      <Animated.View style={[styles.pocketWrap, envSt]}>
        <View style={[styles.pocket, { backgroundColor: manila.soft, borderColor: c.ink }]}>
          <Svg width={W - 3} height={H - POCKET_TOP - 3} style={StyleSheet.absoluteFill}>
            <Line x1={0} y1={H - POCKET_TOP - 3} x2={(W - 3) / 2} y2={34} stroke={fold} strokeWidth={1.5} />
            <Line x1={W - 3} y1={H - POCKET_TOP - 3} x2={(W - 3) / 2} y2={34} stroke={fold} strokeWidth={1.5} />
          </Svg>
        </View>
        {stamp !== "hidden" ? (
          <Stamp label="Sent" tone="sky" state={stamp} size="md" rotate={-9} style={styles.stamp}
            onImpact={() => { haptics.success(); finish(); }} />
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: W, height: H, alignSelf: "center", overflow: "hidden" },
  back: { position: "absolute", left: 0, right: 0, top: BACK_TOP, bottom: 0, borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  print: { position: "absolute", top: 10, left: (W - PRINT_W) / 2, width: PRINT_W, height: PRINT_H, borderRadius: 4 },
  printInner: { flex: 1, padding: 10, overflow: "hidden", borderRadius: 4 },
  pocketWrap: { position: "absolute", left: 0, right: 0, top: POCKET_TOP, bottom: 0 },
  pocket: { flex: 1, borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: "hidden" },
  stamp: { position: "absolute", alignSelf: "center", top: 22 },
});
