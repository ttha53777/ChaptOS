/**
 * Segmented control (`.dk-seg` in the mock): a paper-2 track with the chosen option
 * lifted onto a card. Used by the Motion Lab now and Me → On this phone later.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { haptics } from "~/motion/haptics";
import { useTheme } from "~/theme/PaperProvider";
import { soft } from "~/theme/shadow";
import { T } from "./T";

export function Segmented<V extends string | number>({ value, options, onChange, label }: {
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (v: V) => void;
  label: string;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.track, { backgroundColor: c.paper2, borderColor: c.line }]}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => { if (!on) { haptics.select(); onChange(o.value); } }}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.opt, on && [{ backgroundColor: c.card }, soft(c.sh1)]]}
          >
            <T v="buttonSm" color={on ? c.ink : c.ink3}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", alignSelf: "flex-start", padding: 3, gap: 3, borderRadius: 999, borderWidth: 1.5 },
  opt: { paddingVertical: 6, paddingHorizontal: 13, borderRadius: 999, minHeight: 30, justifyContent: "center" },
});
