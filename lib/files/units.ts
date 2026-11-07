import type { TextUnit } from "./types";

/**
 * Keep units in order until `maxChars` is reached; the unit that crosses the
 * line is clipped. `truncated` says something was dropped.
 */
export function capUnits(units: TextUnit[], maxChars: number): { units: TextUnit[]; chars: number; truncated: boolean } {
  const out: TextUnit[] = [];
  let chars = 0;
  for (const u of units) {
    if (chars + u.text.length > maxChars) {
      const room = maxChars - chars;
      if (room > 200) { out.push({ ...u, text: u.text.slice(0, room) }); chars += room; }
      return { units: out, chars, truncated: true };
    }
    out.push(u);
    chars += u.text.length;
  }
  return { units: out, chars, truncated: false };
}
