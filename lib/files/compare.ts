/**
 * Line two extracted documents up against each other, for compare_attachments.
 * Pure.
 *
 * Both documents are cut into comparable segments — a heading, a table row, a
 * list item, or one sentence of prose — so a paragraph that merely re-wrapped
 * across a page break compares equal. The segment sequences are then diffed
 * (Myers, O((N+M)·D)) and the edits grouped into hunks, each carrying the
 * section it sits under and the unit refs on both sides, so every difference
 * the model reports can be cited from both files.
 */
import type { TextUnit } from "./types";

export interface Segment {
  text: string;
  norm: string;
  ref: string;
  section: string | null;
  /** For a table row: its table's header row, so a changed row can be read against its columns. */
  header?: string;
}

const SEPARATOR_RE = /^\|[\s:|-]+\|$/;
const LIST_RE = /^\s*(?:•|\d{1,3}[.)]|[-*]) /;
const HEADING_RE = /^#{1,6} /;

/** What two segments must agree on to count as the same: case, spacing, quote and dash style, trailing punctuation aside. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-")
    .replace(/\s*\|\s*/g, "|")
    .replace(/\s+/g, " ")
    .replace(/[\s.;:,]+$/, "")
    .trim();
}

function sentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?;])\s+(?=["“(]?[A-Z0-9$•])/).map(s => s.trim()).filter(Boolean);
}

export function segmentUnits(units: TextUnit[]): Segment[] {
  const out: Segment[] = [];
  let section: string | null = null;
  for (const u of units) {
    let header: string | undefined;
    let prevLine = "";
    let para: string[] = [];
    let listItem = false;
    const flush = () => {
      if (!para.length) return;
      const joined = para.join(" ").replace(/\s+/g, " ").trim();
      for (const text of listItem ? [joined] : sentences(joined)) {
        const norm = normalize(text);
        if (norm) out.push({ text, norm, ref: u.ref, section });
      }
      para = [];
      listItem = false;
    };
    for (const raw of u.text.split("\n")) {
      const line = raw.trim();
      if (!line) { flush(); prevLine = ""; continue; }
      if (HEADING_RE.test(line)) {
        flush();
        section = line.replace(/^#+\s*/, "").slice(0, 80);
        out.push({ text: line, norm: normalize(line.replace(/^#+\s*/, "")), ref: u.ref, section });
      } else if (line.startsWith("|")) {
        flush();
        if (SEPARATOR_RE.test(line)) {
          // The header row was pushed as a segment already; it heads the rows that follow.
          if (prevLine.startsWith("|")) header = prevLine;
        } else {
          if (!prevLine.startsWith("|")) header = undefined;
          out.push({ text: line, norm: normalize(line), ref: u.ref, section, ...(header ? { header } : {}) });
        }
      } else if (LIST_RE.test(line)) {
        flush();
        listItem = true;
        para.push(line);
      } else {
        para.push(line);
      }
      prevLine = line;
    }
    flush();
  }
  return out;
}

export type Edit = { op: "eq"; i: number; j: number } | { op: "del"; i: number } | { op: "ins"; j: number };

/**
 * Shortest edit script from `a` to `b`, or null when they differ by more than
 * `maxD` edits (too different to line up usefully, and too costly to try).
 */
export function diffSequences(a: readonly number[], b: readonly number[], maxD: number): Edit[] | null {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf);
  const N = A.length, M = B.length;

  const middle: Edit[] = [];
  if (N === 0) for (let j = 0; j < M; j++) middle.push({ op: "ins", j: pre + j });
  else if (M === 0) for (let i = 0; i < N; i++) middle.push({ op: "del", i: pre + i });
  else {
    const limit = Math.min(maxD, N + M);
    const off = limit + 1;
    const V = new Int32Array(2 * limit + 3);
    const trace: Int32Array[] = [];
    let found = -1;
    for (let d = 0; d <= limit && found < 0; d++) {
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && V[off + k - 1] < V[off + k + 1]) ? V[off + k + 1] : V[off + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && A[x] === B[y]) { x++; y++; }
        V[off + k] = x;
        if (x >= N && y >= M) { found = d; break; }
      }
      trace.push(V.slice(off - d, off + d + 1));
    }
    if (found < 0) return null;

    const rev: Edit[] = [];
    let x = N, y = M;
    for (let d = found; d > 0; d--) {
      const prev = trace[d - 1];
      const at = (k: number) => prev[k + d - 1];
      const k = x - y;
      const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
      const pk = down ? k + 1 : k - 1;
      const px = at(pk), py = px - pk;
      while (x > (down ? px : px + 1) && y > (down ? py + 1 : py)) { rev.push({ op: "eq", i: pre + x - 1, j: pre + y - 1 }); x--; y--; }
      if (down) { rev.push({ op: "ins", j: pre + y - 1 }); y--; }
      else { rev.push({ op: "del", i: pre + x - 1 }); x--; }
    }
    while (x > 0 && y > 0) { rev.push({ op: "eq", i: pre + x - 1, j: pre + y - 1 }); x--; y--; }
    middle.push(...rev.reverse());
  }

  const edits: Edit[] = [];
  for (let i = 0; i < pre; i++) edits.push({ op: "eq", i, j: i });
  edits.push(...middle);
  for (let s = 0; s < suf; s++) edits.push({ op: "eq", i: a.length - suf + s, j: b.length - suf + s });
  return edits;
}

export interface Hunk { a: Segment[]; b: Segment[]; section: string | null }

export interface TextComparison {
  segmentsA: number;
  segmentsB: number;
  unchanged: number;
  hunks: Hunk[];
  /** Segments present in both, at different places. */
  moved: { text: string; a: Segment; b: Segment }[];
}

/** Edits past this make two documents "too different": the model should read them instead. */
export const MAX_EDITS = 1_500;

export function compareTexts(unitsA: TextUnit[], unitsB: TextUnit[]): TextComparison | null {
  const sa = segmentUnits(unitsA), sb = segmentUnits(unitsB);
  const ids = new Map<string, number>();
  const id = (s: Segment) => { let n = ids.get(s.norm); if (n === undefined) { n = ids.size; ids.set(s.norm, n); } return n; };
  const edits = diffSequences(sa.map(id), sb.map(id), MAX_EDITS);
  if (!edits) return null;

  const raw: Hunk[] = [];
  let cur: Hunk | null = null;
  let unchanged = 0;
  let lastSection: string | null = null;
  for (const e of edits) {
    if (e.op === "eq") { unchanged++; lastSection = sb[e.j].section; cur = null; continue; }
    if (!cur) { cur = { a: [], b: [], section: null }; raw.push(cur); }
    if (e.op === "del") cur.a.push(sa[e.i]); else cur.b.push(sb[e.j]);
    cur.section ??= (e.op === "del" ? sa[e.i].section : sb[e.j].section) ?? lastSection;
  }

  const hunks = raw.flatMap(refineHunk);

  // A segment deleted in one place and inserted in another moved; it didn't change.
  const delBy = new Map<string, Segment>();
  for (const h of hunks) for (const s of h.a) if (!delBy.has(s.norm)) delBy.set(s.norm, s);
  const moved: TextComparison["moved"] = [];
  const movedNorms = new Set<string>();
  for (const h of hunks) for (const s of h.b) {
    const from = delBy.get(s.norm);
    if (from && !movedNorms.has(s.norm)) { movedNorms.add(s.norm); moved.push({ text: s.text, a: from, b: s }); }
  }
  const kept = hunks
    .map(h => ({ ...h, a: h.a.filter(s => !movedNorms.has(s.norm)), b: h.b.filter(s => !movedNorms.has(s.norm)) }))
    .filter(h => h.a.length || h.b.length);
  return { segmentsA: sa.length, segmentsB: sb.length, unchanged, hunks: kept, moved };
}

const words = (s: Segment) => new Set(s.norm.split(/[^\p{L}\p{N}$%]+/u).filter(Boolean));

/** Word overlap (Jaccard) of two segments: 1 is the same words, 0 none shared. */
function similarity(x: Segment, y: Segment): number {
  const a = words(x), b = words(y);
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both || 1);
}

/** How alike two segments must be to be one passage edited, rather than one removed and another added. */
const PAIR_SIMILARITY = 0.4;

/**
 * Split a hunk into its edited pairs and its pure additions / removals, in
 * order: a renumbered heading next to a newly inserted article becomes one
 * "differs" (IV → V) and one "only in b", not a single blur of both.
 */
function refineHunk(h: Hunk): Hunk[] {
  if (!h.a.length || !h.b.length) return [h];
  const out: Hunk[] = [];
  const emit = (a: Segment[], b: Segment[]) => {
    if (!a.length && !b.length) return;
    const last = out[out.length - 1];
    const kind = (x: Hunk) => (x.a.length && x.b.length ? "pair" : x.a.length ? "a" : "b");
    const next: Hunk = { a, b, section: (a[0] ?? b[0]).section ?? h.section };
    // Runs of pure additions (or removals) stay one hunk; each edited pair stands alone.
    if (last && kind(last) === kind(next) && kind(next) !== "pair") { last.a.push(...a); last.b.push(...b); }
    else out.push(next);
  };
  let j = 0;
  for (const seg of h.a) {
    let best = -1, bestSim = PAIR_SIMILARITY;
    for (let k = j; k < h.b.length; k++) {
      const sim = similarity(seg, h.b[k]);
      if (sim >= bestSim) { best = k; bestSim = sim; }
    }
    if (best < 0) { emit([seg], []); continue; }
    emit([], h.b.slice(j, best));
    emit([seg], [h.b[best]]);
    j = best + 1;
  }
  emit([], h.b.slice(j));
  return out;
}

const FIGURE_RE = /\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?%|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b|\b\d[\d,]*(?:\.\d+)?\b/gi;

/**
 * The amounts, percentages, dates and other numbers on one side of a hunk that
 * the other side doesn't have — the facts most likely to be a real change or a
 * contradiction, pulled out so they can't be skimmed past.
 */
export function figureChanges(a: string, b: string): { a: string[]; b: string[] } | null {
  const grab = (s: string) => [...new Set((s.match(FIGURE_RE) ?? []).map(x => x.replace(/\s+/g, " ").trim()))];
  const fa = grab(a), fb = grab(b);
  const onlyA = fa.filter(x => !fb.includes(x)), onlyB = fb.filter(x => !fa.includes(x));
  return onlyA.length || onlyB.length ? { a: onlyA.slice(0, 8), b: onlyB.slice(0, 8) } : null;
}
