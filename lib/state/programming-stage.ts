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

/** Dot/header colors for board columns and cards. */
export const STAGE_PILL: Record<ProgrammingStage, { dot: string; text: string }> = {
  idea:      { dot: "bg-slate-500",   text: "text-slate-300"   },
  planning:  { dot: "bg-amber-400",   text: "text-amber-300"   },
  confirmed: { dot: "bg-sky-400",     text: "text-sky-300"     },
  done:      { dot: "bg-emerald-400", text: "text-emerald-300" },
};

/** Planning+ stages require a backing CalendarEvent (and therefore a date). */
export function stageRequiresCalendar(stage: ProgrammingStage): boolean {
  return stage !== "idea";
}

export function stageRequiresDate(stage: ProgrammingStage): boolean {
  return stage !== "idea";
}
