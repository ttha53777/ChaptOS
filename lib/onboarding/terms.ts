/**
 * Term-model vocabulary for the /create interview.
 *
 * The interview asks "how does your calendar reset?" (TermModel) and then
 * offers ready-made suggestions for the CURRENT term ("Fall 2026 · Aug 24 –
 * Dec 18") so the founder never types a date in chat — suggestTerms() computes
 * them from today's date, and the blueprint's "This term" card lets the exact
 * dates be edited before anything is built.
 *
 * The windows are deliberately generic US-academic shapes. They will be a week
 * or two off for any given school — that's fine; the label is what matters in
 * chat, the dates are editable on the sheet, and provisionOrg stores whatever
 * the founder confirmed.
 *
 * Pure data + date math, no React, no DB — unit-tested directly.
 */

import { todayISO } from "@/lib/dates";

export const TERM_MODELS = ["semester", "quarter", "season", "year-round"] as const;
export type TermModel = (typeof TERM_MODELS)[number];

export const TERM_MODEL_LABEL: Record<TermModel, string> = {
  semester:     "Semesters",
  quarter:      "Quarters",
  season:       "Seasons",
  "year-round": "Year-round",
};

/**
 * The Period vocab label each term model implies. Always explicit (never a
 * "leave the default" null): a template may carry its own Period override
 * (sports-team → "Season"), and the founder's direct answer to "how does your
 * calendar reset?" should win over it. Year-round orgs get "Year" so their one
 * long period isn't captioned "Semester" everywhere (discovery caveat #26).
 */
export const TERM_PERIOD_VOCAB: Record<TermModel, string> = {
  semester:     "Semester",
  quarter:      "Quarter",
  season:       "Season",
  "year-round": "Year",
};

export interface TermSuggestion {
  label: string;
  /** YYYY-MM-DD, matching how Semester rows store dates. */
  startDate: string;
  endDate: string;
}

/** A yearless window: name + [month, day] bounds (1-based, within one calendar year). */
interface TermWindow {
  name: string;
  start: readonly [number, number];
  end: readonly [number, number];
}

const WINDOWS: Record<Exclude<TermModel, "year-round">, readonly TermWindow[]> = {
  semester: [
    { name: "Spring", start: [1, 12], end: [5, 8] },
    { name: "Summer", start: [5, 18], end: [8, 14] },
    { name: "Fall",   start: [8, 24], end: [12, 18] },
  ],
  quarter: [
    { name: "Winter", start: [1, 5],  end: [3, 20] },
    { name: "Spring", start: [3, 30], end: [6, 12] },
    { name: "Summer", start: [6, 22], end: [8, 28] },
    { name: "Fall",   start: [9, 21], end: [12, 11] },
  ],
  season: [
    { name: "Winter", start: [1, 1],  end: [3, 15] },
    { name: "Spring", start: [3, 16], end: [6, 14] },
    { name: "Summer", start: [6, 15], end: [8, 14] },
    { name: "Fall",   start: [8, 15], end: [12, 31] },
  ],
};

function iso(year: number, [month, day]: readonly [number, number]): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Suggest the 2–3 most plausible "current term" answers for a model, ordered
 * by relevance: the window containing `today` first (or the next upcoming one
 * when today falls in a break), then the following window(s).
 *
 * @param today - YYYY-MM-DD; injectable for tests.
 */
export function suggestTerms(model: TermModel, today: string = todayISO()): TermSuggestion[] {
  const year = Number(today.slice(0, 4));

  if (model === "year-round") {
    return [year, year + 1].map(y => ({
      label: String(y),
      startDate: `${y}-01-01`,
      endDate: `${y}-12-31`,
    }));
  }

  // Lay this year's and next year's windows out chronologically, then walk to
  // the first window that hasn't ended yet — string compare works because
  // everything is YYYY-MM-DD.
  const laid: TermSuggestion[] = [year, year + 1].flatMap(y =>
    WINDOWS[model].map(w => ({
      label: `${w.name} ${y}`,
      startDate: iso(y, w.start),
      endDate: iso(y, w.end),
    })),
  );
  const from = laid.findIndex(t => today <= t.endDate);
  return laid.slice(from, from + 3);
}

/**
 * Keyword matcher for the term-model question's free-text fallback. Same
 * naive-`includes` posture as matchKind — chips are the primary input; an
 * unmatched answer reads as "semester" (the overwhelming default).
 */
export function matchTermModel(text: string): TermModel {
  const lower = text.toLowerCase();
  if (lower.includes("quarter") || lower.includes("trimester")) return "quarter";
  if (lower.includes("season")) return "season";
  if (
    lower.includes("year") || lower.includes("round") ||
    lower.includes("rolling") || lower.includes("annual") ||
    lower.includes("no term") || lower.includes("don't reset") || lower.includes("dont reset")
  ) return "year-round";
  return "semester";
}
