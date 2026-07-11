import { NextRequest } from "next/server";
import { z } from "zod";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { aiEnabled, interpretInterview, type RawInterviewResult } from "@/lib/ai";
import { ALL_WORKFLOWS, ALWAYS_ON_WORKFLOWS, type WorkflowId } from "@/lib/org-types";
import { VOCAB_KEYS, DEFAULT_LABELS, type VocabKey } from "@/lib/vocab";
import { KIND_IDS, KIND_VARIANTS, isKindId, type KindId } from "@/lib/onboarding/kinds";
import { TERM_MODELS } from "@/lib/onboarding/terms";
import { logError } from "@/lib/observability";

// POST /api/ai/interview — the /create interview's free-text interpreter.
//
// PRE-AUTH by design: the whole /create flow runs before sign-in (the founder
// authenticates at the Build step, last), so this route has no session and no
// buildContext — same posture as /api/orgs/slug-check. The abuse surface is
// bounded instead by tight IP rate limits (per-minute + per-day), a hard
// transcript cap, and small token budgets in interpretInterview().
//
// The model only INTERPRETS: it turns a typed answer into structured picks
// (workflow add/removes, vocab tweaks, a kind/variant, custom metrics, a
// founder title) plus at most ONE clarifying follow-up per response. Nothing
// here writes anywhere — the client dispatches the picks into the same draft
// reducer the founder's own taps use, and the blueprint review still stands
// between the draft and provisioning.
//
// Degradation contract: ANY failure (no key, rate limit, model error, junk
// output) must leave the client on its deterministic path — so errors are
// plain statuses the client maps to "use the keyword matcher and move on".
//
// SECURITY: model output is untrusted. validateInterviewResult() intersects
// every id/key against the real registries (ALL_WORKFLOWS / VOCAB_KEYS /
// KIND_VARIANTS) before anything leaves this route.

const MINUTE_LIMIT = 15;
const DAY_LIMIT    = 80;
const PROBE_LIMIT  = 30;

/** Hard server-side transcript bound — the activity stage's up-to-6-question
    clarify loop tops out well under this; anything longer is not our client. */
const MAX_TRANSCRIPT = 14;

export const interviewAiInput = z.object({
  stage:   z.enum(["kind", "activity", "metrics", "founder-title"]),
  orgName: z.string().trim().max(120),
  // Structured priors so the model never re-asks what the chips already
  // answered. All optional — early stages have fewer of them.
  answers: z
    .object({
      kind:             z.enum(KIND_IDS).nullable(),
      variant:          z.string().max(30).nullable(),
      enabledWorkflows: z.array(z.string().max(20)).max(ALL_WORKFLOWS.length),
      termModel:        z.enum(TERM_MODELS).nullable(),
    })
    .partial(),
  // The clarify loop so far: q = a question we asked, user = the founder.
  transcript: z
    .array(
      z.object({
        role: z.enum(["q", "user"]),
        text: z.string().trim().min(1).max(300),
      }),
    )
    .min(1)
    .max(MAX_TRANSCRIPT),
});

export type InterviewAiInput = z.infer<typeof interviewAiInput>;

export interface ValidatedInterviewResult {
  reply: string;
  picks: {
    addWorkflows:    WorkflowId[];
    removeWorkflows: WorkflowId[];
    vocab:           Partial<Record<VocabKey, string>>;
    kind:            KindId | null;
    variant:         string | null;
    customMetrics:   { name: string; unit: string | null }[];
    founderTitle:    string | null;
  };
  followUp: { question: string; chips: string[] } | null;
  confidence: "high" | "low";
}

const MAX_CUSTOM_METRICS = 3;
const MAX_CHIPS = 4;

/**
 * Turn the model's UNTRUSTED raw output into a safe result: every id/key is
 * intersected with the real registries so a hallucinated value can never reach
 * the client. Pure + exported so it's unit-testable without the model. Same
 * posture as validateRecommendation in ../recommend-setup.
 */
export function validateInterviewResult(
  raw: RawInterviewResult,
  input: Pick<InterviewAiInput, "answers" | "transcript">,
): ValidatedInterviewResult {
  const known = new Set<string>(ALL_WORKFLOWS);
  const addWorkflows = [...new Set(raw.addWorkflows.filter(w => known.has(w)))] as WorkflowId[];
  // Never let the model remove an always-on workflow (operations = Dashboard).
  const removable = new Set<string>(ALL_WORKFLOWS.filter(w => !ALWAYS_ON_WORKFLOWS.includes(w)));
  const removeWorkflows = [...new Set(raw.removeWorkflows.filter(w => removable.has(w)))] as WorkflowId[];

  const vocab: Partial<Record<VocabKey, string>> = {};
  for (const key of VOCAB_KEYS) {
    const v = raw.vocabulary[key];
    if (typeof v === "string" && v.trim()) vocab[key] = v.trim().slice(0, 40);
  }

  const kind = raw.kind && isKindId(raw.kind) ? raw.kind : null;
  // A variant only means something for the kind it belongs to — validate it
  // against the resolved kind (the model's, else the prior).
  const variantKind = kind ?? input.answers.kind ?? null;
  const variantIds = variantKind ? (KIND_VARIANTS[variantKind] ?? []).map(v => v.id) : [];
  const variant = raw.variant && variantIds.includes(raw.variant) ? raw.variant : null;

  const customMetrics = raw.customMetrics
    .map(m => ({
      name: m.name.trim().slice(0, 40),
      unit: m.unit?.trim().slice(0, 10) || null,
    }))
    .filter(m => m.name.length > 0)
    .slice(0, MAX_CUSTOM_METRICS);

  const founderTitle = raw.founderTitle?.trim().slice(0, 60) || null;

  // A follow-up needs room for one more q+answer inside the transcript cap;
  // past that the client would drop it anyway, so don't even send it.
  const roomForFollowUp = input.transcript.length <= MAX_TRANSCRIPT - 2;
  const question = raw.followUpQuestion?.trim().slice(0, 200) || null;
  const chips = [...new Set(raw.followUpChips.map(c => c.trim().slice(0, 40)).filter(Boolean))].slice(0, MAX_CHIPS);
  const followUp = roomForFollowUp && question ? { question, chips } : null;

  return {
    reply: raw.reply.trim().slice(0, 200),
    picks: { addWorkflows, removeWorkflows, vocab, kind, variant, customMetrics, founderTitle },
    followUp,
    confidence: raw.confidence,
  };
}

// ─── System prompt ───────────────────────────────────────────────────────────

const WORKFLOW_DESCRIPTIONS: Record<WorkflowId, string> = {
  members:        "Member roster, profiles, and per-member tracking.",
  events:         "Programming board — plan programs, socials, fundraisers, and service events.",
  attendance:     "Meeting/practice attendance tracking and per-member attendance rates.",
  finance:        "Budget, dues, transactions, and running balance (Treasury page).",
  parties:        "Social events with door revenue and wrap-up tracking.",
  service:        "Service events and per-member volunteer-hour totals.",
  communications: "Announcements and social post planning.",
  docs:           "Pinned links and shared documents.",
  tasks:          "Task assignments and to-dos for officers/committees.",
  meetings:       "Formal meeting minutes, agendas, and records — only for orgs that hold recurring formal meetings.",
  operations:     "Always-on — Dashboard and Timeline. Never add or remove it.",
};

const STAGE_GOALS: Record<InterviewAiInput["stage"], string> = {
  kind: `GOAL: resolve which KIND of organization this is (set "kind"), and — when the text makes it obvious — its variant too (set "variant"). Leave workflows/vocabulary/customMetrics/founderTitle empty. Ask a follow-up ONLY if the text is genuinely ambiguous between two kinds.`,
  activity: `GOAL: settle the org's final page set. Compare what the founder says the org DOES against currently enabled workflows; return "addWorkflows" for pages they need and "removeWorkflows" for enabled pages that don't fit. You may also fix vocabulary via "vocabulary" pairs when the founder's words clearly imply it. This is the stage where clarifying follow-ups matter: each follow-up must target ONE concrete unresolved page decision (Is attendance taken and does it matter? Is money collected — regular dues, event-by-event, or none? Formal meetings with minutes, or none? A recruitment/rush season? A public/social-media presence?). Never ask a generic "tell me more". Never re-ask anything the PRIORS or the transcript already answer. STOP asking (followUpQuestion: null) the moment the page set is confidently resolved — most orgs need 1–3 follow-ups, and a clear answer deserves none.`,
  metrics: `GOAL: turn the founder's "we also track …" answer into 1–${MAX_CUSTOM_METRICS} custom per-member metrics in "customMetrics" — each a short display name (e.g. "Chapter Points") and an optional short unit (e.g. "pts", "hrs", null for a bare number). Do not duplicate the built-ins (attendance, GPA, dues, service hours). Leave other pick fields empty. Ask a follow-up only if you cannot tell WHAT quantity they mean.`,
  "founder-title": `GOAL: extract the founder's own title into "founderTitle" (e.g. "President", "Head Coach", "VP Operations"). Title-case it, keep it under 60 characters, no sentence. Leave every other pick field empty. No follow-ups.`,
};

function buildSystemPrompt(input: InterviewAiInput): string {
  const workflowList = ALL_WORKFLOWS.map(w => `  - ${w}: ${WORKFLOW_DESCRIPTIONS[w]}`).join("\n");
  const vocabList = VOCAB_KEYS.map(k => `  - ${k} (default "${DEFAULT_LABELS[k]}")`).join("\n");
  const kind = input.answers.kind ?? null;
  const variantList = kind && KIND_VARIANTS[kind]?.length
    ? KIND_VARIANTS[kind]!.map(v => `  - ${v.id}: ${v.label}`).join("\n")
    : "  (none for this kind)";
  const priors = [
    `org name: ${input.orgName || "(unnamed)"}`,
    `kind: ${kind ?? "(unknown)"}`,
    `variant: ${input.answers.variant ?? "(unknown)"}`,
    `enabled workflows: ${(input.answers.enabledWorkflows ?? []).join(", ") || "(none yet)"}`,
    `term model: ${input.answers.termModel ?? "(not asked yet)"}`,
  ].join("\n  ");

  return `You are the setup interviewer inside an org-management app's creation flow. A founder is answering short questions; your job is to interpret ONE free-text answer into structured picks — you never write anything, the founder reviews everything on a blueprint before it's built.

PRIORS (already answered — never re-ask these):
  ${priors}

VALID WORKFLOW IDS (the org's pages) — use ONLY these exact ids in addWorkflows/removeWorkflows:
${workflowList}

VALID KIND IDS: ${KIND_IDS.join(", ")}
VALID VARIANT IDS for the current kind:
${variantList}

VOCABULARY KEYS (optional label overrides) — return "vocabulary" as {key,label} pairs using ONLY these keys:
${vocabList}

${STAGE_GOALS[input.stage]}

REPLY: "reply" is the one short conversational sentence the founder sees (max ~25 words, warm, concrete about what you just changed or understood — e.g. "No parties then — I'll lead with pro-dev events and dues."). No markdown. Speak in the founder's own words for their org; NEVER expose the internal machinery — don't name a kind/variant/workflow id, don't say which bucket or template you picked, and never say you'll "treat it as" or "categorize it as" a type (especially not "other"). When an org doesn't fit a preset, just reflect what THEY said and describe what it means for their setup — e.g. for "homeowner group" say "A homeowners' group — I'll keep the words plain and start you with only the pages you turn on." not "I'll treat it as an 'other' org type."

FOLLOW-UPS: at most ONE per response, via "followUpQuestion" (a single short question) plus 2–${MAX_CHIPS} "followUpChips" (short tap-answers covering the likely cases). When you don't need one, followUpQuestion is null and followUpChips is [].

Set "confidence" to "low" only when you had to guess.`;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

// GET — cheap "is AI configured?" probe the interview fires on mount. When
// false the client keeps every answer on the deterministic keyword path.
export async function GET(req: NextRequest) {
  const rl = rateLimit(`interview-ai-probe:${clientIp(req)}`, PROBE_LIMIT, 60_000);
  if (!rl.ok) return tooManyRequests(rl);
  return Response.json({ enabled: aiEnabled() });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const minute = rateLimit(`interview-ai:${ip}`, MINUTE_LIMIT, 60_000);
  if (!minute.ok) return tooManyRequests(minute);
  const day = rateLimit(`interview-ai-day:${ip}`, DAY_LIMIT, 24 * 60 * 60 * 1000);
  if (!day.ok) return tooManyRequests(day);

  if (!aiEnabled()) return Response.json({ enabled: false, result: null });

  const body = await req.json().catch(() => null);
  const parsed = interviewAiInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid interview input" }, { status: 400 });
  }
  const input = parsed.data;

  const messages = input.transcript.map(t => ({
    role: t.role === "q" ? ("assistant" as const) : ("user" as const),
    content: t.text,
  }));

  try {
    const raw = await interpretInterview(buildSystemPrompt(input), messages);
    // Model/parse failure → null result; the client falls back to its keyword
    // matcher. enabled stays true so the client keeps trying on later turns.
    if (!raw) return Response.json({ enabled: true, result: null });
    return Response.json({ enabled: true, result: validateInterviewResult(raw, input) });
  } catch (e) {
    logError(e, { route: "/api/ai/interview", method: "POST" });
    return Response.json({ enabled: true, result: null });
  }
}
