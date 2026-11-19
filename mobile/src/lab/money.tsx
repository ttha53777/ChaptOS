/**
 * Motion Lab: U9 money. The reimbursement's signature moment (the receipt print sliding
 * into the envelope, SENT stamped on the pocket) and the dues balance counting up as it
 * does on a first open. Nothing here calls the API.
 */
import { useState } from "react";
import { View } from "react-native";
import { Icon } from "~/icons/Icon";
import { Envelope, type EnvelopeState } from "~/moments/Envelope";
import { Button } from "~/paper/Button";
import { TickingNumber } from "~/paper/TickingNumber";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { Section } from "./sections";

export function ReimbursementLab() {
  const { c } = useTheme();
  const [k, setK] = useState(0);
  const [state, setState] = useState<EnvelopeState>("ready");
  const print = (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 6 }}>
      <Icon name="receipt" size={26} color={c.thermal.faint} />
      <T v="mono" color={c.thermal.ink} style={{ fontSize: 15 }}>$42.80</T>
      <T v="meta" color={c.thermal.faint}>Formal decorations</T>
    </View>
  );
  return (
    <Section title="Reimbursement sent" note="The taped print slides into the envelope (440ms, flight) leaving 10pt peeking; the envelope gives 3pt (soft haptic); SENT stamps the pocket (340ms, success haptic on impact). Reduced: the print fades (180ms), the stamp fades in.">
      <Envelope key={k} state={state} print={print} onDone={() => undefined} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button label="Send it" icon="send" size="sm" onPress={() => setState("sent")} disabled={state === "sent"} />
        <Button label="Reset" variant="soft" size="sm" onPress={() => { setState("ready"); setK(x => x + 1); }} />
      </View>
    </Section>
  );
}

export function BalanceLab() {
  const [v, setV] = useState(0);
  return (
    <Section title="Balance count" note="A first open per session counts the figure up from $0: only the digits that change roll (TickingNumber). Reduced: they cross-fade, and a first open shows the figure at once.">
      <TickingNumber value={`$${v.toLocaleString()}`} v="hero" />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button label="Count to $1,240" size="sm" onPress={() => setV(1240)} />
        <Button label="Back to $0" variant="soft" size="sm" onPress={() => setV(0)} />
      </View>
    </Section>
  );
}
