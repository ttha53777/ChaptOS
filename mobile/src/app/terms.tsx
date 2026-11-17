import type { AcceptTermsResponse, MeResponse } from "@/lib/api-types";
import type { acceptTermsInput } from "@/lib/validation/terms";
import { useMutation } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { StyleSheet } from "react-native";
import type { z } from "zod";
import { api } from "~/api/client";
import { config } from "~/config";
import { useEntryOf } from "~/entry/EntryContext";
import { signOutHere } from "~/entry/session";
import { keys } from "~/data/hooks";
import { queryClient } from "~/data/query";
import { activeOrg } from "~/state/org";
import { Button } from "~/paper/Button";
import { Surface } from "~/paper/bits";
import { useTheme } from "~/theme/PaperProvider";
import { Page } from "~/ui/Page";
import { T } from "~/ui/T";

/** The same hard wall as the web's TermsGate: no "not now". */
export default function Terms() {
  const { c } = useTheme();
  const entry = useEntryOf("terms");
  const version = entry?.me.terms.version ?? "";
  const accept = useMutation({
    mutationFn: (body: z.input<typeof acceptTermsInput>) => api<AcceptTermsResponse>("/api/auth/terms", { method: "POST", body }),
    onSuccess: terms => {
      // The answer is the fresh TermsStatus: patch /me rather than refetching it.
      queryClient.setQueryData<MeResponse | null>(keys.me(activeOrg.get().slug), me => (me ? { ...me, terms } : me));
    },
  });
  const updated = entry?.me.terms.acceptedVersion != null;

  return (
    <Page
      kicker="Terms of Service"
      tone="butter"
      title={updated ? "We've updated our terms." : "One thing first."}
      lede={`Agree to the ChaptOS Terms of Service (version ${version}) to keep using your chapter's workspace.`}
      footer={<>
        <Button label={accept.isPending ? "Saving…" : "I agree"} icon="arrow-r" block haptic="success"
          disabled={accept.isPending || !version} onPress={() => accept.mutate({ version })} />
        <Button label="Sign out" variant="soft" block onPress={() => void signOutHere()} />
      </>}
    >
      <Button label="Read the terms" variant="ghost" icon="doc" onPress={() => void WebBrowser.openBrowserAsync(`${config.apiUrl}/terms`)} />
      {accept.error ? (
        <Surface inked="rose" style={styles.note}><T v="callout" color={c.risk}>{accept.error.message}</T></Surface>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({ note: { padding: 14 } });
