/**
 * Excuses waiting (the web's Timeline review queue): each one a slip on a legal-pad
 * stripe with who, which meeting, their reason, and Late when it was filed after the
 * fact. Excuse inks it approved; Decline opens a line for a note the member will read,
 * then declines. MANAGE_ATTENDANCE (PATCH /api/excuses/[id]).
 *
 * Excuse stamps the slip EXCUSED (the stamp's impact is the one haptic), holds a beat,
 * then the slip lifts away and the list closes up; Decline lifts it away at once (one tap).
 * Reduced: the stamp and the exit are fades, the list closes up without travel. A refusal
 * smears the stamp, puts the slip back and says why. `eventId` narrows the list to one meeting.
 */
import type { ExcuseListItem } from "@/lib/api-types";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, FadeOutUp, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { errorMessage } from "~/api/errors";
import { decideExcuse, refreshPending, setPending, usePendingExcuses } from "~/data/meetings";
import { refreshAttendance } from "~/data/calendar";
import { EASE } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Avatar, Pill } from "~/paper/bits";
import { Stamp, type StampState } from "~/paper/Stamp";
import { Sheet } from "~/shell/sheets";
import { ErrorState, SkeletonList } from "~/shell/states";
import { toast } from "~/shell/toast";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { shortDate } from "./model";

export function ExcuseReview({ open, eventId, onClose }: { open: boolean; eventId?: number | null; onClose: () => void }) {
  const { c } = useTheme();
  const q = usePendingExcuses(open);
  const list = (q.data ?? []).filter(x => x.status === "pending" && (eventId == null || x.calendarEventId === eventId));

  return (
    <Sheet open={open} onClose={onClose} size="tall" tone="butter" icon="form" kicker="Attendance" title={list.length ? `${list.length} ${list.length === 1 ? "excuse" : "excuses"} waiting` : "Excuses"}>
      {!q.data ? (q.isError ? <ErrorState compact title="Couldn't load the excuses." error={q.error} onRetry={() => void q.refetch()} /> : <SkeletonList count={3} />)
        : !list.length ? (
          <View style={[styles.done, { borderColor: c.line2 }]}>
            <T v="subhead">Nothing waiting.</T>
            <T v="meta" color={c.ink3}>Every excuse has an answer.</T>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {list.length > 1 ? <Bulk list={list} /> : null}
            {list.map(x => <Slip key={x.id} x={x} />)}
          </View>
        )}
    </Sheet>
  );
}

/**
 * "Reviewed each one? Approve all N" (the web's approveAll): every one PATCHed at once;
 * the ones that went through leave together, and a partial failure re-reads the queue.
 * One success haptic on the result (or error when any failed).
 */
function Bulk({ list }: { list: ExcuseListItem[] }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    const targets = [...list];
    const results = await Promise.allSettled(targets.map(t => decideExcuse(t.id, "approve").then(() => t)));
    const ok = results.flatMap(r => (r.status === "fulfilled" ? [r.value] : []));
    const okIds = new Set(ok.map(t => t.id));
    setPending(l => l.filter(y => !okIds.has(y.id)));
    for (const id of new Set(ok.map(t => t.calendarEventId))) void refreshAttendance(id);
    const failed = targets.length - ok.length;
    if (failed > 0) {
      void refreshPending();
      haptics.error();
      toast.error(`${failed} couldn't be approved`, { detail: "They're still waiting." });
    } else {
      haptics.success();
      toast.show(`${ok.length} excuses approved`);
    }
    setBusy(false);
  };
  return (
    <View style={[styles.bulk, { borderColor: c.line2 }]}>
      <T v="meta" color={c.ink3} style={{ flex: 1 }}>Reviewed each one?</T>
      <Button label={busy ? "Approving…" : `Approve all ${list.length}`} size="sm" tone="mint" icon="check" onPress={() => void go()} disabled={busy} />
    </View>
  );
}

function Slip({ x }: { x: ExcuseListItem }) {
  const { c } = useTheme();
  const m = useMotion();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [stamp, setStamp] = useState<StampState>("hidden");
  const [busy, setBusy] = useState(false);
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (leave.current) clearTimeout(leave.current); }, []);

  const said = () => toast.show(`${x.brotherName} is excused`, { detail: `${x.eventTitle} · ${shortDate(x.eventDate)}` });
  const after = () => { void refreshAttendance(x.calendarEventId); void refreshPending(); };

  // Excuse: the stamp lands (its impact is the haptic), holds a beat, then the slip leaves.
  const approve = () => {
    if (busy) return;
    setBusy(true);
    setStamp("in");
    let undo: (() => void) | null = null;
    leave.current = setTimeout(() => { undo = setPending(l => l.filter(y => y.id !== x.id)); }, m.t(m.reduced ? 380 : 640));
    decideExcuse(x.id, "approve").then(
      () => { said(); after(); },
      e => {
        if (leave.current) clearTimeout(leave.current);
        undo?.();
        setStamp("smear"); setBusy(false);
        haptics.error();
        toast.error("Couldn't excuse them", { detail: errorMessage(e) });
      },
    );
  };

  // Decline: the slip folds away at once.
  const decline = () => {
    haptics.tap();
    const undo = setPending(l => l.filter(y => y.id !== x.id));
    decideExcuse(x.id, "reject", note).then(
      () => { toast.show(`Declined ${x.brotherName}'s excuse`, { detail: note.trim() ? "Your note goes with it." : `${x.eventTitle} · ${shortDate(x.eventDate)}` }); after(); },
      e => { undo(); haptics.error(); toast.error("Couldn't decline it", { detail: errorMessage(e) }); },
    );
  };

  const layout = LinearTransition.duration(m.t(m.reduced ? 0 : 280)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
  const out = m.reduced ? FadeOut.duration(m.t(180)) : FadeOutUp.duration(m.t(220));
  return (
    <Animated.View layout={layout} entering={FadeIn.duration(m.t(180)).reduceMotion(ReduceMotion.Never)} exiting={out.reduceMotion(ReduceMotion.Never)}
      style={[styles.slip, { backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }]}>
      <View style={[styles.margin, { backgroundColor: alpha(c.pastel.rose.ink, 0.4) }]} />
      <View style={styles.top}>
        <Avatar name={x.brotherName} tone="butter" style={{ width: 28, height: 28, borderRadius: 14 }} />
        <T v="subhead" style={{ flex: 1 }} numberOfLines={1}>{x.brotherName}</T>
        {x.isRetroactive ? <Pill label="Late" tone="rose" /> : null}
      </View>
      <T v="meta" color={c.ink3}>{`${x.eventTitle} · ${shortDate(x.eventDate)} · filed ${shortDate(x.submittedAt.slice(0, 10))}`}</T>
      <T v="body" color={c.note.ink} style={{ fontStyle: "italic" }}>“{x.reason}”</T>
      {declining ? (
        <Animated.View entering={FadeIn.duration(m.t(160)).reduceMotion(ReduceMotion.Never)} style={{ gap: 8, marginTop: 4 }}>
          <TextInput value={note} onChangeText={setNote} placeholder="A note they'll read (optional)" placeholderTextColor={c.faint} maxLength={1000} multiline autoFocus
            accessibilityLabel="Note for the member" style={[styles.note, { color: c.ink, borderColor: c.line2, backgroundColor: c.card }]} />
          <View style={styles.acts}>
            <Button label="Back" variant="soft" size="sm" onPress={() => setDeclining(false)} style={{ flex: 1 }} />
            <Button label="Decline" variant="ghost" tone="rose" size="sm" icon="x" onPress={decline} style={{ flex: 1 }} />
          </View>
        </Animated.View>
      ) : (
        <View style={[styles.acts, { marginTop: 4, opacity: busy ? 0.5 : 1 }]} pointerEvents={busy ? "none" : "auto"}>
          <Button label="Decline" variant="soft" size="sm" onPress={() => setDeclining(true)} style={{ flex: 1 }} />
          <Button label="Excuse" tone="mint" size="sm" icon="check" onPress={approve} style={{ flex: 1 }} />
        </View>
      )}
      <View pointerEvents="none" style={styles.stamp}>
        <Stamp label="Excused" tone="mint" state={stamp} size="sm" rotate={-10} onImpact={() => haptics.soft()} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bulk: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" },
  slip: { gap: 6, paddingVertical: 13, paddingRight: 14, paddingLeft: 30, borderWidth: 1.5, borderTopLeftRadius: 6, borderTopRightRadius: 14, borderBottomRightRadius: 8, borderBottomLeftRadius: 12 },
  margin: { position: "absolute", left: 20, top: 0, bottom: 0, width: 1.5 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  acts: { flexDirection: "row", gap: 8 },
  stamp: { position: "absolute", right: 14, top: 10 },
  note: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minHeight: 64, textAlignVertical: "top" },
  done: { alignItems: "center", gap: 4, padding: 22, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16 },
});
