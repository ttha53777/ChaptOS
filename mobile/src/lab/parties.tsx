/**
 * Motion Lab: Parties (stage 4). The signature moment (the till receipt feeding out of
 * the slot in three jerks, then CLOSED OUT stamped across the total), the wristbands, the
 * night-by-night strip growing from its baseline, and ledger lines in each state.
 * Nothing here calls the API.
 */
import type { Party } from "@/lib/api-types";
import { useState } from "react";
import { View } from "react-native";
import { Till, type TillState } from "~/moments/Till";
import { Button } from "~/paper/Button";
import { Book, Strip, Wristband } from "~/parties/bits";
import { Section } from "./sections";

const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const base: Omit<Party, "id" | "name" | "date"> = {
  partyType: "Open", theme: "", collabOrg: "", doorRevenue: 0, attendance: 0, expenses: 0, notes: "", completed: false, completedAt: null,
  attendanceEventId: null, mandatory: false, schedule: null, time: "21:00",
};
const PARTIES: Party[] = [
  { ...base, id: 1, name: "Winter Kickback", date: day(5), partyType: "Closed", theme: "Ugly sweaters" },
  { ...base, id: 2, name: "Homecoming Afterparty", date: day(-3), collabOrg: "KDF" },
  { ...base, id: 3, name: "Black & Gold", date: day(-17), theme: "Black & Gold", doorRevenue: 890, expenses: 310, completed: true },
  { ...base, id: 4, name: "Rainy Mixer", date: day(-30), partyType: "Closed", doorRevenue: 120, expenses: 260, completed: true },
  { ...base, id: 5, name: "Rush Social", date: day(-44), doorRevenue: 580, expenses: 120, completed: true },
];
const CLOSED = PARTIES.filter(p => p.completed).reverse();

export function PartiesLab() {
  const [k, setK] = useState(0);
  const [state, setState] = useState<TillState>("ready");
  const [s, setS] = useState(0);
  const today = day(0);
  return (
    <Section title="Parties" note="Close it out: the receipt feeds from the till's slot in three 170ms jerks with 90ms breaths, the last on the spring; CLOSED OUT stamps the total (success haptic on impact). Reduced: the receipt fades in at rest (200ms), the stamp fades in. Strip bars grow from the baseline on the pop spring, 40ms apart; reduced, they fade in at size.">
      <Till key={k} state={state} onDone={() => undefined}
        slip={{ org: "Oozma Kappa", name: "Homecoming Afterparty", when: "Sat Nov 14", door: "$1,240.00", spent: "$310.00", net: "+$930", neg: false }} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button label="Close it out" icon="check" size="sm" tone="rose" onPress={() => setState("print")} disabled={state === "print"} />
        <Button label="Reset" variant="soft" size="sm" onPress={() => { setState("ready"); setK(x => x + 1); }} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Wristband type="Open" size="md" />
        <Wristband type="Closed" size="md" />
      </View>
      <Strip key={`s${s}`} chron={CLOSED} max={630} onOpen={() => undefined} />
      <Button label="Grow again" variant="soft" size="sm" onPress={() => setS(x => x + 1)} />
      <Book parties={PARTIES} today={today} officer onOpen={() => undefined} onWrap={() => undefined} />
    </Section>
  );
}
