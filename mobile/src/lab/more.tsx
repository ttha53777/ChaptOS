/**
 * Motion Lab: U7 More. The service card punching in (and unpunching on an undo/refusal),
 * and fundraiser jars filling. Nothing here calls the API.
 */
import { useState } from "react";
import { View } from "react-native";
import { Jar, JAR_FILL_MS } from "~/moments/Jar";
import { PunchHoles } from "~/moments/Punch";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { Section } from "./sections";

export function PunchLab() {
  const { c } = useTheme();
  const [n, setN] = useState(3);
  const stock = c.pastel.butter.soft;
  return (
    <Section title="Hours punch in" note="Each new hole presses in (1 → .72 → 1, 500ms spring) and its chad drops out (8,46 · 140° · fade, 800ms), staggered 90ms, soft haptic on the first four. Unpunching refills with stock (220ms). Reduced: 180ms cross-fade, haptics kept.">
      <View style={{ padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: c.ink, backgroundColor: stock }}>
        <PunchHoles punched={n} total={10} stock={stock} print={c.pastel.peach.ink} />
      </View>
      <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{n} / 10h</T>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Log 2h" icon="clock" tone="peach" onPress={() => setN(x => Math.min(10, x + 2))} style={{ flex: 1 }} />
        <Button label="Undo 2h" variant="ghost" onPress={() => { haptics.tap(); setN(x => Math.max(0, x - 2)); }} style={{ flex: 1 }} />
      </View>
    </Section>
  );
}

export function JarLab() {
  const { c } = useTheme();
  const [k, setK] = useState(0);
  return (
    <Section title="Jars fill" note={`Money rises to came-in ÷ goal over ${JAR_FILL_MS}ms (spring), 120ms apart; past the goal it reaches the lid. Transform only. Reduced: appears at level with a 180ms fade.`}>
      <View key={k} style={{ flexDirection: "row", justifyContent: "space-around" }}>
        <Jar fill={0} tint={c.pastel.mint.fill} />
        <Jar fill={0.55} tint={c.pastel.mint.fill} delay={120} />
        <Jar fill={1} tint={c.pastel.mint.fill} delay={240} />
        <Jar fill={1.37} tint={c.pastel.mint.fill} delay={360} />
      </View>
      <Button label="Fill again" variant="soft" icon="refresh" onPress={() => setK(x => x + 1)} />
    </Section>
  );
}
