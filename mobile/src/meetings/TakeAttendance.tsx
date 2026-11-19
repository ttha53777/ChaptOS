/**
 * Take attendance (the web's LogAttendanceForm): the roster as a roll call. Tap a name to
 * mark them here; tap again to take it back. Excused members (an approved excuse) and
 * exempt ones are shown at the foot, not on the roll. "Everyone's here" ticks the rest.
 *
 * Saves only the rows the officer flipped (POST /api/attendance { changes }), so a member
 * who taps "I'm here" on their phone while this is open keeps their check-in.
 * MANAGE_ATTENDANCE.
 *
 * The box fills with an ink tick that pops in (0.6 → 1, pop spring); reduced motion
 * fades it in place. One select haptic per mark, success on save.
 */
import type { Brother, CalendarEvent } from "@/lib/api-types";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { errorMessage } from "~/api/errors";
import { useEventAttendance } from "~/data/calendar";
import { recordAttendance } from "~/data/meetings";
import { useRoster } from "~/data/tasks";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Avatar } from "~/paper/bits";
import { Sheet } from "~/shell/sheets";
import { SkeletonList } from "~/shell/states";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { LOW_PCT, shortDate } from "./model";
import { TickingNumber } from "~/paper/TickingNumber";
import { alpha } from "~/theme/palette";

export function TakeAttendance({ event, onClose }: { event: CalendarEvent | null; onClose: () => void }) {
  const { c } = useTheme();
  const open = event != null;
  const roster = useRoster(open);
  const att = useEventAttendance(event?.id ?? null);
  const [here, setHere] = useState<Set<number>>(new Set());
  const [was, setWas] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // seed from who's recorded, once per opening
  const seeded = att.data && open;
  useEffect(() => {
    if (!seeded) return;
    const s = new Set(att.data!.attended.map(a => a.brotherId));
    setHere(new Set(s)); setWas(s); setQ(""); setErr(null); setBusy(false);
  }, [seeded, event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const excused = useMemo(() => new Map((att.data?.excused ?? []).map(x => [x.brotherId, x] as const)), [att.data]);
  const exempt = useMemo(() => new Set(att.data?.exempt ?? []), [att.data]);
  const people = useMemo(() => (roster.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [roster.data]);
  const onRoll = people.filter(b => !excused.has(b.id) && !exempt.has(b.id));
  const off = people.filter(b => excused.has(b.id) || exempt.has(b.id));
  const shown = q.trim() ? onRoll.filter(b => b.name.toLowerCase().includes(q.trim().toLowerCase())) : onRoll;
  const changes = onRoll.filter(b => here.has(b.id) !== was.has(b.id)).map(b => ({ brotherId: b.id, attended: here.has(b.id) }));
  const present = onRoll.filter(b => here.has(b.id)).length;

  const flip = (id: number) => { haptics.tap(); setHere(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const all = () => { haptics.tap(); setHere(new Set(onRoll.map(b => b.id))); };

  const save = async () => {
    if (!event || !changes.length || busy) return;
    setBusy(true); setErr(null);
    try {
      await recordAttendance(event.id, changes);
      haptics.success();
      onClose();
      toast.show(`Attendance saved · ${present} here`, { detail: `${event.title} · ${shortDate(event.date)}` });
    } catch (e) {
      haptics.error();
      setErr(errorMessage(e, "Couldn't save the roll. Try again."));
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone="mint" icon="clip" kicker={event ? `${event.title} · ${shortDate(event.date)}` : ""} title="Take attendance"
      actions={onRoll.length && present < onRoll.length ? <Button label="Everyone" size="sm" variant="soft" icon="check" onPress={all} /> : null}
      footer={
        <View style={{ flex: 1, gap: 6 }}>
          {err ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T> : null}
          <Button label={busy ? "Saving…" : changes.length ? `Save · ${present} of ${onRoll.length} here` : `${present} of ${onRoll.length} here`} icon="check" tone="mint" block
            onPress={() => void save()} disabled={!changes.length || busy} />
        </View>
      }>
      {!att.data || !roster.data ? <SkeletonList count={6} /> : (
        <View style={{ gap: 14 }}>
          {onRoll.length > 12 ? (
            <View style={[styles.search, { borderColor: c.line2, backgroundColor: c.card }]}>
              <Icon name="search" size={15} color={c.ink3} />
              <TextInput value={q} onChangeText={setQ} placeholder="Find someone" placeholderTextColor={c.faint} style={[styles.searchIn, { color: c.ink }]} accessibilityLabel="Find someone" />
            </View>
          ) : null}
          <Tally present={present} total={onRoll.length} />
          {att.data.checkInOpen ? <T v="meta" color={c.ink3}>Check-in is still open: people tapping in on their phones fill in here too.</T> : null}
          <View style={[styles.list, { borderColor: c.line, backgroundColor: c.card }]}>
            {shown.map((b, i) => <RollRow key={b.id} b={b} on={here.has(b.id)} first={i === 0} onPress={() => flip(b.id)} />)}
            {!shown.length ? <T v="meta" color={c.ink3} style={{ padding: 14 }}>No one by that name.</T> : null}
          </View>
          {off.length ? (
            <View style={{ gap: 6 }}>
              <T v="label" color={c.ink3}>Not on the roll</T>
              <T v="meta" color={c.ink2}>{off.map(b => `${b.name} (${excused.has(b.id) ? "excused" : "exempt"})`).join(", ")}</T>
            </View>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

export /**
 * The count as you go: present rolls digit by digit, the bar fills toward it, and a hairline
 * marks 70% (the book's "Under 70%" line). Reduced: the bar jumps, the digits cross-fade.
 */
function Tally({ present, total }: { present: number; total: number }) {
  const { c } = useTheme();
  const m = useMotion();
  const [w, setW] = useState(0);
  const frac = total ? present / total : 0;
  const p = useSharedValue(frac);
  useEffect(() => { p.value = m.reduced ? frac : withTiming(frac, m.timing(280, "out")); }, [frac, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const fill = useAnimatedStyle(() => ({ opacity: w ? 1 : 0, transform: [{ translateX: -w * (1 - p.value) }] }));
  const low = total > 0 && frac < LOW_PCT / 100;
  return (
    <View style={{ gap: 8 }} accessible accessibilityLabel={`${present} of ${total} here`}>
      <View style={styles.tallyTop}>
        <TickingNumber value={present} v="figure" />
        <T v="body" color={c.ink3} style={{ marginBottom: 5, flex: 1 }}>{` of ${total} here`}</T>
        <T v="mono" color={low ? c.pastel.rose.ink : c.pastel.mint.ink} style={{ marginBottom: 7, fontSize: 12.5, fontWeight: "700" }}>{total ? `${Math.round(frac * 100)}%` : ""}</T>
      </View>
      <View style={[styles.track, { borderColor: c.ink, backgroundColor: c.paper2 }]} onLayout={e => setW(e.nativeEvent.layout.width - 3)}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.note.fill[low ? "peach" : "mint"] }, fill]} />
        <View style={[styles.line, { left: `${LOW_PCT}%`, backgroundColor: alpha(c.ink, 0.35) }]} />
      </View>
    </View>
  );
}

export function RollRow({ b, on, first, onPress }: { b: Brother; on: boolean; first: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    v.value = m.reduced ? withTiming(on ? 1 : 0, m.timing(140, "out")) : on ? withSpring(1, m.spring("pop")) : withTiming(0, m.timing(120, "out"));
  }, [on, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const tick = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value), transform: [{ scale: m.reduced ? 1 : 0.6 + 0.4 * v.value }] }));
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={b.name}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: 1, borderTopColor: c.lineSoft }, pressed && { backgroundColor: c.paper2 }]}>
      <Avatar name={b.name} uri={b.avatarUrl ?? null} tone={on ? "mint" : "sky"} style={{ width: 34, height: 34, borderRadius: 17 }} />
      <T v="callout" style={{ flex: 1 }} numberOfLines={1} color={on ? c.ink : c.ink2}>{b.name}</T>
      <View style={[styles.box, { borderColor: on ? c.ink : c.line2, backgroundColor: c.card }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.boxFill, { backgroundColor: c.note.fill.mint }, tick]}>
          <Icon name="check" size={15} color={c.note.ink} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, minHeight: 44 },
  searchIn: { flex: 1, fontSize: 16, paddingVertical: 8 },
  list: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 54 },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, overflow: "hidden" },
  tallyTop: { flexDirection: "row", alignItems: "flex-end" },
  track: { height: 12, borderRadius: 6, borderWidth: 1.5, overflow: "hidden" },
  line: { position: "absolute", top: 0, bottom: 0, width: 1.5 },
  boxFill: { alignItems: "center", justifyContent: "center" },
});
