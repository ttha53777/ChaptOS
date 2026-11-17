/**
 * The anchor route. Every guarded group redirects here when its guard turns
 * false, and this sends people on to wherever their entry state says they
 * belong. It also shows the loading and "can't reach the server" states, which
 * aren't places anyone navigates to.
 */
import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useEntryState } from "~/entry/EntryContext";
import { signOutHere } from "~/entry/session";
import { Button } from "~/paper/Button";
import { Kicker } from "~/paper/bits";
import { useTheme } from "~/theme/PaperProvider";
import { Page } from "~/ui/Page";

const ROUTE = {
  signedOut: "/sign-in",
  terms: "/terms",
  join: "/join",
  awaiting: "/awaiting",
  ready: "/today",
} as const;

export default function Index() {
  const entry = useEntryState();
  const { c } = useTheme();

  if (entry.kind === "loading") {
    return (
      <View style={[styles.center, { backgroundColor: c.paper }]} accessibilityLabel="Loading">
        <Kicker label="ChaptOS" />
        <ActivityIndicator color={c.ink3} style={{ marginTop: 16 }} />
      </View>
    );
  }

  if (entry.kind === "error") {
    return (
      <Page kicker="Offline?" tone="rose" title="Can't reach ChaptOS." lede={entry.error.message}
        footer={<>
          <Button label="Try again" icon="refresh" block onPress={entry.retry} />
          <Button label="Sign out" variant="soft" block onPress={() => void signOutHere()} />
        </>}
      />
    );
  }

  return <Redirect href={ROUTE[entry.kind]} />;
}


const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
