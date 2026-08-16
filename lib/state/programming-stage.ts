export const STAGES = ["idea", "planning", "confirmed", "done"] as const;
export type ProgrammingStage = (typeof STAGES)[number];

export function isProgrammingStage(value: string): value is ProgrammingStage {
  return (STAGES as readonly string[]).includes(value);
}

export const STAGE_LABELS: Record<ProgrammingStage, string> = {
  idea:      "Idea",
  planning:  "Planning",
  confirmed: "Confirmed",
  done:      "Done",
};

/**
 * What each lane MEANS — one sentence, in the product's own voice.
 *
 * Kept beside the labels because the stage control, the help screen and the
 * board all say the same thing about a lane, and three copies of a sentence is
 * three chances for them to drift apart the first time an org changes one.
 */
export const STAGE_MEANINGS: Record<ProgrammingStage, string> = {
  idea:      "Up in the air. Belongs to the chapter.",
  planning:  "Someone's on it. Belongs to a person.",
  confirmed: "Locked in. The chapter can plan around it.",
  done:      "Over. Rated and on the record.",
};

/** Dot/header colors for board columns and cards. */
export const STAGE_PILL: Record<ProgrammingStage, { dot: string; text: string }> = {
  idea:      { dot: "bg-slate-500",   text: "text-slate-300"   },
  planning:  { dot: "bg-amber-400",   text: "text-amber-300"   },
  confirmed: { dot: "bg-sky-400",     text: "text-sky-300"     },
  done:      { dot: "bg-emerald-400", text: "text-emerald-300" },
};
