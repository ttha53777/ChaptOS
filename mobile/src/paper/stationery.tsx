/**
 * Larger paper objects, each copied from where the mock already draws it:
 *   Ruled          ruled-line background (index cards, legal pad, skeletons)
 *   IndexCard      Tasks deck `.tq-card`: ruled, rose margin rule under the cap line
 *   LegalPad       minutes / excuse `.lpad`: yellow ruled sheet, peach binding, margin rule
 *   ManilaFolder   Docs drawer `.lb-f`: pastel name tab over an inked folder body
 *   Receipt        Treasury `.px-rc`: thermal till paper with a zigzag torn foot
 *   SheetSurface   `.sheet`: the static look of a bottom sheet (tone tab, grabber, header).
 *                  U1 puts gestures, detents and stacking on top of it.
 *   Highlighter    `.hi`: a marker stroke drawn behind one word
 */
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Polygon } from "react-native-svg";
import { type IconName } from "~/icons/Icon";
import { alpha, type Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard, soft } from "~/theme/shadow";
import { T } from "~/ui/T";
import { Tile } from "./bits";

/* ── Ruled ───────────────────────────────────────────────────────────────────── */
export function Ruled({ gap, offset = 0, color, inset = 0 }: { gap: number; offset?: number; color: string; inset?: number }) {
  const [h, setH] = useState(0);
  const n = h > 0 ? Math.floor((h - offset) / gap) : 0;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e: LayoutChangeEvent) => setH(e.nativeEvent.layout.height)}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ position: "absolute", left: inset, right: inset, top: offset + (i + 1) * gap - 1, height: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}

/* ── IndexCard ───────────────────────────────────────────────────────────────── */
export interface IndexCardProps {
  /** The cap line above the margin rule (band, counts). */
  cap?: ReactNode;
  children?: ReactNode;
  /** Hard-shadow pastel; the top card of a deck is inked, ghosts behind it aren't. */
  tone?: Tone;
  ghost?: boolean;
  rotate?: number;
  style?: StyleProp<ViewStyle>;
}

export const INDEX_LINE = 30;

export function IndexCard({ cap, children, tone = "lilac", ghost, rotate = -0.4, style }: IndexCardProps) {
  const { c } = useTheme();
  return (
    <View style={[
      styles.index,
      { backgroundColor: c.card, borderColor: ghost ? c.line2 : c.ink, transform: [{ rotate: `${rotate}deg` }] },
      ghost ? soft(c.sh1) : hard(c.pastel[tone].fill, 4),
      style,
    ]}>
      {cap != null && (
        <View style={[styles.indexCap, { borderBottomColor: alpha(c.pastel.rose.ink, 0.42) }]}>{cap}</View>
      )}
      <View style={styles.indexBody}>
        <Ruled gap={INDEX_LINE} offset={3} color={alpha(c.pastel.sky.ink, 0.17)} inset={16} />
        {children}
      </View>
    </View>
  );
}

/* ── LegalPad ────────────────────────────────────────────────────────────────── */
export const PAD_LINE = 32;

export function LegalPad({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[styles.pad, { backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }, soft(c.sh1), style]}>
      <View style={[styles.padBinding, { backgroundColor: c.pastel.peach.ink }]} />
      <View style={[styles.padMargin, { borderLeftColor: alpha(c.pastel.rose.ink, 0.45) }]} />
      <View style={styles.padBody}>
        <Ruled gap={PAD_LINE} color={alpha(c.pastel.sky.ink, 0.22)} />
        {children}
      </View>
    </View>
  );
}

/* ── ManilaFolder ────────────────────────────────────────────────────────────── */
export interface ManilaFolderProps {
  name: string;
  tone?: Tone;
  icon?: IconName;
  /** Tab offset along the top edge, 0–1 of the width (folders in a drawer stagger). */
  tabAt?: number;
  /** A folder with nothing filed yet: dashed, no shadow. */
  empty?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ManilaFolder({ name, tone = "butter", tabAt = 0, empty, children, style }: ManilaFolderProps) {
  const { c } = useTheme();
  const tn = empty ? c.paper3 : c.note.fill[tone];
  const dashed = empty ? ({ borderStyle: "dashed" } as const) : null;
  return (
    <View style={style}>
      <View style={[styles.tab, { marginLeft: `${Math.round(tabAt * 100)}%`, backgroundColor: tn, borderColor: c.ink }, dashed]}>
        <T v="subhead" color={empty ? c.ink2 : c.note.ink} numberOfLines={1} style={{ fontSize: 13.5, lineHeight: 17 }}>{name}</T>
      </View>
      <View style={[
        styles.folder,
        { backgroundColor: c.card, borderColor: c.ink, borderTopLeftRadius: tabAt > 0.02 ? 14 : 0 },
        empty ? dashed : hard(tn, 3),
      ]}>
        {children}
      </View>
    </View>
  );
}

/* ── Receipt ─────────────────────────────────────────────────────────────────── */
const TOOTH = 14;

export function Receipt({ children, rotate = -0.5, style }: { children?: ReactNode; rotate?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const teeth = Math.max(1, Math.floor(w / TOOTH));
  const tw = w / teeth;
  const points = [`0,0`, ...Array.from({ length: teeth }, (_, i) => `${i * tw + tw / 2},${TOOTH / 2} ${(i + 1) * tw},0`)].join(" ");
  return (
    <View style={[{ transform: [{ rotate: `${rotate}deg` }] }, style]} onLayout={e => setW(e.nativeEvent.layout.width)}>
      <View style={[styles.receipt, { backgroundColor: c.thermal.paper }, hard(c.thermal.shadow, 3, 4)]}>{children}</View>
      {w > 0 && (
        <Svg width={w} height={TOOTH / 2} style={{ marginTop: -0.5 }}>
          <Polygon points={points} fill={c.thermal.paper} />
        </Svg>
      )}
    </View>
  );
}

/* ── SheetSurface ────────────────────────────────────────────────────────────── */
export interface SheetSurfaceProps {
  tone?: Tone;
  icon?: IconName;
  kicker?: string;
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SheetSurface({ tone = "lilac", icon, kicker, title, children, footer, style }: SheetSurfaceProps) {
  const { c } = useTheme();
  return (
    <View style={[styles.sheet, style]}>
      <View style={[styles.sheetTab, { backgroundColor: c.note.fill[tone], borderColor: c.ink }]} />
      <View style={[styles.sheetInner, { backgroundColor: c.card, borderColor: c.ink }]}>
        <View style={styles.grab}><View style={[styles.grabBar, { backgroundColor: c.line2 }]} /></View>
        {(title || kicker) && (
          <View style={styles.sheetHead}>
            {icon && <Tile icon={icon} tone={tone} size={42} rotate={-5} />}
            <View style={{ flex: 1 }}>
              {kicker && <T v="kicker" color={c.ink3}>{kicker}</T>}
              {title && <T v="title" accessibilityRole="header">{title}</T>}
            </View>
          </View>
        )}
        <View style={styles.sheetBody}>{children}</View>
        {footer && <View style={[styles.sheetFoot, { borderTopColor: c.line, backgroundColor: c.paper2 }]}>{footer}</View>}
      </View>
    </View>
  );
}

/* ── Highlighter ─────────────────────────────────────────────────────────────── */
export function Highlighter({ children, tone = "butter", delay = 350 }: { children: ReactNode; tone?: Tone; delay?: number }) {
  const { c } = useTheme();
  const m = useMotion();
  const draw = useSharedValue(m.reduced ? 1 : 0);
  useEffect(() => {
    if (m.reduced) { draw.value = 1; return; }
    draw.value = 0;
    draw.value = withDelay(m.t(delay), withTiming(1, m.timing(800, "spring")));
  }, [m, delay, draw]);
  const stroke = useAnimatedStyle(() => ({ transform: [{ rotate: "-0.8deg" }, { scaleX: draw.value }] }));
  return (
    <View style={styles.hi}>
      <Animated.View
        pointerEvents="none"
        style={[styles.hiStroke, { backgroundColor: c.note.fill[tone], opacity: c.markOp, transformOrigin: "left center" }, stroke]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  index: { borderWidth: 1.5, borderTopLeftRadius: 6, borderTopRightRadius: 16, borderBottomRightRadius: 8, borderBottomLeftRadius: 14, overflow: "hidden" },
  indexCap: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 13, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1.5 },
  indexBody: { paddingHorizontal: 16, paddingTop: 3, paddingBottom: 16 },

  pad: { borderWidth: 1.5, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, overflow: "hidden" },
  padBinding: { position: "absolute", left: 0, right: 0, top: 0, height: 14, opacity: 0.8 },
  padMargin: { position: "absolute", left: 28, top: 14, bottom: 0, borderLeftWidth: 1.5 },
  padBody: { paddingTop: 26, paddingRight: 14, paddingBottom: 6, paddingLeft: 40 },

  tab: { alignSelf: "flex-start", maxWidth: "64%", height: 27, justifyContent: "center", paddingHorizontal: 14, marginBottom: -1.5, borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 10, borderTopRightRadius: 12, zIndex: 2 },
  folder: { borderWidth: 1.5, borderRadius: 14, overflow: "hidden" },

  receipt: { paddingTop: 20, paddingHorizontal: 18, paddingBottom: 14 },

  sheet: { paddingTop: 8 },
  sheetTab: { position: "absolute", left: 14, right: 14, top: 0, height: 40, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1.5, borderBottomWidth: 0, transform: [{ rotate: "-1.2deg" }] },
  sheetInner: { borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: "hidden" },
  grab: { paddingTop: 9, paddingBottom: 4, alignItems: "center" },
  grabBar: { width: 40, height: 5, borderRadius: 3 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 4, paddingHorizontal: 18, paddingBottom: 10 },
  sheetBody: { paddingTop: 6, paddingHorizontal: 18, paddingBottom: 18, gap: 18 },
  sheetFoot: { flexDirection: "row", gap: 10, alignItems: "center", paddingTop: 12, paddingHorizontal: 18, paddingBottom: 20, borderTopWidth: 1.5 },

  hi: { alignSelf: "flex-start" },
  hiStroke: { position: "absolute", left: "-3%", right: "-4%", bottom: "6%", height: "48%", borderTopLeftRadius: 6, borderTopRightRadius: 8, borderBottomRightRadius: 6, borderBottomLeftRadius: 9 },
});
