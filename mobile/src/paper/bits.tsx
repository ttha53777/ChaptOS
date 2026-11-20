/**
 * The small paper parts every screen is assembled from. Each mirrors a mock class:
 *   Surface      .card / inked cards (.tonight, .meas--health)
 *   Tile         .tile              pastel icon square
 *   Pill         .pill              tone-tinted status
 *   Chip         .kick .chip / .day[aria-pressed]   neutral or selected chip
 *   Kicker       .dk-kick / .tq-dh  coloured dash + tracked caps
 *   Avatar(+Stack) .avatar / .stk
 *   Tape         .note::after       translucent tape strip
 *   StickyNote   .note / .pinned    pastel note, dark ink in both themes
 */
import { useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { DUR } from "~/motion/motion";
import { Icon, type IconName } from "~/icons/Icon";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard, soft } from "~/theme/shadow";
import { T } from "~/ui/T";

/* ── Surface ─────────────────────────────────────────────────────────────────── */
export interface SurfaceProps {
  children?: ReactNode;
  /** Ink border + hard pastel shadow: the one card on a screen that matters most. */
  inked?: Tone;
  /** Hard-shadow offset when inked (4 for cards, 5 for the hero ticket). */
  lift?: number;
  radius?: number;
  dashed?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Surface({ children, inked, lift = 4, radius = 22, dashed, style }: SurfaceProps) {
  const { c } = useTheme();
  const look: ViewStyle = dashed
    ? { backgroundColor: "transparent", borderColor: c.line2, borderStyle: "dashed" }
    : inked
      ? { backgroundColor: c.card, borderColor: c.ink, ...hard(c.pastel[inked].fill, lift) }
      : { backgroundColor: c.card, borderColor: c.line, ...soft(c.sh1) };
  return <View style={[{ borderWidth: 1.5, borderRadius: radius }, look, style]}>{children}</View>;
}

/* ── Tile ────────────────────────────────────────────────────────────────────── */
export function Tile({ icon, tone, size = 34, rotate = 0 }: { icon: IconName; tone: Tone; size?: number; rotate?: number }) {
  const { c } = useTheme();
  const p = c.pastel[tone];
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.32, borderWidth: 1.5, borderColor: p.border, backgroundColor: p.soft,
      alignItems: "center", justifyContent: "center", transform: [{ rotate: `${rotate}deg` }],
    }}>
      <Icon name={icon} size={size * 0.5} color={p.ink} />
    </View>
  );
}

/* ── Pill ────────────────────────────────────────────────────────────────────── */
export function Pill({ label, tone, dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const { c } = useTheme();
  const bg = tone ? c.pastel[tone].soft : c.paper2;
  const fg = tone ? c.pastel[tone].ink : c.ink2;
  const bd = tone ? c.pastel[tone].border : c.line;
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: bd }]}>
      {dot && <View style={[styles.dot, { backgroundColor: fg }]} />}
      <T v="pill" color={fg} numberOfLines={1}>{label}</T>
    </View>
  );
}

/* ── Chip ────────────────────────────────────────────────────────────────────── */
export function Chip({ label, selected, icon }: { label: string; selected?: boolean; icon?: IconName }) {
  const { c } = useTheme();
  return (
    <View style={[
      styles.chip,
      selected
        ? { backgroundColor: c.card, borderColor: c.ink, ...hard(c.pastel.butter.fill, 2) }
        : { backgroundColor: c.card, borderColor: c.line2 },
    ]}>
      {icon && <Icon name={icon} size={13} color={selected ? c.ink : c.ink2} />}
      <T v="pill" color={selected ? c.ink : c.ink2}>{label}</T>
    </View>
  );
}

/* ── Kicker ──────────────────────────────────────────────────────────────────── */
export function Kicker({ label, tone = "peach", dash = 18, mono = true, color }: { label: string; tone?: Tone; dash?: number; mono?: boolean; color?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.kicker} accessibilityRole="header">
      <View style={{ width: dash, height: 2, borderRadius: 2, backgroundColor: c.pastel[tone].fill }} />
      <T v={mono ? "kicker" : "label"} color={color ?? c.ink3}>{label}</T>
    </View>
  );
}

/* ── Avatar ──────────────────────────────────────────────────────────────────── */
export type AvatarSize = "sm" | "md" | "lg";
const AV = { sm: 26, md: 34, lg: 78 } as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "", b = parts.length > 1 ? parts[parts.length - 1]![0] : "";
  return (a + b).toUpperCase();
}

/** `px` sets an exact diameter (the photo and initials scale with it); `size` picks a preset. */
export interface AvatarProps { name: string; uri?: string | null; tone?: Tone; size?: AvatarSize; px?: number; ring?: string; style?: StyleProp<ViewStyle> }

export function Avatar({ name, uri, tone = "lilac", size = "md", px, ring, style }: AvatarProps) {
  const { c } = useTheme();
  const d = px ?? AV[size];
  const lg = size === "lg";
  return (
    <View
      accessibilityLabel={name}
      style={[{
        width: d, height: d, borderRadius: d / 2, alignItems: "center", justifyContent: "center", overflow: lg ? "visible" : "hidden",
        backgroundColor: c.note.fill[tone],
        borderWidth: lg ? 2 : ring ? 2 : 1.5,
        borderColor: lg ? c.ink : ring ?? "rgba(38,33,27,0.08)",
      }, lg && hard(c.pastel.peach.fill, 4), style]}
    >
      {/* Initials are the placeholder while a photo loads, and the fallback if it never does. */}
      <T v={lg ? "title" : "pill"} color={c.avInk} style={{ fontSize: d * (lg ? 0.3 : 0.32), lineHeight: d * 0.4 }}>{initials(name)}</T>
      {uri ? <AvatarPhoto key={uri} uri={uri} d={d} /> : null}
    </View>
  );
}

/** A photo that fades in over the initials when it arrives from the network. One already
 *  in the image cache (loaded within a frame or so) shows at once, so a list you've seen
 *  doesn't flicker as it remounts. A failed load leaves the initials showing. */
function AvatarPhoto({ uri, d }: { uri: string; d: number }) {
  const m = useMotion();
  const shown = useSharedValue(0);
  const t0 = useRef(Date.now());
  const [failed, setFailed] = useState(false);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  if (failed) return null;
  return (
    <Animated.Image source={{ uri }} onError={() => setFailed(true)}
      onLoad={() => { shown.value = Date.now() - t0.current < 50 || m.reduced ? 1 : withTiming(1, m.timing(DUR.fade, "out")); }}
      style={[{ position: "absolute", width: d - 3, height: d - 3, borderRadius: d / 2 }, fade]} />
  );
}

export function AvatarStack({ people, size = "sm", max = 4 }: { people: { name: string; uri?: string | null; tone?: Tone }[]; size?: AvatarSize; max?: number }) {
  const { c } = useTheme();
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <View style={styles.stack} accessibilityLabel={`${people.length} people`}>
      {shown.map((p, i) => (
        <Avatar key={`${p.name}-${i}`} {...p} size={size} ring={c.card} style={{ marginLeft: i ? -8 : 0 }} />
      ))}
      {rest > 0 && <T v="mono" color={c.ink3} style={{ marginLeft: 6 }}>+{rest}</T>}
    </View>
  );
}

/* ── Tape ────────────────────────────────────────────────────────────────────── */
export function Tape({ width = 56, rotate = -3, tint, style }: { width?: number; rotate?: number; tint?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      pointerEvents="none"
      style={[{
        width, height: 16, backgroundColor: tint ?? "rgba(255,255,255,0.5)",
        borderLeftWidth: 1, borderRightWidth: 1, borderStyle: "dashed", borderColor: "rgba(38,33,27,0.16)",
        transform: [{ rotate: `${rotate}deg` }],
      }, style]}
    />
  );
}

/* ── StickyNote ──────────────────────────────────────────────────────────────── */
export function StickyNote({ children, tone = "butter", rotate = -1, tape = true, style }: { children: ReactNode; tone?: Tone; rotate?: number; tape?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{
      paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14,
      borderTopLeftRadius: 5, borderTopRightRadius: 14, borderBottomRightRadius: 7, borderBottomLeftRadius: 12,
      backgroundColor: c.note.fill[tone], transform: [{ rotate: `${rotate}deg` }],
    }, soft(c.sh2), style]}>
      {tape && <Tape width={58} rotate={-4} style={styles.noteTape} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1.5, alignSelf: "flex-start" },
  kicker: { flexDirection: "row", alignItems: "center", gap: 9 },
  stack: { flexDirection: "row", alignItems: "center" },
  noteTape: { position: "absolute", top: -8, left: 34 },
});
