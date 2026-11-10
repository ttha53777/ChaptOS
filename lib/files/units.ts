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

/**
 * What an empty table cell reads as. Models skim past a bare "|  |" and pull
 * the next value left into it; a word can't be skipped.
 */
export const BLANK_CELL = "(blank)";

const SEPARATOR_RE = /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;

/**
 * When a markdown table runs across a split (a long Word section, a block of a
 * text file), the continuation starts with bare rows nobody can read against
 * their columns. Give each such piece its table's header and separator again.
 */
export function carryTableHeaders(pieces: string[]): string[] {
  let header: string | null = null;
  return pieces.map((piece, i) => {
    let out = piece;
    const first = piece.split("\n", 1)[0];
    const prevLines = i > 0 ? pieces[i - 1].trimEnd().split("\n") : [];
    const continues = header && prevLines.length > 0 && prevLines[prevLines.length - 1].startsWith("|");
    const second = piece.split("\n", 2)[1] ?? "";
    if (continues && first.startsWith("|") && !SEPARATOR_RE.test(second)) out = `${header}\n${piece}`;
    // Remember the last header seen (in the original text) for the next piece.
    const lines = piece.split("\n");
    for (let k = 0; k + 1 < lines.length; k++) {
      if (lines[k].startsWith("|") && SEPARATOR_RE.test(lines[k + 1]) && !SEPARATOR_RE.test(lines[k])) header = `${lines[k]}\n${lines[k + 1]}`;
    }
    return out;
  });
}
