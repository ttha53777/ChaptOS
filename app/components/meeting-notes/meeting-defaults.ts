import type { CalendarEvent } from "@/app/data";
import type { ActiveSemester } from "@/app/hooks/useActiveSemester";
import { initialSchedule, type ScheduleValue } from "@/app/components/timeline/ScheduleFields";
import { compareEvents } from "@/lib/event-time";

/** What the Add meeting form edits. */
export type MeetingDraft = { title: string; when: ScheduleValue; location: string; mandatory: boolean };

function localDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * New-meeting defaults: the chapter's usual time and room, on its usual
 * weekday, the first one that's free and inside the term. Shared by Add
 * meeting and the Templates page's "Filled for <date>" preview, so the preview
 * shows the meeting the officer would actually be adding.
 */
export function nextMeetingDraft(events: CalendarEvent[], semester: ActiveSemester | null, today: string): MeetingDraft {
  const last = [...events].sort((a, b) => compareEvents(b, a))[0];
  const used = new Set(events.map(e => e.date));
  const weekday = last ? localDate(last.date).getDay() : null;
  const clamp = (d: string) => semester && d < semester.startDate ? semester.startDate : d;
  let date = clamp(today);
  if (weekday != null) {
    const d = localDate(date);
    for (let i = 0; i < 60; i++) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (semester && iso > semester.endDate) break;
      if (d.getDay() === weekday && !used.has(iso) && iso >= today) { date = iso; break; }
      d.setDate(d.getDate() + 1);
    }
  }
  const prev = last ? initialSchedule(last.schedule, { date: last.date, time: last.time, isNew: false }) : null;
  const base = initialSchedule(null, { date, isNew: true });
  // A typed time ("7:00 PM") still says when the chapter usually starts.
  const typed = last?.time?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  const typedStart = typed ? `${String((Number(typed[1]) % 12) + (/pm/i.test(typed[3]) ? 12 : 0)).padStart(2, "0")}:${typed[2]}` : "";
  const when = prev?.mode === "timed" ? { ...base, startTime: prev.startTime, endTime: prev.endTime }
    : typedStart ? { ...base, startTime: typedStart } : base;
  return { title: "Chapter meeting", when, location: last?.location ?? "", mandatory: true };
}
