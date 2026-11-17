import { Link } from "expo-router";
import { StyleSheet } from "react-native";
import { config } from "~/config";
import { useEntryOf } from "~/entry/EntryContext";
import { signOutHere } from "~/entry/session";
import { Button } from "~/paper/Button";
import { Kicker, Surface } from "~/paper/bits";
import { useTheme } from "~/theme/PaperProvider";
import { OrgSwitcher } from "~/ui/OrgSwitcher";
import { TabPlaceholder } from "~/ui/TabPlaceholder";
import { T } from "~/ui/T";

/** More, shell only: chapters (switch), sign out, and dev tools. Me/settings are U2. */
export default function More() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  if (!entry) return null;
  return (
    <TabPlaceholder title="More">
      <Surface style={styles.card}>
        <Kicker label="Chapters" tone="butter" />
        <OrgSwitcher me={entry.me} />
      </Surface>
      <Button label="Sign out" variant="ghost" icon="out" onPress={() => void signOutHere()} />
      {__DEV__ ? (
        <Surface dashed style={styles.card}>
          <Kicker label="Dev" tone="sky" />
          <T v="meta" color={c.ink3}>{`${config.variant} · v${config.appVersion} · ${config.apiUrl}`}</T>
          <Link href="/lab" asChild><Button label="Motion Lab" variant="soft" icon="spark" /></Link>
        </Surface>
      ) : null}
    </TabPlaceholder>
  );
}

const styles = StyleSheet.create({ card: { padding: 16, gap: 10 } });
