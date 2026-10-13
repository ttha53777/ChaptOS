"use client";
// Live demos a post can embed. In the Markdown:
//
//   <div data-demo="minutes">Fallback text for RSS readers.</div>
//
// ../[slug]/page.tsx splits the rendered post on these markers and mounts the
// matching component in place; feeds keep the fallback text.
import "./demos.css";
import { AgendaDemo } from "./AgendaDemo";
import { AskDemo } from "./AskDemo";
import { LiveMinutes } from "./LiveMinutes";
import { RollCall } from "./RollCall";
import { SlashDemo } from "./SlashDemo";
import { SummarizeDemo } from "./SummarizeDemo";
import { RoomDemo } from "./Room";

const DEMOS: Record<string, () => React.ReactNode> = {
  minutes: LiveMinutes,
  agenda: AgendaDemo,
  together: RoomDemo,
  slash: SlashDemo,
  summarize: SummarizeDemo,
  attendance: RollCall,
  ask: AskDemo,
};

export function PostDemo({ name }: { name: string }) {
  const Demo = DEMOS[name];
  return Demo ? <Demo /> : null;
}
