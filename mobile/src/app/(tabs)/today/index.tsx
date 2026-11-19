/**
 * Today (U3): the live check-in band when a window is open, Up next, On your plate,
 * and the chapter's announcement. One round trip (GET /api/home) plus the
 * announcement; the live check-in rides its own key so it can poll and be prefetched
 * on foreground (src/data/home.ts).
 *
 * States: first load = skeletons in the ticket's and rows' shapes; no data and an
 * error = ErrorState; offline or a failed refresh over last-known data (restored from
 * the persisted cache) = StaleNote; nothing on the Timeline / plate = compact empties.
 * There's no Ask bar yet: Ask Chapt is Phase 4.
 */
import type { LiveCheckIn } from "@/lib/api-types";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAnnouncement, useHome, useLiveCheckIn, useScreenFocused } from "~/data/home";
import { useEntryOf } from "~/entry/EntryContext";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, FadeIn, SkeletonCard, StaleNote } from "~/shell/states";
import { AnnouncementNote, NoNote } from "~/today/AnnouncementNote";
import { canPin, noteOn, NoteEditor } from "~/today/NoteEditor";
import { AskBar } from "~/today/AskBar";
import { CheckInBand } from "~/today/CheckInBand";
import { bandVisible, useNow } from "~/today/live";
import { Plate } from "~/today/Plate";
import { AfterThat, UpNextTicket } from "~/today/UpNext";

const toTimeline = () => router.navigate("/(tabs)/timeline");

export default function Today() {
  const entry = useEntryOf("ready");
  const focused = useScreenFocused();
  const home = useHome();
  const live = useLiveCheckIn(focused);
  const note = useAnnouncement();
  const [writing, setWriting] = useState(false);

  if (!entry) return null;
  const pin = canPin(entry.me);
  const first = entry.me.name.split(" ")[0] || entry.me.name;
  const subtitle = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const refresh = () => Promise.all([home.refetch(), live.refetch(), note.refetch()]);
  const h = home.data;

  return (
    <Screen title={`Hi, ${first}.`} subtitle={subtitle} large org onRefresh={refresh}>
      {h ? <StaleNote updatedAt={home.dataUpdatedAt} failed={home.isError} onRetry={() => void home.refetch()} /> : null}

      <AskBar />

      {live.data ? (
        <LiveBand live={live.data} fetchedAt={live.dataUpdatedAt} ticking={focused} />
      ) : null}

      {h ? (
        <FadeIn style={{ gap: 16 }}>
          {h.upNext[0] ? (
            <>
              <UpNextTicket event={h.upNext[0]} today={h.today} onPress={toTimeline} />
              <AfterThat events={h.upNext.slice(1)} today={h.today} onPress={toTimeline} />
            </>
          ) : (
            <EmptyState compact title="Nothing coming up." line="When your chapter adds an event to the Timeline, the next one shows here with a countdown." />
          )}
          <Plate plate={h.plate} today={h.today} />
        </FadeIn>
      ) : home.isError ? (
        <ErrorState title="Couldn't load Today." error={home.error} onRetry={() => void home.refetch()} />
      ) : (
        <View style={styles.sk}>
          <SkeletonCard height={190} lines={3} lead radius={24} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </View>
      )}

      {note.data && noteOn(entry.me) ? <AnnouncementNote a={note.data} onEdit={pin ? () => setWriting(true) : undefined} />
        : pin && note.isSuccess ? <NoNote onWrite={() => setWriting(true)} /> : null}
      {pin ? <NoteEditor open={writing} current={note.data} onClose={() => setWriting(false)} /> : null}
    </Screen>
  );
}

/** The band with its own one-second clock, so only it re-renders as the window counts down. */
function LiveBand({ live, fetchedAt, ticking }: { live: LiveCheckIn; fetchedAt: number; ticking: boolean }) {
  const now = useNow(ticking);
  if (!bandVisible(live, fetchedAt, now)) return null;
  return <CheckInBand live={live} fetchedAt={fetchedAt} now={now} onPress={() => router.push("/checkin")} />;
}

const styles = StyleSheet.create({ sk: { gap: 12 } });
