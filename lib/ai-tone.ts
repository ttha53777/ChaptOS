// The answer's tone: what colour its one mark (and its block's accents) take.
// good = on track, paid, passed · watch = late, under the bar, owed ·
// now = today, neutral · yours = your own record, a how-to · chapt = asking
// back, a draft, Chapt's own state.
//
// Shared by the chat route (which sends `tone`) and the widget (which falls
// back to it for answers saved before the server sent one). Types only, so it
// is safe in the client bundle.

import type { AnswerShape, AnswerTone } from "@/lib/api-types/chat";

export const ANSWER_TONES = ["good", "watch", "now", "yours", "chapt"] as const satisfies readonly AnswerTone[];

export function isAnswerTone(v: unknown): v is AnswerTone {
  return typeof v === "string" && (ANSWER_TONES as readonly string[]).includes(v);
}

/**
 * The tone a drawn shape implies, read off its own numbers, or null when the
 * shape doesn't settle it. A shape's tone beats the model's: it comes from the
 * data, the model's from the model's reading of it.
 */
export function shapeTone(s: AnswerShape | undefined | null): AnswerTone | null {
  if (!s) return null;
  switch (s.type) {
    case "tally":   return s.hit > 0 ? "watch" : "good";
    case "pastdue": return "watch";
    case "yesno":   return s.holds ? "good" : "watch";
    case "figure":  return s.metric === "balance" ? (s.value < 0 ? "watch" : "good") : "now";
    case "steps":   return "yours";
    case "decline": return "now";
    case "reasons": return s.gauge.value < s.gauge.atRisk ? "watch" : s.gauge.watch != null && s.gauge.value < s.gauge.watch ? "now" : "good";
    case "quote":   return s.decided ? "good" : "now";
    default:        return null;
  }
}

/** What the server sends: the shape's tone, else the model's, else nothing (the client decides). */
export function resolveTone(modelTone: AnswerTone | undefined, shape: AnswerShape | undefined | null): AnswerTone | undefined {
  return shapeTone(shape) ?? modelTone;
}
