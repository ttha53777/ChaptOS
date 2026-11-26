/**
 * Full-screen check-in, opened from Today's band. The CheckInTicket moment wired to
 * POST /api/attendance/[eventId]/check-in (DELETE undoes).
 *
 *   tap I'm here   optimistic: the stub tears and HERE lands before the server answers;
 *                  then a toast with the 10s Undo ring
 *   Undo           (toast or the stub's own button) the ink lifts, the stub reattaches,
 *                  DELETE goes out
 *   refused        the ticket plays backwards (smear, blush, shake, reattach) and the
 *                  toast says why: the window closed first, an approved excuse already
 *                  counts you, or the phone is offline. The window is re-read so the
 *                  ticket shows what's really true.
 *   cancelled      rose VOID stamp, "not counted", no button
 *   first time     after a check-in goes through, the one-time push offer (~/push/PushOffer)
 *
 * The live check-in comes from the cache the band filled (and the foreground prefetch),
 * so this opens instantly; it keeps polling while open.
 */
import type { LiveCheckIn } from "@/lib/api-types";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ApiError, NetworkError, errorMessage } from "~/api/errors";
import { refreshLive, setCheckedIn, useLiveCheckIn } from "~/data/home";
import { CheckInTicket, type CheckInTicketHandle } from "~/moments/CheckInTicket";
import { Avatar } from "~/paper/bits";
import { setOnCheckInScreen } from "~/push";
import { PushOffer } from "~/push/PushOffer";
import { Button } from "~/paper/Button";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonCard } from "~/shell/states";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { endedLine, ticketFace, useNow, windowView } from "~/today/live";
import { T } from "~/ui/T";

/** Why the server said no, in words a member can act on. `short` goes under the button. */
function refusal(e: unknown): { title: string; detail: string; short: string } {
  if (e instanceof NetworkError) {
    return { title: "You're offline", detail: "Nothing was recorded. Check in again once you're connected.", short: "Not sent: you're offline." };
  }
  if (e instanceof ApiError) {
    if (e.status === 409) return { title: "You're already accounted for", detail: e.message, short: e.message };
    if (e.status === 400 && /not open|closed/i.test(e.message)) {
      return { title: "Check-in closed first", detail: "The window closed before your tap reached the server. Nothing was recorded.", short: "The window had closed." };
    }
    if (e.status === 404) return { title: "That meeting is gone", detail: "It may have been deleted. Nothing was recorded.", short: "The meeting is gone." };
  }
  const msg = errorMessage(e, "Couldn't check you in.");
  return { title: "Couldn't check you in", detail: msg, short: msg };
}

export default function CheckIn() {
  const live = useLiveCheckIn(true);
  // A check-in push arriving while this screen is up doesn't banner over it.
  useEffect(() => { setOnCheckInScreen(true); return () => setOnCheckInScreen(false); }, []);
  const done = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <Screen title="Check-in" right={<Button label="Done" variant="soft" size="sm" onPress={done} />} onRefresh={() => live.refetch()}>
      {live.data ? (
        <Live live={live.data} fetchedAt={live.dataUpdatedAt} />
      ) : live.data === null ? (
        <EmptyState
          pictures={[{ icon: "hand", tone: "mint", label: "Tap I'm here" }, { icon: "ticket", tone: "butter", label: "Get stamped" }, { icon: "people", tone: "sky", label: "See who came" }]}
          title="No check-in is open."
          line="When an officer opens check-in at a meeting, it shows on Today and you tap yourself in here."
          action={{ label: "Back to Today", onPress: done }}
        />
      ) : live.isError ? (
        <ErrorState title="Couldn't load check-in." error={live.error} onRetry={() => void live.refetch()} />
      ) : (
        <SkeletonCard height={260} lines={3} lead radius={24} />
      )}
    </Screen>
  );
}

function Live({ live, fetchedAt }: { live: LiveCheckIn; fetchedAt: number }) {
  const { c } = useTheme();
  const ticket = useRef<CheckInTicketHandle>(null);
  const now = useNow(true);
  const { win, closingLabel } = windowView(live, fetchedAt, now);
  const face = ticketFace(live);
  const id = live.event.id;
  // After a check-in goes through, offer push once (~/push/PushOffer).
  const [justIn, setJustIn] = useState(false);

  async function checkIn() {
    try {
      await setCheckedIn(id, true);
      setJustIn(true);
      // The ticket plays the undo when it's on screen; after Done, the toast's Undo still works.
      toast.show("You're checked in", {
        detail: live.event.title, tone: "mint",
        undo: () => { if (ticket.current) ticket.current.undo(); else undo().catch(() => {}); },
      });
    } catch (e) {
      const why = refusal(e);
      toast.error(why.title, { detail: why.detail });
      void refreshLive();
      throw new Error(why.short);
    }
  }

  async function undo() {
    toast.dismiss();
    try {
      await setCheckedIn(id, false);
      toast.show("Check-in taken back", { detail: "You're not checked in.", tone: "sky", icon: "refresh" });
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 400 ? "The window has closed, so your check-in stands." : errorMessage(e, "Couldn't undo that.");
      toast.error("Couldn't take it back", { detail: msg });
      void refreshLive();
      throw new Error(msg);
    }
  }

  return (
    <View style={{ gap: 18 }}>
      <CheckInTicket
        ref={ticket}
        title={live.event.title}
        dow={face.dow}
        day={face.day}
        meta={face.meta}
        window={win}
        closingLabel={closingLabel ?? undefined}
        closedLine={endedLine(live) ?? undefined}
        checkedIn={live.me.checkedIn}
        excuse={live.me.excuse}
        others={live.presentCount - (live.me.checkedIn ? 1 : 0)}
        of={live.eligibleCount}
        onCheckIn={checkIn}
        onUndo={undo}
      />

      <PushOffer when={justIn} />

      {win === "void" ? (
        <T v="meta" color={c.ink3}>{endedLine(live)}</T>
      ) : live.recent.length ? (
        <View style={{ gap: 10 }}>
          <T v="label" color={c.ink3}>Last in</T>
          {live.recent.map(r => (
            <View key={r.brotherId} style={styles.arrival}>
              <Avatar name={r.name} uri={r.avatarUrl} size="sm" />
              <T v="callout" style={{ flex: 1 }} numberOfLines={1}>{r.name}</T>
              <T v="mono" color={c.ink3}>{new Date(r.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</T>
            </View>
          ))}
        </View>
      ) : (
        <T v="meta" color={c.ink3}>Nobody's in yet.</T>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ arrival: { flexDirection: "row", alignItems: "center", gap: 10 } });
