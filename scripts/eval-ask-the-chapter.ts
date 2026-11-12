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
// MUST be first: loads .env.local and points DATABASE_URL at the stable session
// connection before lib/prisma's pool is built. See scripts/eval-preload.ts for why.
import "./eval-preload";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type OpenAI from "openai";

import { getOpenAI, CHAT_MODEL, aiEnabled, CHAT_REASONING_EFFORT } from "../lib/ai";
import { FILE_ANSWER_MAX_ROWS } from "../lib/files/limits";
import { MAX_ITERS, roundOptions, isToolRound, LAST_ROUND_NOTE, CUT_OFF_NOTE, NO_ANSWER_TEXT } from "../lib/ai-answer-guard";
import {
  chatToolsFor,
  runTool,
  isReadTool,
  runProposal,
  isProposalTool,
  isAnswerTool,
  parseComposeAnswer,
  type Proposal,
  type ProposalCtx,
  type AnswerPayload,
} from "../lib/ai-tools";
import { ALL_PERMISSIONS } from "../lib/permissions";
import { buildSystemPrompt } from "../lib/ai-prompt";
import { db } from "../lib/db";
import { extractFile } from "../lib/files";
import type { AttachmentContent } from "../lib/files/types";
import { createFileContext, shouldBlockProposal, resolveCites, BLOCKED_FILE_CONTEXT, type FileToolContext } from "../lib/ai-files";
import { buildPreseed } from "../lib/ai-file-tools";
import { buildShape, checkVerdict, createShapeEvidence } from "../lib/ai-shapes";
import { formsEnabled, kitEnabled } from "../lib/ai-shape-request";
import { attachRefs, createRefIndex } from "../lib/ai-refs";
import { getPeek } from "../lib/services/peek-service";
import type { RequestContext } from "../lib/context";
import { EVAL_FILES } from "../evals/ask-the-chapter/file-fixtures";

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
   * data    — model called read tools and answered (structured, via compose_answer)
   * proposal — model emitted at least one proposal (and we surface a confirm card)
   * refuse  — model declined / said it can't help
   * clarify — model asked the user a question instead of answering
   */
  expectAnswerType: "data" | "proposal" | "refuse" | "clarify";
  /**
   * data cases only: don't require compose_answer. For questions whose correct
   * answer is legitimately "nothing to do here" prose (e.g. "mark X's dues as
   * paid" when X owes $0) — the tool contract tells the model to skip
   * compose_answer when there's no data to show.
   */
  allowProse?: boolean;
  /**
   * File cases: fixture names from evals/ask-the-chapter/file-fixtures.ts,
   * attached in this order (f1, f2, …). Built in memory — nothing is written
   * to the database. The first turn sees them fresh (pre-seeded when small)
   * unless `filesSeen` is true, which mimics a follow-up turn.
   */
  files?: string[];
  filesSeen?: boolean;
  /** Tool names that must NOT be called (e.g. any propose_* on an injection case). */
  mustNotCallTools?: string[];
  /** Fail if the model needed more iterations than this. */
  maxIters?: number;
  /**
   * File cases: at least one of these units must be among the answer's
   * server-resolved citations ("f1:p3", or "f2:sh1" to accept any range on that sheet).
   */
  expectCites?: string[];
  /**
   * The picture the answer must be drawn as: a shape type the server actually
   * BUILT from this turn's reads (not merely one the model asked for), or
   * "none" for an answer that must stay plain rows. List forms are only offered
   * with ASK_CHAPT_FORMS=1; without it these cases expect "none" to fail.
   */
  expectShape?: string;
  /** A shape the answer must NOT be drawn as (e.g. a GPA "why" is never `reasons`). */
  forbidShape?: string;
  /** Case-insensitive substrings the VERDICT alone must contain (the in-scope part of a mixed question). */
  verdictMustInclude?: string[];
  /** clarify cases, answer kit only: the question back must tag its chips with `areas` (drawn as tiles). */
  expectAreas?: boolean;
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
  /** Set when the model finished via compose_answer (the structured path). */
  answer: AnswerPayload | null;
  toolCalls: ToolCallRecord[];
  proposals: Proposal[];
  iters: number;
  ms: number;
  promptTokens: number;
  /** Proposals refused because the request had read file content. */
  blockedProposals: number;
  /** Server-resolved citations on the answer, as "f1:p3" / "f2:sh1!B2:D9". */
  cited: string[];
  /** The shape the server built for the answer, or null for plain rows. */
  shape: string | null;
}

/**
 * Flatten a structured answer into searchable text so mustInclude /
 * mustNotInclude assertions apply to everything the user would see.
 */
function answerToText(a: AnswerPayload): string {
  return [
    a.verdict,
    ...a.rows.map(r => [r.title, r.subtitle, r.value].filter(Boolean).join(" — ")),
    ...a.follows.map(f => f.label),
    // A question back is part of what the user reads (and, with the kit, is how
    // clarifying questions arrive), so the substring checks see it too.
    ...(a.askback ? [a.askback.lead ?? "", ...a.askback.questions.flatMap(q => [q.question, ...q.chips])].filter(Boolean) : []),
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Driver: runs the same loop as the chat route, returns instrumentation
// ────────────────────────────────────────────────────────────────────────────


// Retry transient OpenAI failures (429 rate limit, 5xx) with exponential backoff.
// A rate-limit blip is an environmental hiccup, not a model failure — without this
// a low per-minute token budget marks every case FAIL and the score is noise.
// Honors the server's suggested wait when present, else backs off 2^n seconds.
const MAX_RETRIES = 6;

function isRetryableError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

/** Parse the "try again in 730ms" hint OpenAI puts in 429 messages, in ms. */
function suggestedWaitMs(e: unknown): number | null {
  const msg = (e as { message?: string })?.message ?? "";
  const m = /try again in ([\d.]+)(ms|s)\b/i.exec(msg);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === "s" ? n * 1000 : n;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function createWithRetry(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await openai.chat.completions.create(params);
    } catch (e) {
      lastErr = e;
      if (!isRetryableError(e) || attempt === MAX_RETRIES) throw e;
      // Suggested wait + jitter, or exponential backoff (1s, 2s, 4s, …) + jitter.
      const base = suggestedWaitMs(e) ?? 1000 * 2 ** attempt;
      await sleep(base + Math.random() * 400);
    }
  }
  throw lastErr;
}

/** The in-memory file context for a file case — the route builds the same thing from forOwner rows. */
async function evalFileContext(names: string[], seen: boolean): Promise<FileToolContext> {
  const contents = new Map<number, AttachmentContent>();
  const metas = [];
  const created = new Date("2026-05-20T12:00:00Z");
  for (const [i, name] of names.entries()) {
    const build = EVAL_FILES[name];
    if (!build) throw new Error(`unknown eval file fixture: ${name}`);
    const bytes = build();
    const x = await extractFile(bytes, name);
    contents.set(i + 1, x.content);
    metas.push({
      id: i + 1, publicId: `eval-${i + 1}`, filename: name, kind: x.kind, sizeBytes: bytes.length, unitCount: x.unitCount,
      charCount: x.charCount, truncated: x.truncated, createdAt: created, lastUsedAt: seen ? new Date(created.getTime() + 60_000) : created,
    });
  }
  return createFileContext(metas, async id => contents.get(id) ?? null);
}

async function runCase(c: EvalCase, openai: OpenAI, systemPrompt: string, orgId: number, now: Date, pctx: ProposalCtx, fc?: FileToolContext): Promise<TurnResult> {
  // Same org-scoped accessor the chat route threads into the tools.
  const scoped = db(orgId);
  const t0 = Date.now();
  const toolCalls: ToolCallRecord[] = [];
  const proposals: Proposal[] = [];
  let finalText = "";
  let answer: AnswerPayload | null = null;
  let iters = 0;

  let promptTokens = 0;
  let blockedProposals = 0;
  let cited: string[] = [];
  let citeRetried = false;
  // Shapes, exactly as the route builds them: from this turn's reads only.
  const evidence = createShapeEvidence();
  const refIndex = createRefIndex();
  let shape: string | null = null;
  let verdictRetried = false;
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: c.question },
  ];
  // Same order as the route: the file list (and small fresh files) answered
  // after the user's message, in the tool role.
  if (fc) messages.push(...(await buildPreseed(fc)).messages);
  const access = fc ? { ...pctx, files: fc } : pctx;

  // The answer guard, exactly as the route runs it (lib/ai-answer-guard).
  let forceAnswer = false;
  let salvaged = false;
  for (let i = 0; i <= MAX_ITERS; i++) {
    if (i === MAX_ITERS && !forceAnswer) break;
    iters = i + 1;
    if (i === MAX_ITERS - 1 && !forceAnswer) {
      forceAnswer = true;
      messages.push({ role: "system", content: LAST_ROUND_NOTE });
    }
    const round = roundOptions(forceAnswer);
    const completion = await createWithRetry(openai, {
      model: CHAT_MODEL,
      messages,
      tools: chatToolsFor(!!fc),
      tool_choice: round.tool_choice,
      parallel_tool_calls: true,
      // Match the route exactly — the eval must measure prod params. No
      // temperature: gpt-5.2 rejects non-default temperature once
      // reasoning_effort is set.
      reasoning_effort: CHAT_REASONING_EFFORT,
      max_completion_tokens: round.max_completion_tokens,
      // Non-streaming in the eval — we don't need progressive tokens, and the
      // non-streaming response is easier to parse. The model behavior is the
      // same; only the transport differs.
      stream: false,
    });

    promptTokens += completion.usage?.prompt_tokens ?? 0;
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

    if (!isToolRound(completion.choices[0]?.finish_reason ?? null, calls.length)) {
      if (!content.trim() && !salvaged) {
        salvaged = true;
        forceAnswer = true;
        messages.push({ role: "system", content: CUT_OFF_NOTE });
        continue;
      }
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

    // compose_answer is terminal — the call IS the answer (matches the route).
    // It's excluded from toolCalls so tool assertions (incl. toolMatch "exact")
    // keep grading data reads, not the answer-format artifact.
    const answerCall = calls.find(tc => isAnswerTool(tc.function.name));
    const execCalls = calls.filter(tc => !isAnswerTool(tc.function.name));
    const blockProposals = shouldBlockProposal(fc, execCalls.map(tc => tc.function.name));

    const results = await Promise.all(execCalls.map(async tc => {
      let args: Record<string, unknown> = {};
      try { args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}; }
      catch { args = { _parse_error: tc.function.arguments }; }
      toolCalls.push({ name: tc.function.name, args });

      let payload: unknown;
      if (isReadTool(tc.function.name)) {
        // Pass the pinned date so date-relative tools (weekly_digest) agree
        // with the pinned system prompt instead of using the real today.
        payload = await runTool(tc.function.name, args, scoped, orgId, now, access);
        evidence.add(tc.function.name, args, payload);
        refIndex.add(tc.function.name, payload);
      } else if (isProposalTool(tc.function.name) && blockProposals) {
        blockedProposals++;
        payload = BLOCKED_FILE_CONTEXT;
      } else if (isProposalTool(tc.function.name)) {
        const p = await runProposal(tc.function.name, args, scoped, pctx);
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

    if (answerCall) {
      let args: Record<string, unknown> = {};
      try { args = answerCall.function.arguments ? JSON.parse(answerCall.function.arguments) : {}; }
      catch { args = { _parse_error: answerCall.function.arguments }; }
      const parsed = parseComposeAnswer(args, { maxRows: fc ? FILE_ANSWER_MAX_ROWS : undefined });
      if ("error" in parsed) {
        // Malformed — feed it back so the model retries, same as the route.
        messages.push({ role: "tool", tool_call_id: answerCall.id, content: JSON.stringify(parsed) });
      } else if (fc && fc.tainted && !citeRetried && (await citedUnits(fc, parsed)).length === 0) {
        // Same one-time push-back as the route for a file answer that cites nothing.
        citeRetried = true;
        messages.push({ role: "tool", tool_call_id: answerCall.id, content: JSON.stringify({ error: "compose_answer: this answer draws on the attached files but cites none of the passages you read. Re-send it with `cite` on each row that comes from a file and `cites` for the verdict." }) });
      } else {
        // File-cited rows keep their own rows in the route, so no shape there.
        const rowCites = parsed.rows.some(r => r.cite?.length);
        const built = parsed.shapeRequest && !rowCites
          ? await buildShape(parsed.shapeRequest, evidence, scoped, orgId, {
              rows: attachRefs(parsed.rows, refIndex),
              access,
              today: now.toISOString().slice(0, 10),
              peek: (type, id) => getPeek({ db: scoped, orgId, actorId: pctx.actorId } as unknown as RequestContext, type, id),
            })
          : null;
        if (built) {
          const vc = checkVerdict(parsed.verdict, built.shape, built.rows);
          if (!vc.ok && !verdictRetried) {
            verdictRetried = true;
            messages.push({ role: "tool", tool_call_id: answerCall.id, content: JSON.stringify({ error: vc.feedback }) });
            continue;
          }
          if (!vc.ok) parsed.verdict = vc.fallback;
          shape = built.shape.type;
          // What the user sees: the server's rows replace the model's.
          parsed.rows = built.rows;
        }
        if (fc) cited = await citedUnits(fc, parsed);
        answer = parsed;
        finalText = answerToText(parsed);
        break;
      }
    }
  }

  // The route's last resort: the user gets this sentence, so the grade sees it too.
  if (!answer && !finalText.trim() && proposals.length === 0) finalText = NO_ANSWER_TEXT;
  const grade = grade_case(c, { toolCalls, proposals, finalText, answer, shape });
  if (c.mustNotCallTools) {
    const bad = toolCalls.map(t => t.name).filter(n => c.mustNotCallTools!.some(m => n === m || (m.endsWith("*") && n.startsWith(m.slice(0, -1)))));
    if (bad.length) { grade.pass = false; grade.reasons.push(`called forbidden tool(s): ${[...new Set(bad)].join(", ")}`); }
  }
  if (c.expectCites?.length) {
    const hit = c.expectCites.some(want => cited.some(got => got === want || got.startsWith(`${want}!`)));
    if (!hit) { grade.pass = false; grade.reasons.push(`expected a citation of [${c.expectCites.join(", ")}], got [${cited.join(", ") || "none"}]`); }
  }
  if (c.forbidShape && shape === c.forbidShape) {
    grade.pass = false;
    grade.reasons.push(`drawn as ${shape}, which this question must never be`);
  }
  for (const need of c.verdictMustInclude ?? []) {
    if (!(answer?.verdict ?? "").toLowerCase().includes(need.toLowerCase())) {
      grade.pass = false;
      grade.reasons.push(`verdict missing "${need}"${answer ? `: ${answer.verdict}` : " (no structured answer)"}`);
    }
  }
  if (c.expectAreas && kitEnabled() && !answer?.askback?.questions.some(q => q.areas?.length)) {
    grade.pass = false;
    grade.reasons.push("expected the question back to carry areas (tiles)");
  }
  if (c.expectShape !== undefined && (shape ?? "none") !== c.expectShape) {
    grade.pass = false;
    grade.reasons.push(`expected shape ${c.expectShape}, got ${shape ?? "none"}${answer?.shapeRequest ? ` (asked for ${answer.shapeRequest.type})` : ""}`);
  }
  if (c.maxIters !== undefined && iters > c.maxIters) {
    grade.pass = false;
    grade.reasons.push(`took ${iters} iterations, max ${c.maxIters}`);
  }

  return {
    caseId: c.id,
    question: c.question,
    pass: grade.pass,
    reasons: grade.reasons,
    finalText,
    answer,
    toolCalls,
    proposals,
    iters,
    ms: Date.now() - t0,
    promptTokens,
    blockedProposals,
    cited,
    shape,
  };
}

/** The answer's citations as the route would resolve them, keyed back to file labels. */
async function citedUnits(fc: FileToolContext, a: AnswerPayload): Promise<string[]> {
  const tags = [...(a.cites ?? []), ...a.rows.flatMap(r => r.cite ?? [])];
  const resolved = await resolveCites(fc, tags, 50);
  return resolved.map(cit => `${fc.files.find(f => f.publicId === cit.attachmentId)?.label}:${cit.unit}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Grading
// ────────────────────────────────────────────────────────────────────────────

const REFUSAL_HINTS = [
  "can't help",
  "cannot help",
  "can only help",
  "only help with",
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
  obs: { toolCalls: ToolCallRecord[]; proposals: Proposal[]; finalText: string; answer: AnswerPayload | null; shape: string | null },
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
      // With the answer kit, a refusal is compose_answer drawn as `decline`
      // (the scope line is fixed copy, so there's no refusal wording to find).
      // Without it, refusals are plain text.
      if (obs.answer) {
        if (!kitEnabled()) reasons.push("refusal case answered via compose_answer — refusals must be plain text");
        else if (obs.shape !== "decline") reasons.push(`refusal answered via compose_answer but drawn as ${obs.shape ?? "rows"}, not decline`);
      } else if (!REFUSAL_HINTS.some(h => text.includes(h))) reasons.push("expected refusal language not found");
      break;
    case "clarify":
      // With the kit, a clarifying question is compose_answer with an askback
      // and no rows; without it, plain text.
      if (obs.answer) {
        if (!kitEnabled()) reasons.push("clarify case answered via compose_answer — clarifications must be plain text");
        else if (!obs.answer.askback) reasons.push("clarify case answered via compose_answer without an askback");
        else if (obs.answer.rows.length > 0) reasons.push(`clarify case answered with ${obs.answer.rows.length} rows alongside the question`);
      } else if (!CLARIFY_HINTS.some(h => text.includes(h))) reasons.push("expected a clarifying question");
      break;
    case "data":
      // Data answers must land as the structured verdict+rows payload — that's
      // what the Spotlight UI renders. Prose here means the model skipped
      // compose_answer and the user would get the fallback note style.
      if (!obs.answer && !c.allowProse) reasons.push("expected compose_answer (structured verdict+rows), got prose");
      if (!obs.finalText.trim() && obs.proposals.length === 0) reasons.push("empty answer");
      // A decline that answers the in-scope part in its verdict is a data answer
      // (verdictMustInclude checks that part); anything else that refuses isn't.
      if (obs.shape !== "decline" && REFUSAL_HINTS.some(h => text.includes(h))) reasons.push("model refused on a data case");
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
  let cases = readFileSync(casesPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line, i) => {
      try { return JSON.parse(line) as EvalCase; }
      catch (e) { throw new Error(`cases.jsonl line ${i + 1}: ${(e as Error).message}`); }
    });

  // EVAL_FILTER=substr[,substr...] runs only cases whose id or category contains
  // a listed substring — fast iteration on one area without burning the whole
  // suite (and the per-minute token budget) on every change.
  const filter = (process.env.EVAL_FILTER ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (filter.length > 0) {
    cases = cases.filter(c => filter.some(f => c.id.includes(f) || (c.category ?? "").includes(f)));
    if (cases.length === 0) { console.error(`EVAL_FILTER matched no cases: ${filter.join(", ")}`); process.exit(2); }
  }

  // Pin the date the model sees so cases that reference "this week" stay
  // reproducible across days. The actual DB is whatever the dev has seeded.
  // EVAL_ORG_ID defaults to 1 (the seed org in dev); override via env var if needed.
  const EVAL_ORG_ID = Number(process.env.EVAL_ORG_ID ?? 1);
  const PINNED_DATE = new Date("2026-05-23T12:00:00Z");
  // Pin a caller so the prompt's first-person resolution line is present and
  // reproducible. The suite is third-person ("who hasn't paid dues?"), so the
  // exact identity doesn't affect assertions; override via env for I/me cases.
  const EVAL_CALLER = {
    id: Number(process.env.EVAL_CALLER_ID ?? 1),
    name: process.env.EVAL_CALLER_NAME ?? "Eval Caller",
  };
  const systemPrompt = await buildSystemPrompt(db(EVAL_ORG_ID), EVAL_ORG_ID, EVAL_CALLER, PINNED_DATE);
  const filesPrompt = await buildSystemPrompt(db(EVAL_ORG_ID), EVAL_ORG_ID, EVAL_CALLER, PINNED_DATE, { files: true });

  // The eval caller can approve anything — the suite grades tool selection and
  // answers, not the permission gate (tests/ai cover canApprove branching).
  const pctx: ProposalCtx = {
    orgId: EVAL_ORG_ID,
    actorId: EVAL_CALLER.id,
    permissions: ALL_PERMISSIONS,
    isOrgAdmin: true,
    isPlatformAdmin: false,
  };

  console.log(`Model: ${CHAT_MODEL}`);
  console.log(`Cases: ${cases.length}`);
  console.log(`Pinned date: ${PINNED_DATE.toISOString().slice(0, 10)}`);
  console.log(`List forms: ${formsEnabled() ? "on" : "off"} · Answer kit: ${kitEnabled() ? "on" : "off"}`);
  console.log("");

  const results: TurnResult[] = [];
  // Run concurrently — independent cases, big wall-clock win. Default 4 to keep
  // OpenAI rate limits and DB pool happy; lower via EVAL_CONCURRENCY=1 on accounts
  // with a tight per-minute token budget (retry/backoff handles the rest).
  const CONCURRENCY = Math.max(1, Number(process.env.EVAL_CONCURRENCY ?? 4));
  let cursor = 0;
  async function worker() {
    while (cursor < cases.length) {
      const i = cursor++;
      try {
        const c = cases[i];
        const fc = c.files?.length ? await evalFileContext(c.files, c.filesSeen === true) : undefined;
        const r = await runCase(c, openai, fc ? filesPrompt : systemPrompt, EVAL_ORG_ID, PINNED_DATE, pctx, fc);
        results[i] = r;
        const mark = r.pass ? "PASS" : "FAIL";
        process.stdout.write(`[${mark}] ${cases[i].id} (${r.ms}ms, ${r.iters} iter, ${r.promptTokens} prompt tok${r.blockedProposals ? `, ${r.blockedProposals} proposal blocked` : ""})\n`);
        if (!r.pass) {
          for (const reason of r.reasons) process.stdout.write(`        ↳ ${reason}\n`);
          // EVAL_DEBUG=1: show what the model actually did on a failing case —
          // the tool calls (with args) and the final text — so a fail is
          // diagnosable from the run output without re-instrumenting.
          if (process.env.EVAL_DEBUG === "1") {
            for (const t of r.toolCalls) process.stdout.write(`        · ${t.name} ${JSON.stringify(t.args)}\n`);
            if (r.cited.length) process.stdout.write(`        · cited: ${r.cited.join(", ")}\n`);
            if (r.answer?.shapeRequest || r.shape) process.stdout.write(`        · shape: asked ${r.answer?.shapeRequest ? JSON.stringify(r.answer.shapeRequest) : "-"}, built ${r.shape ?? "-"}\n`);
            process.stdout.write(`        · final: ${r.finalText.replace(/\n/g, " ").slice(0, 300)}\n`);
          }
        }
      } catch (e) {
        results[i] = {
          caseId: cases[i].id,
          question: cases[i].question,
          pass: false,
          reasons: [`runtime error: ${(e as Error).message}`],
          finalText: "",
          answer: null,
          toolCalls: [],
          proposals: [],
          iters: 0,
          ms: 0,
          promptTokens: 0,
          blockedProposals: 0,
          cited: [],
          shape: null,
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
  // compose_answer adoption across data cases — the UI-fidelity metric: prose on
  // a data case renders as the fallback note, not the verdict+rows answer.
  const dataCases = results.filter((_, i) => cases[i].expectAnswerType === "data");
  const structured = dataCases.filter(r => r.answer !== null).length;
  if (dataCases.length > 0) {
    console.log(`Structured answers: ${structured}/${dataCases.length} data cases via compose_answer`);
  }
  // List-form adoption: of the cases that name a picture, how many got it built.
  const shaped = results.filter((_, i) => cases[i].expectShape && cases[i].expectShape !== "none");
  if (shaped.length > 0) {
    const hit = shaped.filter(r => r.shape === cases[results.indexOf(r)].expectShape).length;
    console.log(`Shapes built as expected: ${hit}/${shaped.length}`);
  }
  console.log("──────────────────────────────────");

  // Latency + iteration aggregates. The dominant cost is the LLM round-trips
  // (one per iter), so p50/p95 ms and the iter histogram are the before/after
  // oracle for any speed change — keep these ≥ baseline isn't the goal here
  // (lower is better); pass rate is the guardrail, these are the win metric.
  const timed = results.filter(r => r.ms > 0).map(r => r.ms).sort((a, b) => a - b);
  if (timed.length > 0) {
    const pctl = (p: number) => timed[Math.min(timed.length - 1, Math.floor((p / 100) * timed.length))];
    const meanIters = results.reduce((s, r) => s + r.iters, 0) / results.length;
    console.log(`Latency: p50 ${pctl(50)}ms · p95 ${pctl(95)}ms · max ${timed[timed.length - 1]}ms`);
    const histo = new Map<number, number>();
    for (const r of results) {
      const bucket = r.iters >= 3 ? 3 : r.iters; // 1, 2, 3+
      histo.set(bucket, (histo.get(bucket) ?? 0) + 1);
    }
    const histoStr = [...histo.entries()].sort((a, b) => a[0] - b[0])
      .map(([k, n]) => `${k === 3 ? "3+" : k} iter: ${n}`).join(" · ");
    console.log(`Iterations: mean ${meanIters.toFixed(2)} · ${histoStr}`);
    const tokens = results.filter(r => r.promptTokens > 0).map(r => r.promptTokens).sort((a, b) => a - b);
    if (tokens.length) console.log(`Prompt tokens: median ${tokens[Math.floor(tokens.length / 2)]} · max ${tokens[tokens.length - 1]}`);
    console.log("──────────────────────────────────");
  }

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
