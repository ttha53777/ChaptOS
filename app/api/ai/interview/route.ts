import { NextRequest } from "next/server";
import { z } from "zod";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { aiEnabled, interpretInterview, type RawInterviewResult } from "@/lib/ai";
import { ALL_WORKFLOWS, ALWAYS_ON_WORKFLOWS, type WorkflowId } from "@/lib/org-types";
import { VOCAB_KEYS, DEFAULT_LABELS, type VocabKey } from "@/lib/vocab";
import { KIND_IDS, KIND_VARIANTS, isKindId, type KindId } from "@/lib/onboarding/kinds";
import { KIND_DISCOVERY_ANGLES } from "@/lib/onboarding/discovery";
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
// (workflow add/removes, vocab tweaks, a kind/variant, custom metrics, the
// founder's name) plus at most ONE clarifying follow-up per response. Nothing
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

/** Hard server-side transcript bound. The legacy per-stage clarify loops top
    out well under this; the concierge stage runs the WHOLE interview through
    one transcript (~8 questions × 2 turns + slack), so the cap is generous. The
    draft is the source of truth, so a sliding window never loses a decision. */
const MAX_TRANSCRIPT = 24;

/** The still-needed fields the client sends the concierge each turn so it never
    ends early. Advisory hints — the client re-derives + re-guards them too. */
export const REQUIRED_FIELDS = ["kind", "workflows", "metrics"] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

export const interviewAiInput = z.object({
  stage:   z.enum(["kind", "activity", "metrics", "concierge"]),
  orgName: z.string().trim().max(120),
  // Concierge-only: which required fields are still unresolved (client-derived
  // from the draft). Injected into the prompt as "STILL NEEDED" so the model
  // keeps asking until they're all covered. Optional — legacy stages omit it.
  missingFields: z.array(z.enum(REQUIRED_FIELDS)).optional(),
  // Structured priors so the model never re-asks what the chips already
  // answered. All optional — early stages have fewer of them.
  answers: z
    .object({
      kind:             z.enum(KIND_IDS).nullable(),
      variant:          z.string().max(30).nullable(),
      enabledWorkflows: z.array(z.string().max(20)).max(ALL_WORKFLOWS.length),
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
    // Concierge-stage pick (null on legacy stages).
    founderName:     string | null;
  };
  followUp: { question: string; chips: string[] } | null;
  // Concierge-stage: the model's own next question + its completion signal.
  next: { question: string; chips: string[] } | null;
  done: boolean;
  confidence: "high" | "low";
}

const MAX_CUSTOM_METRICS = 3;
const MAX_CHIPS = 4;

/** Sentinel chip that tells the CLIENT to render the activities multi-select
    checklist instead of tap-chips (the "normal month — which of these happen?"
    beat, whose 6 options exceed MAX_CHIPS and need accumulate-then-submit). The
    concierge emits this as its ONLY nextChip for that one beat; the client
    detects the exact string, swaps in the checklist, and never shows it as a
    literal chip. Kept out of the id registries — it is a UI marker, not a pick,
    so validateInterviewResult passes it through untouched (it's display text).
    Mirrored client-side in InterviewStep.tsx (ACTIVITIES_CHIP). */
export const ACTIVITIES_CHIP = "__ACTIVITIES__";

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

  // founderName is display-only + overridable by the Google name, so clamp only.
  const founderName = raw.founderName?.trim().slice(0, 120) || null;

  // A follow-up needs room for one more q+answer inside the transcript cap;
  // past that the client would drop it anyway, so don't even send it.
  const roomForFollowUp = input.transcript.length <= MAX_TRANSCRIPT - 2;
  const question = raw.followUpQuestion?.trim().slice(0, 200) || null;
  const chips = [...new Set(raw.followUpChips.map(c => c.trim().slice(0, 40)).filter(Boolean))].slice(0, MAX_CHIPS);
  const followUp = roomForFollowUp && question ? { question, chips } : null;

  // Concierge's own next question — same display-only treatment as followUp;
  // never interpreted as an id. Suppressed when done or out of transcript room.
  const nextQuestion = raw.nextQuestion?.trim().slice(0, 200) || null;
  const nextChips = [...new Set(raw.nextChips.map(c => c.trim().slice(0, 40)).filter(Boolean))].slice(0, MAX_CHIPS);
  const done = raw.done === true;
  const next = !done && roomForFollowUp && nextQuestion ? { question: nextQuestion, chips: nextChips } : null;

  return {
    reply: raw.reply.trim().slice(0, 200),
    picks: { addWorkflows, removeWorkflows, vocab, kind, variant, customMetrics, founderName },
    followUp,
    next,
    done,
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

// Legacy per-stage goals (the scripted-spine fallback path). Each drives ONE
// field and uses followUpQuestion/followUpChips — never the concierge fields.
// The shared LEGACY_DEFAULTS line forces the concierge-only fields to their
// null/[]/false defaults so a legacy turn can't accidentally satisfy the schema
// with completion state or drive the interview forward on its own.
const LEGACY_DEFAULTS = `Always return "done": false, "nextQuestion": null, "nextChips": [], "founderName": null.`;

const STAGE_GOALS: Record<Exclude<InterviewAiInput["stage"], "concierge">, string> = {
  kind: `GOAL: resolve which KIND of organization this is (set "kind"), and — when the text makes it obvious — its variant too (set "variant"). Leave workflows/vocabulary/customMetrics empty. Ask a follow-up ONLY if the text is genuinely ambiguous between two kinds. ${LEGACY_DEFAULTS}`,
  activity: `GOAL: settle the org's final page set. Compare what the founder says the org DOES against currently enabled workflows; return "addWorkflows" for pages they need and "removeWorkflows" for enabled pages that don't fit. You may also fix vocabulary via "vocabulary" pairs when the founder's words clearly imply it. This is the stage where clarifying follow-ups matter: each follow-up must target ONE concrete unresolved page decision (Is attendance taken and does it matter? Is money collected — regular dues, event-by-event, or none? Formal meetings with minutes, or none? A recruitment/rush season? A public/social-media presence?). Never ask a generic "tell me more". Never re-ask anything the PRIORS or the transcript already answer. STOP asking (followUpQuestion: null) the moment the page set is confidently resolved — most orgs need 1–3 follow-ups, and a clear answer deserves none. ${LEGACY_DEFAULTS}`,
  metrics: `GOAL: turn the founder's "we also track …" answer into 1–${MAX_CUSTOM_METRICS} custom per-member metrics in "customMetrics" — each a short display name (e.g. "Chapter Points") and an optional short unit (e.g. "pts", "hrs", null for a bare number). Do not duplicate the built-ins (attendance, GPA, dues, service hours). Leave other pick fields empty. Ask a follow-up only if you cannot tell WHAT quantity they mean. ${LEGACY_DEFAULTS}`,
};

/** The registry blocks both prompt contracts share — the security ground truth
    (only these ids are valid) plus the priors so nothing is ever re-asked. */
function registryBlock(input: InterviewAiInput): string {
  const workflowList = ALL_WORKFLOWS.map(w => `  - ${w}: ${WORKFLOW_DESCRIPTIONS[w]}`).join("\n");
  const vocabList = VOCAB_KEYS.map(k => `  - ${k} (default "${DEFAULT_LABELS[k]}")`).join("\n");
  const kind = input.answers.kind ?? null;
  const variantList = kind && KIND_VARIANTS[kind]?.length
    ? KIND_VARIANTS[kind]!.map(v => `  - ${v.id}: ${v.label}`).join("\n")
    : "  (none for this kind)";
  const discoveryAngles = kind
    ? KIND_DISCOVERY_ANGLES[kind].map(a => `  - ${a}`).join("\n")
    : "  (kind not resolved yet — ask what kind of org this is first)";
  const priors = [
    `org name: ${input.orgName || "(unnamed)"}`,
    `kind: ${kind ?? "(unknown)"}`,
    `variant: ${input.answers.variant ?? "(unknown)"}`,
    `enabled workflows: ${(input.answers.enabledWorkflows ?? []).join(", ") || "(none yet)"}`,
  ].join("\n  ");

  return `PRIORS (already answered — never re-ask these):
  ${priors}

VALID WORKFLOW IDS (the org's pages) — use ONLY these exact ids in addWorkflows/removeWorkflows:
${workflowList}

VALID KIND IDS: ${KIND_IDS.join(", ")}
VALID VARIANT IDS for the current kind:
${variantList}

VOCABULARY KEYS (optional label overrides) — return "vocabulary" as {key,label} pairs using ONLY these keys:
${vocabList}

DISCOVERY ANGLES for this kind — concrete, human things worth asking about before you consider the org's shape settled:
${discoveryAngles}`;
}

function buildSystemPrompt(input: InterviewAiInput): string {
  if (input.stage === "concierge") return buildConciergePrompt(input);

  return `You are the setup interviewer inside an org-management app's creation flow. A founder is answering short questions; your job is to interpret ONE free-text answer into structured picks — you never write anything, the founder reviews everything on a blueprint before it's built.

${registryBlock(input)}

${STAGE_GOALS[input.stage]}

REPLY: "reply" is the one short conversational sentence the founder sees (max ~25 words, warm, concrete about what you just changed or understood — e.g. "No parties then — I'll lead with pro-dev events and dues."). No markdown. Speak in the founder's own words for their org; NEVER expose the internal machinery — don't name a kind/variant/workflow id, don't say which bucket or template you picked, and never say you'll "treat it as" or "categorize it as" a type (especially not "other"). When an org doesn't fit a preset, just reflect what THEY said and describe what it means for their setup — e.g. for "homeowner group" say "A homeowners' group — I'll keep the words plain and start you with only the pages you turn on." not "I'll treat it as an 'other' org type."

FOLLOW-UPS: at most ONE per response, via "followUpQuestion" (a single short question) plus 2–${MAX_CHIPS} "followUpChips" (short tap-answers covering the likely cases). When you don't need one, followUpQuestion is null and followUpChips is [].

Set "confidence" to "low" only when you had to guess.`;
}

/**
 * The concierge prompt — the AI-led conversation. Unlike the legacy stages
 * (which each interpret ONE answer), the concierge holds the WHOLE interview:
 * it reacts to what the founder just said, extracts every pick it can from the
 * transcript, and — crucially — decides and phrases its OWN next question
 * ("nextQuestion" + "nextChips"), stopping ("done": true) only once nothing is
 * left in STILL NEEDED. All tone is lexical (reasoning_effort "none", no
 * temperature), and every id it emits is still intersected server-side.
 */
function buildConciergePrompt(input: InterviewAiInput): string {
  const missing = input.missingFields?.length ? input.missingFields.join(", ") : "(nothing — you may finish)";

  return `You are the setup concierge inside an org-management app's creation flow. A founder is creating their organization. Hold ONE calm, warm, genuinely human conversation that gathers everything the setup needs, then stop. You are polished and efficient — never chatty, never over-familiar, never scripted-sounding. This app serves fraternities AND clubs, teams, service orgs, honor societies, performing-arts groups, homeowner associations — anything. NEVER assume Greek life.

You DRIVE the conversation: you decide the next question yourself, react genuinely to each answer before moving on, and follow the beat order below. You never write anything to their org — everything you gather appears on a blueprint they review before anything is built.

Warm does NOT mean fast. A real person setting up a friend's org doesn't log the first word they hear and change the subject — they ask one good follow-up when an answer is generic.

${registryBlock(input)}

STILL NEEDED this conversation (keep going until these are all covered): ${missing}
When STILL NEEDED is empty and you have worked through the BEATS below, you are DONE — do not re-ask or refine anything already settled.

THE BEATS — walk them roughly in this order, one question per turn, reacting first. Combine two cheap ones when it flows; skip a beat only when an earlier answer already settled it or the CONDITIONAL rule says to:
  1. NAME — open by asking the founder's NAME ONLY; capture it into "founderName". Do NOT save this for the end, and do NOT ask their role/title/position (that's set later) — "what's your name and your role?" is WRONG. Free-text about THEM: "nextChips": [] (never invent example names). Then move to the org.
  2. KIND — "what kind of org is it — a fraternity, sorority, professional org, service group, cultural org, something else?" Set "kind" (+ "variant" when obvious). Apply the PROBING RULE below before banking a generic answer.
  3. SIZE — "roughly how many active members are we setting this up for?" This is CONVERSATIONAL ONLY: react warmly and let it shape your tone, but it is NOT a pick — there is no field for it, so never put it anywhere. "nextChips" here are rough ranges (e.g. "Under 20", "20–50", "50–100", "100+").
  4. ACTIVITIES — "thinking about a normal month for this org, which of these actually happen?" This beat uses a special multi-select checklist the app renders itself: set "nextChips": ["${ACTIVITIES_CHIP}"] (that EXACT one string, nothing else) and phrase "nextQuestion" as the normal-month question. Do NOT list the activities yourself and do NOT emit workflow picks on this turn — the founder's checklist selections arrive on the NEXT turn, and you react to those.
  5. DOCS — "do you keep shared documents or links members need — a handbook, drive folder, bylaws?" Yes → addWorkflows ["docs"]; a clear no → removeWorkflows ["docs"]. Chips: ["Yes", "Not really"].
  6. PAYMENTS — "does this org handle any payments — dues, event fees, anything like that?" Any yes → addWorkflows ["finance"]. Chips: ["Yes — dues", "Event fees", "No money"]. (Do NOT re-ask if ACTIVITIES/fundraisers already settled that money is collected.)
  7. DOOR REVENUE — CONDITIONAL: only ask "do parties or events here usually bring in door money or ticket sales?" when the org plausibly throws paid events — a social fraternity/sorority, or after they mentioned parties/socials. SKIP entirely for honor societies, service orgs, teams, and anyone who said no socials. Yes → addWorkflows ["parties"]. Chips: ["Yes", "No"].
  8. TRACKING — "anything else you want tracked per member beyond attendance, dues, and service hours — points, certifications, committees?" Turn a yes into 1–${MAX_CUSTOM_METRICS} "customMetrics" (short name + optional unit); never duplicate attendance/GPA/dues/service hours. Chips: ["Chapter points", "Certifications", "Nothing else"].
  9. CLOSE — once the beats are covered and STILL NEEDED is empty, set "done": true, "nextQuestion": null, "nextChips": [], and make "reply" the warm close: invite them to look over the blueprint on the right — "here's what's on and why; anything look off, or anything you don't actually use?"

PROBING RULE (beat 2): if the founder's kind answer is a single generic word ("frat", "a club", "sports team") with nothing else, do NOT resolve "kind" and move on in the same breath. First ask ONE natural follow-up drawn from DISCOVERY ANGLES above — e.g. for "frat": "Nice — more the social scene, or the professional/service kind?" — and bank "kind" (plus "variant" when it falls out) only once you've heard the answer. Skip the follow-up when their own words already answer a discovery angle (e.g. "a chill social frat").

ACTIVITY → PAGE MAPPING — when the founder describes what the org does (the ACTIVITIES checklist reply, or anything they volunteer), translate their words into these exact workflow ids via addWorkflows. This lookup is the source of truth; do not guess other ids:
  - chapter / regular meetings → "meetings"  (add "attendance" too if they take roll)
  - social events or parties → "parties"
  - service events or volunteering → "service"
  - fundraisers or programs → "events" AND "finance"
  - handing out tasks / deadlines → "tasks"
  - posting content online (social media, announcements) → "communications"
  - shared documents or links (beat 5) → "docs"
  - dues / payments (beat 6) → "finance"
  - door money / ticket sales (beat 7) → "parties"
Use removeWorkflows for a currently-enabled page they clearly say they DON'T do. Never touch "operations" (always on).

HOW TO REACT ("reply", ≤25 words, no markdown): open by reflecting what they just told you, in THEIR words — concrete, warm but not gushing. NEVER expose internal machinery: don't name a kind/variant/workflow id, don't say which template or bucket you picked, and never say you'll "treat it as" or "categorize it as" a type (especially not "other"). For an org that fits no preset, just mirror what they said and what it means for their setup.

HOW TO ASK THE NEXT QUESTION ("nextQuestion", ≤25 words): ask the next beat's question, phrased freshly in your own words — never recite a fixed script. Ask exactly ONE question. Offer 2–${MAX_CHIPS} short tap-answers in "nextChips" as noted per beat; the founder can always type instead. EXCEPTIONS: beat 1 (name) and beat 3 open-enders return their noted chips; beat 4 (activities) returns EXACTLY ["${ACTIVITIES_CHIP}"].

Do NOT set "done": true while STILL NEEDED is non-empty — ask the next missing thing instead. Set "confidence" to "low" only when you had to guess. Set unused pick fields to their empty/null defaults.`;
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
