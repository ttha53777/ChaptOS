/**
 * Motion Lab: U1 shell. The sheet duration (500ms, the mock's, chosen over the plan's 320ms)
 * side by side with the alternative, then every shell pattern live: sheets (fit / half / tall / stacked), toasts
 * (plain, Undo ring, error), and the loading / empty / error / offline pieces.
 */
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { EASE } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Kicker } from "~/paper/bits";
import { Sheet } from "~/shell/sheets";
import { CreateButton, Tab } from "~/shell/TabBar";
import { EmptyState, ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { toast } from "~/shell/toast";
import { usePaperSettings, useMotion, useTheme, type SheetMs } from "~/theme/PaperProvider";
import { Segmented } from "~/ui/Segmented";
import { T } from "~/ui/T";
import { Section } from "./sections";

/* ── 320 vs 500 ───────────────────────────────────────────────────────────────── */
export function SheetDurationLab() {
  const { c } = useTheme();
  const s = usePaperSettings();
  const m = useMotion();
  const { width } = useWindowDimensions();
  const w = Math.floor((width - 36 - 14) / 2);
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  const [open, setOpen] = useState(false);

  const play = () => {
    const to = open ? 0 : 1;
    setOpen(!open);
    a.value = withTiming(to, { duration: m.t(320), easing: EASE.sheet });
    b.value = withTiming(to, { duration: m.t(500), easing: EASE.sheet });
  };

  return (
    <Section title="Sheet duration" note="500ms (right, the mock's) is the default. Same curve (.32,.72,0,1), same scale-back; left is the plan's 320ms for comparison. Flipping below changes the real sheets until the app restarts.">
      <View style={{ flexDirection: "row", gap: 14 }}>
        <MiniPhone p={a} w={w} label="320ms · plan" />
        <MiniPhone p={b} w={w} label="500ms · mock" />
      </View>
      <View style={styles.rowWrap}>
        <Button label={open ? "Close both" : "Play both"} icon="refresh" size="sm" onPress={play} />
        <Segmented<SheetMs> label="Real sheets use" value={s.sheetMs} onChange={v => s.set({ sheetMs: v })}
          options={[{ value: 320, label: "320ms" }, { value: 500, label: "500ms" }]} />
      </View>
      <T v="meta" color={c.ink3}>The 4× slow toggle above applies to both. A drag that doesn't dismiss snaps back in 320ms either way.</T>
    </Section>
  );
}

function MiniPhone({ p, w, label }: { p: SharedValue<number>; w: number; label: string }) {
  const { c } = useTheme();
  const h = Math.round(w * 2.05);
  const sat = 10;
  const canvas = useAnimatedStyle(() => ({
    transform: [{ translateY: (sat - 3) * p.value }, { scale: 1 - 0.08 * p.value }],
  }));
  const scrim = useAnimatedStyle(() => ({ opacity: p.value }));
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.value) * h * 0.66 }] }));
  return (
    <View style={{ gap: 6, alignItems: "center" }}>
      <View style={[styles.phone, { width: w, height: h }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.miniCanvas, { backgroundColor: c.paper }, canvas]}>
          <View style={[styles.miniBar, { backgroundColor: c.ink, width: "46%" }]} />
          {[0.9, 0.7, 0.8].map((f, i) => (
            <View key={i} style={[styles.miniCard, { borderColor: c.line, backgroundColor: c.card }]}>
              <View style={[styles.miniLine, { backgroundColor: c.skel, width: `${f * 100}%` }]} />
              <View style={[styles.miniLine, { backgroundColor: c.skel, width: "50%" }]} />
            </View>
          ))}
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrim]} />
        <Animated.View style={[styles.miniSheet, { height: h * 0.62, backgroundColor: c.card, borderColor: c.ink }, sheet]}>
          <View style={[styles.miniGrab, { backgroundColor: c.line2 }]} />
          <View style={[styles.miniLine, { backgroundColor: c.ink, width: "55%", height: 7, marginTop: 8 }]} />
          <View style={[styles.miniLine, { backgroundColor: c.skel, width: "80%" }]} />
          <View style={[styles.miniLine, { backgroundColor: c.skel, width: "65%" }]} />
        </Animated.View>
      </View>
      <T v="kicker" color={c.ink2}>{label}</T>
    </View>
  );
}

/* ── live shell patterns ──────────────────────────────────────────────────────── */
export function ShellLab() {
  const { c } = useTheme();
  const [sheet, setSheet] = useState<null | "fit" | "half" | "tall">(null);
  const [second, setSecond] = useState(false);
  const [failed, setFailed] = useState(true);

  return (
    <>
      <Section title="Sheets" note="Drag the grabber or header to dismiss; pull up past the top to feel the rubber band; tap the scrim to close. Half opens at 56% and drags up to full. Stacked: the first sheet steps back.">
        <View style={styles.rowWrap}>
          <Button label="Fit" size="sm" variant="ghost" onPress={() => setSheet("fit")} />
          <Button label="Half → tall" size="sm" variant="ghost" onPress={() => setSheet("half")} />
          <Button label="Tall" size="sm" variant="ghost" onPress={() => setSheet("tall")} />
        </View>
      </Section>

      <Sheet open={sheet !== null} onClose={() => { setSheet(null); setSecond(false); }} size={sheet ?? "fit"}
        kicker="Motion Lab" title={sheet === "half" ? "Two detents" : sheet === "tall" ? "A tall sheet" : "A fitted sheet"} icon="note" tone="sky"
        footer={<Button label="Open a second sheet" block onPress={() => setSecond(true)} style={{ flex: 1 }} />}>
        <T v="body" color={c.ink2}>
          {sheet === "half" ? "Drag the header up to take it full height, down to dismiss." : "This sheet sizes to its content, up to full height."}
        </T>
        {Array.from({ length: sheet === "fit" ? 2 : 10 }, (_, i) => (
          <SkeletonCard key={i} lines={2} title={false} />
        ))}
      </Sheet>
      <Sheet open={second} onClose={() => setSecond(false)} kicker="Stacked" title="On top of the first" icon="clip" tone="peach">
        <T v="body" color={c.ink2}>The sheet underneath stepped back (−12pt, .94). Close this and it comes forward again.</T>
        <Button label="Show a toast over the sheets" variant="ghost" onPress={() => toast.show("Toasts drop to the bottom edge over a sheet")} />
      </Sheet>

      <Section title="Toasts" note="Ink snackbar above the tab bar (bottom edge when there's none). Undo runs 10s with the ring, like the web. Swipe one down to dismiss early.">
        <View style={styles.rowWrap}>
          <Button label="Plain" size="sm" variant="ghost" tone="mint" onPress={() => toast.show("Excuse filed", { detail: "Officers see it on the event" })} />
          <Button label="With undo" size="sm" variant="ghost" tone="lilac"
            onPress={() => { haptics.success(); toast.show("Task done", { tone: "lilac", undo: () => toast.show("Task back on your plate") }); }} />
          <Button label="Error" size="sm" variant="ghost" tone="rose"
            onPress={() => { haptics.error(); toast.error("Couldn't check you in", { detail: "Check-in closed a moment ago" }); }} />
        </View>
      </Section>

      <Section title="Loading, empty, error" note="First load: ruled skeletons in the card's shape (appear after 140ms, so fast answers never flash them). Empty: the day-one pattern. Error: only when there's nothing saved to show.">
        <Kicker label="Skeletons" tone="sky" />
        <SkeletonCard height={150} lines={3} radius={24} />
        <SkeletonCard lines={2} lead />
        <Kicker label="Empty (day one)" tone="mint" />
        <EmptyState
          pictures={[{ icon: "cal", tone: "sky", label: "Meetings" }, { icon: "ticket", tone: "peach", label: "Check-ins" }, { icon: "clip", tone: "lilac", label: "Tasks" }]}
          title="Nothing on the calendar yet"
          line="When an officer adds a meeting or event, it lands here."
        />
        <EmptyState compact title="No tasks on you" line="Anything assigned to you shows up here." />
        <Kicker label="Error and offline" tone="rose" />
        <ErrorState title="Couldn't load the timeline." error={new Error("x")} onRetry={() => toast.show("Retrying…")} />
        <View style={styles.rowWrap}>
          <Segmented label="Stale note" value={failed ? "failed" : "fresh"} onChange={v => setFailed(v === "failed")}
            options={[{ value: "failed", label: "Refresh failed" }, { value: "fresh", label: "Current" }]} />
        </View>
        <StaleNote updatedAt={Date.now() - 42 * 60_000} failed={failed} onRetry={() => setFailed(false)} />
        <T v="meta" color={c.ink3}>Turn on airplane mode and the note switches to "Offline · showing what you saw …" by itself.</T>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  phone: { borderRadius: 18, overflow: "hidden", backgroundColor: "black" },
  miniCanvas: { borderRadius: 12, overflow: "hidden", padding: 10, paddingTop: 18, gap: 8, transformOrigin: "50% 0%" },
  miniBar: { height: 9, borderRadius: 4, marginBottom: 4 },
  miniCard: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 5 },
  miniLine: { height: 5, borderRadius: 3 },
  miniSheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 1.5, borderBottomWidth: 0, padding: 10, gap: 6 },
  miniGrab: { alignSelf: "center", width: 22, height: 3, borderRadius: 2 },
});

/* ── the tab bar ──────────────────────────────────────────────────────────────── */
const LAB_TABS = [
  { key: "today", label: "Home", icon: "home" },
  { key: "timeline", label: "Timeline", icon: "timeline" },
  { key: "members", label: "Brothers", icon: "people" },
  { key: "more", label: "More", icon: "menu" },
] as const;

export function TabBarLab() {
  const { c } = useTheme();
  const [on, setOn] = useState<string>("today");
  const active = useSharedValue("today");
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState(2);
  const tab = (t: (typeof LAB_TABS)[number], i: number) => (
    <Tab key={t.key} tabKey={t.key} active={active} label={t.label} icon={t.icon} focused={on === t.key} onPress={() => { active.value = t.key; setOn(t.key); }}
      badge={t.key === "more" ? badge : 0} position={`${i + 1} of 4`} />
  );
  return (
    <Section title="Tab bar + Create" note="The web's phone bar. The tab you're on gets the inked tile (card, ink border, 2px butter shadow), popping 0.72 → 1 on the pop spring; a press nudges it 1px into its shadow. Create's face slides 1.5px onto its lilac shadow; open, the + turns 135° into an ×. Reduced: the tile fades in at full size, Create doesn't travel and the + cross-fades to an ×.">
      <View style={[labBar.bar, { backgroundColor: c.paper, borderColor: c.line }]}>
        <View style={[labBar.half, { flex: 2 }]}>{LAB_TABS.slice(0, 2).map(tab)}</View>
        <CreateButton open={open} onPress={() => { haptics.tap(); setOpen(o => !o); }} />
        <View style={[labBar.half, { flex: 2 }]}>{LAB_TABS.slice(2).map((t, i) => tab(t, i + 2))}</View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label={open ? "Close Create" : "Open Create"} variant="soft" size="sm" onPress={() => setOpen(o => !o)} style={{ flex: 1 }} />
        <Button label={badge ? "Clear badge" : "2 overdue"} variant="ghost" size="sm" onPress={() => setBadge(b => (b ? 0 : 2))} style={{ flex: 1 }} />
      </View>
    </Section>
  );
}

const labBar = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "flex-start", paddingTop: 6, paddingBottom: 10, paddingHorizontal: 8, borderWidth: 1.5, borderRadius: 16 },
  half: { flexDirection: "row" },
});
