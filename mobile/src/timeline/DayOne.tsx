/**
 * The Timeline's day one (app/org/[slug]/timeline/DayOne.tsx, timeline-dayone.css): nothing
 * on the calendar at all. Three pictures (an event ticket, the line it joins, the door on
 * the day) with the web's captions, then Add a deadline (MANAGE_TASKS) and Add your first
 * event (MANAGE_EVENTS), or, for everyone else, the line saying an officer will start it.
 *
 * Motion: the pictures rise 10pt in turn (80ms apart); reduced: they fade together.
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { Icon } from "~/icons/Icon";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";

export function TimelineDayOne({ canEvents, canDeadlines, onAddEvent, onAddDeadline }: {
  canEvents: boolean; canDeadlines: boolean; onAddEvent: () => void; onAddDeadline: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 18 }}>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line, boxShadow: c.sh1 }]} accessibilityLabel="How the timeline works">
        <Figure i={0} title="1 · Add an event or deadline" line="What and when. Once."><TicketPic /></Figure>
        <Figure i={1} title="2 · It joins the line" line="In date order, for everyone."><LinePic /></Figure>
        <Figure i={2} title="3 · Tap in on the day" line="Required events count who came."><DoorPic /></Figure>
      </View>
      {canEvents || canDeadlines ? (
        <View style={styles.cta}>
          {canDeadlines ? (
            <Pressable onPress={onAddDeadline} accessibilityRole="button" style={({ pressed }) => [styles.btn, { backgroundColor: c.pastel.peach.soft, borderColor: c.pastel.peach.border, opacity: pressed ? 0.8 : 1 }]}>
              <Icon name="flag" size={15} color={c.pastel.peach.ink} />
              <T v="button" color={c.pastel.peach.ink}>Add a deadline</T>
            </Pressable>
          ) : null}
          {canEvents ? (
            <Pressable onPress={onAddEvent} accessibilityRole="button" style={({ pressed }) => [styles.btn, { backgroundColor: c.ink, borderColor: c.ink }, hard(c.pastel.lilac.fill, 3), pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
              <Icon name="plus" size={15} color={c.paper} />
              <T v="button" color={c.paper}>Add your first event</T>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <T v="callout" color={c.ink3} align="center">Nothing on the line yet. An officer will add the first event or deadline.</T>
      )}
    </View>
  );
}

function Figure({ i, title, line, children }: { i: number; title: string; line: string; children: ReactNode }) {
  const { c } = useTheme();
  const m = useMotion();
  return (
    <Animated.View entering={FadeInDown.duration(m.t(360)).delay(m.reduced ? 0 : m.t(120 + i * 80)).reduceMotion(ReduceMotion.System)} style={styles.fig}>
      <View style={styles.pic} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</View>
      <T v="heading" size={16.5} align="center">{title}</T>
      <T v="meta" color={c.ink3} align="center">{line}</T>
    </Animated.View>
  );
}

function TicketPic() {
  const { c } = useTheme();
  return (
    <View style={[styles.ticket, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.rose.fill, 3)]}>
      <View style={[styles.stub, { backgroundColor: c.pastel.rose.fill, borderRightColor: c.ink }]}>
        <T v="mono" size={9} color={c.ink} style={{ fontWeight: "600", letterSpacing: 1 }}>NOV</T>
        <T v="hero" size={26} ls={-0.04} lh={1}>14</T>
      </View>
      <View style={{ padding: 10, gap: 3 }}>
        <T v="heading" size={15}>Fall formal</T>
        <T v="mono" size={9.5} color={c.ink3}>FRI · 8 PM</T>
        <View style={styles.tag}><View style={[styles.d5, { backgroundColor: c.pastel.rose.ink }]} /><T v="meta" size={11} color={c.pastel.rose.ink} style={{ fontWeight: "600" }}>Party</T></View>
      </View>
    </View>
  );
}

function Row({ date, title, tone, past, fresh }: { date: string; title: string; tone: "sky" | "rose" | "butter"; past?: boolean; fresh?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.lrow, past && { opacity: 0.5 }]}>
      <View style={[styles.ldot, { borderColor: c.pastel[tone].ink, backgroundColor: fresh ? c.pastel[tone].ink : c.card }]} />
      <T v="mono" size={10} color={c.ink3} style={{ width: 40 }}>{date}</T>
      <T v="meta" size={12} color={c.ink} style={fresh ? { fontWeight: "700" } : undefined}>{title}</T>
    </View>
  );
}

function LinePic() {
  const { c } = useTheme();
  return (
    <View style={styles.line}>
      <View style={[styles.lrail, { backgroundColor: c.line2 }]} />
      <Row date="Nov 3" title="Chapter meeting" tone="sky" past />
      <View style={[styles.ltoday, { backgroundColor: c.ink }]}><T v="mono" size={8.5} color={c.paper} style={{ letterSpacing: 0.8 }}>TODAY</T></View>
      <Row date="Nov 10" title="Chapter meeting" tone="sky" />
      <Row date="Nov 14" title="Fall formal" tone="rose" fresh />
      <Row date="Nov 20" title="Dues due" tone="butter" />
    </View>
  );
}

function DoorPic() {
  const { c } = useTheme();
  return (
    <View style={[styles.door, { backgroundColor: c.card, borderColor: c.line2 }]}>
      <View style={[styles.stamp, { borderColor: c.pastel.mint.ink }]}><T v="kicker" size={10} color={c.pastel.mint.ink}>Here</T></View>
      <T v="mono" size={9.5} color={c.ink3}>TONIGHT · REQUIRED</T>
      <T v="heading" size={15}>Chapter meeting</T>
      <View style={[styles.tap, { backgroundColor: c.ink }]}><Icon name="check" size={12} color={c.paper} /><T v="buttonSm" color={c.paper}>I’m here</T></View>
      <View style={styles.dots}>
        {Array.from({ length: 10 }, (_, i) => <View key={i} style={[styles.d6, { backgroundColor: i < 9 ? c.pastel.mint.ink : "transparent", borderColor: c.pastel.mint.ink }]} />)}
      </View>
      <T v="meta" size={11} color={c.ink3}>9 of 10 here</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: 1.5, paddingVertical: 24, paddingHorizontal: 18, gap: 30 },
  fig: { alignItems: "center", gap: 4 },
  pic: { minHeight: 140, alignItems: "center", justifyContent: "flex-end", marginBottom: 10 },
  cta: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  btn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5 },
  ticket: { flexDirection: "row", borderWidth: 1.5, borderRadius: 12, overflow: "hidden", transform: [{ rotate: "-2deg" }] },
  stub: { width: 54, alignItems: "center", justifyContent: "center", borderRightWidth: 1.5, borderStyle: "dashed", paddingVertical: 10 },
  tag: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  d5: { width: 5, height: 5, borderRadius: 3 },
  line: { gap: 6, paddingLeft: 4 },
  lrail: { position: "absolute", left: 9, top: 8, bottom: 8, width: 1.5 },
  lrow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ldot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  ltoday: { alignSelf: "flex-start", marginLeft: 20, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999 },
  door: { alignItems: "center", gap: 4, paddingVertical: 14, paddingHorizontal: 22, borderRadius: 16, borderWidth: 1.5 },
  stamp: { position: "absolute", top: 8, right: -10, borderWidth: 2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, transform: [{ rotate: "12deg" }] },
  tap: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, marginTop: 4 },
  dots: { flexDirection: "row", gap: 3, marginTop: 6 },
  d6: { width: 6, height: 6, borderRadius: 3, borderWidth: 1 },
});
