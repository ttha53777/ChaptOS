/**
 * Motion Lab: Programming (stage 3). The four lane papers side by side, the stage ladder
 * (its ink marker slides on the settle spring; reduced, it jumps), and the wrap-up stars
 * (the run pops in, 35ms apart; reduced, they fill in place).
 */
import type { ProgrammingEvent, ProgrammingStage } from "@/lib/api-types";
import { useState } from "react";
import { View } from "react-native";
import { EventCard } from "~/programming/Card";
import { Ladder } from "~/programming/EventSheet";
import { StarPicker } from "~/programming/steps";
import { T } from "~/ui/T";
import { Section } from "./sections";

const base: Omit<ProgrammingEvent, "id" | "title" | "stage"> = {
  schedule: null, dueDate: null, location: "", time: null, status: "Upcoming", category: "social", type: "Social", mandatory: false,
  collab: null, owner: null, ownerNote: null, description: null, attachmentUrl: null, attachmentDocId: null, fieldValues: {},
  detachedFields: [], spendingCents: 0, successRating: null, wrapUpNotes: null, calendarEventId: null,
};
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const CARDS: ProgrammingEvent[] = [
  { ...base, id: 1, title: "Alumni mixer", stage: "idea" },
  { ...base, id: 2, title: "Speaker night", stage: "planning", category: "professional", type: "Professional", dueDate: day(6), owner: { kind: "brother", id: 9, name: "Avery Lin", initials: "AL" } },
  { ...base, id: 3, title: "Formal", stage: "confirmed", dueDate: day(12), location: "The Grand Hall", owner: { kind: "role", id: 4, name: "Social Chair", holders: ["Jordan"] } },
  { ...base, id: 4, title: "Beach cleanup", stage: "done", category: "service", type: "Service", dueDate: day(-9), location: "North Beach", successRating: 4, owner: { kind: "brother", id: 8, name: "Priya Shah", initials: "PS" } },
];

export function ProgrammingLab() {
  const [stage, setStage] = useState<ProgrammingStage>("planning");
  const [stars, setStars] = useState<number | null>(3);
  const today = day(0);
  return (
    <Section title="Programming" note="Lanes as paper: an idea is a sticky note, a plan a dashed index card, confirmed is inked on a hard shadow, done is filed with its stars. The ladder's marker slides between rungs; the stars pop in a run.">
      <View style={{ gap: 12 }}>{CARDS.map((e, i) => <EventCard key={e.id} e={e} i={i} today={today} onPress={() => undefined} />)}</View>
      <Ladder stage={stage} officer onPick={setStage} />
      <View style={{ alignItems: "center", gap: 6 }}>
        <StarPicker value={stars} onChange={setStars} />
        <T v="meta">{stars ? `${stars} of 5` : "Not rated"}</T>
      </View>
    </Section>
  );
}
