// What the working line says, and which chips it draws — pure, so the wording
// can be tested without rendering. See WorkingLine.tsx for the design rule
// these serve: every part of the turn stays where it is and becomes part of
// the answer.

import type { LedgerStep } from "./types";

/** Under this, the status still says it's reading the question; after it, the intent line. */
export const QUESTION_BEAT_MS = 1500;

export type StatusTone = "think" | "read" | "compose" | "done" | "halt";

export interface StatusInput {
  steps: LedgerStep[];
  /** The intent line from chat/intent.ts — describes the question, so it can't be wrong. */
  intent: string;
  composing?: boolean;
  live: boolean;
  /** Live: time since the question went. Settled: the whole turn, when known. */
  elapsedMs?: number;
  stopped?: boolean;
  /** The turn ended without finishing: a dropped connection or a server notice. */
  failed?: boolean;
  /** Something arrived to replace the placeholder: an answer, prose or a card. */
  answered: boolean;
}

export interface Status { text: string; tone: StatusTone }

export type ChipState = "likely" | "queued" | "reading" | "read";

export interface Chip {
  key: string;
  label: string;
  state: ChipState;
  /** The latest finding posted for this record. */
  finding?: string;
  /** How many findings this record posted (several lookups against the Roster, say). */
  reads: number;
}

/** 11.4s, or 1m 05s past a minute. */
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.floor(s % 60)).padStart(2, "0")}s`;
}

function listJoin(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const labelOf = (s: LedgerStep) => s.source ?? s.verb;

/**
 * One chip per record, in the order the records first appeared. Several steps
 * against the same source (three member lookups) share a chip, so the row
 * names records rather than repeating "Roster" three times.
 */
export function chipsFor(steps: LedgerStep[]): Chip[] {
  const order: string[] = [];
  const groups = new Map<string, LedgerStep[]>();
  for (const s of steps) {
    const k = labelOf(s);
    if (!groups.has(k)) { groups.set(k, []); order.push(k); }
    groups.get(k)!.push(s);
  }
  return order.map(k => {
    const g = groups.get(k)!;
    const real = g.filter(s => !s.provisional);
    const done = real.filter(s => s.status === "done");
    const findings = done.map(s => s.finding).filter((f): f is string => !!f);
    const state: ChipState = real.length === 0
      ? "likely"
      : done.length === real.length
        ? "read"
        : real.some(s => s.status === "active") || done.length > 0
          ? "reading"
          : "queued";
    return {
      key: k,
      label: k,
      state,
      ...(findings.length ? { finding: findings[findings.length - 1] } : {}),
      reads: findings.length,
    };
  });
}

/** The single status line, or null when a settled turn has nothing to say. */
export function statusFor(i: StatusInput): Status | null {
  const chips = chipsFor(i.steps).filter(c => c.state !== "likely");

  if (!i.live) {
    const read = chips.filter(c => c.state === "read").length;
    const records = `${read} record${read === 1 ? "" : "s"}`;
    // A turn that didn't finish says so in a word; the slip below it says why.
    // It keeps a line here so the chips don't jump up when it ends.
    if (i.stopped) return { text: read > 0 ? `Stopped after ${records}` : "Stopped", tone: "halt" };
    if (i.failed) return { text: read > 0 ? `Didn't finish · read ${records}` : "Didn't finish", tone: "halt" };
    const timed = i.elapsedMs !== undefined;
    const tone: StatusTone = "done";
    if (read > 0) {
      return { text: `Read ${records}${timed ? ` in ${fmtElapsed(i.elapsedMs!)}` : ""}`, tone };
    }
    // Answered without consulting anything (a how-to, a refusal). Saying how
    // long it took keeps the line in place rather than vanishing on arrival.
    if (i.answered && timed) return { text: `Answered in ${fmtElapsed(i.elapsedMs!)}`, tone };
    return null;
  }

  if (i.composing || i.answered) return { text: "Writing the answer", tone: "compose" };

  const real = i.steps.filter(s => !s.provisional);
  if (real.length === 0) {
    return { text: (i.elapsedMs ?? 0) < QUESTION_BEAT_MS ? "Reading your question" : i.intent, tone: "think" };
  }

  const reading = chips.filter(c => c.state === "reading");
  const settled = chips.filter(c => c.state === "read").length;
  const of = chips.length > 1 ? ` · ${Math.min(settled + Math.max(reading.length, 1), chips.length)} of ${chips.length}` : "";

  if (reading.length === 1) {
    // One record in hand: its verb says what's happening to it.
    const active = real.find(s => s.status === "active" && labelOf(s) === reading[0].label)
      ?? real.find(s => labelOf(s) === reading[0].label)!;
    return { text: `${active.verb}…${of}`, tone: "read" };
  }
  if (reading.length > 1) {
    return { text: `Reading ${listJoin(reading.map(c => c.label))}…${of}`, tone: "read" };
  }
  if (settled === chips.length) {
    // Everything named has been read, and the model hasn't started writing —
    // it may still reach for another record.
    return { text: "Going over what it read", tone: "think" };
  }
  const next = real.find(s => s.status === "pending")!;
  return { text: `${next.verb}…${of}`, tone: "read" };
}
