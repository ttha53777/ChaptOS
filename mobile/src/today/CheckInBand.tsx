/**
 * The live check-in band at the top of Today (web `.ci-band`, app/paper-checkin.css).
 *
 *   open      mint    "Check-in open" · tap to check in
 *   closing   butter  "Closes in 4:12", counting down on the phone between polls
 *   closed    sky     final tally, lingers 10 min (server rule), no action
 *   void      rose    VOID stamp, "not counted"
 *
 * Tapping it opens the full-screen check-in (src/app/checkin.tsx).
 *
 * Motion: the band drops in when a window opens while Today is on screen (translateY
 * −14 → 0 + fade, 320ms spring curve); a change of state cross-fades the tone layer
 * (240ms, opacity) rather than snapping; the count rolls only the digit that changed.
 * Reduced: the band fades in in place, tone and count cross-fade. No idle pulse.
 */
import type { LiveCheckIn } from "@/lib/api-types";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, ReduceMotion } from "react-native-reanimated";
import { Icon } from "~/icons/Icon";
import { EASE } from "~/motion/motion";
import { AvatarStack } from "~/paper/bits";
import { Stamp } from "~/paper/Stamp";
import { TickingNumber } from "~/paper/TickingNumber";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import type { CheckInWindow } from "~/moments/CheckInTicket";
import { windowView } from "./live";

const TONE: Record<CheckInWindow, Tone> = { open: "mint", closing: "butter", closed: "sky", void: "rose" };

export interface CheckInBandProps {
  live: LiveCheckIn;
  /** When `live` was fetched (the query's dataUpdatedAt). */
  fetchedAt: number;
  now: number;
  onPress: () => void;
}

export function CheckInBand({ live, fetchedAt, now, onPress }: CheckInBandProps) {
  const { c } = useTheme();
  const m = useMotion();
  const { win, closingLabel } = windowView(live, fetchedAt, now);
  const tone = TONE[win];
  const p = c.pastel[tone];

  const kicker = win === "void" ? "Check-in cancelled" : win === "closed" ? "Check-in closed" : win === "closing" ? closingLabel : "Check-in open";
  const me = live.me;
  const status =
    win === "void" ? "Not counted. Nobody's attendance changes."
    : me.checkedIn ? `You're in${me.checkedInAt ? ` · ${new Date(me.checkedInAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}`
    : me.excuse?.status === "approved" ? "You're excused"
    : win === "closed" ? "You weren't checked in"
    : "Tap to check in";

  const enter = m.reduced
    ? FadeIn.duration(m.t(180)).reduceMotion(ReduceMotion.Never)
    : FadeInDown.duration(m.t(320)).easing(EASE.spring).withInitialValues({ transform: [{ translateY: -14 }] }).reduceMotion(ReduceMotion.Never);
  const toneIn = FadeIn.duration(m.t(240)).reduceMotion(ReduceMotion.Never);
  const toneOut = FadeOut.duration(m.t(240)).reduceMotion(ReduceMotion.Never);

  const label = `${kicker}. ${live.event.title}. ${win === "void" ? `${live.presentCount} check-ins thrown out` : `${live.presentCount} of ${live.eligibleCount} checked in`}. ${status}.`;

  return (
    <Animated.View entering={enter} style={[styles.wrap, hard(p.fill, 4)]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens check-in"
        style={({ pressed }) => [styles.band, { borderColor: c.ink, backgroundColor: c.card }, pressed && { transform: [{ translateY: 1 }] }]}>
        <Animated.View key={tone} entering={toneIn} exiting={toneOut} style={[StyleSheet.absoluteFill, { backgroundColor: p.soft }]} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.kick}>
            <View style={[styles.dot, { backgroundColor: p.ink }]} />
            <T v="kicker" color={p.ink} numberOfLines={1}>{kicker}</T>
          </View>
          <T v="subhead" numberOfLines={1}>{live.event.title}</T>
          <T v="meta" color={c.ink2} numberOfLines={1}>{status}</T>
        </View>
        {win === "void" ? (
          <Stamp label="VOID" sub="not counted" tone="rose" state="shown" rotate={-9} size="sm" splat={false} />
        ) : (
          <View style={styles.tally}>
            <View style={styles.count}>
              <TickingNumber value={live.presentCount} v="monoLg" />
              <T v="mono" color={c.ink3}>/{live.eligibleCount}</T>
            </View>
            {live.recent.length ? (
              <AvatarStack size="sm" max={4} people={live.recent.map(r => ({ name: r.name, uri: r.avatarUrl }))} />
            ) : (
              <T v="pill" color={c.ink3}>here</T>
            )}
          </View>
        )}
        <Icon name="chev-r" size={16} color={c.ink3} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20 },
  band: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingLeft: 14, paddingRight: 10, borderRadius: 20, borderWidth: 1.5, overflow: "hidden" },
  kick: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  tally: { alignItems: "flex-end", gap: 4 },
  count: { flexDirection: "row", alignItems: "flex-end", gap: 1 },
});
