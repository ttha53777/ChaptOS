"use client";
// Live demos a post can embed. In the Markdown:
//
//   <div data-demo="minutes">Fallback text for RSS readers.</div>
//
// ../[slug]/page.tsx splits the rendered post on these markers and mounts the
// matching component in place; feeds keep the fallback text.
import "./demos.css";
import "./timeline.css";
import "./handoff.css";
import { AgendaDemo } from "./AgendaDemo";
import { AskDemo } from "./AskDemo";
import { LiveMinutes } from "./LiveMinutes";
import { RollCall } from "./RollCall";
import { SlashDemo } from "./SlashDemo";
import { SummarizeDemo } from "./SummarizeDemo";
import { RoomDemo } from "./Room";
import { ScatteredDemo } from "./Scattered";
import { TimelineAdd } from "./TimelineAdd";
import { EventTypesDemo } from "./EventTypesDemo";
import { CalendarDemo } from "./CalendarDemo";
import { CheckInDemo } from "./CheckInDemo";
import { HandoffScatter } from "./HandoffScatter";
import { DocsLibrary } from "./DocsLibrary";
import { SeatHandoff } from "./SeatHandoff";
import { TermDemo } from "./TermDemo";

const DEMOS: Record<string, () => React.ReactNode> = {
  minutes: LiveMinutes,
  agenda: AgendaDemo,
  together: RoomDemo,
  slash: SlashDemo,
  summarize: SummarizeDemo,
  attendance: RollCall,
  ask: AskDemo,
  scattered: ScatteredDemo,
  "tl-add": TimelineAdd,
  "tl-types": EventTypesDemo,
  "tl-calendar": CalendarDemo,
  "tl-checkin": CheckInDemo,
  "ho-scatter": HandoffScatter,
  "ho-docs": DocsLibrary,
  "ho-seat": SeatHandoff,
  "ho-term": TermDemo,
};

export function PostDemo({ name }: { name: string }) {
  const Demo = DEMOS[name];
  return Demo ? <Demo /> : null;
}
