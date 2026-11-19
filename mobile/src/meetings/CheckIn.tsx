/**
 * The officer's side of live check-in (POST /api/attendance/[eventId]/window,
 * MANAGE_ATTENDANCE). Members already tap in from Today's band and the ticket; this is
 * opening, closing and correcting the window.
 *
 *   OpenCheckInSheet   Create's "Open check-in": which event (the web's candidates:
 *                      today first, then upcoming by nearness, then past by recency; a
 *                      window that just closed reopens), then open it
 *   WindowPanel        on a meeting: Open check-in · the open window (tally, closing
 *                      clock, Close & record, Cancel) · closed (Reopen) · cancelled
 *                      (Restore)
 *
 * Close & record and Cancel confirm first: closing is the write that marks everyone who
 * didn't tap in absent; cancelling throws the check-ins out. Opening is one tap.
 * Each answer is the new LiveCheckIn, which goes straight into the live cache, so Today's
 * band follows at once.
 */
import type { CalendarEvent, LiveCheckIn } from "@/lib/api-types";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { useCalendar } from "~/data/calendar";
import { localDay, useLiveCheckIn } from "~/data/home";
import { setWindow } from "~/data/meetings";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { SkeletonList } from "~/shell/states";
import { toast } from "~/shell/toast";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { TickingNumber } from "~/paper/TickingNumber";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { endedLine, useNow, windowView } from "~/today/live";
import { clockLabel, daysFrom, mmss, relDay } from "~/today/time";
import { T } from "~/ui/T";
import { minutesOf, shortDate } from "./model";

type Action = "open" | "close" | "reopen" | "cancel" | "restore";

const SAID: Record<Action, { ok: string; fail: string }> = {
  open: { ok: "Check-in is open", fail: "Couldn't open check-in" },
  close: { ok: "Check-in closed", fail: "Couldn't close check-in" },
  reopen: { ok: "Check-in reopened", fail: "Couldn't reopen check-in" },
  cancel: { ok: "Check-in cancelled", fail: "Couldn't cancel check-in" },
  restore: { ok: "Check-in restored", fail: "Couldn't restore check-in" },
};

export async function runWindow(event: { id: number; title: string }, action: Action): Promise<boolean> {
  try {
    const live = await setWindow(event.id, action);
    // one haptic, on the result: the window opening or the roll being recorded is the moment; a cancel just lands
    if (action === "cancel") haptics.soft(); else haptics.success();
    const detail = action === "close" && live ? `${live.presentCount} of ${live.eligibleCount} made it; everyone else is marked absent.`
      : action === "cancel" ? "Nothing was recorded."
      : action === "open" || action === "reopen" ? `${event.title} · members tap in from Today.`
      : event.title;
    toast.show(SAID[action].ok, { detail });
    return true;
  } catch (e) {
    haptics.error();
    toast.error(SAID[action].fail, { detail: errorMessage(e) });
    return false;
  }
}

/** The web's checkInCandidates. */
export function checkInCandidates(events: CalendarEvent[], live: LiveCheckIn | null | undefined, today: string): CalendarEvent[] {
  return events
    .filter(e => e.mandatory && (e.id !== live?.event.id || live.state === "closed"))
    .map(e => ({ e, days: daysFrom(today, e.date) }))
    .sort((a, b) => {
      const rank = (d: number) => (d === 0 ? 0 : d > 0 ? 1 : 2);
      return rank(a.days) - rank(b.days) || Math.abs(a.days) - Math.abs(b.days) || (minutesOf(a.e) ?? 0) - (minutesOf(b.e) ?? 0);
    })
    .map(x => x.e);
}

/* ── Create → Open check-in ───────────────────────────────────────────────────── */

export function OpenCheckInSheet({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened: () => void }) {
  const { c } = useTheme();
  const cal = useCalendar();
  const live = useLiveCheckIn(false);
  const [busy, setBusy] = useState<number | null>(null);
  const today = localDay();
  const list = cal.data ? checkInCandidates(cal.data, live.data, today).slice(0, 8) : null;
  const running = live.data && live.data.state !== "closed" ? live.data : null;

  const go = async (e: CalendarEvent) => {
    if (busy) return;
    setBusy(e.id);
    const reopening = live.data?.event.id === e.id;
    const ok = await runWindow(e, reopening ? "reopen" : "open");
    setBusy(null);
    if (ok) onOpened();
  };

  return (
    <Sheet open={open} onClose={onClose} tone="mint" icon="check" kicker="Open check-in" title="Which event?" locked={busy != null}>
      {running ? (
        <View style={[styles.note, { borderColor: c.pastel.butter.border, backgroundColor: c.pastel.butter.soft }]}>
          <Icon name="alert" size={16} color={c.pastel.butter.ink} />
          <T v="meta" color={c.ink2} style={{ flex: 1 }}>{`Check-in is already open for ${running.event.title}. Close it from that meeting before opening another.`}</T>
        </View>
      ) : null}
      {!list ? <SkeletonList count={3} /> : !list.length ? (
        <T v="body" color={c.ink2}>No required events on the calendar. Add a meeting first.</T>
      ) : (
        <View style={{ gap: 8, opacity: running ? 0.45 : 1 }} pointerEvents={running ? "none" : "auto"}>
          {list.map((e, i) => {
            const n = daysFrom(today, e.date);
            const when = [n === 0 ? "Today" : n > 0 && n < 7 ? relDay(today, e.date) : shortDate(e.date), clockLabel(e.time)].filter(Boolean).join(" · ");
            const first = i === 0 && n === 0;
            return (
              <Pressable key={e.id} onPress={() => void go(e)} accessibilityRole="button" accessibilityLabel={`Open check-in for ${e.title}, ${when}`}
                style={({ pressed }) => [first ? styles.hero : styles.row, first
                  ? { backgroundColor: c.ink, borderColor: c.ink, boxShadow: `3px 3px 0 ${c.note.fill.lilac}` }
                  : { backgroundColor: c.card, borderColor: pressed ? c.ink : c.line },
                  pressed && { transform: [{ translateX: 1.5 }, { translateY: 1.5 }] }]}>
                <Icon name={first ? "check" : "cal"} size={first ? 20 : 16} color={first ? c.paper : c.ink3} />
                <View style={{ flex: 1 }}>
                  <T v={first ? "subhead" : "callout"} color={first ? c.paper : c.ink} numberOfLines={1}>{e.title}</T>
                  <T v="meta" color={first ? alpha(c.paper, 0.72) : c.ink3} numberOfLines={1}>{busy === e.id ? "Opening…" : live.data?.event.id === e.id ? `${when} · reopens it` : when}</T>
                </View>
                <Icon name="arrow-r" size={15} color={first ? alpha(c.paper, 0.7) : c.ink3} />
              </Pressable>
            );
          })}
          <T v="meta" color={c.ink3}>Members check themselves in from their phones. Closing it marks everyone else absent.</T>
        </View>
      )}
    </Sheet>
  );
}

/* ── on a meeting ─────────────────────────────────────────────────────────────── */

export function WindowPanel({ event }: { event: CalendarEvent }) {
  const { c } = useTheme();
  const m = useMotion();
  const q = useLiveCheckIn(true);
  const live = q.data && q.data.event.id === event.id ? q.data : null;
  const now = useNow(!!live, true);
  const [confirm, setConfirm] = useState<"close" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  if (!event.mandatory) return null;
  const view = live ? windowView(live, q.dataUpdatedAt, now) : null;
  const running = view && (view.win === "open" || view.win === "closing");
  const otherOpen = q.data && q.data.event.id !== event.id && q.data.state !== "closed" ? q.data : null;

  const act = async (a: Action) => {
    setBusy(true);
    await runWindow(event, a);
    setBusy(false);
    setConfirm(null);
  };

  // the panel's state, so a change cross-fades instead of snapping
  const phase = running ? "open" : live && view?.win === "void" ? "void" : live ? "closed" : "none";
  let body: React.ReactNode;
  if (running && live) {
    body = (
      <>
        <View style={styles.liveTop}>
          <View style={[styles.pulse, { backgroundColor: view!.win === "closing" ? c.pastel.butter.ink : c.pastel.mint.ink }]} />
          {view!.win === "closing" ? (
            <View style={[styles.liveTop, { flex: 1, gap: 4 }]} accessible accessibilityLabel={view!.closingLabel ?? "Closing soon"}>
              <T v="callout">Closes in</T>
              <TickingNumber value={mmss(view!.msLeft)} v="callout" direction={-1} />
            </View>
          ) : <T v="callout" style={{ flex: 1 }}>Check-in is open</T>}
          <View style={styles.count} accessible accessibilityLabel={`${live.presentCount} of ${live.eligibleCount} checked in`}>
            <TickingNumber value={live.presentCount} v="subhead" />
            <T v="mono" color={c.ink3} style={{ fontSize: 12 }}>{`/${live.eligibleCount}`}</T>
          </View>
        </View>
        <View style={styles.acts}>
          <Button label="Cancel it" variant="soft" size="sm" onPress={() => setConfirm("cancel")} style={{ flex: 1 }} disabled={busy} />
          <Button label="Close & record" tone="mint" size="sm" icon="check" onPress={() => setConfirm("close")} style={{ flex: 1.4 }} disabled={busy} />
        </View>
      </>
    );
  } else if (live && view?.win === "void") {
    body = (
      <>
        <T v="meta" color={c.ink2}>{endedLine(live)}</T>
        <Button label="Restore it" variant="ghost" tone="mint" size="sm" icon="refresh" onPress={() => void act("restore")} disabled={busy} style={{ alignSelf: "flex-start" }} />
      </>
    );
  } else if (live) {
    body = (
      <>
        <T v="meta" color={c.ink2}>{endedLine(live) ?? "Check-in has closed."}</T>
        <Button label="Reopen" variant="ghost" tone="mint" size="sm" icon="refresh" onPress={() => void act("reopen")} disabled={busy} style={{ alignSelf: "flex-start" }} />
      </>
    );
  } else {
    body = (
      <>
        <T v="meta" color={c.ink3}>{otherOpen ? `Check-in is open for ${otherOpen.event.title} right now.` : "Open it when the meeting starts; members tap in from Today."}</T>
        <Button label="Open check-in" tone="mint" size="sm" icon="check" onPress={() => void act("open")} disabled={busy || !!otherOpen} style={{ alignSelf: "flex-start" }} />
      </>
    );
  }

  return (
    <View style={[styles.panel, { borderColor: running ? c.ink : c.line, backgroundColor: running ? c.pastel.mint.soft : c.card }]}>
      <T v="label" color={c.ink3}>Check-in</T>
      <Animated.View key={phase} entering={FadeIn.duration(m.t(200)).reduceMotion(ReduceMotion.Never)} style={{ gap: 10 }}>{body}</Animated.View>
      <Sheet open={confirm != null} onClose={() => setConfirm(null)} locked={busy} tone={confirm === "cancel" ? "rose" : "mint"} icon={confirm === "cancel" ? "x" : "check"}
        kicker={event.title} title={confirm === "cancel" ? "Cancel check-in?" : "Close check-in?"}
        footer={
          <View style={[styles.acts, { flex: 1 }]}>
            <Button label="Keep it open" variant="soft" onPress={() => setConfirm(null)} style={{ flex: 1 }} disabled={busy} />
            <Button label={busy ? "…" : confirm === "cancel" ? "Cancel it" : "Close & record"} tone={confirm === "cancel" ? "rose" : "mint"}
              onPress={() => void act(confirm ?? "close")} style={{ flex: 1.3 }} disabled={busy} />
          </View>
        }>
        <T v="body" color={c.ink2}>
          {confirm === "cancel"
            ? `The ${live?.presentCount ?? 0} check-ins so far are thrown out and nothing is recorded. You can restore it for a few minutes after.`
            : `${live?.presentCount ?? 0} of ${live?.eligibleCount ?? 0} are in. Everyone else who isn't excused is marked absent.`}
        </T>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5, marginBottom: 12 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1.5, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5 },
  panel: { gap: 10, padding: 14, borderRadius: 16, borderWidth: 1.5 },
  liveTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  pulse: { width: 9, height: 9, borderRadius: 5 },
  count: { flexDirection: "row", alignItems: "baseline", gap: 1 },
  acts: { flexDirection: "row", gap: 8 },
});
