"use client";

/**
 * Client wrapper for POST /api/ai/interview — the interview's free-text
 * interpreter.
 *
 * The whole contract is "never block the conversation": any failure mode
 * (AI not configured, rate-limited, network error, model returned junk, 10s
 * timeout) collapses to `null`, and the caller falls back to its deterministic
 * path (keyword matcher + canned reply). The founder never sees an error
 * state, just a slightly less clever interviewer.
 */

import type { Draft } from "@/lib/onboarding/draft";
import type { WorkflowId } from "@/lib/org-types";
import type { VocabKey } from "@/lib/vocab";
import type { KindId } from "@/lib/onboarding/kinds";

export type InterviewAiStage = "kind" | "activity" | "metrics" | "concierge";

/** The required fields the concierge is sent each turn (mirrors REQUIRED_FIELDS
    in the route). metrics/founderName aren't gated — see missingFields(). */
export type RequiredField = "kind" | "workflows" | "metrics";

export interface InterviewAiTurn {
  role: "q" | "user";
  text: string;
}

/** Mirrors ValidatedInterviewResult from app/api/ai/interview/route.ts. */
export interface InterviewAiResult {
  reply: string;
  picks: {
    addWorkflows: WorkflowId[];
    removeWorkflows: WorkflowId[];
    vocab: Partial<Record<VocabKey, string>>;
    kind: KindId | null;
    variant: string | null;
    customMetrics: { name: string; unit: string | null }[];
    founderName: string | null;
  };
  followUp: { question: string; chips: string[] } | null;
  next: { question: string; chips: string[] } | null;
  done: boolean;
  confidence: "high" | "low";
}

/**
 * Which required fields the concierge still needs, derived from the draft each
 * turn. Sent as a prior so the model never ends early, and re-checked
 * client-side before honoring the model's "done" (a guard against early exit).
 *
 * kind is the only hard gate (null in the draft = still missing). workflows /
 * metrics are inherently satisfiable-by-default (workflows are non-empty from
 * the moment a kind is set; metrics always have a sensible default), so they are
 * TOPICS the concierge raises once, never gates — we never block completion on
 * them here. The founder's seat title is no longer asked at all (it keeps the
 * kind default, editable on the Roles step); the current term is no longer
 * collected in the interview either — a fresh org sets it in the workspace via
 * SemesterGate.
 */
export function missingFields(draft: Draft): RequiredField[] {
  const missing: RequiredField[] = [];
  if (draft.kind === null) missing.push("kind");
  return missing;
}

const TIMEOUT_MS = 10_000;

/** Probe whether AI is configured; false on any failure (then don't call ask). */
export async function probeInterviewAi(): Promise<boolean> {
  try {
    const res = await fetch("/api/ai/interview", { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { enabled?: boolean };
    return data.enabled === true;
  } catch {
    return false;
  }
}

export async function askInterviewAi(
  stage: InterviewAiStage,
  draft: Draft,
  transcript: InterviewAiTurn[],
  missing?: RequiredField[],
): Promise<InterviewAiResult | null> {
  try {
    const res = await fetch("/api/ai/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        stage,
        orgName: draft.name.trim().slice(0, 120),
        answers: {
          kind: draft.kind,
          variant: draft.variant,
          enabledWorkflows: draft.enabledWorkflows,
        },
        ...(missing ? { missingFields: missing } : {}),
        // Server caps text at 300 chars — trim here so a long paste degrades
        // to a truncated answer instead of a 400 (which would read as "AI down").
        // The concierge runs the whole interview through one transcript, so the
        // window is wider than the legacy per-stage clarify loops needed.
        transcript: transcript.slice(-24).map(t => ({ role: t.role, text: t.text.slice(0, 300) })),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { enabled?: boolean; result?: InterviewAiResult | null };
    if (!data.enabled || !data.result) return null;
    return data.result;
  } catch {
    return null;
  }
}
