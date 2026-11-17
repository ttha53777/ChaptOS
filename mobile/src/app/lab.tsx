/**
 * Motion Lab (dev builds only). Review surface for U0 and every later UI phase:
 * theme, reduced motion, simulated Dynamic Type and 4× slow-mo apply app-wide.
 */
import { Redirect, router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ButtonLab, CheckInLab, HapticsLab, IconLab, PaletteLab, PaperLab, StampLab, TickLab, TypeLab } from "~/lab/sections";
import { Button } from "~/paper/Button";
import { Kicker } from "~/paper/bits";
import { usePaperSettings, useTheme } from "~/theme/PaperProvider";
import { Segmented } from "~/ui/Segmented";
import { T } from "~/ui/T";

export default function MotionLab() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Lab />;
}

function Lab() {
  const { c } = useTheme();
  const s = usePaperSettings();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.paper }}>
      <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={styles.head}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Kicker label="Dev only" tone="lilac" />
            <Button label="Close" variant="soft" size="sm" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
          </View>
          <T v="hero">Motion Lab</T>
        </View>
        <View style={[styles.controls, { backgroundColor: c.paper, borderBottomColor: c.line }]}>
          <Segmented label="Theme" value={s.appearance} onChange={v => s.set({ appearance: v })}
            options={[{ value: "system", label: "System" }, { value: "day", label: "Day" }, { value: "night", label: "Night" }]} />
          <Segmented label="Motion" value={s.reduced} onChange={v => s.set({ reduced: v })}
            options={[{ value: "system", label: "System" }, { value: "on", label: "Reduced" }, { value: "off", label: "Full" }]} />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Segmented label="Type size" value={s.typeSize} onChange={v => s.set({ typeSize: v })}
              options={[{ value: "System", label: "Aa" }, { value: "XXL", label: "XXL" }, { value: "AX3", label: "AX3" }]} />
            <Segmented label="Speed" value={s.speed} onChange={v => s.set({ speed: v })}
              options={[{ value: 1, label: "1×" }, { value: 4, label: "4× slow" }]} />
          </View>
        </View>
        <CheckInLab />
        <StampLab />
        <TickLab />
        <ButtonLab />
        <PaperLab />
        <TypeLab />
        <PaletteLab />
        <IconLab />
        <HapticsLab />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 18, paddingTop: 8, gap: 10 },
  controls: { paddingHorizontal: 18, paddingVertical: 12, gap: 8, borderBottomWidth: 1.5 },
});
