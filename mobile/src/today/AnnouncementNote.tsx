/**
 * The chapter's one announcement (GET /api/announcement) on a taped sticky note, with
 * its author and when it was last changed. The link button shows only when an officer
 * set one, and opens only http(s) links.
 *
 * Motion: when the announcement changes while Today is open (a refresh brings a new
 * one), the note lands with a small tape-press: scale 1.04 → 1 and a 1.5° settle,
 * 300ms on the spring curve, with a soft haptic. Reduced: it cross-fades in. The
 * first render never animates.
 *
 * Officers who can pin (MANAGE_ANNOUNCEMENTS) get Edit on the note, and when there's no
 * note, NoNote: the web's empty pin with "Write one".
 */
import type { Announcement } from "@/lib/api-types";
import { useEffect, useRef } from "react";
import { Linking, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { StickyNote } from "~/paper/bits";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export function AnnouncementNote({ a, onEdit }: { a: NonNullable<Announcement>; onEdit?: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const seen = useRef(a.updatedAt);
  const s = useSharedValue(1);
  const r = useSharedValue(0);
  const o = useSharedValue(1);

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

  const press = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }, { rotate: `${r.value}deg` }] }));

  const when = new Date(a.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const link = a.ctaUrl && /^https?:\/\//i.test(a.ctaUrl) ? a.ctaUrl : null;

  return (
    <Animated.View style={press}>
      <StickyNote tone="butter" rotate={-1}>
        <View style={{ gap: 6 }}>
          <T v="kicker" color={c.note.ink} style={{ opacity: 0.7 }}>Announcement</T>
          <T v="heading" color={c.note.ink}>{a.title}</T>
          {a.body ? <T v="body" color={c.note.ink}>{a.body}</T> : null}
          {link ? (
            <Button label={a.ctaLabel || "Open link"} icon="link" variant="soft" size="sm" style={styles.cta}
              onPress={() => { void Linking.openURL(link); }} />
          ) : null}
          <View style={styles.foot}>
            <T v="meta" color={c.note.ink} style={{ opacity: 0.65, flex: 1 }}>{`${a.authorName ? `${a.authorName} · ` : ""}${when}`}</T>
            {onEdit ? <Button label="Edit" icon="pencil" variant="soft" size="sm" onPress={onEdit} /> : null}
          </View>
        </View>
      </StickyNote>
    </Animated.View>
  );
}

/** No note pinned, for someone who can pin one: the web's empty pin. */
export function NoNote({ onWrite }: { onWrite: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: c.line2 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="callout" color={c.ink2}>Nothing pinned.</T>
        <T v="meta" color={c.ink3}>One note for the whole chapter, at the bottom of everyone's Today.</T>
      </View>
      <Button label="Write one" icon="pin" tone="butter" variant="ghost" size="sm" onPress={onWrite} />
    </View>
  );
}

const styles = StyleSheet.create({
  cta: { alignSelf: "flex-start", marginTop: 2 },
  foot: { flexDirection: "row", alignItems: "center", gap: 8 },
  empty: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16, padding: 14 },
});
