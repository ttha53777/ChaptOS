/**
 * Hard offset shadows: the paper aesthetic's signature "sits up off the page" edge
 * (`box-shadow: 3px 3px 0 var(--peach)` on the web). RN 0.76+ draws `boxShadow` natively
 * on the new architecture, blur 0 included, so this is a real shadow rather than the
 * sibling-view trick older RN needed.
 */
import type { ViewStyle } from "react-native";

export function hard(color: string, x = 3, y = x): ViewStyle {
  return { boxShadow: [{ offsetX: x, offsetY: y, blurRadius: 0, spreadDistance: 0, color }] };
}

/** The soft lift shadows (`--pp-sh-1..3`) are strings in the palette; this keeps call
 *  sites symmetrical with `hard()`. */
export function soft(shadow: string): ViewStyle {
  return { boxShadow: shadow };
}
