/**
 * "Join approved" (U2 signature moment), over the app the first time it's ready with a
 * roster row in the chapter whose letter this phone was holding (~/entry/letter). The
 * same envelope as the awaiting screen, sealed for a beat, then it opens and the chapter's
 * card slides out (~/moments/Letter). "Open <chapter>" fades the overlay away onto the
 * app, which has been loading underneath the whole time. Tapping anywhere before the card
 * is out skips straight to it.
 *
 * Reduced motion: a cross-fade from envelope to card, then the same button.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { ChapterMark } from "~/entry/ChapterMark";
import type { Letter } from "~/entry/letter";
import { SealedLetter } from "~/moments/Letter";
import { DUR } from "~/motion/motion";
import { Button } from "~/paper/Button";
import { Kicker } from "~/paper/bits";
import { hard } from "~/theme/shadow";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

/** How long the sealed envelope sits before it opens. */
const BEAT = 600;

export function JoinApproved({ letter, onDone }: { letter: Letter; onDone: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const [open, setOpen] = useState(false);
  const [out, setOut] = useState(false);
  const veil = useSharedValue(0);
  const btn = useSharedValue(0);

  useEffect(() => {
    veil.value = withTiming(1, m.timing(DUR.fade, "out"));
    const t = setTimeout(() => setOpen(true), m.t(BEAT));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (out) btn.value = withTiming(1, m.timing(DUR.move, "out")); }, [out]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = () => { veil.value = withTiming(0, m.timing(220, "out"), fin => { if (fin) scheduleOnRN(onDone); }); };
  const veilSt = useAnimatedStyle(() => ({ opacity: veil.value }));
  const btnSt = useAnimatedStyle(() => ({ opacity: btn.value, transform: [{ translateY: 12 * (1 - btn.value) }] }));

  const card = (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.mint.fill, 4)]}>
      <ChapterMark name={letter.name} logoUrl={letter.logoUrl} size={56} />
      <Kicker label="Approved" tone="mint" />
      <T v="title" align="center" numberOfLines={2}>{letter.name}</T>
      <T v="body" color={c.ink2} align="center">You're in, {letter.submittedName.split(" ")[0]}. Welcome to the chapter.</T>
    </View>
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.paper }, veilSt]} accessibilityViewIsModal>
      <SafeAreaView style={styles.page}>
        <Pressable style={styles.stage} onPress={() => { if (!open) setOpen(true); }} accessibilityLabel={`Your request to join ${letter.name} was approved`}
          accessibilityLiveRegion="polite">
          <SealedLetter chapter={letter.name} logoUrl={letter.logoUrl} to={letter.submittedName} requestedAt={letter.requestedAt}
            open={open} card={card} onOpened={() => setOut(true)} />
        </Pressable>
        <Animated.View style={[styles.foot, btnSt]} pointerEvents={out ? "auto" : "none"}>
          <Button label={`Open ${letter.name}`} icon="arrow-r" tone="mint" block onPress={leave} />
        </Animated.View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  stage: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  card: { alignItems: "center", gap: 8, paddingVertical: 20, paddingHorizontal: 16, borderWidth: 1.5, borderRadius: 14 },
  foot: { paddingHorizontal: 20, paddingBottom: 12 },
});
