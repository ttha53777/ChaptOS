import type { ReactNode } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Kicker, Surface } from "~/paper/bits";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

/** A tab whose content isn't built yet (UI phases U1/U2). Says so plainly. */
export function TabPlaceholder({ title, children }: { title: string; children?: ReactNode }) {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={["top"]} style={[styles.page, { backgroundColor: c.paper }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <T v="hero" accessibilityRole="header">{title}</T>
        {children ?? (
          <Surface dashed style={styles.card}>
            <Kicker label="Not built yet" tone="butter" />
            <T v="body" color={c.ink2}>This tab arrives with the core member screens.</T>
          </Surface>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  body: { padding: 18, paddingTop: 16, gap: 16 },
  card: { padding: 16, gap: 8 },
});
