/**
 * The /create interview's ACTIVITIES beat — "thinking about a normal month,
 * which of these actually happen?" — as pure data + pure functions.
 *
 * This beat decides the org's ENTIRE page set (see the WORKFLOW AUTHORITY block
 * in lib/org-types.ts), and its answer is authoritative in both directions: what
 * the founder names goes on, and every other activity-owned page goes OFF. That
 * makes reading a typed answer correctly a correctness problem, not a nicety —
 * hence a module with no React in it and real tests.
 */

import type { AiPicks } from "./draft";
import type { WorkflowId } from "@/lib/org-types";

/**
 * The checklist. Each option pairs the founder-facing label with the workflow
 * id(s) it turns on. This table MUST mirror the ACTIVITY → PAGE MAPPING block in
 * the concierge prompt (app/api/ai/interview/route.ts) so the tapped-checklist
 * path and the model's free-text path resolve identical pages. Rendered as a
 * multi-select grid (the same accumulate-then-submit pattern the metrics picker
 * uses) because its six options exceed the concierge's 4-chip cap.
 *
 * Attendance rides the meetings tick rather than earning its own beat: taking
 * roll IS what a chapter meeting page is for, and a founder who disagrees has a
 * one-tap toggle on the blueprint. Adding a seventh question to reach the same
 * place would be worse.
 */
export const ACTIVITY_OPTIONS: readonly {
  id: string;
  label: string;
  workflows: WorkflowId[];
}[] = [
  { id: "meetings",  label: "Chapter meetings",             workflows: ["meetings", "attendance"] },
  { id: "socials",   label: "Social events or parties",     workflows: ["parties"] },
  { id: "service",   label: "Service or volunteering",      workflows: ["service"] },
  { id: "fundraise", label: "Fundraisers or programs",      workflows: ["events", "finance"] },
  { id: "tasks",     label: "Handing out tasks/deadlines",  workflows: ["tasks"] },
  { id: "online",    label: "Posting content online",       workflows: ["communications"] },
];

/** Every checklist option id. */
export const ACTIVITY_IDS: readonly string[] = ACTIVITY_OPTIONS.map(o => o.id);

/** Every page the checklist can decide — its REMOVAL domain. A page in here that
    the founder didn't name gets turned OFF, which is what makes the checklist
    authoritative instead of merely additive. (docs and finance can come back at
    the later docs/payments beats; parties at the door beat. Those are strict
    refinements that run after, so there's no conflict.) */
export const ACTIVITY_OWNED: WorkflowId[] = [
  ...new Set(ACTIVITY_OPTIONS.flatMap(o => o.workflows)),
];

/** The checklist labels for a set of ids, in checklist order — for reply copy. */
export function activityLabels(ids: ReadonlySet<string>): string[] {
  return ACTIVITY_OPTIONS.filter(o => ids.has(o.id)).map(o => o.label);
}

/**
 * Turn a checklist selection into one authoritative pick set: what they named
 * goes on, and every OTHER activity-owned page goes off. Shared by both drivers
 * (tap, typed, and the concierge's checklist turn) so a page can never depend on
 * which one asked.
 */
export function activityPicksToAiPicks(ids: ReadonlySet<string>): AiPicks {
  const on = new Set<WorkflowId>(
    ACTIVITY_OPTIONS.filter(o => ids.has(o.id)).flatMap(o => o.workflows),
  );
  return {
    addWorkflows: [...on],
    removeWorkflows: ACTIVITY_OWNED.filter(w => !on.has(w)),
    vocab: {},
  };
}

/* ─── Reading a typed answer ──────────────────────────────────────────────── */

/** Which option a phrase names. Deliberately naive (same posture as matchKind) —
    the checklist is the primary input and a misread is one tap from fixed. */
const ACTIVITY_KEYWORDS: readonly { id: string; re: RegExp }[] = [
  { id: "meetings",  re: /\bmeet|chapter|assembly|weekly|general body\b/ },
  { id: "socials",   re: /part(y|ies)|social|mixer|formal|tailgate|date night/ },
  { id: "service",   re: /service|volunteer|philanthrop|charity|community/ },
  { id: "fundraise", re: /fundrais|program|workshop|speaker|rush|recruit/ },
  { id: "tasks",     re: /task|deadline|assign|committee|to-?do/ },
  { id: "online",    re: /instagram|social media|\bpost|announce|newsletter|online/ },
];

/** Clause boundaries that RESET polarity — what follows stands on its own.
    ("we don't do service, but everything else yeah" — the "but" clause is not
    part of the negation.) */
const CLAUSE_BREAK = /[,.;!?]+|\b(?:but|though|although|however)\b/;

/** Markers that INVERT the polarity of everything after them within a clause.
    ("everything except service" — the tail is negative inside a positive
    clause.) Each one flips again, so they chain. */
const FLIP = /\b(?:except|excepting|besides|other than|apart from|aside from|minus|without|no longer)\b/;

/** Negation cues. Applied per sub-clause, so "we do parties" and "no service"
    can live in the same sentence without contaminating each other. */
const NEGATION =
  /\b(?:no|not|none|never|nope|nah|neither|nor|hardly|rarely|barely|stopped|quit|dropped|skip)\b|n['’]t\b/;

/** "All of them" / "everything". */
const BLANKET_ALL = /\b(?:all|everything|every one|everyone of|the lot|the whole lot)\b/;

/** "None of those" / "nothing". */
const BLANKET_NONE = /\b(?:none|nothing|neither|nope|nah)\b|\bnot really\b/;

export interface ActivityRead {
  /** The resulting selection — what should be ON. */
  ids: Set<string>;
  /** What the founder explicitly ruled out, for the reply copy. */
  off: Set<string>;
  /**
   * Whether the answer determines the whole selection. False means we read what
   * they DON'T do but never heard what they do — `ids` is then a best guess
   * (everything they didn't rule out) that the caller must confirm rather than
   * submit, because submitting is authoritative.
   */
  confident: boolean;
}

/**
 * Read a typed "normal month" answer into a checklist selection, so a founder
 * who types lands where one who taps does.
 *
 * NEGATION IS THE POINT. The result is authoritative — unnamed pages get turned
 * OFF — so a flat keyword scan builds the exact inverse of what was said:
 * "we don't do service, but everything else yeah" used to enable service and
 * disable meetings, parties, tasks, fundraisers and comms. This is also the
 * guaranteed path whenever AI is down, rate-limited, or has handed off, so it is
 * not a degraded nicety; for some founders it is the only reader they ever meet.
 *
 * Returns `null` for an answer it CANNOT read at all. That distinction matters:
 * an empty selection means "none of these happen" and turns all six pages off,
 * so every natural affirmative that names no keyword ("yes", "yeah, all of
 * those") must not collapse into it. An unreadable answer is a question to
 * re-ask, not an answer of "none".
 */
export function readActivities(text: string): ActivityRead | null {
  const on = new Set<string>();
  const off = new Set<string>();
  let all = false;
  let none = false;

  for (const clause of text.toLowerCase().split(CLAUSE_BREAK)) {
    if (!clause?.trim()) continue;
    // Within a clause, each flip marker inverts what follows: the head keeps the
    // clause's own polarity, the tail is its opposite, the next tail flips back.
    const parts = clause.split(FLIP);
    parts.forEach((part, i) => {
      if (!part.trim()) return;
      const flipped = i % 2 === 1;
      const negated = NEGATION.test(part) !== flipped;
      const named = ACTIVITY_KEYWORDS.filter(k => k.re.test(part)).map(k => k.id);
      for (const id of named) (negated ? off : on).add(id);
      if (named.length) return;
      // Nothing named — the part may still be a blanket answer. "none of those"
      // reads as none regardless of how the polarity landed (its own words are
      // what tripped the negation cue); "all of them" only counts said straight,
      // since "not all of them" is a quantity we can't act on.
      if (BLANKET_NONE.test(part)) none = true;
      else if (BLANKET_ALL.test(part) && !negated) all = true;
    });
  }

  // A blanket "none" is a real, complete answer — but only when nothing else was
  // named. "none of the service stuff, we do meetings" is led by its specifics.
  if (none && !all && on.size === 0 && off.size === 0) {
    return { ids: new Set(), off: new Set(), confident: true };
  }

  const base = all ? new Set(ACTIVITY_IDS) : on;
  const ids = new Set([...base].filter(id => !off.has(id)));

  // They told us what they do (outright or via "everything") — that's the whole
  // selection, and the unnamed pages are genuinely unwanted.
  if (on.size > 0 || all) return { ids, off, confident: true };

  // Only negatives. We know what to rule out but never heard what they do, so
  // "everything else" is a guess — hand it back as a pre-ticked checklist to
  // confirm rather than acting on it. Turning five pages off (or on) on the
  // strength of "no parties" would be inventing an answer.
  if (off.size > 0) {
    return { ids: new Set(ACTIVITY_IDS.filter(id => !off.has(id))), off, confident: false };
  }

  return null;
}
