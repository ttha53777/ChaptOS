// One colour per tag, everywhere it appears (the index's "Filed under" row,
// the cards, a post's sign-off), so "meetings" always reads as the same label.
// Known tags are pinned; any new one hashes onto the palette.
export type Accent = "peach" | "sky" | "mint" | "butter" | "lilac" | "rose";

const PINNED: Record<string, Accent> = { meetings: "sky", product: "lilac", meta: "butter", handoff: "peach" };
const PALETTE: Accent[] = ["peach", "mint", "rose", "sky", "lilac", "butter"];

export function tagAccent(tag: string): Accent {
  const pinned = PINNED[tag.toLowerCase()];
  if (pinned) return pinned;
  let h = 0;
  for (const c of tag.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
