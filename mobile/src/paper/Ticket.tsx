/**
 * The ticket (`.tonight` in the mock): an ink-bordered card with a hard pastel shadow,
 * split by a perforation with half-moon notches into a body and a stub.
 *
 * Body and stub are separate views on purpose: check-in tears the stub off at the
 * perforation. Each half draws its own dashed edge and its own quarter of each notch,
 * so attached they read as one perforated card and torn they each keep a ragged edge.
 * Pass Reanimated styles in `stubStyle` / `bodyStyle` to move them.
 */
import { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";

const R = 24;          // outer corner radius
const NOTCH = 20;      // notch diameter
const B = 1.5;         // ink border

export interface TicketProps {
  body: ReactNode;
  stub?: ReactNode;
  /** Hard-shadow pastel; tracks state (mint open, butter closing soon, sky done). */
  tone?: Tone;
  /** What shows through the notches: the surface the ticket sits on. */
  ground?: string;
  bodyStyle?: StyleProp<AnimatedStyle<ViewStyle>>;
  stubStyle?: StyleProp<AnimatedStyle<ViewStyle>>;
  /** Drawn inside the stub, under its content (e.g. a blush wash on failure). */
  stubUnderlay?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

function Perf({ color, at }: { color: string; at: "top" | "bottom" }) {
  return (
    <View pointerEvents="none" style={[styles.perf, at === "top" ? { top: -1 } : { bottom: -1 }]}>
      <Svg height={2} width="100%">
        <Line x1={0} x2="100%" y1={1} y2={1} stroke={color} strokeWidth={1.5} strokeDasharray="4.5 3.5" />
      </Svg>
    </View>
  );
}

function Notch({ side, at, ground, ink }: { side: "left" | "right"; at: "top" | "bottom"; ground: string; ink: string }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.notch,
        { backgroundColor: ground, borderColor: ink },
        side === "left" ? { left: -NOTCH / 2 - B } : { right: -NOTCH / 2 - B },
        at === "top" ? { top: -NOTCH / 2 } : { bottom: -NOTCH / 2 },
      ]}
    />
  );
}

export function Ticket({ body, stub, tone = "mint", ground, bodyStyle, stubStyle, stubUnderlay, style }: TicketProps) {
  const { c } = useTheme();
  const g = ground ?? c.paper;
  const shadow = hard(c.pastel[tone].fill, 5);
  const face = { backgroundColor: c.card, borderColor: c.ink };

  if (!stub) {
    return (
      <Animated.View style={[styles.whole, face, shadow, style, bodyStyle]}>{body}</Animated.View>
    );
  }

  return (
    <View style={style}>
      <Animated.View style={[styles.body, face, shadow, bodyStyle]}>
        {body}
        <Perf color={c.line2} at="bottom" />
        <Notch side="left" at="bottom" ground={g} ink={c.ink} />
        <Notch side="right" at="bottom" ground={g} ink={c.ink} />
      </Animated.View>
      <Animated.View style={[styles.stub, face, shadow, { transformOrigin: "left top" }, stubStyle]}>
        {stubUnderlay}
        <Perf color={c.line2} at="top" />
        <Notch side="left" at="top" ground={g} ink={c.ink} />
        <Notch side="right" at="top" ground={g} ink={c.ink} />
        {stub}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  whole: { borderWidth: B, borderRadius: R, overflow: "hidden" },
  body: { borderWidth: B, borderBottomWidth: 0, borderTopLeftRadius: R, borderTopRightRadius: R, overflow: "hidden" },
  stub: { borderWidth: B, borderTopWidth: 0, borderBottomLeftRadius: R, borderBottomRightRadius: R, overflow: "hidden" },
  perf: { position: "absolute", left: 14, right: 14, height: 2 },
  notch: { position: "absolute", width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2, borderWidth: B },
});
