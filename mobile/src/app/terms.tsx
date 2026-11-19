/**
 * The terms wall (U2): the same hard wall as the web's TermsGate. One paper sheet (it
 * scrolls, so it stays whole at the largest text sizes), one ink button, no "not now".
 * Signing out is a quiet line under the sheet, not a second button.
 */
import type { AcceptTermsResponse, MeResponse } from "@/lib/api-types";
import type { acceptTermsInput } from "@/lib/validation/terms";
import { useMutation } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { z } from "zod";
import { api } from "~/api/client";
import { config } from "~/config";
import { keys } from "~/data/hooks";
import { queryClient } from "~/data/query";
import { useEntryOf } from "~/entry/EntryContext";
import { signOutHere } from "~/entry/session";
import { Icon } from "~/icons/Icon";
import { Button } from "~/paper/Button";
import { Kicker } from "~/paper/bits";
import { activeOrg } from "~/state/org";
import { hard } from "~/theme/shadow";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

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
  const read = () => void WebBrowser.openBrowserAsync(`${config.apiUrl}/terms`);

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: c.paper }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.sheet, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.butter.fill, 5)]}>
          <Kicker label={`Terms of Service · v${version}`} tone="butter" />
          <T v="hero" accessibilityRole="header">{updated ? "We've updated our terms." : "One thing first."}</T>
          <T v="body" color={c.ink2}>
            {updated
              ? "Agree to the new version to keep using your chapter's workspace."
              : "Agree to the ChaptOS Terms of Service to use your chapter's workspace."}
          </T>
          <Pressable onPress={read} accessibilityRole="link" style={({ pressed }) => [styles.link, { borderColor: c.line2, opacity: pressed ? 0.6 : 1 }]}>
            <Icon name="doc" size={18} color={c.ink2} />
            <T v="callout" style={{ flex: 1 }}>Read the terms</T>
            <Icon name="out" size={15} color={c.ink3} />
          </Pressable>
          {accept.error ? <T v="callout" color={c.risk}>{accept.error.message}</T> : null}
          <Button label={accept.isPending ? "Saving…" : "I agree"} icon="arrow-r" block haptic="success"
            disabled={accept.isPending || !version} onPress={() => accept.mutate({ version })} />
        </View>
        <Pressable onPress={() => void signOutHere()} hitSlop={10} accessibilityRole="button" style={{ alignSelf: "center" }}>
          <T v="meta" color={c.ink3} style={{ textDecorationLine: "underline" }}>Not you? Sign out</T>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  body: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 18 },
  sheet: { gap: 14, padding: 20, borderWidth: 1.5, borderRadius: 6, borderTopRightRadius: 16, transform: [{ rotate: "-0.4deg" }] },
  link: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1.5, borderRadius: 12 },
});
