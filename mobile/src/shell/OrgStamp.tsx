/**
 * The org stamp in the header: the active chapter's logo (or initials) on a tilted
 * square with a hard butter shadow. With more than one chapter it opens the switcher
 * sheet: chapter cards from MeResponse.memberships. Picking one flips the stamp
 * (rotateY to the edge, swap, back: 2 × 140ms) while Screen cross-fades the content.
 * Reduced motion: the stamp cross-fades instead of flipping.
 */
import type { MeResponse } from "@/lib/api-types";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Avatar, initials, Pill } from "~/paper/bits";
import { setActiveOrg } from "~/state/org";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { Sheet } from "./sheets";

type Org = { name: string; logoUrl: string | null };

export function OrgStamp() {
  const entry = useEntryOf("ready");
  const [open, setOpen] = useState(false);
  if (!entry) return null;
  const { me } = entry;
  const many = me.memberships.length > 1;
  const org: Org = { name: me.org?.name ?? "Your chapter", logoUrl: me.org?.logoUrl ?? null };
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={!many}
        accessibilityRole={many ? "button" : "image"}
        accessibilityLabel={many ? `${org.name}. Switch chapter` : org.name}
        hitSlop={8}
      >
        <StampFace org={org} />
      </Pressable>
      {many ? <OrgSheet me={me} open={open} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const SIZE = 34;

export function StampFace({ org, size = SIZE }: { org: Org; size?: number }) {
  const { c } = useTheme();
  const m = useMotion();
  const [shown, setShown] = useState(org);
  const flip = useSharedValue(0); // 0 face-on, 1 edge-on
  const op = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (org.name === shown.name && org.logoUrl === shown.logoUrl) return;
    if (m.reduced) {
      op.value = withSequence(
        withTiming(0, m.timing(90, "out"), f => { if (f) scheduleOnRN(setShown, org); }),
        withTiming(1, m.timing(140, "out")),
      );
      return;
    }
    flip.value = withSequence(
      withTiming(1, m.timing(140, "in"), f => { if (f) scheduleOnRN(setShown, org); }),
      withTiming(0, m.timing(180, "spring")),
    );
  }, [org.name, org.logoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ perspective: 400 }, { rotateY: `${flip.value * 90}deg` }, { rotate: "-4deg" }],
  }));

  return (
    <Animated.View style={[styles.stamp, { width: size, height: size, borderColor: c.ink, backgroundColor: c.note.fill.butter }, hard(c.pastel.peach.fill, 2), style]}>
      {shown.logoUrl
        ? <Image source={{ uri: shown.logoUrl }} style={{ width: size - 3, height: size - 3, borderRadius: 7 }} />
        : <T v="pill" color={c.note.ink} style={{ fontSize: size * 0.34 }}>{initials(shown.name)}</T>}
    </Animated.View>
  );
}

export function OrgSheet({ me, open, onClose }: { me: MeResponse; open: boolean; onClose: () => void }) {
  const { c } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} kicker="Your chapters" title="Switch chapter" icon="swap" tone="butter">
      <View style={{ gap: 10 }}>
        {me.memberships.map(ms => {
          const current = ms.orgSlug === me.org?.slug;
          return (
            <Pressable
              key={ms.organizationId}
              accessibilityRole="button"
              accessibilityState={{ selected: current }}
              accessibilityLabel={`${ms.orgName}, ${ms.title}${current ? ", current" : ""}`}
              onPress={() => {
                onClose();
                if (!current) { haptics.select(); setActiveOrg(ms.orgSlug); }
              }}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: c.card, borderColor: current ? c.ink : c.line },
                current && hard(c.pastel.butter.fill, 3),
                pressed && { transform: [{ scale: 0.985 }] },
              ]}
            >
              <Avatar name={ms.orgName} uri={ms.orgLogoUrl} tone="butter" size="md" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="subhead" numberOfLines={1}>{ms.orgName}</T>
                <T v="meta" color={c.ink3} numberOfLines={1}>{ms.title}</T>
              </View>
              {current ? <Pill label="Here now" tone="butter" /> : <Icon name="chev-r" size={16} color={c.ink3} />}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stamp: { borderWidth: 1.5, borderRadius: 9, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, borderWidth: 1.5, minHeight: 64 },
});
