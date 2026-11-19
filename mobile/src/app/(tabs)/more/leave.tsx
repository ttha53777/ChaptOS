/**
 * More → Leave this chapter. Plain on purpose: what happens, then type the chapter's
 * short name to confirm (the server checks the same thing: POST /api/orgs/leave
 * { confirmSlug }). Red ink lives only here and on Delete account.
 *
 * Leaving deletes my Membership in this chapter (roles, dues, GPA, attendance figures
 * live on it); my account and my other chapters stay. The last admin can't leave (409) and is told to hand it over first. After it
 * goes through, the app moves to my next chapter (or the join screen when there isn't
 * one) and forgets this chapter's cached data.
 */
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { resetCache } from "~/data/query";
import { leaveOrg } from "~/data/more";
import { useEntryOf } from "~/entry/EntryContext";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Surface } from "~/paper/bits";
import { Screen } from "~/shell/Screen";
import { toast } from "~/shell/toast";
import { setActiveOrg } from "~/state/org";
import { useTheme } from "~/theme/PaperProvider";
import { Field } from "~/ui/Field";
import { T } from "~/ui/T";

export default function LeavePage() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!entry || !entry.me.org) return null;
  const me = entry.me;
  const org = me.org!;
  const slug = org.slug;
  const next = me.memberships.find(x => x.orgSlug !== org.slug) ?? null;
  const ok = typed.trim() === slug && slug !== "";

  const leave = () => {
    setBusy(true);
    setErr(null);
    leaveOrg(typed.trim()).then(
      async () => {
        haptics.success();
        toast.show(`You left ${org.name}`, next ? { detail: `Now in ${next.orgName}` } : undefined);
        setActiveOrg(next?.orgSlug ?? null);
        await resetCache();
        router.replace("/");
      },
      e => { setBusy(false); haptics.error(); setErr(errorMessage(e)); },
    );
  };

  return (
    <Screen title="Leave" back="More">
      <T v="title" accessibilityRole="header">Leave {org.name}?</T>
      <Surface style={styles.card}>
        <Line text={`You come off ${org.name}'s roster and lose access to its pages.`} />
        <Line text="Your row here goes with you: your roles, and the dues, GPA and attendance figures the chapter kept on it." />
        <Line text={next ? `Your account and your other ${me.memberships.length - 1 === 1 ? "chapter" : "chapters"} stay. You'll land in ${next.orgName}.` : "Your account stays. To come back, you'd need a new invite and an officer's approval."} />
      </Surface>
      <View style={{ gap: 6 }}>
        <Field label={`Type ${slug} to confirm`} value={typed} onChangeText={t => { setTyped(t); setErr(null); }} autoCapitalize="none" autoCorrect={false}
          placeholder={slug} returnKeyType="done" error={err} />
      </View>
      <Button label={busy ? "Leaving…" : `Leave ${org.name}`} icon="door" tone="rose" block disabled={!ok || busy} onPress={leave} />
      <T v="meta" color={c.ink3}>If you're the only admin, hand that to someone else on the web first.</T>
    </Screen>
  );
}

function Line({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.line}>
      <View style={[styles.dot, { backgroundColor: c.risk }]} />
      <T v="body" color={c.ink2} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  line: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
});
