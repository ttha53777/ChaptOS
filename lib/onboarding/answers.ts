/**
 * The /create interview's answers → the charter, as pure functions.
 *
 * The interview is a fixed spine of beats (intro → kind → role → a normal month
 * → money → docs → tracking → term → recap). Each answer is recorded on
 * `draft.answers`, and `deriveFromAnswers` rebuilds everything the answers own —
 * pages, per-member tracking, the founder seat's title, the default term — from
 * ALL of them at once. Rebuilding rather than patching is what makes the recap's
 * "Change" safe: re-asking one question can never drop what a later one decided.
 *
 * What the answers own, and nothing else:
 *   - pages: BASE_WORKFLOWS ∪ the month checklist ∪ money (Treasury) ∪ docs (Docs).
 *     Every page an answer can't reach is base, so the page set is fully decided.
 *   - tracking: the founder's picks once the tracking beat ran; until then the
 *     kind's defaults minus what the pages rule out. Without Treasury there is
 *     nothing to owe, so "Dues owed" is forced off either way.
 *   - the founder seat's title.
 *   - the term, until the founder picks one (then draft.term is theirs).
 *
 * Pure — no React — so it is unit-tested directly and shared by the reducer.
 */

import { BASE_WORKFLOWS, getOrgType, normalizeWorkflows, type WorkflowId } from "@/lib/org-types";
import { ACTIVITY_OPTIONS } from "./activities";
import type { DocsAnswer, Draft, DraftTerm, MoneyAnswer } from "./draft";
import {
  BUILTIN_METRIC_DEFAULTS,
  KIND_TO_TYPE,
  getVariant,
  type BuiltinMetricFlags,
  type KindId,
} from "./kinds";
import { suggestTerms, type TermModel } from "./terms";

export const INTERVIEW_BEATS = ["intro", "kind", "role", "month", "money", "docs", "metrics", "term"] as const;
export type InterviewBeat = (typeof INTERVIEW_BEATS)[number];

export function isInterviewBeat(value: string): value is InterviewBeat {
  return (INTERVIEW_BEATS as readonly string[]).includes(value);
}

/** Whether a beat has been answered on this draft. */
export function beatAnswered(draft: Draft, beat: InterviewBeat): boolean {
  const a = draft.answers;
  switch (beat) {
    case "intro":   return !!a.intro;
    case "kind":    return draft.kind !== null;
    case "role":    return a.title !== undefined;
    case "month":   return a.acts !== undefined;
    case "money":   return a.money !== undefined;
    case "docs":    return a.docs !== undefined;
    case "metrics": return a.metrics !== undefined;
    case "term":    return !!a.term;
  }
}

/** The first beat still owed, or null when every one has been answered. */
export function nextUnansweredBeat(draft: Draft): InterviewBeat | null {
  return INTERVIEW_BEATS.find(b => !beatAnswered(draft, b)) ?? null;
}

/** The calendar a kind usually runs on — teams play seasons, everyone else terms. */
export function defaultTermModel(kind: KindId | null): TermModel {
  return kind === "team" ? "season" : "semester";
}

/** A concrete term from one of suggestTerms()'s slots (clamped to what exists). */
export function termFromSuggestion(model: TermModel, pick: number, today?: string): DraftTerm {
  const sugs = suggestTerms(model, today);
  const i = Math.max(0, Math.min(pick, sugs.length - 1));
  const s = sugs[i]!;
  return { model, pick: i, label: s.label, startDate: s.startDate, endDate: s.endDate };
}

/** The founder seat's title as the kind's template names it ("President", "Captain"…). */
export function defaultFounderTitle(kind: KindId | null): string {
  const template = getOrgType(KIND_TO_TYPE[kind ?? "other"]) ?? getOrgType("generic-org");
  return template?.roleSeeds.find(r => r.all)?.name ?? "Admin";
}

/** Built-in tracking defaults for the draft's kind + variant. */
export function kindMetricDefaults(draft: Pick<Draft, "kind" | "variant">): BuiltinMetricFlags {
  const kind = draft.kind ?? "other";
  return { ...BUILTIN_METRIC_DEFAULTS[kind], ...getVariant(kind, draft.variant)?.metricDefaults };
}

/** The pages the recorded answers turn on. */
export function workflowsFromAnswers(answers: Draft["answers"]): WorkflowId[] {
  const on = new Set<WorkflowId>(BASE_WORKFLOWS);
  for (const opt of ACTIVITY_OPTIONS) {
    if (answers.acts?.includes(opt.id)) opt.workflows.forEach(w => on.add(w));
  }
  // Money is asked after the month, so its answer is the final word on Treasury
  // — "no money" wins even over a ticked "fundraisers".
  if (answers.money) {
    if (answers.money === "none") on.delete("finance");
    else on.add("finance");
  }
  if (answers.docs) {
    if (answers.docs === "none") on.delete("docs");
    else on.add("docs");
  }
  return normalizeWorkflows([...on]);
}

/**
 * Rebuild everything the answers own. Leaves the kind's seats (bar the founder
 * title), vocab, event types and custom metrics alone — those are edited, not
 * answered.
 */
export function deriveFromAnswers(draft: Draft, today?: string): Draft {
  const answers = draft.answers;
  const enabledWorkflows = workflowsFromAnswers(answers);
  const pages = new Set(enabledWorkflows);

  const flags: BuiltinMetricFlags = answers.metrics
    ? { ...answers.metrics }
    : kindMetricDefaults(draft);
  if (!answers.metrics && !pages.has("service")) flags.serviceHours = false;
  if (!pages.has("finance")) flags.duesOwed = false;

  const founderTitle = answers.title ?? defaultFounderTitle(draft.kind);
  const seats = draft.seats.map(s => (s.all ? { ...s, title: founderTitle } : s));

  // An answered term is the founder's — never recomputed. Unanswered, it follows
  // the kind (a team's default is this season, not this semester).
  const term =
    answers.term && draft.term ? draft.term : termFromSuggestion(defaultTermModel(draft.kind), 0, today);

  return {
    ...draft,
    enabledWorkflows,
    activitiesAnswered: answers.acts !== undefined,
    metrics: { ...flags, custom: draft.metrics.custom },
    seats,
    term,
  };
}

/* ─── Reading typed answers ─────────────────────────────────────────────────
   The chips are the primary input; these keep a typed answer from dead-ending.
   Each returns null for text it can't read, so the caller re-asks instead of
   guessing — every one of these answers turns pages on or off. */

const NO_RE = /^(no|nope|nah|not really)\b|\b(no money|none|nothing|never|don'?t|doesn'?t|free)\b/i;
const HEDGE_RE = /\b(not sure|unsure|no idea|don'?t know|dunno|idk|maybe|might|depends)\b/i;

export function readMoneyAnswer(text: string): MoneyAnswer | null {
  const t = text.toLowerCase();
  if (HEDGE_RE.test(t)) return null;
  if (/\b(sometimes|now and then|occasional(ly)?|a little|a bit|rarely|once in a while|every so often)\b/.test(t)) return "some";
  if (NO_RE.test(t)) return "none";
  return "yes";
}

export function readDocsAnswer(text: string): DocsAnswer | null {
  const t = text.toLowerCase();
  if (HEDGE_RE.test(t)) return null;
  if (/\b(scatter(ed)?|everywhere|all over|messy|mess|random|all over the place)\b/.test(t)) return "scattered";
  if (NO_RE.test(t)) return "none";
  return "yes";
}

/** A founder's typed name, minus the greeting they wrapped it in. */
export function readFounderName(text: string): string {
  return text
    .replace(/^(?:(?:hey|hi|hello|yo)[,!.]*\s+)?(?:(?:i'?m|i am|my name is|it'?s|this is)\s+)?/i, "")
    .replace(/[.!]+$/, "")
    .trim()
    .replace(/\b\p{Ll}/gu, c => c.toUpperCase())
    .slice(0, 120);
}

/** A typed title ("I'm the treasurer") as a seat name ("Treasurer"). */
export function readFounderTitle(text: string): string {
  return text
    .replace(/^(i'?m |i am )?(the |our |a |an )?/i, "")
    .replace(/[.!]+$/, "")
    .trim()
    .replace(/\b\p{Ll}/gu, c => c.toUpperCase())
    .slice(0, 60);
}
