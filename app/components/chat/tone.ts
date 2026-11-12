// The answer's tone (see lib/ai-tone.ts for the palette). The server sends
// `tone` once the answer kit is on; when it doesn't (flag off, the fast path,
// answers saved before), it is read off what the answer already is. Only clear
// cases move off the neutral default: a wrong "watch" would colour good news
// as bad, so anything ambiguous stays "now".

import { shapeTone } from "@/lib/ai-tone";
import type { AnswerData, AnswerTone } from "./types";

export type { AnswerTone };

export function answerTone(answer: AnswerData): AnswerTone {
  if (answer.tone) return answer.tone;
  const fromShape = shapeTone(answer.shape);
  if (fromShape) return fromShape;
  // Ranked advice (a game plan) and an answer that is only a question back are
  // Chapt talking about what to do next.
  if (answer.rows.length > 0 && answer.rows.every(r => r.tier)) return "chapt";
  if (answer.rows.length === 0 && answer.askback) return "chapt";
  return "now";
}
