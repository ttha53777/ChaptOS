/**
 * Offline eval harness for the "Ask the Chapter" chat feature.
 *
 * Drives the same tool-calling loop as app/api/ai/chat/route.ts but in-process
 * (no HTTP, no SSE) so each case is deterministic and fast. We share the
 * system prompt builder with the route via lib/ai-prompt.ts so a prompt change
 * in one can't silently desync from the other.
 *
 * Run:
 *   tsx scripts/eval-ask-the-chapter.ts
 *
 * Requires: OPENAI_API_KEY in .env.local, seeded dev DB (npx prisma db seed).
 * See evals/ask-the-chapter/README.md.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type OpenAI from "openai";

import { getOpenAI, CHAT_MODEL, aiEnabled } from "../lib/ai";
import {
  TOOLS,
  runTool,
  isReadTool,
  runProposal,
  isProposalTool,
  type Proposal,
} from "../lib/ai-tools";
import { buildSystemPrompt } from "../lib/ai-prompt";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface EvalCase {
  id: string;
  question: string;
  category?: string;
  /** Tool names the model should call. */
  expectedTools?: string[];
  /** Subset-match: for each tool, every listed arg key must be present with the
   *  listed value. Extra args on the call are allowed. */
  expectedToolArgs?: Record<string, Record<string, unknown>>;
  /**
   * How to interpret expectedTools:
   *  - "all"  (default): every listed tool must have been called.
   *  - "any":  at least one listed tool must have been called.
   *  - "exact": the set of called tools must equal the listed set.
   */
  toolMatch?: "all" | "any" | "exact";
  /** Case-insensitive substrings the final assistant text must contain. */
  mustInclude?: string[];
  /** Case-insensitive substrings the final assistant text must NOT contain. */
  mustNotInclude?: string[];
  /** Required for proposal cases: the `action` field on the emitted proposal. */
  expectedProposalAction?: string;
  /**
   * data    — model called read tools and wrote a normal answer
   * proposal — model emitted at least one proposal (and we surface a confirm card)
   * refuse  — model declined / said it can't help
   * clarify — model asked the user a question instead of answering
   */
  expectAnswerType: "data" | "proposal" | "refuse" | "clarify";
}

interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
}

interface TurnResult {
  caseId: string;
  question: string;
  pass: boolean;
  reasons: string[];
  finalText: string;
  toolCalls: ToolCallRecord[];
  proposals: Proposal[];
  iters: number;
  ms: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Driver: runs the same loop as the chat route, returns instrumentation
// ────────────────────────────────────────────────────────────────────────────

const MAX_ITERS = 10; // match route

async function runCase(c: EvalCase, openai: OpenAI, systemPrompt: string, orgId: number): Promise<TurnResult> {
  const t0 = Date.now();
  const toolCalls: ToolCallRecord[] = [];
  const proposals: Proposal[] = [];
  let finalText = "";
  let iters = 0;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: c.question },
  ];

  for (let i = 0; i < MAX_ITERS; i++) {
    iters = i + 1;
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      parallel_tool_calls: true,
      temperature: 0.3,
      max_tokens: 400,
      // Non-streaming in the eval — we don't need progressive tokens, and the
      // non-streaming response is easier to parse. The model behavior is the
      // same; only the transport differs.
      stream: false,
    });

    const msg = completion.choices[0]?.message;
    if (!msg) break;

    const content = typeof msg.content === "string" ? msg.content : "";
    // The OpenAI SDK's tool_calls union includes a "custom" variant that has no
    // `function` field. We only register `function`-typed tools, so any other
    // variant is unreachable in practice — narrow and drop the rest.
    const calls = (msg.tool_calls ?? []).filter(
      (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
        tc.type === "function",
    );

    if (calls.length === 0) {
      finalText = content;
      break;
    }

    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: calls.map(tc => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    });

    const results = await Promise.all(calls.map(async tc => {
      let args: Record<string, unknown> = {};
      try { args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}; }
      catch { args = { _parse_error: tc.function.arguments }; }
      toolCalls.push({ name: tc.function.name, args });

      let payload: unknown;
      if (isReadTool(tc.function.name)) {
        payload = await runTool(tc.function.name, args, orgId);
      } else if (isProposalTool(tc.function.name)) {
        const p = runProposal(tc.function.name, args);
        if ("error" in p) {
          payload = p;
        } else {
          proposals.push(p);
          payload = {
            status: "awaiting_user_confirmation",
            summary: p.summary,
            note: "A confirm card has been shown to the user. Do not claim the action is complete. Reply briefly (≤1 short sentence) acknowledging the proposal.",
          };
        }
      } else {
        payload = { error: `Unknown tool: ${tc.function.name}` };
      }
      return { id: tc.id, payload };
    }));

    for (const r of results) {
      messages.push({ role: "tool", tool_call_id: r.id, content: JSON.stringify(r.payload) });
    }
  }

  const grade = grade_case(c, { toolCalls, proposals, finalText });

  return {
    caseId: c.id,
    question: c.question,
    pass: grade.pass,
    reasons: grade.reasons,
    finalText,
    toolCalls,
    proposals,
    iters,
    ms: Date.now() - t0,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Grading
// ────────────────────────────────────────────────────────────────────────────

const REFUSAL_HINTS = [
  "can't help",
  "cannot help",
  "outside",
  "out of scope",
  "don't have",
  "do not have",
  "not able to",
  "unable to",
  "not something i can",
  "not within",
];

const CLARIFY_HINTS = ["which one", "could you clarify", "do you mean", "?"];

function grade_case(
  c: EvalCase,
  obs: { toolCalls: ToolCallRecord[]; proposals: Proposal[]; finalText: string },
): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = (obs.finalText || "").toLowerCase();
  const calledNames = obs.toolCalls.map(t => t.name);
  const calledSet = new Set(calledNames);

  // Tool-call assertions
  if (c.expectedTools && c.expectedTools.length > 0) {
    const mode = c.toolMatch ?? "all";
    if (mode === "all") {
      const missing = c.expectedTools.filter(t => !calledSet.has(t));
      if (missing.length > 0) reasons.push(`missing tool(s): ${missing.join(", ")}`);
    } else if (mode === "any") {
      if (!c.expectedTools.some(t => calledSet.has(t))) {
        reasons.push(`expected ANY of [${c.expectedTools.join(", ")}], called [${calledNames.join(", ") || "none"}]`);
      }
    } else if (mode === "exact") {
      const expected = new Set(c.expectedTools);
      const extra = [...calledSet].filter(t => !expected.has(t));
      const missing = [...expected].filter(t => !calledSet.has(t));
      if (extra.length || missing.length) {
        reasons.push(`tool set mismatch — missing: [${missing.join(", ")}], extra: [${extra.join(", ")}]`);
      }
    }
  } else if (c.expectAnswerType === "refuse") {
    if (calledNames.length > 0) reasons.push(`refusal case but model called: ${calledNames.join(", ")}`);
  }

  // Tool-args assertions (subset match)
  if (c.expectedToolArgs) {
    for (const [toolName, expectedArgs] of Object.entries(c.expectedToolArgs)) {
      const call = obs.toolCalls.find(t => t.name === toolName);
      if (!call) {
        reasons.push(`expected args on ${toolName} but tool was not called`);
        continue;
      }
      for (const [key, expectedVal] of Object.entries(expectedArgs)) {
        const actual = call.args[key];
        if (!valuesMatch(actual, expectedVal)) {
          reasons.push(`${toolName}.${key}: expected ${JSON.stringify(expectedVal)}, got ${JSON.stringify(actual)}`);
        }
      }
    }
  }

  // Substring assertions
  for (const need of c.mustInclude ?? []) {
    if (!text.includes(need.toLowerCase())) reasons.push(`mustInclude missing: "${need}"`);
  }
  for (const avoid of c.mustNotInclude ?? []) {
    if (text.includes(avoid.toLowerCase())) reasons.push(`mustNotInclude present: "${avoid}"`);
  }

  // Answer-type assertions
  switch (c.expectAnswerType) {
    case "proposal":
      if (obs.proposals.length === 0) reasons.push("expected a proposal but none emitted");
      if (c.expectedProposalAction && !obs.proposals.some(p => p.action === c.expectedProposalAction)) {
        reasons.push(`expected proposal action ${c.expectedProposalAction}, got [${obs.proposals.map(p => p.action).join(", ")}]`);
      }
      break;
    case "refuse":
      if (!REFUSAL_HINTS.some(h => text.includes(h))) reasons.push("expected refusal language not found");
      break;
    case "clarify":
      if (!CLARIFY_HINTS.some(h => text.includes(h))) reasons.push("expected a clarifying question");
      break;
    case "data":
      // Data answers just need to be non-empty and not refuse.
      if (!obs.finalText.trim() && obs.proposals.length === 0) reasons.push("empty answer");
      if (REFUSAL_HINTS.some(h => text.includes(h))) reasons.push("model refused on a data case");
      break;
  }

  return { pass: reasons.length === 0, reasons };
}

function valuesMatch(actual: unknown, expected: unknown): boolean {
  if (typeof expected === "string" && typeof actual === "string") {
    return actual.toLowerCase() === expected.toLowerCase();
  }
  return actual === expected;
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!aiEnabled()) {
    console.error("OPENAI_API_KEY not set in .env.local — cannot run eval.");
    process.exit(2);
  }
  const maybeClient = getOpenAI();
  if (!maybeClient) { console.error("OpenAI client unavailable."); process.exit(2); return; }
  const openai: OpenAI = maybeClient;

  const casesPath = resolve(__dirname, "../evals/ask-the-chapter/cases.jsonl");
  const cases = readFileSync(casesPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line, i) => {
      try { return JSON.parse(line) as EvalCase; }
      catch (e) { throw new Error(`cases.jsonl line ${i + 1}: ${(e as Error).message}`); }
    });

  // Pin the date the model sees so cases that reference "this week" stay
  // reproducible across days. The actual DB is whatever the dev has seeded.
  // EVAL_ORG_ID defaults to 1 (the seed org in dev); override via env var if needed.
  const EVAL_ORG_ID = Number(process.env.EVAL_ORG_ID ?? 1);
  const PINNED_DATE = new Date("2026-05-23T12:00:00Z");
  const systemPrompt = await buildSystemPrompt(EVAL_ORG_ID, PINNED_DATE);

  console.log(`Model: ${CHAT_MODEL}`);
  console.log(`Cases: ${cases.length}`);
  console.log(`Pinned date: ${PINNED_DATE.toISOString().slice(0, 10)}`);
  console.log("");

  const results: TurnResult[] = [];
  // Run concurrently — independent cases, big wall-clock win. Cap at 4 to keep
  // OpenAI rate limits and DB pool happy.
  const CONCURRENCY = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < cases.length) {
      const i = cursor++;
      try {
        const r = await runCase(cases[i], openai, systemPrompt, EVAL_ORG_ID);
        results[i] = r;
        const mark = r.pass ? "PASS" : "FAIL";
        process.stdout.write(`[${mark}] ${cases[i].id} (${r.ms}ms, ${r.iters} iter)\n`);
        if (!r.pass) {
          for (const reason of r.reasons) process.stdout.write(`        ↳ ${reason}\n`);
        }
      } catch (e) {
        results[i] = {
          caseId: cases[i].id,
          question: cases[i].question,
          pass: false,
          reasons: [`runtime error: ${(e as Error).message}`],
          finalText: "",
          toolCalls: [],
          proposals: [],
          iters: 0,
          ms: 0,
        };
        process.stdout.write(`[ERR ] ${cases[i].id}: ${(e as Error).message}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  const pct = total === 0 ? 0 : Math.round((passed / total) * 1000) / 10;

  console.log("");
  console.log("──────────────────────────────────");
  console.log(`Score: ${passed}/${total}  (${pct}%)`);
  console.log("──────────────────────────────────");

  // Group failures by category for at-a-glance pattern spotting
  const failsByCategory = new Map<string, number>();
  for (let i = 0; i < cases.length; i++) {
    if (!results[i].pass) {
      const cat = cases[i].category ?? "uncategorized";
      failsByCategory.set(cat, (failsByCategory.get(cat) ?? 0) + 1);
    }
  }
  if (failsByCategory.size > 0) {
    console.log("Failures by category:");
    for (const [cat, n] of [...failsByCategory.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat}: ${n}`);
    }
  }

  // Exit code: 0 if everything passes, 1 otherwise (useful for CI later).
  process.exit(passed === total ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
