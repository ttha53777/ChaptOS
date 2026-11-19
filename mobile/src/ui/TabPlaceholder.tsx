import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { Kicker, Surface } from "~/paper/bits";
import { Screen } from "~/shell/Screen";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

/** A tab whose content isn't built yet. Uses the real frame (large title, org stamp,
 *  pull to refresh) so the shell can be tried on every tab; says plainly what's missing. */
export function TabPlaceholder({ title, stage, onRefresh, children }: {
  title: string; stage?: string; onRefresh?: () => Promise<unknown>; children?: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <Screen title={title} large org onRefresh={onRefresh}>
      {children ?? (
        <Surface dashed style={styles.card}>
          <Kicker label="Not built yet" tone="butter" />
          <T v="body" color={c.ink2}>{stage ? `This tab arrives in ${stage}.` : "This tab arrives with the core member screens."}</T>
        </Surface>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ card: { padding: 16, gap: 8 } });
