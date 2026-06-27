import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { requireUser } from "@/lib/auth/require-user";
import { buildContext } from "@/lib/context";
import { checkMutationRate } from "@/lib/rate-limit";
import { aiEnabled, getOpenAI, CHAT_MODEL, MAX_COMPLETION_TOKENS, type RawSetupRecommendation } from "@/lib/ai";
import { ALL_WORKFLOWS, getOrgType, type OrgTypeTemplate } from "@/lib/org-types";
import { WORKFLOW_FEATURES } from "@/lib/workflow-features";
import { VOCAB_KEYS, DEFAULT_LABELS } from "@/lib/vocab";
import { PERMISSIONS } from "@/lib/permissions";
import { DEFAULT_THRESHOLDS } from "@/lib/thresholds";
import { validateRecommendation } from "@/app/api/ai/recommend-setup/route";
import { withIdleTimeout, StreamIdleTimeoutError, STREAM_IDLE_MS } from "@/lib/ai-stream";
import { logError } from "@/lib/observability";

// POST /api/ai/setup-chat — the CONVERSATIONAL onboarding agent (Phase 2). A
// stripped-down clone of the chat route: streams SSE (text / proposal / done),
// same requireUser → aiEnabled → checkMutationRate posture. Instead of the 21
// chat tools it has ONE tool, emit_setup_proposal, whose arguments are the same
// RawSetupRecommendation the single-shot recommend-setup produces. When the model
// calls it we run the SAME validateRecommendation() and stream a `proposal`
// event; otherwise the model streams text (a clarifying question or explanation).
//
// The model only PROPOSES — it never writes. The founder confirms the proposal in
// the UI and applies it via the existing PATCH /api/orgs/config + setup-apply.

export const dynamic = "force-dynamic";

// Room for an adaptive interview (up to ~6 questions + answers + clarification
// back-and-forth + the opening) without truncating the early turns.
const MAX_HISTORY_MSGS = 20;
const MAX_PRIOR_CONTENT_CHARS = 800;
// The soft target the PROMPT enforces: at most this many real questions before
// the model should propose. The founder may also ask US questions; those don't
// count (the prompt says so), so we can't enforce this number server-side.
const MAX_QUESTIONS = 6;
// Hard server safety net: once total assistant turns hit this (questions +
// answers to the founder's own clarifications), nudge the model to propose so a
// runaway conversation can't loop forever. Sits above MAX_QUESTIONS to leave
// headroom for a few clarification exchanges.
const HARD_TURN_CEILING = 12;
// Sentinel the client sends when the founder clicks "Build my setup now".
const BUILD_NOW = "[BUILD_NOW]";

interface ClientMessage {
  role: "user" | "assistant";
  content: string;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// The single proposal tool. Its parameters mirror the recommend-setup json_schema
// (workflows/widgets/vocab/thresholds/roles/rationale) so the same validator
// consumes the args verbatim.
const SETUP_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "emit_setup_proposal",
    description: "Emit the recommended org setup. Call this exactly once, as soon as the founder has described their organization (their first answer is usually enough).",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabledWorkflows: { type: "array", items: { type: "string" } },
        shownWidgets:     { type: "array", items: { type: "string" } },
        vocabulary: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { key: { type: "string" }, label: { type: "string" } },
            required: ["key", "label"],
          },
        },
        thresholds: {
          type: "object",
          additionalProperties: false,
          properties: {
            attendanceAtRisk: { type: "number" },
            attendanceWatch:  { type: "number" },
            gpaAtRisk:        { type: "number" },
            gpaWatch:         { type: "number" },
            serviceHoursGoal: { type: "number" },
          },
          required: ["attendanceAtRisk", "attendanceWatch", "gpaAtRisk", "gpaWatch", "serviceHoursGoal"],
        },
        roles: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name:        { type: "string" },
              rank:        { type: "number" },
              permissions: { type: "array", items: { type: "string" } },
              color:       { type: "string" },
            },
            required: ["name", "rank", "permissions", "color"],
          },
        },
        rationale: { type: "string" },
      },
      required: ["enabledWorkflows", "shownWidgets", "vocabulary", "thresholds", "roles", "rationale"],
    },
  },
};

// Optional companion tool: when a question has a small set of natural answers,
// the model offers them as one-tap choices. Additive — the founder can always
// free-type instead. Unlike emit_setup_proposal, this does NOT end the turn.
const CHOICES_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "offer_choices",
    description: "Ask a clarifying question that has a small set of natural answers, and offer those answers as one-tap choices. Use this INSTEAD of writing the question as plain text when choices make sense. The founder can still type a free answer instead.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        ack: { type: "string", description: "A short warm acknowledgement of the founder's last answer, e.g. 'Got it, a soccer team — love it.' Empty for the very first question only." },
        question: { type: "string", description: "The question to show the founder, e.g. 'Do you collect dues?'" },
        choices: { type: "array", items: { type: "string" }, description: "2-5 short suggested answers" },
        multi: { type: "boolean", description: "true if the founder may pick SEVERAL of these answers (e.g. 'What do you keep track of?'); false for pick-one questions (e.g. 'Do you collect dues?')." },
      },
      required: ["ack", "question", "choices", "multi"],
    },
  },
};

// Build a "prior" block from the org-type template the founder chose at creation
// (e.g. "Sports team", "Fraternity"). It gives the model a sensible starting
// point — default workflows, vocabulary, roles — so the interview refines a base
// instead of starting cold. Empty string when no/unknown type, so the prompt is
// unchanged for orgs without one.
function buildPriorBlock(template: OrgTypeTemplate | null): string {
  if (!template) return "";
  const workflows = template.enabledWorkflows.join(", ");
  const vocab = Object.entries(template.vocabularyOverrides);
  const vocabLine = vocab.length
    ? vocab.map(([k, v]) => `${k}→"${v}"`).join(", ")
    : "(none — canonical defaults fit)";
  // Non-founder seeded roles (the rank-100 admin is added automatically).
  const roles = template.roleSeeds.filter(r => r.rank < 100).map(r => r.name).join(", ") || "(none)";
  return `

STARTING POINT — the founder already picked the "${template.label}" template when creating this org. Use it as your default baseline, then ADJUST based on what they tell you (the conversation always wins over this prior; never contradict something they say):
- Default pages for this type: ${workflows}
- Default label overrides: ${vocabLine}
- Typical officer roles: ${roles}
Lean on this to ask FEWER, sharper questions — only ask about things this template leaves ambiguous or that the founder hints differ. If their first message already matches the template, you may need just one or two confirmations before proposing.`;
}

// Grounded conversation system prompt: the same option registries the single-shot
// step uses, plus the conversation rules, plus the chosen org-type prior.
function buildConversationPrompt(template: OrgTypeTemplate | null): string {
  const widgetList = WORKFLOW_FEATURES.operations.map(f => `  - ${f.id}: ${f.label}`).join("\n");
  return `You are a friendly setup assistant for a multi-purpose organization operations app. Help a founder configure their new organization through a short, adaptive interview.

Write for a busy, non-technical person. The founder is not an app expert — they may not know what a "workflow", "dashboard widget", "threshold", or "role" is. Your job is to make setup feel effortless.

Keep questions DEAD SIMPLE:
- Use plain, everyday words. Never use app/internal jargon (don't say "workflow", "widget", "threshold", "vocabulary", "config"). Ask about real-world things the founder already understands: "Do you collect money from members?", "Do you track grades?", "Do you take attendance at meetings?".
- One short sentence, max ~15 words. No compound questions. No markdown. A warm, casual tone.
- When useful, add a tiny example in plain words so the question is unmistakable, e.g. "Do you collect dues — like membership fees each semester?".

Sound like a warm human, not a form. Before each new question, briefly ACKNOWLEDGE what the founder just said — reflect it back or react in a few words — so they feel heard. Then ask the next question.
- Examples: "A soccer team — love it. Do you take attendance at practices?" · "Got it, no dues then. Do you track grades?" · "Nice, that helps. Roughly how many members do you have?"
- Keep the acknowledgement to a short phrase (a handful of words). Be genuine, never robotic or repetitive — vary how you react. Don't gush or over-explain.
- The very first question (right after the founder's opening message) still gets a light acknowledgement of what they described.

How to interview:
- Ask ONE question at a time, then wait for the answer.
- Let the founder's answers drive how many questions you ask. A rich first answer may need only one or two follow-ups (or none); a thin answer like "a club" warrants more. Never ask about something they've already told you.
- Ask at most ${MAX_QUESTIONS} questions total, then call emit_setup_proposal regardless. Never interrogate past that.
- Prioritize questions that change the setup, in plain terms: what kind of group is this and what do they keep track of → do they collect money/dues → do they track grades → do they take attendance → do they log volunteer/service hours → roughly how many members → who the officers/leaders are. Skip anything the founder already covered.
- How to ASK: if the question has a small set of natural answers, call offer_choices — put a SHORT acknowledgement of their last answer in its "ack" field, the plain-language question in "question", and 2-5 short answers in "choices". Set "multi" to true when the founder could pick SEVERAL answers (e.g. "What do you keep track of?" → attendance, dues, grades, hours), and false for pick-one questions (e.g. "Do you collect dues?"). Otherwise, write your acknowledgement + question as plain text. Pick exactly one of these per turn — don't ask the same question both ways.

If the founder asks YOU a question or seems confused (e.g. "what do you mean?", "what's that for?", "I'm not sure", "can you explain?"):
- Answer them first, briefly and plainly — say what the thing is and why it matters for their setup, with a quick example. No jargon.
- Then gently re-ask your question (you may offer choices again). Do NOT treat their question as an answer, and do NOT propose yet just because they spoke.
- This back-and-forth doesn't count toward your question limit — only count questions the founder actually answered.

- If the founder's message is exactly "${BUILD_NOW}", stop asking and call emit_setup_proposal immediately using whatever you know so far.
- Before emitting the proposal you may write ONE short warm sentence (e.g. "Got it — here's a setup for your soccer club:").
${buildPriorBlock(template)}

When you call emit_setup_proposal, choose ONLY from these exact ids/keys:
WORKFLOWS: ${ALL_WORKFLOWS.join(", ")} (always include "operations").
WIDGETS to SHOW (omit the rest to hide):
${widgetList}
VOCABULARY: array of {key,label}; keys are ${VOCAB_KEYS.join(", ")} with defaults ${VOCAB_KEYS.map(k => `${k}="${DEFAULT_LABELS[k]}"`).join(", ")}. Only include keys whose default doesn't fit.
THRESHOLDS: all five numbers; defaults ${JSON.stringify(DEFAULT_THRESHOLDS)}; tune to the org (gpa 0-4).
ROLES: 2-4 officer roles {name, rank 0-90, color hex, permissions: names from ${Object.keys(PERMISSIONS).join(", ")}}. Never propose the top admin role (added automatically at rank 100).`;
}

export async function POST(req: NextRequest) {
  // Membership gate (see ai/chat). This route doesn't read org data — it shapes a
  // setup recommendation from the request body — but gating keeps the AI surface
  // uniform and fail-closed. The founder has a membership immediately post-create.
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;

  if (!aiEnabled()) return Response.json({ enabled: false });

  const limited = checkMutationRate(ctx.actorId, 20, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { messages?: ClientMessage[]; orgType?: string } | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "Invalid request: messages required" }, { status: 400 });
  }

  // The org-type the founder picked at creation, used as the interview's prior.
  // getOrgType returns null for missing/unknown ids, so an absent or bogus value
  // simply falls back to a cold interview — no validation error needed.
  const template = getOrgType(typeof body.orgType === "string" ? body.orgType : null);

  const trimmed = body.messages
    .slice(-MAX_HISTORY_MSGS)
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string");
  const lastIdx = trimmed.length - 1;
  const history = trimmed.map((m, i) =>
    i === lastIdx || m.content.length <= MAX_PRIOR_CONTENT_CHARS
      ? m
      : { ...m, content: m.content.slice(0, MAX_PRIOR_CONTENT_CHARS) + "…" },
  );

  const openai = getOpenAI();
  if (!openai) return Response.json({ enabled: false });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildConversationPrompt(template) },
    ...history.map(m => ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
  ];

  // Over-ask guard: a hard server safety net so a runaway conversation can't
  // loop forever. We can't distinguish a real question from an answer to the
  // founder's own clarification, so this counts ALL assistant turns (minus the
  // client-side opening greeting) and only fires above HARD_TURN_CEILING — well
  // past the prompt's soft MAX_QUESTIONS target, leaving room for clarifications.
  const assistantTurns = history.filter(m => m.role === "assistant").length - 1;
  if (assistantTurns >= HARD_TURN_CEILING) {
    messages.push({
      role: "system",
      content: "This conversation has gone on long enough. Do not ask another question — call emit_setup_proposal now using what you know.",
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sseEvent(event, data)));
      try {
        // One completion: the model either streams a question (text) or calls the
        // single proposal tool. No multi-iteration loop — the proposal ends the turn.
        const toolCallsByIndex = new Map<number, { name: string; argsBuf: string }>();
        let streamedText = false; // did the model write any prose this turn?

        const completion = await openai.chat.completions.create({
          model: CHAT_MODEL,
          messages,
          tools: [SETUP_TOOL, CHOICES_TOOL],
          tool_choice: "auto",
          temperature: 0.3,
          max_completion_tokens: MAX_COMPLETION_TOKENS,
          stream: true,
        });

        // Idle watchdog — abort and bail if the stream stalls between chunks so
        // the SSE response can't hang. The throw lands in the catch below.
        for await (const chunk of withIdleTimeout(completion, STREAM_IDLE_MS, () => completion.controller.abort())) {
          const choice = chunk.choices[0];
          if (!choice) continue;
          const delta = choice.delta;
          if (typeof delta.content === "string" && delta.content.length > 0) {
            streamedText = true;
            send("text", { delta: delta.content });
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const slot = toolCallsByIndex.get(tc.index) ?? { name: "", argsBuf: "" };
              if (tc.function?.name) slot.name = tc.function.name;
              if (tc.function?.arguments) slot.argsBuf += tc.function.arguments;
              toolCallsByIndex.set(tc.index, slot);
            }
          }
        }

        // If the model emitted the proposal tool, validate + stream the proposal.
        const proposalCall = [...toolCallsByIndex.values()].find(t => t.name === "emit_setup_proposal");
        if (proposalCall) {
          let raw: RawSetupRecommendation | null = null;
          try {
            const parsed = JSON.parse(proposalCall.argsBuf || "{}");
            // Flatten vocabulary {key,label}[] → Record, mirroring recommendSetup.
            const vocabulary: Record<string, string> = {};
            if (Array.isArray(parsed.vocabulary)) {
              for (const p of parsed.vocabulary) {
                if (typeof p?.key === "string" && typeof p?.label === "string") vocabulary[p.key] = p.label;
              }
            }
            raw = {
              enabledWorkflows: Array.isArray(parsed.enabledWorkflows) ? parsed.enabledWorkflows.filter((x: unknown) => typeof x === "string") : [],
              shownWidgets: Array.isArray(parsed.shownWidgets) ? parsed.shownWidgets.filter((x: unknown) => typeof x === "string") : [],
              vocabulary,
              thresholds: parsed.thresholds && typeof parsed.thresholds === "object" ? parsed.thresholds : {},
              roles: Array.isArray(parsed.roles) ? parsed.roles : [],
              customMemberFields: Array.isArray(parsed.customMemberFields) ? parsed.customMemberFields : [],
              rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
            };
          } catch {
            raw = null;
          }
          if (raw) {
            send("proposal", { recommendation: validateRecommendation(raw) });
          }
        }

        // If the model asked via offer_choices, surface the warm acknowledgement +
        // question + one-tap answers. The ack and question live IN the tool (models
        // reliably route the whole turn into the tool call and skip prose), so we
        // emit them as a `text` event ourselves — but only if the model didn't
        // already stream that text. Choices: strings only, max 5, ≤60 chars, no blanks.
        const choicesCall = [...toolCallsByIndex.values()].find(t => t.name === "offer_choices");
        if (choicesCall && !proposalCall) {
          try {
            const parsed = JSON.parse(choicesCall.argsBuf || "{}");
            const choices = Array.isArray(parsed.choices)
              ? parsed.choices
                  .filter((c: unknown): c is string => typeof c === "string")
                  .map((c: string) => c.trim())
                  .filter((c: string) => c.length > 0 && c.length <= 60)
                  .slice(0, 5)
              : [];
            const ack = typeof parsed.ack === "string" ? parsed.ack.trim() : "";
            const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
            const multi = parsed.multi === true;
            // Join the acknowledgement and question into the visible message.
            const prose = [ack, question].filter(Boolean).join(" ");
            if (prose && !streamedText) send("text", { delta: prose });
            if (choices.length > 0) send("choices", { choices, multi });
          } catch {
            // malformed args — skip; if the model streamed text it still shows
          }
        }

        send("done", {});
      } catch (e) {
        if (e instanceof StreamIdleTimeoutError) {
          logError(e, { route: "/api/ai/setup-chat", method: "POST", userId: ctx.actorId, extra: { reason: "stream-idle-timeout" } });
          send("text", { delta: "\n\n(The response timed out. You can try again or set things up manually below.)" });
        } else {
          logError(e, { route: "/api/ai/setup-chat", method: "POST", userId: ctx.actorId });
          send("text", { delta: "\n\n(Sorry — I hit an error. You can set things up manually below.)" });
        }
        send("done", {});
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// GET — cheap "is AI configured?" probe (mirrors recommend-setup) so the
// onboarding page can decide whether to render the conversational step.
export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ enabled: aiEnabled() });
}
