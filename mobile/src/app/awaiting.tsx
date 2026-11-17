import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { keys } from "~/data/hooks";
import { useEntryOf } from "~/entry/EntryContext";
import { signOutHere } from "~/entry/session";
import { Button } from "~/paper/Button";
import { StickyNote } from "~/paper/bits";
import { useTheme } from "~/theme/PaperProvider";
import { Page } from "~/ui/Page";
import { T } from "~/ui/T";

/** A request is in; an officer hasn't decided. Checks back on its own every 30s. */
export default function Awaiting() {
  const { c } = useTheme();
  const entry = useEntryOf("awaiting");
  const qc = useQueryClient();
  const recheck = () => {
    void qc.invalidateQueries({ queryKey: keys.joinRequests });
    void qc.invalidateQueries({ queryKey: ["me"] });
  };
  useEffect(() => {
    const t = setInterval(recheck, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const org = entry?.request.org.name ?? "your chapter";
  return (
    <Page
      kicker="Request sent"
      tone="lilac"
      title={`Waiting for ${org}.`}
      lede="An officer will look at your request. You'll get in as soon as they approve it."
      footer={<>
        <Button label="Check again" icon="refresh" block onPress={recheck} />
        <Button label="Sign out" variant="soft" block onPress={() => void signOutHere()} />
      </>}
    >
      {entry ? (
        <StickyNote rotate={-1.5} style={styles.note}>
          <T v="callout" color={c.note.ink}>{`You asked as “${entry.request.submittedName}”.`}</T>
        </StickyNote>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({ note: { marginTop: 8 } });
