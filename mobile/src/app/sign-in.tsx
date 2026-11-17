import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { signIn, signInRedirectUrl } from "~/auth";
import { config, configProblem } from "~/config";
import { Button } from "~/paper/Button";
import { StickyNote, Surface } from "~/paper/bits";
import { useTheme } from "~/theme/PaperProvider";
import { Fine, Page } from "~/ui/Page";
import { T } from "~/ui/T";

/** Phase 2's temporary dev sign-in. Phase 7 replaces it with native Google + Apple. */
export default function SignIn() {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = configProblem();

  async function go() {
    setBusy(true);
    setError(null);
    const result = await signIn().catch((e: unknown) => ({ ok: false as const, cancelled: false, message: String(e) }));
    // Success needs nothing here: the session change moves the app on.
    if (!result.ok && !result.cancelled) setError(result.message);
    setBusy(false);
  }

  return (
    <Page
      kicker="ChaptOS"
      title="Sign in to your chapter."
      lede="Use the Google account you use for ChaptOS on the web."
      footer={<>
        <Button label={busy ? "Opening Google…" : "Continue with Google"} icon="arrow-r" block disabled={busy || !!problem} onPress={go} />
        {__DEV__ ? <Fine>{`API ${config.apiUrl}`}</Fine> : null}
      </>}
    >
      {error || problem ? (
        <Surface inked="rose" style={styles.note}>
          <T v="callout" color={c.risk}>{problem ?? error}</T>
        </Surface>
      ) : null}
      {__DEV__ ? (
        <StickyNote rotate={-1}>
          <View style={styles.dev}>
            <T v="label" color={c.note.ink}>Dev sign-in</T>
            <T v="meta" color={c.note.ink}>{`Redirect: ${signInRedirectUrl()}`}</T>
            <T v="meta" color={c.note.ink}>It must be in Supabase's redirect allowlist.</T>
          </View>
        </StickyNote>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  note: { padding: 14 },
  dev: { gap: 4 },
});
