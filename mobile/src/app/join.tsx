/**
 * Signed in, on no roster anywhere (U2): "Ask an officer for your chapter's invite link."
 *
 * A paste chip reads the clipboard; a link that holds a token is checked at once
 * (GET /api/auth/invite-status) and turns into an invite ticket with the chapter's name
 * and logo. A dead link becomes a ticket stamped with why (EXPIRED, VOID, FULL) and the
 * server's sentence. A live one asks for my name as the chapter will know me; "Ask to
 * join" (POST /api/auth/request-join) stamps the ticket SENT, and once the stamp has
 * landed the app moves on to the awaiting letter. Typing the link works too.
 *
 * There's no path to start a chapter in v1. Opening invite links straight into the app
 * is Phase 7.
 */
import type { InviteStatusResponse, RequestJoinResponse } from "@/lib/api-types";
import { submitJoinRequestInput } from "@/lib/validation/join-request";
import { useMutation } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, ReduceMotion } from "react-native-reanimated";
import { api } from "~/api/client";
import { isApiError } from "~/api/errors";
import { keys, useMobileConfig } from "~/data/hooks";
import { queryClient } from "~/data/query";
import { ChapterMark } from "~/entry/ChapterMark";
import { useEntryOf } from "~/entry/EntryContext";
import { tokenFrom } from "~/entry/invite";
import { signOutHere } from "~/entry/session";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Pill } from "~/paper/bits";
import { Stamp, type StampState } from "~/paper/Stamp";
import { Ticket } from "~/paper/Ticket";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { Field } from "~/ui/Field";
import { Fine, Page } from "~/ui/Page";
import { T } from "~/ui/T";

const DEAD_STAMP: Record<string, string> = { expired: "Expired", revoked: "Void", exhausted: "Full", reserved: "Void", not_found: "No such link" };
/** After SENT lands, how long the ticket rests before the awaiting letter replaces it. */
const SENT_REST = 700;

export default function Join() {
  const { c } = useTheme();
  const m = useMotion();
  const entry = useEntryOf("join");
  const mobileConfig = useMobileConfig();
  const [link, setLink] = useState("");
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [sent, setSent] = useState<StampState>("hidden");

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
      haptics.select();
      if (status.valid && status.state === "already_member") void queryClient.invalidateQueries({ queryKey: ["me"] });
      if (status.valid && !name) setName(status.submittedName ?? status.account?.name ?? "");
    },
  });

  const request = useMutation({
    mutationFn: (body: unknown) => api<RequestJoinResponse>("/api/auth/request-join", { method: "POST", body, org: null }),
    onSuccess: res => {
      if (res.state === "already_member") { void queryClient.invalidateQueries({ queryKey: ["me"] }); return; }
      setSent("in");
    },
    onError: () => haptics.error(),
  });

  const status = check.data;
  const token = tokenFrom(link);

  const take = (text: string) => {
    setLink(text);
    check.reset();
    request.reset();
    setSent("hidden");
    const t = tokenFrom(text);
    if (t && /\/join\//.test(text)) check.mutate(t);
  };

  const paste = async () => {
    haptics.tap();
    const text = (await Clipboard.getStringAsync().catch(() => "")).trim();
    if (!text) { toast.show("Nothing to paste", { detail: "Copy the invite link an officer sent you, then tap Paste." }); return; }
    if (!/\/join\/[^/?#\s]+/.test(text)) { setTyping(true); setLink(text); toast.show("That doesn't look like an invite link", { detail: "It should have /join/ in it." }); return; }
    take(text);
  };

  function send() {
    const parsed = submitJoinRequestInput.safeParse({ token, name, termsVersion: mobileConfig.data?.termsVersion });
    if (!parsed.success) { setNameError(parsed.error.issues[0]?.message ?? "Check the form"); return; }
    setNameError(null);
    request.mutate(parsed.data);
  }

  const rejected = entry?.requests.filter(r => r.status === "rejected") ?? [];
  const org = status?.org ?? null;
  const enter = m.reduced ? FadeIn.duration(m.t(180)).reduceMotion(ReduceMotion.Never) : FadeInDown.duration(m.t(320)).reduceMotion(ReduceMotion.Never);

  return (
    <Page
      kicker="No chapter yet"
      tone="sky"
      title="Ask an officer for your chapter's invite link."
      lede="Paste it here and an officer will let you in. Chapters are set up by their officers on chaptos.com."
      footer={<Button label="Sign out" variant="soft" block onPress={() => void signOutHere()} />}
    >
      {!status ? (
        <View style={{ gap: 12 }}>
          <Pressable onPress={() => void paste()} accessibilityRole="button" accessibilityLabel="Paste invite link"
            style={({ pressed }) => [styles.chip, { borderColor: c.ink, backgroundColor: c.pastel.sky.soft, boxShadow: `${pressed ? 1 : 3}px ${pressed ? 1 : 3}px 0 ${c.pastel.sky.fill}`, transform: [{ translateX: pressed ? 2 : 0 }, { translateY: pressed ? 2 : 0 }] }]}>
            <Icon name="link" size={18} color={c.pastel.sky.ink} />
            <View style={{ flex: 1 }}>
              <T v="callout">{check.isPending ? "Checking the link…" : "Paste invite link"}</T>
              <T v="meta" color={c.ink3} numberOfLines={1}>{link && !typing ? link : "chaptos.com/join/…"}</T>
            </View>
            <Icon name="copy" size={16} color={c.ink3} />
          </Pressable>
          {typing ? (
            <>
              <Field label="Invite link" placeholder="https://chaptos.com/join/…" autoCapitalize="none" autoCorrect={false} autoFocus
                value={link} onChangeText={v => { setLink(v); check.reset(); }} returnKeyType="go" onSubmitEditing={() => token && check.mutate(token)} />
              <Button label={check.isPending ? "Checking…" : "Check link"} block disabled={!token || check.isPending} onPress={() => check.mutate(token)} />
            </>
          ) : (
            <Pressable onPress={() => setTyping(true)} hitSlop={8} accessibilityRole="button">
              <T v="meta" color={c.ink3} align="center" style={{ textDecorationLine: "underline" }}>Or type it in</T>
            </Pressable>
          )}
          {check.error ? <T v="callout" color={c.risk}>{check.error.message}</T> : null}
        </View>
      ) : (
        <Animated.View entering={enter} style={{ gap: 14 }}>
          <View>
            <Ticket tone={status.valid ? "mint" : "rose"}
              stub={<ChapterMark name={org?.name ?? "?"} logoUrl={org?.logoUrl ?? null} size={44} />}
              body={<View style={{ gap: 2 }}>
                <T v="label" color={c.ink3}>Invite</T>
                <T v="title" numberOfLines={2} style={{ fontSize: 20 }}>{org?.name ?? "Unknown chapter"}</T>
                <T v="mono" color={c.ink3} numberOfLines={1} style={{ fontSize: 10.5 }}>{org ? `chaptos.com/org/${org.slug}` : "chaptos.com"}</T>
              </View>} />
            {!status.valid ? <Stamp label={DEAD_STAMP[status.reason] ?? "Void"} tone="rose" state="in" size="md" rotate={-9} style={styles.stamp} /> : null}
            {sent !== "hidden" ? (
              <Stamp label="Sent" tone="mint" state={sent} size="md" rotate={-8} style={styles.stamp}
                onImpact={() => { haptics.success(); setTimeout(() => void queryClient.invalidateQueries({ queryKey: keys.joinRequests }), m.t(SENT_REST)); }} />
            ) : null}
          </View>

          {!status.valid ? (
            <T v="body" color={c.ink2}>{status.message}</T>
          ) : status.state === "rejected" ? (
            <T v="body" color={c.ink2}>Your request to join wasn't approved. Ask an officer for a new link.</T>
          ) : status.state === "pending" ? (
            <T v="body" color={c.ink2}>You've already asked to join. An officer will review it.</T>
          ) : status.state === "already_member" ? (
            <T v="body" color={c.ink2}>You're already a member. Opening it…</T>
          ) : sent === "hidden" ? (
            <View style={styles.form}>
              <Field label="Your name, as the chapter knows you" value={name} onChangeText={setName} error={nameError}
                autoComplete="name" returnKeyType="send" onSubmitEditing={send} />
              <T v="meta" color={c.ink3}>
                {`By asking to join you agree to the ChaptOS Terms of Service${mobileConfig.data ? ` (version ${mobileConfig.data.termsVersion})` : ""}.`}
              </T>
              <Button label={request.isPending ? "Sending…" : "Ask to join"} icon="send" block
                disabled={request.isPending || !mobileConfig.data} onPress={send} />
              {request.error ? <T v="callout" color={c.risk}>{request.error.message}</T> : null}
            </View>
          ) : (
            <T v="body" color={c.ink2}>Sent. An officer will look at it.</T>
          )}

          {sent === "hidden" ? <Button label="Use a different link" variant="ghost" size="sm" icon="refresh" style={{ alignSelf: "center" }}
            onPress={() => { setLink(""); check.reset(); request.reset(); }} /> : null}
        </Animated.View>
      )}

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
  chip: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" },
  stamp: { position: "absolute", right: 22, top: 18 },
  form: { gap: 12 },
  past: { gap: 8, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
