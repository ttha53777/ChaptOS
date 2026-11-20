/**
 * Today's way into Ask Chapt (mock `.askbar`): a dashed, empty-looking field with the
 * spark, "Ask Chapt about your chapter…". Pressed, it washes lilac. Opens /ask. Hidden
 * when Ask Chapt is switched off for the chapter.
 */
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useChatAvailability } from "~/data/chat";
import { Icon } from "~/icons/Icon";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export function AskBar() {
  const { c } = useTheme();
  const avail = useChatAvailability();
  if (avail.data && !avail.data.enabled) return null;
  return (
    <Pressable
      onPress={() => router.push("/ask")}
      accessibilityRole="button"
      accessibilityLabel="Ask Chapt about your chapter"
      style={({ pressed }) => [styles.bar, { borderColor: pressed ? c.pastel.lilac.ink : c.line2, backgroundColor: pressed ? c.pastel.lilac.soft : "transparent" }]}
    >
      <Icon name="spark" size={16} color={c.pastel.lilac.ink} />
      <T v="callout" color={c.ink3} style={{ flex: 1 }}>Ask Chapt about your chapter…</T>
      <View style={[styles.go, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}>
        <Icon name="arrow-r" size={13} color={c.pastel.lilac.ink} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16, minHeight: 50 },
  go: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
