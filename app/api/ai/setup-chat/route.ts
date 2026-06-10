import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { requireUser } from "@/lib/auth/require-user";
import { checkMutationRate } from "@/lib/rate-limit";
import { aiEnabled, getOpenAI, CHAT_MODEL, MAX_COMPLETION_TOKENS, type RawSetupRecommendation } from "@/lib/ai";
import { ALL_WORKFLOWS } from "@/lib/org-types";
import { WORKFLOW_FEATURES } from "@/lib/workflow-features";
import { VOCAB_KEYS, DEFAULT_LABELS } from "@/lib/vocab";
import { PERMISSIONS } from "@/lib/permissions";
import { DEFAULT_THRESHOLDS } from "@/lib/thresholds";
import { validateRecommendation } from "@/app/api/ai/recommend-setup/route";
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

const MAX_HISTORY_MSGS = 8;
const MAX_PRIOR_CONTENT_CHARS = 800;

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

// Grounded conversation system prompt: the same option registries the single-shot
// step uses, plus the conversation rules.
function buildConversationPrompt(): string {
  const widgetList = WORKFLOW_FEATURES.operations.map(f => `  - ${f.id}: ${f.label}`).join("\n");
  return `You are a friendly setup assistant for a multi-purpose organization operations app. Help a founder configure their new organization through a SHORT conversation.

Rules:
- The founder's FIRST message describes their organization. As soon as you have that, call emit_setup_proposal exactly once — do NOT ask follow-up questions when the description is usable.
- Only ask ONE short clarifying question if the first message is empty or truly unusable (e.g. "ok", a greeting); otherwise propose immediately.
- Before emitting the proposal you may write ONE short warm sentence (e.g. "Got it — here's a setup for your soccer club:"). Keep all prose short. No markdown.

When you call emit_setup_proposal, choose ONLY from these exact ids/keys:
WORKFLOWS: ${ALL_WORKFLOWS.join(", ")} (always include "operations").
WIDGETS to SHOW (omit the rest to hide):
${widgetList}
VOCABULARY: array of {key,label}; keys are ${VOCAB_KEYS.join(", ")} with defaults ${VOCAB_KEYS.map(k => `${k}="${DEFAULT_LABELS[k]}"`).join(", ")}. Only include keys whose default doesn't fit.
THRESHOLDS: all five numbers; defaults ${JSON.stringify(DEFAULT_THRESHOLDS)}; tune to the org (gpa 0-4).
ROLES: 2-4 officer roles {name, rank 0-90, color hex, permissions: names from ${Object.keys(PERMISSIONS).join(", ")}}. Never propose the top admin role (added automatically at rank 100).`;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!aiEnabled()) return Response.json({ enabled: false });

  const limited = checkMutationRate(user.id, 20, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { messages?: ClientMessage[] } | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "Invalid request: messages required" }, { status: 400 });
  }

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
    { role: "system", content: buildConversationPrompt() },
    ...history.map(m => ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sseEvent(event, data)));
      try {
        // One completion: the model either streams a question (text) or calls the
        // single proposal tool. No multi-iteration loop — the proposal ends the turn.
        const toolCallsByIndex = new Map<number, { name: string; argsBuf: string }>();

        const completion = await openai.chat.completions.create({
          model: CHAT_MODEL,
          messages,
          tools: [SETUP_TOOL],
          tool_choice: "auto",
          temperature: 0.3,
          max_completion_tokens: MAX_COMPLETION_TOKENS,
          stream: true,
        });

        for await (const chunk of completion) {
          const choice = chunk.choices[0];
          if (!choice) continue;
          const delta = choice.delta;
          if (typeof delta.content === "string" && delta.content.length > 0) {
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
              rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
            };
          } catch {
            raw = null;
          }
          if (raw) {
            send("proposal", { recommendation: validateRecommendation(raw) });
          }
        }

        send("done", {});
      } catch (e) {
        logError(e, { route: "/api/ai/setup-chat", method: "POST", userId: user.id });
        send("text", { delta: "\n\n(Sorry — I hit an error. You can set things up manually below.)" });
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
