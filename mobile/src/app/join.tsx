/**
 * Signed in, on no roster anywhere: "Ask an officer for your chapter's invite
 * link", and a field to paste it. There is no path to start a chapter in v1.
 * Pasting checks the link (invite-status), then files a join request
 * (request-join). Opening invite links straight into the app is Phase 7.
 */
import type { InviteStatusResponse, RequestJoinResponse } from "@/lib/api-types";
import { submitJoinRequestInput } from "@/lib/validation/join-request";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { api } from "~/api/client";
import { isApiError } from "~/api/errors";
import { keys, useMobileConfig } from "~/data/hooks";
import { queryClient } from "~/data/query";
import { useEntryOf } from "~/entry/EntryContext";
import { tokenFrom } from "~/entry/invite";
import { signOutHere } from "~/entry/session";
import { Button } from "~/paper/Button";
import { Pill, Surface } from "~/paper/bits";
import { useTheme } from "~/theme/PaperProvider";
import { Field } from "~/ui/Field";
import { Fine, Page } from "~/ui/Page";
import { T } from "~/ui/T";

export default function Join() {
  const { c } = useTheme();
  const entry = useEntryOf("join");
  const mobileConfig = useMobileConfig();
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const check = useMutation({
    mutationFn: async (token: string) => {
      try {
        return await api<InviteStatusResponse>("/api/auth/invite-status", { query: { token }, org: null });
      } catch (e) {
        // A dead link answers 404/410 with the same shape: show it, don't throw it.
        if (isApiError(e) && (e.status === 404 || e.status === 410) && e.body) return e.body as InviteStatusResponse;
        throw e;
      }
    },
    onSuccess: status => {
      if (status.valid && status.state === "already_member") void queryClient.invalidateQueries({ queryKey: ["me"] });
      if (status.valid && !name) setName(status.submittedName ?? status.account?.name ?? "");
    },
  });

  const request = useMutation({
    mutationFn: (body: unknown) => api<RequestJoinResponse>("/api/auth/request-join", { method: "POST", body, org: null }),
    onSuccess: res => {
      // Pending → the awaiting screen; already a member → straight in.
      void queryClient.invalidateQueries({ queryKey: res.state === "already_member" ? ["me"] : keys.joinRequests });
    },
  });

  const status = check.data;
  const token = tokenFrom(link);

  function send() {
    const parsed = submitJoinRequestInput.safeParse({ token, name, termsVersion: mobileConfig.data?.termsVersion });
    if (!parsed.success) { setNameError(parsed.error.issues[0]?.message ?? "Check the form"); return; }
    setNameError(null);
    request.mutate(parsed.data);
  }

  const rejected = entry?.requests.filter(r => r.status === "rejected") ?? [];

  return (
    <Page
      kicker="No chapter yet"
      tone="sky"
      title="Ask an officer for your invite link."
      lede="Paste it here and an officer will let you in. Chapters are set up by their officers on chaptos.com."
      footer={<Button label="Sign out" variant="soft" block onPress={() => void signOutHere()} />}
    >
      <Field label="Invite link" placeholder="https://chaptos.com/join/…" autoCapitalize="none" autoCorrect={false}
        value={link} onChangeText={v => { setLink(v); check.reset(); request.reset(); }} />
      {!status ? (
        <Button label={check.isPending ? "Checking…" : "Check link"} block disabled={!token || check.isPending} onPress={() => check.mutate(token)} />
      ) : null}

      {check.error ? <T v="callout" color={c.risk}>{check.error.message}</T> : null}

      {status && !status.valid ? (
        <Surface inked="rose" style={styles.card}>
          <T v="title">{status.org?.name ?? "This link"}</T>
          <T v="body" color={c.ink2}>{status.message}</T>
        </Surface>
      ) : null}

      {status?.valid ? (
        <Surface inked="mint" style={styles.card}>
          <T v="title">{status.org?.name ?? "Your chapter"}</T>
          {status.state === "rejected" ? (
            <T v="body" color={c.ink2}>Your request to join wasn't approved. Ask an officer for a new link.</T>
          ) : status.state === "pending" ? (
            <T v="body" color={c.ink2}>You've already asked to join. An officer will review it.</T>
          ) : status.state === "already_member" ? (
            <T v="body" color={c.ink2}>You're already a member. Opening it…</T>
          ) : (
            <View style={styles.form}>
              <Field label="Your name, as the chapter knows you" value={name} onChangeText={setName} error={nameError}
                autoComplete="name" returnKeyType="send" onSubmitEditing={send} />
              <T v="meta" color={c.ink3}>
                {`By asking to join you agree to the ChaptOS Terms of Service${mobileConfig.data ? ` (version ${mobileConfig.data.termsVersion})` : ""}.`}
              </T>
              <Button label={request.isPending ? "Sending…" : "Ask to join"} icon="send" block haptic="success"
                disabled={request.isPending || !mobileConfig.data} onPress={send} />
              {request.error ? <T v="callout" color={c.risk}>{request.error.message}</T> : null}
            </View>
          )}
        </Surface>
      ) : null}

      {rejected.length ? (
        <View style={styles.past}>
          {rejected.map(r => (
            <View key={r.id} style={styles.row}>
              <T v="callout" style={{ flex: 1 }}>{r.org.name}</T>
              <Pill label="Not approved" tone="rose" />
            </View>
          ))}
          <Fine>A new link from an officer lets you ask again.</Fine>
        </View>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 10 },
  form: { gap: 12, marginTop: 4 },
  past: { gap: 8, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
