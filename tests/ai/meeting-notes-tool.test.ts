/**
 * search_meeting_notes — Ask Chapt reading the chapter's minutes:
 *
 *   1. CONTENT — an untouched agenda is not minutes; the structured summary
 *      comes back as gist/decisions/actions; meetings matching more query
 *      words rank first.
 *   2. BUDGET — long minutes are cut to the passages around the query words
 *      (with their heading), never sent whole; list_calendar_events keeps
 *      only a preview.
 *
 * Pure unit — a recording stub stands in for ctx.db.
 */

import { describe, it, expect } from "vitest";
import { runTool, noteExcerpts } from "@/lib/ai-tools";
import type { db } from "@/lib/db";

type Scoped = ReturnType<typeof db>;
type Call = { model: string; op: string; args: unknown };

function stub(data: Record<string, unknown>): { scoped: Scoped; calls: Call[] } {
  const calls: Call[] = [];
  const scoped = new Proxy({} as Record<string, unknown>, {
    get(_t, model: string) {
      return new Proxy({}, {
        get(_m, op: string) {
          return async (args: unknown) => {
            calls.push({ model, op, args });
            return data[model] ?? [];
          };
        },
      });
    },
  }) as unknown as Scoped;
  return { scoped, calls };
}

const row = (o: Record<string, unknown>) => ({
  id: 1, title: "Chapter", date: "2026-10-01", category: "chapter",
  description: "", notesSeed: null, notesSummary: null, notesSummaryData: null, ...o,
});

type Item = { id: number; summary?: unknown; minutes?: string; excerpted?: boolean };

describe("search_meeting_notes", () => {
  it("skips an untouched agenda and returns the structured summary", async () => {
    const { scoped } = stub({
      calendarEvent: [
        row({ id: 1, description: "## Agenda\n- Old business", notesSeed: "## Agenda\n- Old business" }),
        row({
          id: 2, date: "2026-09-24", description: "## Formal\nVoted to book the Elks Lodge.",
          notesSummary: "Booked the venue.",
          notesSummaryData: {
            gist: "Booked the venue.", decisions: ["Formal at the Elks Lodge"],
            actions: [{ id: "a1", text: "Send deposit", owner: "Dev", brotherId: 4, due: "2026-10-03", done: false }],
          },
        }),
      ],
    });
    const out = await runTool("search_meeting_notes", { query: "formal" }, scoped, 1) as Item[];
    expect(out.map(i => i.id)).toEqual([2]);
    expect(out[0].summary).toEqual({
      gist: "Booked the venue.", decisions: ["Formal at the Elks Lodge"],
      actions: [{ text: "Send deposit", owner: "Dev", due: "2026-10-03", done: false }],
    });
    expect(out[0].minutes).toBe("## Formal\nVoted to book the Elks Lodge.");
  });

  it("ranks meetings that match more query words first", async () => {
    const { scoped, calls } = stub({
      calendarEvent: [
        row({ id: 1, date: "2026-10-08", description: "Dues reminder sent." }),
        row({ id: 2, date: "2026-09-10", description: "Dues vote passed 30-4." }),
      ],
    });
    const out = await runTool("search_meeting_notes", { query: "dues vote" }, scoped, 1) as Item[];
    expect(out.map(i => i.id)).toEqual([2, 1]);
    // Every query word becomes an OR over title, minutes and summary.
    const where = (calls[0].args as { where: { AND: { OR?: unknown[] }[] } }).where;
    expect(where.AND[1].OR).toHaveLength(6);
  });

  it("cuts long minutes to the passages around the query words", async () => {
    const filler = Array.from({ length: 2000 }, (_, i) => `line ${i} about nothing`).join("\n");
    const { scoped } = stub({
      calendarEvent: [row({ description: `## Rush\n${filler}\nRush budget set at $800.\n${filler}` })],
    });
    const [item] = await runTool("search_meeting_notes", { query: "budget" }, scoped, 1) as Item[];
    expect(item.excerpted).toBe(true);
    expect(item.minutes).toContain("## Rush");
    expect(item.minutes).toContain("Rush budget set at $800.");
    expect(item.minutes!.length).toBeLessThan(500);
  });

  it("answers 'none' with the broaden hint when nothing matches", async () => {
    const { scoped } = stub({ calendarEvent: [] });
    const out = await runTool("search_meeting_notes", { query: "kayak" }, scoped, 1) as { count: number };
    expect(out.count).toBe(0);
  });
});

describe("noteExcerpts", () => {
  it("keeps the heading and neighbours, marking gaps", () => {
    const text = ["## Social", "a", "b", "mixer with Tri Delt", "c", "d", "e", "## Money", "f", "mixer cost $300"].join("\n");
    expect(noteExcerpts(text, ["mixer"], 1000)).toBe(
      ["## Social", "…", "b", "mixer with Tri Delt", "c", "…", "## Money", "f", "mixer cost $300"].join("\n"),
    );
  });
});

describe("list_calendar_events", () => {
  it("previews long minutes instead of sending them whole", async () => {
    const { scoped } = stub({ calendarEvent: [row({ description: "x".repeat(5000) })] });
    const [ev] = await runTool("list_calendar_events", {}, scoped, 1) as { description: string; minutesTruncated?: boolean }[];
    expect(ev.minutesTruncated).toBe(true);
    expect(ev.description.length).toBeLessThan(500);
  });
});
