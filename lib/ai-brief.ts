/**
 * Today's brief — the reads most questions start with, fetched before the
 * model is asked anything.
 *
 * WHY. An ordinary question costs two model calls in sequence: one to choose a
 * read tool, then one to write the answer from its result. For the common
 * questions ("when's the next meeting", "what do I owe", "what's due this
 * week", "what's our balance") the first call always picks the same few reads.
 * Running those reads up front means the first call can answer: one model
 * round trip instead of two, about half the time and tokens.
 *
 * HOW. The brief is the REAL read tools, run through runTool with the asker's
 * access, handed to the model as tool calls that have already been answered
 * (the way attached files are pre-read). So nothing downstream needs to know
 * about it: rows still resolve to records (lib/ai-refs), pictures still draw
 * only from what was read (lib/ai-shape-evidence), and permission gates stay
 * exactly where they are.
 *
 * COST. The brief rides on every model call, so it is kept small: short
 * windows, capped lists, trimmed fields, and none of it on file turns. It
 * comes right after the system prompt, ahead of the conversation, and is
 * cached for BRIEF_TTL_MS per asker, so a follow-up question sends the same
 * bytes and OpenAI serves them from its prompt cache.
 */
import type OpenAI from "openai";

import { runTool, type ToolAccess } from "@/lib/ai-tools";
import type { db } from "@/lib/db";

type Scoped = ReturnType<typeof db>;
/** A read tool's JSON result, as runTool returns it. */
type ToolResult = unknown;

/** How far ahead the calendar and deadline sections look, today included. */
export const BRIEF_DAYS = 14;
/** Caps on the lists. A list that reaches its cap may have more: the prompt says so. */
export const BRIEF_EVENT_LIMIT = 8;
export const BRIEF_DEADLINE_LIMIT = 12;
const BRIEF_RECENT_TX = 3;
/** Long enough to cover a follow-up; short enough that a payment shows up within a minute. */
export const BRIEF_TTL_MS = 60_000;

/** The ledger chip and source label an answer drawn only from the brief shows. */
export const BRIEF_STEP = { verb: "Checked today's brief", source: "Today's brief" } as const;

export interface BriefCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: ToolResult;
}

export interface Brief {
  calls: BriefCall[];
  /** Characters of tool results handed to the model — telemetry. */
  chars: number;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The reads, with arguments a model would have chosen for the same questions. */
export function briefPlan(actorId: number, now: Date): Array<Omit<BriefCall, "id" | "result">> {
  const today = isoDay(now);
  const last = new Date(now);
  last.setUTCDate(last.getUTCDate() + BRIEF_DAYS - 1);
  const end = isoDay(last);
  return [
    // The asker's own record: dues, attendance, GPA, service hours, role.
    { name: "get_brother", args: { id: actorId } },
    { name: "list_calendar_events", args: { start: today, end, order_by: "date", order: "asc", limit: BRIEF_EVENT_LIMIT } },
    // No start: overdue work is part of "what's on my plate".
    { name: "list_deadlines", args: { end, open_only: true, order_by: "dueDate", order: "asc", limit: BRIEF_DEADLINE_LIMIT } },
    { name: "get_treasury", args: {} },
  ];
}

/**
 * Trim a result to what a brief needs. It keeps the shape its tool returns
 * (fields are only removed, or a hint reworded), so every reader of that tool
 * still works.
 */
function trim(name: string, result: ToolResult): ToolResult {
  if (typeof result !== "object" || result === null || Array.isArray(result) || "error" in result) return result;
  const r = { ...(result as Record<string, unknown>) };
  // An empty list's usual hint says "broaden before telling the user there are
  // none" — right for a filter the model chose, wrong for a brief window it
  // didn't: a chapter with nothing scheduled sent the model searching three
  // more times. In a brief, empty is an answer for the window; one look
  // further ahead is enough for "next".
  if (r.count === 0 && Array.isArray(r.items) && typeof r.hint === "string") {
    if (name === "list_calendar_events") {
      r.hint = "Nothing on the calendar in this window. For a 'next' question, look further ahead ONCE (start=today, no end); if that is empty too, say nothing is scheduled.";
    } else if (name === "list_deadlines") {
      r.hint = "No open deadlines due in this window, overdue ones included. That is a complete answer for what's due soon or overdue.";
    }
  }
  if (name === "get_brother") {
    // They know their own address, and the model never needs it to answer.
    delete r.email;
  }
  if (name === "get_treasury" && Array.isArray(r.recentTransactions)) {
    r.recentTransactions = r.recentTransactions.slice(0, BRIEF_RECENT_TX);
  }
  return r as ToolResult;
}

const cache = new Map<string, { brief: Brief; expires: number }>();

/**
 * Build (or reuse) the asker's brief. Never throws: a read that fails is left
 * out, and a brief with nothing in it is null — the turn then runs exactly as
 * it did before briefs existed.
 */
export async function buildBrief(scoped: Scoped, orgId: number, access: ToolAccess, now: Date = new Date()): Promise<Brief | null> {
  const key = `${orgId}:${access.actorId}:${access.permissions}:${access.isOrgAdmin ? 1 : 0}`;
  const t = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > t) return hit.brief;

  const plan = briefPlan(access.actorId, now);
  const results = await Promise.all(plan.map(async p => {
    try { return trim(p.name, await runTool(p.name, p.args, scoped, orgId, undefined, access)); }
    catch { return null; }
  }));
  const calls: BriefCall[] = [];
  plan.forEach((p, i) => {
    const result = results[i];
    // A failed read would only teach the model the tool is broken.
    if (!result || (typeof result === "object" && !Array.isArray(result) && "error" in result)) return;
    calls.push({ id: `brief_${i}`, ...p, result });
  });
  const brief = calls.length ? { calls, chars: calls.reduce((n, c) => n + JSON.stringify(c.result).length, 0) } : null;

  cache.set(key, { brief: brief as Brief, expires: t + BRIEF_TTL_MS });
  if (cache.size > 2000) {
    for (const [k, v] of cache) if (v.expires <= t) cache.delete(k);
  }
  return brief;
}

/** The brief as already-answered tool calls: one assistant turn, then a tool message per read. */
export function briefMessages(brief: Brief): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return [
    {
      role: "assistant",
      content: null,
      tool_calls: brief.calls.map(c => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    },
    ...brief.calls.map(c => ({ role: "tool" as const, tool_call_id: c.id, content: JSON.stringify(c.result) })),
  ];
}

/**
 * The rule that tells the model what the brief is. Static text, so it lives in
 * the cached part of the system prompt.
 */
export const BRIEF_RULE =
  "TODAY'S BRIEF: before every question these reads were already run for you and appear as answered tool calls at the start of the conversation — " +
  `get_brother for the person asking (their own dues, attendance, GPA, service hours, role), list_calendar_events for today and the next ${BRIEF_DAYS - 1} days, ` +
  `list_deadlines for open deadlines due by then (overdue ones included), and get_treasury. They are exact and current. ` +
  "When they cover the question, answer straight away with compose_answer — don't call those tools again with the same arguments. " +
  `A brief list that reached its limit (${BRIEF_EVENT_LIMIT} events, ${BRIEF_DEADLINE_LIMIT} deadlines) may have more: call the tool for the full list. ` +
  "Call tools as usual for anything the brief doesn't cover: other members, other dates, history, attendance records, budgets, or a different filter.";
