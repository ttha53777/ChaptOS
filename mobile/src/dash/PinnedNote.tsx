/**
 * The pinned note: the web's PinnedAnnouncement (app/components/dashboard/ledger/
 * PinnedAnnouncement.tsx, paper rules in app/paper-aesthetic.css `.dash .pinned`) on a
 * phone. A butter note a hair off square, taped at the top left:
 *
 *   PINNED | **Title** body …
 *   — Maya · 7h ago   [link]   [Edit]
 *
 * With nothing pinned, someone who can pin sees the dashed placeholder ("ANNOUNCEMENT",
 * the org's word for it, and Write one); anyone else sees nothing, as on the web.
 *
 * Motion: when a refresh brings a changed note, it lands with a tape-press (1.04 → 1 and
 * a 1.5° settle on the spring) and a soft haptic. Reduced: a cross-fade. Never on first
 * render.
 */
import type { Announcement } from "@/lib/api-types";
import { useEffect, useRef } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { haptics } from "~/motion/haptics";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

/** app/components/dashboard/AnnouncementCard relativeTime. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = Date.now() - then, min = 60_000, hr = 60 * min, day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const NOTE_LINE = "rgba(38,33,27,0.35)";
const NOTE_HS = "rgba(38,33,27,0.18)";

export function PinnedNote({ a, word, onEdit }: { a: Announcement | null; word: string; onEdit?: () => void }) {
  if (!a && !onEdit) return null;
  return a ? <Note a={a} onEdit={onEdit} /> : <Empty word={word} onWrite={onEdit!} />;
}

function Note({ a, onEdit }: { a: NonNullable<Announcement>; onEdit?: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const seen = useRef(a.updatedAt);
  const s = useSharedValue(1), r = useSharedValue(0), o = useSharedValue(1);

  useEffect(() => {
    if (seen.current === a.updatedAt) return;
    seen.current = a.updatedAt;
    haptics.soft();
    if (m.reduced) {
      o.value = withSequence(withTiming(0.3, m.timing(1)), withTiming(1, m.timing(220, "out")));
      return;
    }
    s.value = withSequence(withTiming(1.04, m.timing(1)), withTiming(1, m.timing(300, "spring")));
    r.value = withSequence(withTiming(1.5, m.timing(1)), withTiming(0, m.timing(300, "spring")));
  }, [a.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const press = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }, { rotate: `${r.value - 0.35}deg` }] }));
  const ink = c.note.ink;
  const body = a.body.trim();
  const link = a.ctaLabel && a.ctaUrl && /^https?:\/\//i.test(a.ctaUrl) ? a.ctaUrl : null;
  const by = a.authorName ? `— ${a.authorName.split(" ")[0]} · ${relativeTime(a.updatedAt)}` : null;

  return (
    <Animated.View style={[styles.note, { backgroundColor: c.note.fill.butter, boxShadow: c.sh2 }, press]}>
      <View pointerEvents="none" style={styles.tape} />
      <View style={[styles.tag, { borderColor: NOTE_LINE }]}>
        <T v="kicker" size={10.24} ls={0.09} color={ink}>PINNED</T>
      </View>
      <T v="body" size={15.2} lh={1.45} color={ink} style={styles.p}>
        <T v="body" size={15.2} lh={1.45} color={ink} style={{ fontFamily: "Inter-600" }}>{a.title}</T>
        {body ? ` ${body}` : ""}
      </T>
      <View style={styles.tail}>
        {by ? <T v="meta" size={12.48} color={ink} style={{ opacity: 0.65 }}>{by}</T> : null}
        {link ? <NoteButton label={a.ctaLabel!} ink={ink} hs={NOTE_HS} onPress={() => { void Linking.openURL(link); }} /> : null}
        {onEdit ? <NoteButton label="Edit" ink={ink} hs={NOTE_HS} onPress={onEdit} /> : null}
      </View>
    </Animated.View>
  );
}

function Empty({ word, onWrite }: { word: string; onWrite: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.note, styles.empty, { borderColor: c.line2 }]}>
      <View style={[styles.tag, { borderColor: c.line2 }]}>
        <T v="kicker" size={10.24} ls={0.09} color={c.ink3}>{word.toUpperCase()}</T>
      </View>
      <T v="body" size={15.2} lh={1.45} color={c.ink2} style={styles.p}>Post something for the chapter — it's the first thing everyone sees.</T>
      <View style={styles.tail}>
        <NoteButton label="Write one" ink={c.ink} hs={c.pastel.butter.fill} onPress={onWrite} />
      </View>
    </View>
  );
}

/** `.dash .pinned .pin-edit`: a small outlined pill with a hard shadow. */
function NoteButton({ label, ink, hs, onPress }: { label: string; ink: string; hs: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.btn, { borderColor: ink, boxShadow: pressed ? undefined : `2px 2px 0 ${hs}` }, pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
      <T v="buttonSm" size={12.8} color={ink}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 16, paddingVertical: 16, paddingHorizontal: 20,
    borderTopLeftRadius: 5, borderTopRightRadius: 14, borderBottomRightRadius: 7, borderBottomLeftRadius: 12,
  },
  // even corners: iOS draws a dashed border solid on uneven ones
  empty: { borderWidth: 1.5, borderStyle: "dashed", borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomRightRadius: 12, borderBottomLeftRadius: 12 },
  tape: {
    position: "absolute", left: 46, top: -8, width: 60, height: 17, transform: [{ rotate: "-4deg" }],
    backgroundColor: "rgba(255,255,255,0.52)", borderLeftWidth: 1, borderRightWidth: 1, borderColor: "rgba(38,33,27,0.16)",
  },
  tag: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1.5 },
  p: { flexGrow: 1, flexShrink: 1, flexBasis: 200 },
  tail: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16, width: "100%" },
  btn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, backgroundColor: "transparent" },
});
