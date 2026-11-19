/**
 * The empty Ask Chapt page (mock `.brief`): the greeting with "know?" under the
 * highlighter, a taped butter note saying what it reads, and three starter tickets
 * (butter, mint, sky stubs). When the keyboard rises the page compacts: the greeting
 * shrinks to one line, the note and label go, and the tickets fold into a row of pills
 * you can still tap. Starters are the web's, the same for everyone.
 */
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { StickyNote } from "~/paper/bits";
import { alpha, type Tone } from "~/theme/palette";
import { hard } from "~/theme/shadow";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export const STARTERS: { icon: IconName; tone: Tone; label: string; q: string }[] = [
  { icon: "cash", tone: "butter", label: "Outstanding dues", q: "How are we doing on dues?" },
  { icon: "people", tone: "mint", label: "Attendance gaps", q: "Who missed the last two meetings?" },
  { icon: "cal", tone: "sky", label: "This week", q: "Summarize what's happening this week." },
];

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export function Landing({ first, org, compact, onAsk }: { first: string; org: string; compact: boolean; onAsk: (q: string) => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const enter = (i: number) => (m.reduced ? FadeIn.duration(m.t(200)) : FadeInDown.duration(m.t(320)).delay(m.t(60 + i * 70))).reduceMotion(ReduceMotion.Never);
  const layout = m.reduced ? undefined : LinearTransition.duration(m.t(240)).reduceMotion(ReduceMotion.Never);
  const date = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <View style={[styles.wrap, compact && { justifyContent: "flex-end", paddingTop: 8 }]}>
      <Animated.View layout={layout} style={{ gap: compact ? 6 : 14, paddingHorizontal: 18 }}>
        {!compact ? (
          <Animated.View entering={enter(0)}>
            <T v="kicker" color={c.ink3}><T v="kicker" color={c.ink2}>{org}</T> · {date}</T>
          </Animated.View>
        ) : null}
        <Animated.View entering={enter(1)} accessible accessibilityRole="header" accessibilityLabel={`${greeting()}, ${first}. What do you want to know?`}>
          {!compact ? <T v="heading" color={c.ink2}>{greeting()}, {first}.</T> : null}
          <T v="hero" style={compact ? { fontSize: 24, lineHeight: 28 } : undefined}>
            What do you want to <T v="hero" style={[compact ? { fontSize: 24, lineHeight: 28 } : null, { fontStyle: "italic", backgroundColor: alpha(c.pastel.butter.fill, c.markOp) }]}>know?</T>
          </T>
        </Animated.View>
        {!compact ? (
          <Animated.View entering={enter(2)} style={{ marginTop: 6 }}>
            <StickyNote tone="butter" rotate={-1.2}>
              <T v="callout" color={c.note.ink}><T v="callout" color={c.note.ink} style={{ fontWeight: "700" }}>Dues, attendance, events, the treasury.</T> Ask, and I'll read the chapter's records and answer.</T>
            </StickyNote>
          </Animated.View>
        ) : null}
      </Animated.View>

      <Animated.View layout={layout} style={{ gap: 10, marginTop: compact ? 12 : 26 }}>
        {!compact ? <Animated.View entering={enter(3)} style={{ paddingHorizontal: 18 }}><T v="label" color={c.ink3}>Start with one</T></Animated.View> : null}
        {compact ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 10, paddingHorizontal: 18, paddingBottom: 6 }}>
            {STARTERS.map(s => (
              <Pressable key={s.q} onPress={() => { haptics.select(); onAsk(s.q); }} accessibilityRole="button" accessibilityLabel={s.q}
                style={({ pressed }) => [styles.pill, { borderColor: c.ink, backgroundColor: c.card }, hard(c.pastel[s.tone].fill, pressed ? 1 : 2.5)]}>
                <Icon name={s.icon} size={16} color={c.pastel[s.tone].ink} />
                <T v="callout" numberOfLines={1}>{s.q}</T>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={{ gap: 12, paddingHorizontal: 18 }}>
            {STARTERS.map((s, i) => {
              const p = c.pastel[s.tone];
              return (
                <Animated.View key={s.q} entering={enter(4 + i)}>
                  <Pressable onPress={() => { haptics.select(); onAsk(s.q); }} accessibilityRole="button" accessibilityLabel={`${s.label}: ${s.q}`}
                    style={({ pressed }) => [styles.tkt, { borderColor: c.ink, backgroundColor: c.card }, hard(p.fill, pressed ? 1 : 4), pressed && { transform: [{ translateX: 2.5 }, { translateY: 2.5 }] }]}>
                    <View style={[styles.stub, { backgroundColor: p.soft, borderRightColor: c.line2 }]}>
                      <Icon name={s.icon} size={20} color={p.ink} />
                    </View>
                    <View style={{ flex: 1, paddingVertical: 10, paddingLeft: 14, gap: 2 }}>
                      <T v="kicker" color={p.ink} style={{ fontSize: 9.5 }}>{s.label}</T>
                      <T v="subhead">{s.q}</T>
                    </View>
                    <View style={[styles.go, { borderColor: c.line2 }]}>
                      <Icon name="arrow-r" size={13} color={c.ink2} />
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 24, paddingBottom: 12 },
  tkt: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 16, minHeight: 68, paddingRight: 14 },
  stub: { width: 54, alignSelf: "stretch", alignItems: "center", justifyContent: "center", borderRightWidth: 1.5, borderStyle: "dashed", borderTopLeftRadius: 14.5, borderBottomLeftRadius: 14.5 },
  go: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 999, minHeight: 44, paddingHorizontal: 14 },
});
