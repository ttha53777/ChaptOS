/**
 * Interview vocabulary for the /create flow.
 *
 * `kind` is the human answer to "what kind of group is this?" — it resolves to
 * one of the seven real org-type template ids in lib/org-types.ts. Sorority is
 * the one kind without its own template: it shares the fraternity template and
 * differs only in vocabulary (Member: "Sister"), applied via KIND_VOCAB_DELTA.
 *
 * `pain` is the answer to "what eats your time?" — it forces one workflow on
 * regardless of what the template defaults say (PAIN_WF).
 *
 * Pure data + matchers, no React, no DB — shared by the interview UI and the
 * draft→createOrgInput mapper, and unit-tested directly.
 */

import type { WorkflowId } from "@/lib/org-types";
import type { VocabOverrides } from "@/lib/vocab";

export const KIND_IDS = [
  "fraternity",
  "sorority",
  "club",
  "team",
  "service",
  "honor",
  "arts",
  "other",
] as const;

export type KindId = (typeof KIND_IDS)[number];

/** Resolve a human kind to the real org-type template id. */
export const KIND_TO_TYPE: Record<KindId, string> = {
  fraternity: "fraternity",
  sorority:   "fraternity",
  club:       "generic-club",
  team:       "sports-team",
  service:    "service-org",
  honor:      "honor-society",
  arts:       "performing-arts",
  other:      "generic-org",
};

/** Chip / sheet labels for each kind. */
export const KIND_LABEL: Record<KindId, string> = {
  fraternity: "A fraternity",
  sorority:   "A sorority",
  club:       "A club",
  team:       "A sports team",
  service:    "A service org",
  honor:      "An honor society",
  arts:       "A performing-arts group",
  other:      "Another kind of org",
};

/**
 * Vocabulary the kind adds ON TOP of its template's overrides. Only sorority
 * carries a delta today — it rides the fraternity template but its members
 * are Sisters, not Brothers.
 */
export const KIND_VOCAB_DELTA: Partial<Record<KindId, VocabOverrides>> = {
  sorority: { Member: "Sister" },
};

export const PAIN_IDS = ["dues", "attendance", "events", "comms"] as const;

export type PainId = (typeof PAIN_IDS)[number];

/** The "what eats your time" answer → the workflow it forces on. */
export const PAIN_WF: Record<PainId, WorkflowId> = {
  dues:       "finance",
  attendance: "attendance",
  events:     "events",
  comms:      "communications",
};

/**
 * Keyword matchers for the interview's free-text fallback. Deliberately naive
 * `includes` chains (ported from the design mock) — the chips are the primary
 * input; this just keeps a typed answer from dead-ending. Both always return
 * an answer: unmatched kind text reads as "other", unmatched pain as "comms".
 */
export function matchKind(text: string): KindId {
  const lower = text.toLowerCase();
  if (lower.includes("frat")) return "fraternity";
  if (lower.includes("soror")) return "sorority";
  if (lower.includes("team") || lower.includes("sport")) return "team";
  if (lower.includes("service") || lower.includes("volunteer")) return "service";
  if (lower.includes("honor")) return "honor";
  if (
    lower.includes("theat") || lower.includes("danc") || lower.includes("music") ||
    lower.includes("art") || lower.includes("choir") || lower.includes("band")
  ) return "arts";
  if (lower.includes("club") || lower.includes("student") || lower.includes("org")) return "club";
  return "other";
}

export function matchPain(text: string): PainId {
  const lower = text.toLowerCase();
  if (lower.includes("due") || lower.includes("money")) return "dues";
  if (lower.includes("attend")) return "attendance";
  if (lower.includes("event") || lower.includes("social")) return "events";
  return "comms";
}

export function isKindId(id: string): id is KindId {
  return (KIND_IDS as readonly string[]).includes(id);
}

export function isPainId(id: string): id is PainId {
  return (PAIN_IDS as readonly string[]).includes(id);
}
