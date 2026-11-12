// The answer's tone: what colour its one mark (and its block's accents) take.
// good = on track, paid, passed · watch = late, under the bar, owed ·
// now = today, neutral · yours = your own record, a how-to · chapt = asking
// back, a draft, Chapt's own state.
//
// The server may send `tone`; when it doesn't, it is read off what the answer
// already is. Only clear cases move off the neutral default: a wrong "watch"
// would colour good news as bad, so anything ambiguous stays "now".

import type { AnswerData, AnswerTone } from "./types";

export type { AnswerTone };

export function answerTone(answer: AnswerData): AnswerTone {
  if (answer.tone) return answer.tone;
  const s = answer.shape;
  if (s) {
    switch (s.type) {
      case "tally":   return s.hit > 0 ? "watch" : "good";
      case "pastdue": return "watch";
      case "yesno":   return s.holds ? "good" : "watch";
      case "figure":  return s.metric === "balance" ? (s.value < 0 ? "watch" : "good") : "now";
      case "steps":   return "yours";
      case "decline": return "now";
      case "reasons": return s.gauge.value < s.gauge.atRisk ? "watch" : s.gauge.watch != null && s.gauge.value < s.gauge.watch ? "now" : "good";
      case "quote":   return s.decided ? "good" : "now";
      default: break;
    }
  }
  // Ranked advice (a game plan) and an answer that is only a question back are
  // Chapt talking about what to do next.
  if (answer.rows.length > 0 && answer.rows.every(r => r.tier)) return "chapt";
  if (answer.rows.length === 0 && answer.askback) return "chapt";
  return "now";
}
