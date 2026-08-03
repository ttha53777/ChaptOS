"use client";

/**
 * Client wrapper for POST /api/ai/interview — the interview's free-text
 * interpreter.
 *
 * The whole contract is "never block the conversation": every failure mode
 * (AI not configured, rate-limited, network error, model returned junk, timeout)
 * still leaves the caller free to fall back to its deterministic path. The
 * founder never sees an error state, just a slightly less clever interviewer.
 *
 * What a failure no longer does is VANISH. Collapsing all of them into a bare
 * `null` had two costs. Nobody could count how often founders landed on the
 * degraded interview, or why — and the caller couldn't tell a rate-limit (worth
 * giving up on) from one slow turn (not). So failures carry a reason, the caller
 * reacts to it, and reportInterviewFallback() beacons it to
 * POST /api/ai/interview/event, which logs a line with no founder content in it.
 */

import type { Draft } from "@/lib/onboarding/draft";
import type { WorkflowId } from "@/lib/org-types";
import type { VocabKey } from "@/lib/vocab";
import type { KindId } from "@/lib/onboarding/kinds";

/** "concierge" is the AI-led interview. "metrics" only PARSES a typed measure
    into {name, unit} for the scripted spine (it can't ask a question or change a
    page, and falls back to titleCase). The old "kind"/"activity" stages are gone
    — the scripted spine asks its own deterministic beats. */
export type InterviewAiStage = "metrics" | "concierge";

/** Sentinel chip the concierge emits for the activities beat (beat 4), telling
    the client to render the multi-select checklist instead of tap-chips. MUST
    stay in sync with ACTIVITIES_CHIP in app/api/ai/interview/route.ts — the
    server-side prompt instructs the model to emit this exact string. */
export const ACTIVITIES_CHIP = "__ACTIVITIES__";

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
 * turn. Sent as a prior so the model never ends early, and — because this is
 * also what finishInterview() consults — the client-side guard that decides
 * whether the interview is allowed to end at all.
 *
 * TWO hard gates:
 *
 *   kind      — null in the draft = still missing.
 *   workflows — the activities beat decides the org's ENTIRE page set (setKind
 *               resets enabledWorkflows to BASE_WORKFLOWS and nothing else adds
 *               to it), so an interview that ends without it provisions an org
 *               with no meetings, parties, service, tasks, docs or dues page and
 *               a Timeline step of ghosted categories over an empty preview.
 *               This used to be ungated on the theory that "workflows are
 *               non-empty from the moment a kind is set" — true, and beside the
 *               point: base pages are the Dashboard and Timeline every org gets,
 *               not an answer. A model that resolved the kind and then said
 *               `done` in the same breath shipped exactly that org.
 *
 * metrics is genuinely satisfiable-by-default (there is always a sensible
 * per-member default), so it stays a TOPIC the concierge raises once, never a
 * gate. The founder's seat title is no longer asked at all (it keeps the kind
 * default, editable on the Roles step); the current term is no longer collected
 * in the interview either — a fresh org sets it in the workspace via
 * SemesterGate.
 */
export function missingFields(draft: Draft): RequiredField[] {
  const missing: RequiredField[] = [];
  if (draft.kind === null) missing.push("kind");
  if (!draft.activitiesAnswered) missing.push("workflows");
  return missing;
}

/**
 * How long to wait on one concierge turn.
 *
 * Was 10s, which is SHORTER than the OpenAI client's own 30s deadline in
 * lib/ai.ts — so a slow-but-successful turn was abandoned here while the server
 * happily finished it, and the server never learned the founder had already been
 * dropped onto the scripted spine. That asymmetry is the likeliest explanation
 * for fallbacks that fire once on a perfectly ordinary answer and then refuse to
 * reproduce. 18s still bounds the wait, and `slowTurn` gives the founder
 * something to read past ~6s so it isn't dead air.
 */
const TIMEOUT_MS = 18_000;
export const SLOW_TURN_MS = 6_000;

/** Failure modes of one call. "aborted" is the odd one out: it means WE cancelled
    (the founder navigated away), so the caller must bail silently — no fallback,
    no beacon, nothing to render into a component that no longer exists. */
export type AskFailureReason =
  | "timeout"
  | "http-429"
  | "http-error"
  | "disabled"
  | "null-result"
  | "network"
  | "aborted";

export type AskOutcome =
  | { ok: true; result: InterviewAiResult; elapsedMs: number }
  | { ok: false; reason: AskFailureReason; elapsedMs: number };

/** Everything worth beaconing. The first six are call failures; the last three
    are decisions the client makes on a SUCCESSFUL response — the model quit with
    beats still owed, the turn cap tripped, or it returned no next question.
    "aborted" is deliberately absent. Mirrors FALLBACK_REASONS in
    app/api/ai/interview/event/route.ts. */
export type FallbackReason =
  | Exclude<AskFailureReason, "aborted">
  | "model-done-early"
  | "turn-cap"
  | "no-next";

/** Opaque per-mount id. Groups one interview's events together and gives the
    route a per-interview rate-limit bucket. Random, never stored, tied to
    nothing about the person — see the telemetry note in
    docs/trust-and-privacy-source-of-truth.md. */
export function newInterviewSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Report a degradation. Fire-and-forget by construction: telemetry must never
 * be able to affect the conversation, so nothing here is awaited and every
 * outcome — 404, 429, offline, blocked by an extension — is swallowed.
 *
 * sendBeacon is preferred because it survives the page being closed, which is
 * exactly when a founder who just hit a broken interview tends to leave.
 */
export function reportInterviewFallback(
  reason: FallbackReason,
  meta: { stage: "boot" | "concierge" | "metrics"; turn: number; sessionId: string; elapsedMs?: number },
): void {
  try {
    const body = JSON.stringify({ reason, ...meta });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/ai/interview/event", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/ai/interview/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never throws into the interview.
  }
}

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
  opts?: { sessionId?: string; signal?: AbortSignal },
): Promise<AskOutcome> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  // One controller for both deadlines, so the catch can tell them apart by the
  // abort reason: a timeout is a degradation worth reporting, an unmount is not.
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Interview turn timed out", "TimeoutError")),
    TIMEOUT_MS,
  );
  const onExternalAbort = () =>
    controller.abort(new DOMException("Interview left", "AbortError"));
  if (opts?.signal) {
    if (opts.signal.aborted) onExternalAbort();
    else opts.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const res = await fetch("/api/ai/interview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts?.sessionId ? { "x-interview-session": opts.sessionId } : {}),
      },
      signal: controller.signal,
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
    if (!res.ok) {
      // 429 is worth telling apart: it means the budget is gone, so retrying
      // this turn or any later one is pointless until the window rolls over.
      return { ok: false, reason: res.status === 429 ? "http-429" : "http-error", elapsedMs: elapsed() };
    }
    const data = (await res.json()) as { enabled?: boolean; result?: InterviewAiResult | null };
    if (!data.enabled) return { ok: false, reason: "disabled", elapsedMs: elapsed() };
    if (!data.result) return { ok: false, reason: "null-result", elapsedMs: elapsed() };
    return { ok: true, result: data.result, elapsedMs: elapsed() };
  } catch (e) {
    const name = (e as { name?: string } | undefined)?.name;
    const reason: AskFailureReason =
      name === "TimeoutError" ? "timeout" : name === "AbortError" ? "aborted" : "network";
    return { ok: false, reason, elapsedMs: elapsed() };
  } finally {
    clearTimeout(timer);
    opts?.signal?.removeEventListener("abort", onExternalAbort);
  }
}
