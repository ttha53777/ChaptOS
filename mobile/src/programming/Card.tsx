/**
 * An event on the board. Each lane has its own paper, so a glance says how settled
 * a thing is:
 *
 *   idea       a sticky note (the type's pastel, a slight tilt): up in the air
 *   planning   a dashed index card: someone's sketching it
 *   confirmed  an inked card on a hard shadow: on everyone's calendar
 *   done       a filed card, quieter, with its stars
 *
 * Each says the type, the name, when and where, who owns it, and the one thing
 * standing between it and the next lane (rose inside two weeks). A press sinks
 * the card into its shadow; the tap opens the event (no haptic: it's navigation).
 */
import type { ProgrammingEvent } from "@/lib/api-types";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Icon } from "~/icons/Icon";
import { Avatar } from "~/paper/bits";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { toneOf } from "~/timeline/model";
import { T } from "~/ui/T";
import { blocker, cardWhen, ownerLabel } from "./model";

const TILT = [-1.2, 0.8, -0.5, 1.1, -0.9];

export function EventCard({ e, i, today, onPress }: { e: ProgrammingEvent; i: number; today: string; onPress: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const press = useSharedValue(0);
  const tone = toneOf(e.category);
  const p = c.pastel[tone];
  const when = cardWhen(e.dueDate, today);
  const block = blocker(e, today);
  const owner = ownerLabel(e.owner);

  const sticky = e.stage === "idea";
  const dashed = e.stage === "planning";
  const inked = e.stage === "confirmed";
  const filed = e.stage === "done";
  const tilt = sticky && !m.reduced ? TILT[i % TILT.length]! : 0;

  const lift = inked ? 3 : 0;
  const face = useAnimatedStyle(() => ({
    transform: [{ rotate: `${tilt * (1 - press.value)}deg` }, { translateX: lift * press.value }, { translateY: lift * press.value }, { scale: inked ? 1 : 1 - 0.015 * press.value }],
  }));

  const bg = sticky ? c.note.fill[tone] : filed ? c.paper2 : c.card;
  const ink = sticky ? c.note.ink : c.ink;
  const sub = sticky ? alpha(c.note.ink, 0.7) : c.ink3;

  return (
    <Pressable onPress={onPress}
      onPressIn={() => { press.value = withTiming(1, m.timing(80, "out")); }}
      onPressOut={() => { press.value = withTiming(0, m.timing(m.reduced ? 90 : 240, "spring")); }}
      accessibilityRole="button"
      accessibilityLabel={`${e.title}. ${e.type}. ${when.label}${e.location ? `, ${e.location}` : ""}${owner ? `. Owner ${owner}` : ""}${block ? `. ${block.text}` : ""}`}>
      {inked ? <View style={[StyleSheet.absoluteFill, styles.shadow, { backgroundColor: p.fill, borderColor: c.ink }]} /> : null}
      <Animated.View style={[styles.card, sticky ? styles.stickyShape : styles.cardShape, {
        backgroundColor: bg,
        borderColor: inked ? c.ink : dashed ? c.line2 : filed ? c.line : "transparent",
        borderStyle: dashed ? "dashed" : "solid",
        borderWidth: sticky ? 0 : 1.5,
      }, face]}>
        <View style={styles.top}>
          <View style={[styles.dot, { backgroundColor: sticky ? c.note.ink : p.ink }]} />
          <T v="kicker" color={sub} numberOfLines={1} style={{ flex: 1 }}>{e.type}</T>
          <T v="mono" color={when.soon && !filed ? (sticky ? c.note.ink : p.ink) : sub} style={[styles.when, when.soon && !filed && { fontWeight: "700" }]}>{when.label}</T>
        </View>
        <T v="subhead" color={filed ? c.ink2 : ink} numberOfLines={2}>{e.title}{e.collab ? <T v="subhead" color={sub}>{`  × ${e.collab}`}</T> : null}</T>
        {e.location ? (
          <View style={styles.line}>
            <Icon name="pin" size={12} color={sub} />
            <T v="meta" color={sub} numberOfLines={1} style={{ flex: 1 }}>{e.location}</T>
          </View>
        ) : null}
        <View style={styles.foot}>
          {owner ? (
            <View style={styles.owner}>
              {e.owner?.kind === "brother"
                ? <Avatar name={e.owner.name} tone={tone} style={styles.face} />
                : <View style={[styles.face, styles.role, { borderColor: sticky ? alpha(c.note.ink, 0.4) : c.line2 }]}><Icon name="people" size={11} color={sub} /></View>}
              <T v="meta" color={sticky ? c.note.ink : c.ink2} numberOfLines={1} style={{ flexShrink: 1 }}>{owner}</T>
            </View>
          ) : <View style={{ flex: 1 }} />}
          {filed ? <Stars n={e.successRating} /> : null}
          {block ? (
            <View style={[styles.block, { backgroundColor: block.tone === "rose" ? c.pastel.rose.soft : sticky ? alpha(c.card, 0.55) : c.pastel.butter.soft, borderColor: block.tone === "rose" ? c.pastel.rose.border : c.pastel.butter.border }]}>
              <T v="pill" color={block.tone === "rose" ? c.pastel.rose.ink : c.pastel.butter.ink} numberOfLines={1}>{block.text}</T>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function Stars({ n, size = 12 }: { n: number | null; size?: number }) {
  const { c } = useTheme();
  if (n == null) return <T v="meta" color={c.ink3}>Not rated</T>;
  return (
    <View style={{ flexDirection: "row", gap: 1 }} accessibilityLabel={`${n} of 5 stars`}>
      {[1, 2, 3, 4, 5].map(k => <Icon key={k} name="star" size={size} color={k <= n ? c.pastel.butter.ink : c.line2} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, paddingVertical: 13, paddingHorizontal: 14 },
  cardShape: { borderRadius: 16 },
  stickyShape: { borderTopLeftRadius: 5, borderTopRightRadius: 14, borderBottomRightRadius: 7, borderBottomLeftRadius: 12 },
  shadow: { borderRadius: 16, borderWidth: 1.5, transform: [{ translateX: 3 }, { translateY: 3 }] },
  top: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  when: { fontSize: 11.5 },
  line: { flexDirection: "row", alignItems: "center", gap: 5 },
  foot: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  owner: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  face: { width: 22, height: 22, borderRadius: 11 },
  role: { borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  block: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, flexShrink: 0, maxWidth: 170 },
});
