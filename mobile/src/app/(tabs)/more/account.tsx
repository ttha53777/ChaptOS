/**
 * More → Delete my account. Plain, red ink only here and on Leave. First the server's
 * preview (GET /api/auth/account): which chapters I'm in and whether any of them stops
 * the deletion (I'm its last admin). If one does, the page says what to do and there's
 * no button. Otherwise: type DELETE, and DELETE /api/auth/account { confirm: "DELETE" }
 * erases me from every chapter and removes the sign-in; then this phone signs out.
 * A 409 (something changed since the preview) shows the fresh blockers.
 */
import type { AccountDeletionPreview } from "@/lib/api-types";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ApiError, errorMessage } from "~/api/errors";
import { deleteAccount, useAccountPreview } from "~/data/more";
import { signOutHere } from "~/entry/session";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Surface } from "~/paper/bits";
import { Screen } from "~/shell/Screen";
import { ErrorState, SkeletonCard } from "~/shell/states";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { Field } from "~/ui/Field";
import { T } from "~/ui/T";

export default function DeleteAccountPage() {
  const { c } = useTheme();
  const q = useAccountPreview(true);
  const [fresh, setFresh] = useState<AccountDeletionPreview | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const p = fresh ?? q.data;
  const blocked = p ? p.orgs.filter(o => o.blocker) : [];

  const del = () => {
    setBusy(true);
    setErr(null);
    deleteAccount().then(
      async () => { haptics.success(); toast.show("Your account is deleted"); await signOutHere(); },
      e => {
        setBusy(false);
        haptics.error();
        if (e instanceof ApiError && e.status === 409 && e.details && typeof e.details === "object" && "orgs" in e.details) setFresh(e.details as AccountDeletionPreview);
        setErr(errorMessage(e));
      },
    );
  };

  return (
    <Screen title="Delete account" back="More" onRefresh={() => { setFresh(null); return q.refetch(); }}>
      <T v="title" accessibilityRole="header">Delete your account?</T>
      {!p ? (q.isError ? <ErrorState title="Couldn't check your account." error={q.error} onRetry={() => void q.refetch()} /> : <SkeletonCard height={160} />) : (
        <>
          <Surface style={styles.card}>
            <T v="body" color={c.ink2}>This removes you from every chapter you're in and deletes your sign-in. It can't be undone.</T>
            {p.orgs.map(o => (
              <View key={o.slug} style={styles.org}>
                <View style={[styles.dot, { backgroundColor: o.blocker ? c.risk : c.ink3 }]} />
                <View style={{ flex: 1 }}>
                  <T v="callout">{o.name}</T>
                  {o.blocker === "last_admin" ? (
                    <T v="meta" color={c.risk}>{o.soleMember ? "You're the only one here. Delete the chapter on the web first." : "You're its last admin. Make someone else an admin on the web first."}</T>
                  ) : <T v="meta" color={c.ink3}>You come off the roster.</T>}
                </View>
              </View>
            ))}
            {p.isPlatformAdmin ? <T v="meta" color={c.risk}>You have staff access. Support has to remove that before the account can go.</T> : null}
          </Surface>
          {p.canDelete && !blocked.length ? (
            <>
              <Field label="Type DELETE to confirm" value={typed} onChangeText={t => { setTyped(t); setErr(null); }} autoCapitalize="characters" autoCorrect={false}
                placeholder="DELETE" error={err} />
              <Button label={busy ? "Deleting…" : "Delete my account"} icon="trash" tone="rose" block disabled={typed.trim() !== "DELETE" || busy} onPress={del} />
            </>
          ) : (
            <T v="body" color={c.ink2}>{err ?? "Sort out the chapters above, then come back."}</T>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  org: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
});
