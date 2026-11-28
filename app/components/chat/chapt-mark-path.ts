/**
 * The answering pencil's geometry, worked out once at module scope.
 *
 * The mock (_design/Ask Chapt Talking Tile.html) drives the pencil with a
 * requestAnimationFrame loop. Here the same motion is sampled into keyframes
 * up front and played by the Web Animations API, so nothing runs in JS per
 * frame: four `element.animate()` calls (pencil transform, word-1 dash,
 * word-2 dash, eyes) on one shared 2s timeline.
 *
 * Units are the mark's own 40×40 viewBox. Inside an SVG, CSS `px` in a
 * transform are user units, so the keyframes below are in grid units too.
 */

type Pt = [number, number];
interface Word { pts: Pt[]; cum: number[]; total: number; d: string }

/** One loop of the 2s write: word, lift, word, hold, fade, back to the start. */
export const PENCIL_CYCLE_MS = 2000;
const SAMPLES = 48;

/* Cursive scribble: a looping curve (x = a·t + b·sin t) gives "e/l"-style loops
   that run right along the bottom and curl back over the top. Each loop gets
   its own height so it reads as a word, not a spring. */
function cursive(x0: number, y0: number, heights: number[]): Word {
  const a = 0.3, b = 0.5;
  const pts: Pt[] = [[x0 - 0.6, y0 + 0.15]];
  const end = 2 * Math.PI * heights.length;
  for (let t = 0; t <= end + 1e-6; t += 0.18) {
    const h = heights[Math.min(heights.length - 1, Math.floor(t / (2 * Math.PI)))];
    pts.push([x0 + a * t + b * Math.sin(t), y0 - (h * (1 - Math.cos(t))) / 2]);
  }
  const l = pts[pts.length - 1];
  pts.push([l[0] + 0.8, l[1] - 0.4]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, total: cum[cum.length - 1], d: "M" + pts.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L") };
}

function pointAt(w: Word, p: number): Pt {
  const s = Math.max(0, Math.min(1, p)) * w.total;
  let i = 1;
  while (i < w.cum.length - 1 && w.cum[i] < s) i++;
  const k = (s - w.cum[i - 1]) / (w.cum[i] - w.cum[i - 1] || 1);
  return [w.pts[i - 1][0] + (w.pts[i][0] - w.pts[i - 1][0]) * k, w.pts[i - 1][1] + (w.pts[i][1] - w.pts[i - 1][1]) * k];
}

const W1 = cursive(19.8, 37.4, [1.5, 2.8, 1.6]);
const W2 = cursive(27.4, 37.4, [2.6, 1.5]);

/** The two words' path data, for the markup. */
export const WORD_PATHS = [W1.d, W2.d] as const;

const soft = (u: number) => u * 0.82 + u * u * (3 - 2 * u) * 0.18; // near-linear, softened ends
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

interface Frame { x: number; y: number; rot: number; p1: number; p2: number; fade: number; lx: number }

/** Where everything is `t` ms into the cycle (the mock's writeFrame, verbatim in effect). */
function frameAt(t: number): Frame {
  let p1 = 0, p2 = 0, tip: Pt, lift = 0, fade = 1, s = 0;
  if (t < 480) { p1 = soft(t / 480); tip = pointAt(W1, p1); s = p1 * W1.total; }
  else if (t < 600) {
    const u = (t - 480) / 120, a = pointAt(W1, 1), b = pointAt(W2, 0);
    p1 = 1; tip = [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]; lift = Math.sin(Math.PI * u) * 1.3;
  }
  else if (t < 1000) { p1 = 1; p2 = soft((t - 600) / 400); tip = pointAt(W2, p2); s = W1.total + p2 * W2.total; }
  else if (t < 1450) { p1 = p2 = 1; tip = pointAt(W2, 1); lift = Math.min(1, (t - 1000) / 150) * 0.8; }
  else {
    p1 = p2 = 1;
    const u = Math.min(1, (t - 1450) / 380), a = pointAt(W2, 1), b = pointAt(W1, 0), e = u * u * (3 - 2 * u);
    fade = 1 - Math.min(1, (t - 1450) / 250);
    tip = [lerp(a[0], b[0], e), lerp(a[1], b[1], e)];
    lift = t < 1830 ? 0.8 + Math.sin(Math.PI * u) * 0.6 : 0.8 * (1 - (t - 1830) / 170);
  }
  const rot = -52 + Math.sin(s * 2.2) * 3.5; // small wrist wobble while writing
  // Eyes track the tip: -0.4 at the start of word 1 to 1 at the end of word 2.
  const lx = lerp(-0.4, 1, (tip[0] - 19) / 13);
  return { x: tip[0], y: tip[1] - lift, rot, p1, p2, fade, lx };
}

const f2 = (n: number) => n.toFixed(2);

/**
 * The pencil at rest with both words written: the reduced-motion pose, and
 * where the pencil sits before its animation starts. An SVG `transform`
 * attribute (unitless), which a running animation's CSS transform overrides.
 */
export const PENCIL_REST = (() => {
  const f = frameAt(1200);
  return `translate(${f2(f.x)} ${f2(f.y)}) rotate(${f.rot.toFixed(1)}) scale(.6)`;
})();

export interface PencilKeyframes { move: Keyframe[]; w1: Keyframe[]; w2: Keyframe[]; eyes: Keyframe[] }

let cache: PencilKeyframes | null = null;

/** The four keyframe lists, built on first use and kept. */
export function pencilKeyframes(): PencilKeyframes {
  if (cache) return cache;
  const move: Keyframe[] = [], w1: Keyframe[] = [], w2: Keyframe[] = [], eyes: Keyframe[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    // The last keyframe repeats the first so the loop closes on itself.
    const f = frameAt(((i % SAMPLES) / SAMPLES) * PENCIL_CYCLE_MS);
    const offset = i / SAMPLES;
    move.push({ offset, transform: `translate(${f2(f.x)}px, ${f2(f.y)}px) rotate(${f.rot.toFixed(1)}deg) scale(.6)` });
    w1.push({ offset, strokeDashoffset: f2(1 - f.p1), opacity: f2(f.fade) });
    w2.push({ offset, strokeDashoffset: f2(1 - f.p2), opacity: f2(f.fade) });
    // On the eyes' loop wrapper, relative to the answering pose's own .4 nudge.
    eyes.push({ offset, transform: `translate(${f2(f.lx - 0.4)}px, 0px)` });
  }
  cache = { move, w1, w2, eyes };
  return cache;
}
