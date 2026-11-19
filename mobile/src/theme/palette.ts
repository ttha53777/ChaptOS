/**
 * The Paper palette, day and night, ported from the web so a phone screen and a
 * browser tab are the same paper and the same ink.
 *
 * Sources (keep in step when they change):
 *   app/paper-aesthetic.css   html[data-aesthetic="paper"] day + [data-theme="dusk"] night
 *   _design/Dashboard iPhone Paper Mock.html   :root / html[data-theme="dark"] (adds paper-3)
 *
 * Screens never use a literal hex. They read `useTheme().c`.
 */

export type Tone = "peach" | "sky" | "mint" | "butter" | "lilac" | "rose";
export const TONES: readonly Tone[] = ["peach", "sky", "mint", "butter", "lilac", "rose"];

/** One pastel: `fill` is the sticky-note / hard-shadow colour, `soft` the tint behind a
 *  pill or tile, `ink` its text and icon colour, `border` its hairline. */
export interface Pastel { fill: string; soft: string; ink: string; border: string }

export interface Palette {
  scheme: "light" | "dark";
  paper: string; paper2: string; paper3: string;
  card: string; card2: string;
  ink: string; ink2: string; ink3: string; faint: string;
  line: string; line2: string; lineSoft: string;
  skel: string; scrim: string;
  pastel: Record<Tone, Pastel>;
  /** Sticky notes are physical paper: dark ink on a pastel in both themes, the fill
   *  dimmed at night (the web's `--pp-note-filter`, pre-applied). */
  note: { ink: string; fill: Record<Tone, string> };
  ok: string; okBg: string; warn: string; warnBg: string; risk: string; riskBg: string; danger: string;
  /** Timeline category inks (`--c-*`). */
  cat: { chapter: string; social: string; fundy: string; program: string; party: string; deadline: string; service: string };
  /** Soft drop shadows (`--pp-sh-1..3`) as RN boxShadow strings. Hard offset shadows are
   *  built with `hard()` in ./shadow.ts from a pastel fill. */
  sh1: string; sh2: string; sh3: string;
  /** Highlighter / tab-blob opacity, and the ambient wash strength. */
  markOp: number; washOp: number;
  /** Initials-on-avatar ink. */
  avInk: string;
  /** Till-receipt thermal paper: light in both themes (mock `.px-rc`). */
  thermal: { paper: string; ink: string; faint: string; neg: string; shadow: string };
  /** Punch-card manila stock printed in one brick ink (mock `.sv-pc`). */
  stock: { a: string; b: string; print: string };
}

/* ── night note filter: brightness(.93) saturate(.85), as a colour transform ───────── */
function filterNote(hex: string, brightness = 0.93, s = 0.85): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * brightness, g = ((n >> 8) & 255) * brightness, b = (n & 255) * brightness;
  const R = (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b;
  const G = (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b;
  const B = (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b;
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${h(R)}${h(G)}${h(B)}`.toUpperCase();
}

const dayPastel: Record<Tone, Pastel> = {
  peach:  { fill: "#FFD5C4", soft: "#FFEDE5", ink: "#C9542D", border: "#F8D2C2" },
  sky:    { fill: "#CFE2FF", soft: "#EAF2FF", ink: "#2A66C7", border: "#CCDFFB" },
  mint:   { fill: "#C7EFDA", soft: "#E6F8EF", ink: "#1B815B", border: "#BDE7D2" },
  butter: { fill: "#FFE5A0", soft: "#FFF6DC", ink: "#9C6B08", border: "#F4DFA6" },
  lilac:  { fill: "#E1D8FF", soft: "#F1EDFF", ink: "#6244CC", border: "#DCD2FB" },
  rose:   { fill: "#FFD6E6", soft: "#FFEDF4", ink: "#C23C77", border: "#F8CEE0" },
};

const nightPastel: Record<Tone, Pastel> = {
  peach:  { fill: "#E5A28A", soft: "rgba(255,178,148,0.085)", ink: "#FFB49A", border: "rgba(255,178,148,0.22)" },
  sky:    { fill: "#8DB2EC", soft: "rgba(150,190,255,0.085)", ink: "#AACBFF", border: "rgba(150,190,255,0.22)" },
  mint:   { fill: "#80CBA4", soft: "rgba(140,220,180,0.08)",  ink: "#8FDDB6", border: "rgba(140,220,180,0.22)" },
  butter: { fill: "#E3BF66", soft: "rgba(255,214,120,0.08)",  ink: "#F0CC72", border: "rgba(255,214,120,0.22)" },
  lilac:  { fill: "#A593EE", soft: "rgba(180,160,255,0.10)",  ink: "#C4B6FF", border: "rgba(180,160,255,0.26)" },
  rose:   { fill: "#E598B7", soft: "rgba(255,160,200,0.08)",  ink: "#FFAACB", border: "rgba(255,160,200,0.22)" },
};

const mapTones = (f: (t: Tone) => string) =>
  Object.fromEntries(TONES.map(t => [t, f(t)])) as Record<Tone, string>;

export const day: Palette = {
  scheme: "light",
  paper: "#FFFCF6", paper2: "#FBF5EA", paper3: "#F4ECDD",
  card: "#FFFFFF", card2: "#FBF5EA",
  ink: "#26211B", ink2: "#544A3F", ink3: "#8A7F71", faint: "#998D7C",
  line: "#EBE1CF", line2: "#DCD0B9", lineSoft: "#F4ECDD",
  skel: "rgba(38,33,27,0.07)", scrim: "rgba(38,33,27,0.28)",
  pastel: dayPastel,
  note: { ink: "#26211B", fill: mapTones(t => dayPastel[t].fill) },
  ok: "#1B815B", okBg: "#E6F8EF", warn: "#9C6B08", warnBg: "#FFF6DC", risk: "#C9542D", riskBg: "#FFEDE5", danger: "#C9542D",
  cat: { chapter: "#2A66C7", social: "#9C6B08", fundy: "#1B815B", program: "#6244CC", party: "#C23C77", deadline: "#C9542D", service: "#1F8A80" },
  sh1: "0 1px 2px rgba(38,33,27,0.05), 0 3px 10px rgba(38,33,27,0.045)",
  sh2: "0 1px 2px rgba(38,33,27,0.05), 0 10px 26px -8px rgba(38,33,27,0.14)",
  sh3: "0 2px 4px rgba(38,33,27,0.05), 0 26px 60px -18px rgba(38,33,27,0.22)",
  markOp: 0.85, washOp: 0.55,
  avInk: "rgba(38,33,27,0.72)",
  thermal: { paper: "#FFFDF7", ink: "#26211B", faint: "rgba(38,33,27,0.55)", neg: "#B23A5E", shadow: "rgba(38,33,27,0.14)" },
  stock: { a: "#F6EAD0", b: "#EEDDBC", print: "#B0503A" },
};

/** "A warm desk under a lamp, not a black UI": pastels become low-alpha tints with lifted
 *  inks; hard shadows keep their colour so ink-bordered things still sit up. */
export const night: Palette = {
  scheme: "dark",
  paper: "#15110D", paper2: "#1B1712", paper3: "#25201A",
  card: "#1F1A15", card2: "#25201A",
  ink: "#F2EADC", ink2: "#CDBFAB", ink3: "#948876", faint: "#7D7262",
  line: "#2F271E", line2: "#43382B", lineSoft: "#262019",
  skel: "rgba(242,234,220,0.07)", scrim: "rgba(5,4,2,0.62)",
  pastel: nightPastel,
  note: { ink: "#26211B", fill: mapTones(t => filterNote(nightPastel[t].fill)) },
  ok: "#8FDDB6", okBg: "rgba(140,220,180,0.08)", warn: "#F0CC72", warnBg: "rgba(255,214,120,0.08)", risk: "#FFB49A", riskBg: "rgba(255,178,148,0.085)", danger: "#FFB49A",
  cat: { chapter: "#AACBFF", social: "#F0CC72", fundy: "#8FDDB6", program: "#C4B6FF", party: "#FFAACB", deadline: "#FFB49A", service: "#7FD6CB" },
  sh1: "0 1px 2px rgba(0,0,0,0.35), 0 3px 10px rgba(0,0,0,0.25)",
  sh2: "0 1px 2px rgba(0,0,0,0.4), 0 12px 28px -10px rgba(0,0,0,0.6)",
  sh3: "0 2px 4px rgba(0,0,0,0.4), 0 26px 60px -18px rgba(0,0,0,0.75)",
  markOp: 0.42, washOp: 0.9,
  avInk: "rgba(22,18,14,0.78)",
  thermal: { paper: "#EDE4D2", ink: "#26211B", faint: "rgba(38,33,27,0.55)", neg: "#B23A5E", shadow: "rgba(0,0,0,0.45)" },
  stock: { a: "#2C241A", b: "#262016", print: "#E79C81" },
};

/** `color` at `alpha` (0–1). Accepts #RRGGBB only; that's all the palette's solids use. */
export function alpha(hex: string, a: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
