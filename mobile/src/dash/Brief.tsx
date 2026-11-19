/**
 * The web BriefingHeader on a phone (paper-aesthetic.css `.briefing`, phone-dash.css):
 *
 *   kicker   a pill with "THU · NOV 19", then "WEEK OF NOV 16–22" in mono
 *   greeting "Good morning, Maya." in the display face, the name over a butter
 *            highlighter stroke, a waving hand after the period
 *   digest   the week in one AI line behind a lilac "DIGEST" chip; "Summarizing this
 *            week…" while it's asked for; "Nothing scheduled this week." when quiet
 *
 * Motion: the highlighter draws left to right (.8s spring, .35s in) and the hand waves
 * once (1.6s, .55s in), as on the web. Reduced: both appear still.
 */
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { Icon } from "~/icons/Icon";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

const greetingFor = (h: number) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const d0 = (iso: string) => new Date(`${iso}T00:00:00`);

/** fmtRange (app/data.ts): "Nov 16–22", "Nov 30–Dec 6". */
export function weekRange(start: string, end: string): string {
  const a = d0(start), b = d0(end);
  return a.getMonth() === b.getMonth()
    ? `${MON[a.getMonth()]} ${a.getDate()}–${b.getDate()}`
    : `${MON[a.getMonth()]} ${a.getDate()}–${MON[b.getMonth()]} ${b.getDate()}`;
}

export function Brief({ firstName, start, end, digest, digestLoading, quiet }: {
  firstName: string | null; start: string; end: string;
  digest: string | null; digestLoading: boolean; quiet: boolean;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const now = new Date();
  const short = `${now.toLocaleDateString("en-US", { weekday: "short" })} · ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`.toUpperCase();

  const mark = useSharedValue(m.reduced ? 1 : 0);
  const wave = useSharedValue(0);
  useEffect(() => {
    if (m.reduced) return;
    mark.value = withDelay(m.t(350), withSpring(1, m.spring("settle")));
    const e = { easing: Easing.out(Easing.cubic) };
    const step = (deg: number, ms: number) => withTiming(deg, { duration: m.t(ms), ...e });
    wave.value = withDelay(m.t(550), withSequence(step(16, 240), step(-8, 240), step(14, 240), step(-4, 240), step(9, 240), step(0, 400)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const markStyle = useAnimatedStyle(() => ({ transform: [{ rotate: "-0.8deg" }, { scaleX: mark.value }] }));
  const waveStyle = useAnimatedStyle(() => ({ transform: [{ translateX: 3 }, { translateY: 4 }, { rotate: `${wave.value}deg` }, { translateX: -3 }, { translateY: -4 }] }));

  const Hand = (
    <Animated.View style={[styles.wave, waveStyle]}><Icon name="hand" size={25} color={c.pastel.butter.ink} /></Animated.View>
  );

  return (
    <View accessibilityRole="summary">
      <View style={styles.kicker}>
        <View style={[styles.today, { backgroundColor: c.card, borderColor: c.line2 }]}>
          <T v="kicker" size={11.5} color={c.ink2}>{short}</T>
        </View>
        <T v="kicker" size={11.5} color={c.ink3}>{`Week of ${weekRange(start, end)}`}</T>
      </View>

      <View style={styles.greetRow} accessibilityRole="header" accessibilityLabel={`${greetingFor(now.getHours())}${firstName ? `, ${firstName}` : ""}.`}>
        <T v="hero" size={30.5} ls={-0.032} lh={1.04}>{`${greetingFor(now.getHours())}${firstName ? ", " : ""}`}</T>
        <View style={styles.tail}>
          {firstName ? (
            <View>
              <Animated.View style={[styles.mark, { backgroundColor: c.pastel.butter.fill, opacity: c.markOp }, markStyle]} />
              <T v="hero" size={30.5} ls={-0.032} lh={1.04}>{firstName}</T>
            </View>
          ) : null}
          <T v="hero" size={30.5} ls={-0.032} lh={1.04}>.</T>
          {Hand}
        </View>
      </View>

      {digest || digestLoading || quiet ? (
        <View style={styles.digest}>
          {!quiet ? (
            <View style={[styles.ai, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}>
              <Icon name="spark" size={9} color={c.pastel.lilac.ink} />
              <T v="label" size={10.2} color={c.pastel.lilac.ink}>Digest</T>
            </View>
          ) : null}
          <T v="body" size={15.2} lh={1.5} color={digestLoading || quiet ? c.ink3 : c.ink2} style={{ flex: 1 }}>
            {digestLoading ? "Summarizing this week…" : quiet ? "Nothing scheduled this week." : digest}
          </T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  today: { paddingVertical: 2, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1.5 },
  greetRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 },
  tail: { flexDirection: "row", alignItems: "flex-end" },
  mark: { position: "absolute", left: -4, right: -4, bottom: 3, height: "48%", borderTopLeftRadius: 12, borderTopRightRadius: 16, borderBottomLeftRadius: 11, borderBottomRightRadius: 18, transformOrigin: "left center" },
  wave: { marginLeft: 8, marginBottom: 4 },
  digest: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 10 },
  ai: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 2, paddingHorizontal: 9, marginTop: 3, borderRadius: 999, borderWidth: 1 },
});
