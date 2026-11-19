/**
 * Motion Lab: Meetings (stage 2). The paper switch, a roll-call row's tick, and the
 * delete slip's OFF THE TIMELINE stamp, each live so the reduced versions can be compared.
 */
import type { Brother } from "@/lib/api-types";
import { useState } from "react";
import { View } from "react-native";
import { RollRow } from "~/meetings/TakeAttendance";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Stamp, type StampState } from "~/paper/Stamp";
import { useTheme } from "~/theme/PaperProvider";
import { Switch } from "~/ui/Switch";
import { T } from "~/ui/T";
import { Section } from "./sections";

const PEOPLE: Brother[] = [
  { id: 901, name: "Avery Lin", role: "Member", attendance: 0, duesOwed: 0, gpa: 0, serviceHours: 0 },
  { id: 902, name: "Jordan Okafor", role: "Member", attendance: 0, duesOwed: 0, gpa: 0, serviceHours: 0 },
];

export function MeetingsLab() {
  const { c } = useTheme();
  const [req, setReq] = useState(true);
  const [here, setHere] = useState<Set<number>>(new Set([901]));
  const [stamp, setStamp] = useState<StampState>("hidden");
  return (
    <Section title="Meetings" note="Switch: the knob slides on the settle spring while the pastel fill fades in under it (opacity only). Reduced: the knob fades out at one end and in at the other. Roll call: the tick pops 0.6 → 1 on the pop spring; reduced, it fades in place. Delete: the slip is stamped OFF THE TIMELINE before the sheet closes.">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <T v="callout" style={{ flex: 1 }}>Required attendance</T>
        <Switch value={req} onChange={setReq} tone="peach" label="Required attendance" />
      </View>
      <View style={{ borderWidth: 1.5, borderColor: c.line, borderRadius: 16, overflow: "hidden", backgroundColor: c.card }}>
        {PEOPLE.map((b, i) => (
          <RollRow key={b.id} b={b} on={here.has(b.id)} first={i === 0}
            onPress={() => { haptics.select(); setHere(s => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; }); }} />
        ))}
      </View>
      <View style={{ minHeight: 90, justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderStyle: "dashed", borderColor: c.line2, borderRadius: 16 }}>
        <Stamp label="Off the timeline" tone="rose" state={stamp} rotate={-9} onImpact={() => haptics.soft()} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Stamp" size="sm" tone="rose" onPress={() => setStamp(s => (s === "in" ? "hidden" : "in"))} style={{ flex: 1 }} />
        <Button label="Refused" size="sm" variant="soft" onPress={() => setStamp("smear")} style={{ flex: 1 }} />
      </View>
    </Section>
  );
}
