/**
 * Posted (Media's "Mark posted", the web's confetti + POSTED stamp): the planned print
 * stops developing (the dashed, faded snapshot gives way to the inked one, 420ms), the
 * POSTED stamp thuds onto the stage, and a burst of confetti leaves the stamp. Success
 * haptic on the stamp's impact (the caller's onImpact). If the server refuses, the
 * caller sends phase "idle" again: the inked print fades back to developing and the
 * stamp smears off.
 *
 *   <PostedPrint type="Reel" phase="posting" | "posted" | "idle" onImpact={…} />
 *
 * "posting" waits (the print breathes faintly), "posted" lands, "shown" is a post that
 * was already up when the sheet opened (stamp in place, no motion).
 *
 * Reduced motion: no breathing and no confetti; the inked print and the stamp fade in
 * together (180ms).
 */
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Snap } from "~/media/bits";
import { DUR } from "~/motion/motion";
import { Stamp, type StampState } from "~/paper/Stamp";
import { useMotion } from "~/theme/PaperProvider";
import { Confetti } from "./TaskDone";

export type PostedPhase = "idle" | "posting" | "posted" | "shown";
export const DEVELOP_IN = 420;

export function PostedPrint({ type, phase, onImpact }: { type: string; phase: PostedPhase; onImpact?: () => void }) {
  const m = useMotion();
  const ink = useSharedValue(phase === "shown" ? 1 : 0);
  const breathe = useSharedValue(1);
  const burst = useSharedValue(0);
  const [stamp, setStamp] = useState<StampState>(phase === "shown" ? "shown" : "hidden");
  const impact = useRef(onImpact);
  impact.current = onImpact;

  useEffect(() => {
    cancelAnimation(breathe);
    breathe.value = 1;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (phase === "shown") { ink.value = 1; setStamp("shown"); }
    else if (phase === "idle") {
      ink.value = withTiming(0, m.timing(DUR.fade, "out"));
      setStamp(s => (s === "hidden" ? s : "smear"));
    } else if (phase === "posting") {
      if (!m.reduced) breathe.value = withRepeat(withSequence(withTiming(0.72, m.timing(700, "standard")), withTiming(1, m.timing(700, "standard"))), -1, false);
    } else {
      ink.value = withTiming(1, m.timing(m.reduced ? 180 : DEVELOP_IN, m.reduced ? "out" : "standard"));
      timers.push(setTimeout(() => setStamp("in"), m.t(m.reduced ? 0 : DEVELOP_IN - 120)));
    }
    return () => timers.forEach(clearTimeout);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const dev = useAnimatedStyle(() => ({ opacity: (1 - ink.value) * breathe.value }));
  const inked = useAnimatedStyle(() => ({ opacity: ink.value }));
  const landed = () => {
    impact.current?.();
    if (!m.reduced) { burst.value = 0; burst.value = withTiming(1, m.timing(900, "out")); }
  };

  return (
    <View style={styles.stage}>
      <View>
        <Animated.View style={dev}><Snap type={type} developing size="lg" /></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, inked]}><Snap type={type} size="lg" /></Animated.View>
      </View>
      <Stamp label="Posted" tone="mint" size="lg" rotate={-12} state={stamp} onImpact={landed} style={styles.stamp} />
      {!m.reduced && phase === "posted" ? <Confetti burst={burst} at={{ x: 0.72, y: 0.78 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignSelf: "center", paddingHorizontal: 40, paddingVertical: 8, transform: [{ rotate: "-2deg" }] },
  stamp: { position: "absolute", right: 0, bottom: 14 },
});
