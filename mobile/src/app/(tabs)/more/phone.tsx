/**
 * More → On this phone. Appearance only for now (notification categories arrive with
 * push in Phase 5). Remembered on this phone, not synced: it's a property of the device.
 */
import { StyleSheet, View } from "react-native";
import { Kicker, Surface } from "~/paper/bits";
import { Screen } from "~/shell/Screen";
import { usePaperSettings, useTheme } from "~/theme/PaperProvider";
import { Segmented } from "~/ui/Segmented";
import { T } from "~/ui/T";

export default function OnThisPhone() {
  const { c } = useTheme();
  const s = usePaperSettings();
  return (
    <Screen title="On this phone" back="More">
      <T v="title" accessibilityRole="header">On this phone</T>
      <Surface style={styles.card}>
        <Kicker label="Appearance" tone="butter" />
        <T v="body" color={c.ink2}>Day is ivory paper; night is a warm desk under a lamp.</T>
        <View>
          <Segmented label="Appearance" value={s.appearance} onChange={v => s.set({ appearance: v })}
            options={[{ value: "system", label: "System" }, { value: "day", label: "Day" }, { value: "night", label: "Night" }]} />
        </View>
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({ card: { padding: 16, gap: 12 } });
