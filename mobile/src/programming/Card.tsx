/**
 * An event on the board (the web's DuskCard), top to bottom:
 *
 *   title
 *   meta     when (Today / Tomorrow / "Sun · 2d" / a date / No date yet), the place
 *            (or "w/ collab"), Required, and a wrapped event's stars
 *   status   the owner's initials, then what it still needs (cardBlocker: rose inside
 *            two weeks, gold beyond, mint when it's ready to confirm), else the owner,
 *            else "No owner"; a confirmed card carries the eye (it's on the Timeline)
 *
 * Each lane has its own paper: an idea is a sticky note tilted by its id, a plan a
 * dashed card, a confirmed event an inked card on a hard shadow, a wrapped one filed
 * and quieter. A red dot marks one that happened and still needs its wrap-up. The tap
 * opens the event (navigation: no haptic).
 */
import type { CalEventType, ProgrammingEvent, ProgrammingOwner } from "@/lib/api-types";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Icon } from "~/icons/Icon";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { BOARD, cardBlocker, cardPlace, cardWhen, ideaTilt, needsWrapUp, ownerInitials, ownerShortLabel, typeCat } from "./model";

export const EventCard = memo(function EventCard({ e, today, types, onPress }: {
  e: ProgrammingEvent; i?: number; today: string; types?: CalEventType[]; onPress: () => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const press = useSharedValue(0);
  const cat = typeCat(e.category, types, c);
  const when = cardWhen(e.dueDate, today);
  const block = cardBlocker(e, today);
  const wrapDue = needsWrapUp(e, today);
  const place = cardPlace(e.location, e.collab);
  const owner = ownerShortLabel(e.owner);

  const sticky = e.stage === "idea";
  const dashed = e.stage === "planning";
  const inked = e.stage === "confirmed";
  const filed = e.stage === "done";
  const tilt = sticky && !m.reduced ? ideaTilt(e.id) : 0;
  const lift = inked ? 3 : 0;
  const face = useAnimatedStyle(() => ({
    transform: [{ rotate: `${tilt * (1 - press.value)}deg` }, { translateX: lift * press.value }, { translateY: lift * press.value }],
  }));

  const ink = sticky ? c.note.ink : c.ink;
  const sub = sticky ? alpha(c.note.ink, 0.72) : c.ink3;
  const whenColor = when.tone === "today" ? c.pastel.rose.ink : when.tone === "soon" ? c.pastel.butter.ink : sub;
  const blockColor = !block ? (sticky ? c.note.ink : c.ink2)
    : block.tone === "rose" ? c.pastel.rose.ink : block.tone === "ok" ? c.pastel.mint.ink : c.pastel.butter.ink;

  return (
    <Pressable onPress={onPress}
      onPressIn={() => { press.value = withTiming(1, m.timing(80, "out")); }}
      onPressOut={() => { press.value = withTiming(0, m.timing(m.reduced ? 90 : 240, "spring")); }}
      accessibilityRole="button"
      accessibilityLabel={[e.title, when.label, place, e.mandatory ? BOARD.required : "", block ? block.text : owner ?? BOARD.noOwner, wrapDue ? "Needs a wrap-up" : ""].filter(Boolean).join(". ")}>
      {inked ? <View style={[StyleSheet.absoluteFill, styles.shadow, { backgroundColor: cat.fill, borderColor: c.ink }]} /> : null}
      <Animated.View style={[styles.card, sticky ? styles.stickyShape : styles.cardShape, {
        backgroundColor: sticky ? cat.fill : filed ? c.paper2 : c.card,
        borderColor: inked ? c.ink : dashed ? c.line2 : filed ? c.line : "transparent",
        borderStyle: dashed ? "dashed" : "solid",
        borderWidth: sticky ? 0 : 1.5,
        borderLeftWidth: sticky ? 0 : 4,
        borderLeftColor: sticky ? "transparent" : cat.ink,
      }, face]}>
        {wrapDue ? <View style={[styles.dot, { backgroundColor: c.pastel.rose.ink, borderColor: c.card }]} /> : null}
        <T v="subhead" color={filed ? c.ink2 : ink} numberOfLines={2}>{e.title}</T>
        <View style={styles.meta}>
          <T v="mono" size={11.5} color={whenColor} style={when.tone === "today" || when.tone === "soon" ? { fontWeight: "700" } : null}>{when.label}</T>
          {place ? (
            <View style={styles.where}>
              {e.location ? <Icon name="pin" size={11} color={sub} /> : null}
              <T v="meta" size={12} color={sub} numberOfLines={1} style={{ flexShrink: 1 }}>{place}</T>
            </View>
          ) : null}
          {e.mandatory ? (
            <View style={[styles.req, { borderColor: c.pastel.peach.border, backgroundColor: c.pastel.peach.soft }]}>
              <T v="pill" size={10.5} color={c.pastel.peach.ink} style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>{BOARD.required}</T>
            </View>
          ) : null}
          {filed && e.successRating != null ? <CardStars value={e.successRating} /> : null}
        </View>
        <View style={styles.status}>
          <OwnerFace owner={e.owner} size={18} tone={sticky ? c.note.ink : c.ink3} />
          <T v="meta" size={12} color={blockColor} numberOfLines={1} style={[{ flexShrink: 1 }, block ? { fontWeight: "600" } : null]}>
            {block ? block.text : owner ?? BOARD.noOwner}
          </T>
          {inked ? <View style={{ marginLeft: "auto" }}><Icon name="eye" size={13} color={c.pastel.lilac.ink} /></View> : null}
        </View>
      </Animated.View>
    </Pressable>
  );
});

/** ★★★★☆, the web's CardStars. */
export function CardStars({ value, size = 12 }: { value: number | null; size?: number }) {
  const { c } = useTheme();
  if (value == null) return <T v="mono" size={size} color={c.line2} accessibilityLabel="Not rated">☆☆☆☆☆</T>;
  return (
    <T v="mono" size={size} color={c.pastel.butter.ink} accessibilityLabel={`Rated ${value} out of 5`}>
      {"★".repeat(value)}<T v="mono" size={size} color={c.line2}>{"☆".repeat(5 - value)}</T>
    </T>
  );
}

/** Kept for the lab: a wrapped event's stars. */
export const Stars = ({ n, size }: { n: number | null; size?: number }) => <CardStars value={n} size={size} />;

/** The owner's initials (a person round, a role squarer); a dashed ring when nobody has it. */
export function OwnerFace({ owner, size = 18, tone }: { owner: ProgrammingOwner; size?: number; tone?: string }) {
  const { c } = useTheme();
  if (!owner) {
    return (
      <View style={[styles.face, { width: size, height: size, borderRadius: size / 2, borderColor: tone ?? c.line2, borderStyle: "dashed" }]}>
        <T v="mono" size={Math.max(7.5, size * 0.42)} color={tone ?? c.ink3} style={{ fontWeight: "700" }}>?</T>
      </View>
    );
  }
  const role = owner.kind === "role";
  return (
    <View style={[styles.face, { width: size, height: size, borderRadius: role ? 5 : size / 2, borderColor: role ? c.line2 : c.pastel.butter.border, backgroundColor: role ? c.paper2 : c.pastel.butter.soft }]}>
      <T v="mono" size={Math.max(7.5, size * 0.42)} color={c.ink2} style={{ fontWeight: "700" }}>{ownerInitials(owner)}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 7, paddingVertical: 12, paddingHorizontal: 13 },
  cardShape: { borderRadius: 14 },
  stickyShape: { borderTopLeftRadius: 4, borderTopRightRadius: 12, borderBottomRightRadius: 6, borderBottomLeftRadius: 10 },
  shadow: { borderRadius: 14, borderWidth: 1.5, transform: [{ translateX: 3 }, { translateY: 3 }] },
  dot: { position: "absolute", top: -4, right: -4, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 10, rowGap: 4 },
  where: { flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1 },
  req: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  face: { borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
