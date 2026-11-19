/**
 * Motion Lab: Media (stage 5). The signature moment (Mark posted: the planned print stops
 * developing, POSTED thuds onto the stage, confetti leaves the stamp; a refusal fades the
 * print back and smears the stamp), the three format snapshots developing and inked, the
 * measures, lane rows in each state and the month view with a hatched quiet stretch.
 * Nothing here calls the API.
 */
import type { InstagramPost } from "@/lib/api-types";
import { useState } from "react";
import { View } from "react-native";
import { LaneHead, MeasureTile, Month, PostRow, Snap } from "~/media/bits";
import { laneOf, lanes, measures, mediaToday } from "~/media/model";
import { PostedPrint, type PostedPhase } from "~/moments/Posted";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Section } from "./sections";

const today = mediaToday();
const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const base = { postedDate: null, status: "open" as const, calendarEventId: null };
const POSTS: InstagramPost[] = [
  { ...base, id: 1, title: "Rush week is coming", dueDate: day(-2), type: "Reel" },
  { ...base, id: 2, title: "Meet the officers", dueDate: day(2), type: "Carousel", calendarEventId: 1 },
  { ...base, id: 3, title: "Chapter meeting tonight", dueDate: day(0), type: "Story" },
  { ...base, id: 4, title: "Formal recap", dueDate: day(12), type: "Carousel" },
  { ...base, id: 5, title: "Philanthropy week", dueDate: day(-9), type: "Story", status: "posted", postedDate: day(-8) },
  { ...base, id: 6, title: "Welcome to the chapter", dueDate: day(-16), type: "Carousel", status: "posted", postedDate: day(-16) },
];

export function MediaLab() {
  const [phase, setPhase] = useState<PostedPhase>("idle");
  const [type, setType] = useState("Reel");
  const [month, setMonth] = useState(today.slice(0, 7));
  return (
    <Section title="Media" note="Mark posted: the print breathes while it saves (opacity .72 ↔ 1, 700ms), then the inked print fades over the developing one (420ms standard); POSTED thuds in 120ms before it finishes and confetti leaves the stamp (success haptic on impact). Refused: the print fades back, the stamp smears off. Reduced: no breathing, no confetti; print and stamp fade in (180ms).">
      <PostedPrint type={type} phase={phase} onImpact={() => haptics.success()} />
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Button label="Saving" size="sm" variant="soft" onPress={() => setPhase("posting")} />
        <Button label="Posted" icon="check" size="sm" tone="mint" onPress={() => setPhase("posted")} />
        <Button label="Refused" size="sm" variant="soft" tone="rose" onPress={() => setPhase("idle")} />
        <Button label={type} size="sm" variant="ghost" icon="swap" onPress={() => { setPhase("idle"); setType(t => (t === "Reel" ? "Story" : t === "Story" ? "Carousel" : "Reel")); }} />
      </View>
      <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-end" }}>
        {["Story", "Reel", "Carousel", "Photo"].map(t => <View key={t} style={{ gap: 8 }}><Snap type={t} developing size="md" /><Snap type={t} size="md" /></View>)}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 }}>
        {measures(POSTS, today).map(x => <MeasureTile key={x.key} m={x} onPress={() => undefined} />)}
      </View>
      {lanes(POSTS, today).map(l => (
        <View key={l.lane.id} style={{ gap: 10 }}>
          <LaneHead label={l.lane.label} note={l.lane.note} count={l.posts.length} tone={l.lane.tone} />
          {l.posts.map(p => <PostRow key={p.id} post={p} lane={laneOf(p, today)} today={today} event={p.calendarEventId ? "Fall Formal" : null} onPress={() => undefined} />)}
        </View>
      ))}
      <Month posts={POSTS} events={[{ id: 1, title: "Fall Formal", date: day(4) }]} today={today} month={month} onMonth={setMonth} onDay={() => undefined} />
    </Section>
  );
}
