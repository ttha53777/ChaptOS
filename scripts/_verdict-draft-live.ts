// Live probe: does draftVerdict fire mid-stream on real gpt-5.2 compose_answer
// output, and how far ahead of the finished call? Fake tool results, no DB.
//   DATABASE_URL=x DIRECT_URL=x tsx --env-file=.env.local scripts/_verdict-draft-live.ts
import OpenAI from "openai";
import { CHAT_MODEL, CHAT_REASONING_EFFORT } from "../lib/ai";
import { chatToolsFor, ANSWER_TOOL } from "../lib/ai-tools";
import { draftVerdict } from "../lib/ai-verdict-draft";

const openai = new OpenAI();
const tool = chatToolsFor(false).find(t => t.type === "function" && t.function.name === ANSWER_TOOL)!;
const owed = Array.from({ length: 6 }, (_, i) => ({ brotherId: 100 + i, name: ["Marcus Bell","Andre Whitfield","Rob Chen","Dev Patel","Sam Ortiz","Leo Park"][i], duesOwed: [240,180,120,90,60,45][i] }));
const Q = [
  "Who still owes dues?",
  "Who owes the most in dues and how much is outstanding overall?",
  "List everyone behind on dues with amounts.",
];
(async () => {
  for (const q of Q) {
    const t0 = performance.now();
    let buf = "", draftAt: number | null = null, firstArgAt: number | null = null, draft: string | null = null;
    const stream = await openai.chat.completions.create({
      model: CHAT_MODEL, stream: true, reasoning_effort: CHAT_REASONING_EFFORT, max_completion_tokens: 4000,
      tools: [tool], tool_choice: { type: "function", function: { name: ANSWER_TOOL } },
      messages: [
        { role: "system", content: "You are Ask Chapt, a chapter assistant. Answer with compose_answer: a one-sentence verdict with one *emphasis*, then a row per person." },
        { role: "user", content: q },
        { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_dues_owed", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "c1", content: JSON.stringify({ members: owed, total: 735 }) },
      ],
    });
    for await (const ch of stream) {
      const a = ch.choices[0]?.delta?.tool_calls?.[0]?.function?.arguments;
      if (!a) continue;
      if (firstArgAt === null) firstArgAt = performance.now() - t0;
      buf += a;
      if (draftAt === null) { draft = draftVerdict(buf); if (draft) draftAt = performance.now() - t0; }
    }
    const end = performance.now() - t0;
    const final = JSON.parse(buf).verdict;
    console.log(JSON.stringify({ q, firstArgMs: Math.round(firstArgAt!), draftMs: draftAt && Math.round(draftAt), endMs: Math.round(end), headStartMs: draftAt && Math.round(end - draftAt), argChars: buf.length, verdictFirst: buf.trimStart().startsWith('{"verdict"'), match: draft === final.trim() }));
  }
})();
