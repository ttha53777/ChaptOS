/**
 * More → Notifications. Two layers, said plainly:
 *
 *   this phone    whether the OS lets ChaptOS notify at all: on / Turn on (the OS
 *                 prompt) / off in the phone's settings (a quiet row with Open settings,
 *                 no nagging). The web preview says notifications live in the phone app.
 *   this chapter  which pushes this chapter sends you, one switch per category
 *                 (GET/PATCH /api/push/preferences). Officer-only ones (Requests to
 *                 join) only appear for people who can act on them.
 */
import { useEffect } from "react";
import { AppState, Linking, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { setPushPreference, usePushPreferences } from "~/data/push";
import { useEntryOf } from "~/entry/EntryContext";
import { haptics } from "~/motion/haptics";
import { askForPush, readPermission, usePushPermission } from "~/push";
import { Screen } from "~/shell/Screen";
import { ErrorState, SkeletonCard } from "~/shell/states";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { GrpLabel, Lede, Note, ScBtn, ScCard, ScCheck, ScPill, ScRow } from "~/settings/ledger";
import { T } from "~/ui/T";

export default function Notifications() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const prefs = usePushPreferences();
  const permission = usePushPermission();

  // Coming back from the phone's settings may have changed the answer.
  useEffect(() => {
    void readPermission();
    const sub = AppState.addEventListener("change", s => { if (s === "active") void readPermission(); });
    return () => sub.remove();
  }, []);

  if (!entry) return null;
  const orgName = entry.me.org?.name ?? "this chapter";

  const turnOn = async () => {
    const p = await askForPush();
    if (p === "granted") { haptics.success(); toast.show("Notifications on", { tone: "mint" }); }
  };
  const flip = async (id: Parameters<typeof setPushPreference>[0]["category"], enabled: boolean) => {
    try { await setPushPreference({ category: id, enabled }); }
    catch (e) { haptics.error(); toast.error("Couldn't save that", { detail: errorMessage(e, "Try again.") }); }
  };

  const phone = (() => {
    switch (permission) {
      case "granted":      return { pill: <ScPill label="On" tone="ok" />, line: "ChaptOS can notify this phone.", action: null };
      case "undetermined": return { pill: <ScPill label="Off" />, line: "Turn them on to hear when check-in opens, or when something lands on your plate.",
        action: <ScBtn kind="primary" small label="Turn on" onPress={() => void turnOn()} /> };
      case "denied":       return { pill: <ScPill label="Off" />, line: "Notifications are off for ChaptOS in your phone's settings.",
        action: <ScBtn small label="Open settings" onPress={() => void Linking.openSettings()} /> };
      default:             return { pill: <ScPill label="Phone app" />, line: "Notifications arrive in the ChaptOS phone app. Your choices below still save.", action: null };
    }
  })();

  return (
    <Screen title="Notifications" back="More" onRefresh={() => prefs.refetch()}>
      <View style={{ gap: 22, paddingBottom: 12 }}>
        <Lede>{`Choose what ${orgName} can buzz you about. Nothing is sent on a schedule; each one is something you can act on.`}</Lede>

        <View>
          <GrpLabel label="This phone" />
          <ScCard pad>
            <ScRow last style={{ gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T v="bodyStrong" size={14}>Notifications</T>
                  {phone.pill}
                </View>
                <Note>{phone.line}</Note>
              </View>
              {phone.action}
            </ScRow>
          </ScCard>
        </View>

        <View>
          <GrpLabel label={`In ${orgName}`} note={entry.me.memberships.length > 1 ? "Each chapter has its own switches." : undefined} />
          {prefs.data ? (
            <ScCard>
              {prefs.data.categories.map((cat, i) => (
                <View key={cat.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.card2 } : undefined}>
                  <ScCheck on={cat.enabled} label={cat.label} sub={cat.description} onChange={() => void flip(cat.id, !cat.enabled)} />
                </View>
              ))}
            </ScCard>
          ) : prefs.isError ? (
            <ErrorState compact title="Couldn't load your notifications." error={prefs.error} onRetry={() => void prefs.refetch()} />
          ) : (
            <SkeletonCard height={220} />
          )}
        </View>
      </View>
    </Screen>
  );
}
