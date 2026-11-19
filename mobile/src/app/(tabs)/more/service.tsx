/**
 * More → Service (mock `#service`, phone-first): my punch card leads (manila stock in one
 * brick ink, a hole per hour toward the goal, ~/moments/Punch), then the next shift as a
 * ticket, then the shifts I've logged and the ones before.
 *
 * Log my hours (POST /api/service-events/[id]/participation/me): pick a shift that has
 * happened, set the hours, and the card punches in. It's optimistic; an undo in the toast
 * puts the old hours back (or removes the row: DELETE), and a refusal unpunches the holes
 * and says why. There's no "I'm going" sign-up: the server has no RSVP for shifts, only
 * hours after the fact, which is also all the web offers.
 *
 * Reads GET /api/service-events and /api/service-participation (mine filtered here).
 */
import type { ServiceEvent } from "@/lib/api-types";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { localDay } from "~/data/home";
import { logMyHours, putEventRows, setMyHours, unlogMyHours, useParticipation, useServiceEvents } from "~/data/more";
import { refreshRoster } from "~/data/members";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { PunchHoles } from "~/moments/Punch";
import { haptics } from "~/motion/haptics";
import { myHours, r1 } from "~/more/model";
import { Button } from "~/paper/Button";
import { Stamp, type StampState } from "~/paper/Stamp";
import { Ticket } from "~/paper/Ticket";
import { Screen } from "~/shell/Screen";
import { Sheet } from "~/shell/sheets";
import { EmptyState, ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { toast } from "~/shell/toast";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { clockLabel, daysFrom, monthDay, weekdayShort } from "~/today/time";
import { T } from "~/ui/T";

export default function ServicePage() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const events = useServiceEvents();
  const parts = useParticipation();
  const [logOpen, setLogOpen] = useState(false);
  if (!entry) return null;
  const me = entry.me;
  const today = localDay();
  const goal = me.org?.thresholds.serviceHoursGoal ?? 10;
  const word = me.org?.vocabularyOverrides.Service ?? "Service";
  const refresh = () => Promise.all([events.refetch(), parts.refetch()]);
  const list = events.data;
  const rows = parts.data;

  return (
    <Screen title={word} back="More" onRefresh={refresh}>
      {list && rows ? <StaleNote updatedAt={events.dataUpdatedAt} failed={events.isError || parts.isError} onRetry={() => void refresh()} /> : null}
      {!list || !rows ? (events.isError || parts.isError
        ? <ErrorState title="Couldn't load service." error={events.error ?? parts.error} onRetry={() => void refresh()} />
        : <SkeletonCard height={260} />)
        : <Body events={list} meId={me.id} meName={me.name} meAvatar={me.avatarUrl} role={me.role} goal={goal} today={today} word={word}
            hours={myHours(rows, me.id)} rows={rows} onLog={() => setLogOpen(true)} />}
      {list && rows ? (
        <LogSheet open={logOpen} onClose={() => setLogOpen(false)} events={list.filter(e => e.date <= today)} rows={rows} meId={me.id}
          me={{ name: me.name, avatarUrl: me.avatarUrl }} />
      ) : null}
    </Screen>
  );
}

function Body({ events, meId, role, goal, today, word, hours, rows, onLog }: {
  events: ServiceEvent[]; meId: number; meName: string; meAvatar: string | null; role: string; goal: number; today: string; word: string;
  hours: number; rows: ReturnType<typeof useParticipation>["data"] & object; onLog: () => void;
}) {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const ahead = events.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter(e => e.date < today || (e.date === today)).sort((a, b) => b.date.localeCompare(a.date));
  const next = ahead[0];
  const mine = new Map(rows.filter(r => r.brotherId === meId).map(r => [r.serviceEventId, r.hours] as const));
  const left = goal - hours;
  const canLog = events.some(e => e.date <= today);

  if (!events.length) {
    return (
      <>
        <PunchCard name={entry?.me.name ?? ""} role={role} hours={0} goal={goal} canLog={false} onLog={onLog} />
        <EmptyState compact pictures={[{ icon: "heart", tone: "mint", label: "Shifts" }, { icon: "clock", tone: "peach", label: "Hours, punched" }, { icon: "check", tone: "sky", label: "The goal" }]}
          title="No service events yet." line="A cleanup, a food bank shift, a build. When an officer adds one, it lands on the Timeline and here, and you log your hours after." />
      </>
    );
  }

  return (
    <>
      <PunchCard name={entry?.me.name ?? ""} role={role} hours={hours} goal={goal} canLog={canLog} onLog={onLog}
        line={left <= 0 ? (hours > goal ? `Goal met, and ${r1(hours - goal)} extra.` : "Goal met.") : hours === 0 ? `${goal} hours to punch this term.` : `${r1(left)} to go.`} />

      {next ? (
        <View style={{ gap: 10 }}>
          <T v="label" color={c.ink3} accessibilityRole="header">Next shift</T>
          <Ticket tone="mint" body={<View style={{ gap: 3 }}>
              <T v="subhead" numberOfLines={2}>{next.title}</T>
              <T v="meta" color={c.ink3}>{[relDay(next.date, today), clockLabel(next.time), next.location || null].filter(Boolean).join(" · ")}</T>
              {next.notes ? <T v="meta" color={c.ink2} numberOfLines={2}>{next.notes}</T> : null}
            </View>} stub={<View style={{ alignItems: "center" }}>
            <T v="mono" color={c.pastel.mint.ink} style={{ fontSize: 10 }}>{weekdayShort(next.date).toUpperCase()}</T>
            <T v="title" style={{ fontSize: 24 }}>{next.date.slice(8, 10).replace(/^0/, "")}</T>
          </View>} />
          {ahead.length > 1 ? <T v="meta" color={c.ink3}>Then {ahead.slice(1, 3).map(e => `${e.title} (${monthDay(e.date)})`).join(", ")}.</T> : null}
        </View>
      ) : null}

      {past.length ? (
        <View style={{ gap: 10 }}>
          <T v="label" color={c.ink3} accessibilityRole="header">Shifts so far</T>
          <View style={[styles.list, { borderColor: c.line, backgroundColor: c.card }]}>
            {past.map((e, i) => {
              const h = mine.get(e.id);
              return (
                <View key={e.id} style={[styles.row, i > 0 && { borderTopColor: c.line, borderTopWidth: 1 }]}>
                  <Icon name="heart" size={15} color={h != null ? c.pastel.mint.ink : c.line2} />
                  <View style={{ flex: 1 }}>
                    <T v="callout" numberOfLines={1}>{e.title}</T>
                    <T v="meta" color={c.ink3}>{monthDay(e.date)}{e.location ? ` · ${e.location}` : ""}</T>
                  </View>
                  <T v="mono" color={h != null ? c.ink : c.ink3} style={{ fontSize: 12 }}>{h != null ? `${r1(h)}h` : "—"}</T>
                </View>
              );
            })}
          </View>
          <T v="meta" color={c.ink3}>{word} hours count toward your standing. Log the shift you were at; an officer can fix a mistake.</T>
        </View>
      ) : null}
    </>
  );
}

const relDay = (d: string, today: string) => {
  const n = daysFrom(today, d);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n < 7 ? weekdayShort(d) : monthDay(d);
};

/* ── the punch card ───────────────────────────────────────────────────────────── */

function PunchCard({ name, role, hours, goal, line, canLog, onLog }: { name: string; role: string; hours: number; goal: number; line?: string; canLog: boolean; onLog: () => void }) {
  const { c } = useTheme();
  const stock = c.pastel.butter.soft;
  const print = c.pastel.peach.ink;
  const punched = Math.floor(hours);
  const total = Math.min(40, Math.max(goal, punched));
  const met = hours >= goal && goal > 0;
  const [stamp, setStamp] = useState<StampState>(met ? "shown" : "hidden");
  const [wasMet, setWasMet] = useState(met);
  useEffect(() => {
    if (met && !wasMet) { setStamp("in"); setWasMet(true); }
    else if (!met && wasMet) { setStamp("out"); setWasMet(false); }
  }, [met, wasMet]);

  return (
    <View style={[styles.card, { backgroundColor: stock, borderColor: c.ink, boxShadow: `4px 4px 0 ${c.pastel.peach.fill}` }]}>
      <View style={[styles.cardHead, { borderBottomColor: alpha(print, 0.38) }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="heart" size={12} color={print} />
          <T v="label" color={print} style={{ fontSize: 9.5 }}>Service card</T>
        </View>
        <T v="label" color={print} style={{ fontSize: 9.5, opacity: 0.85 }}>Goal · {goal} hrs</T>
      </View>
      <View style={[styles.who, { borderBottomColor: alpha(print, 0.38) }]}>
        <T v="label" color={print} style={{ fontSize: 8.5 }}>Name</T>
        <T v="subhead" style={{ flex: 1 }} numberOfLines={1}>{name}</T>
        <T v="mono" color={c.ink3} style={{ fontSize: 10 }} numberOfLines={1}>{role}</T>
      </View>
      <View style={styles.big}>
        <T v="hero" style={{ fontSize: 48, lineHeight: 50 }}>{r1(hours)}<T v="subhead" color={print}> / {goal}h</T></T>
        {line ? <T v="callout" color={c.ink2} style={{ flex: 1, textAlign: "right" }}>{line}</T> : null}
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <PunchHoles punched={punched} total={total} stock={stock} print={print} />
      </View>
      {stamp !== "hidden" ? <Stamp label="Goal met" tone="mint" state={stamp} size="md" rotate={-10} style={{ position: "absolute", right: 18, top: 70 }} /> : null}
      <View style={styles.foot}>
        {canLog ? <Button label="Log my hours" icon="clock" tone="peach" block onPress={onLog} style={{ flex: 1 }} />
          : <T v="meta" color={c.ink2}>A hole punches for every hour you log.</T>}
      </View>
    </View>
  );
}

/* ── log my hours ─────────────────────────────────────────────────────────────── */

function LogSheet({ open, onClose, events, rows, meId, me }: {
  open: boolean; onClose: () => void; events: ServiceEvent[]; rows: NonNullable<ReturnType<typeof useParticipation>["data"]>; meId: number;
  me: { name: string; avatarUrl: string | null };
}) {
  const { c } = useTheme();
  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));
  const [pick, setPick] = useState<number | null>(null);
  const [hours, setHours] = useState(2);
  const mineFor = (id: number) => rows.find(r => r.serviceEventId === id && r.brotherId === meId)?.hours ?? null;
  useEffect(() => {
    if (!open) return;
    const first = sorted.find(e => mineFor(e.id) == null) ?? sorted[0];
    setPick(first?.id ?? null);
    setHours(first ? mineFor(first.id) ?? 2 : 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const event = sorted.find(e => e.id === pick) ?? null;
  const before = event ? mineFor(event.id) : null;

  const save = () => {
    if (!event) return;
    onClose();
    const restore = setMyHours(meId, event.id, hours, me);
    toast.show(before == null ? `${r1(hours)}h logged` : `${r1(before)}h → ${r1(hours)}h`, {
      detail: event.title,
      undo: () => {
        const back = setMyHours(meId, event.id, before, me);
        (before == null ? unlogMyHours(event.id) : logMyHours(event.id, before)).then(
          r => { putEventRows(event.id, r); void refreshRoster(); },
          e => { back(); toast.error("Couldn't undo that", { detail: errorMessage(e) }); },
        );
      },
    });
    logMyHours(event.id, hours).then(
      r => { putEventRows(event.id, r); void refreshRoster(); },
      e => { restore(); haptics.error(); toast.error("Couldn't log those hours", { detail: errorMessage(e) }); },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Log my hours" kicker="One punch per hour" tone="peach" icon="clock"
      footer={<Button label={before == null ? "Punch it" : "Change it"} icon="check" tone="peach" block onPress={save} disabled={!event || hours === before} style={{ flex: 1 }} />}>
      <View style={{ gap: 16 }}>
        <View style={{ gap: 8 }}>
          <T v="label" color={c.ink3}>Which shift</T>
          {sorted.slice(0, 8).map(e => {
            const on = e.id === pick;
            const had = mineFor(e.id);
            return (
              <Pressable key={e.id} onPress={() => { haptics.select(); setPick(e.id); setHours(had ?? 2); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={[styles.pick, { borderColor: on ? c.ink : c.line, backgroundColor: on ? c.pastel.peach.soft : c.card }]}>
                <View style={{ flex: 1 }}>
                  <T v="callout" numberOfLines={1}>{e.title}</T>
                  <T v="meta" color={c.ink3}>{monthDay(e.date)}{had != null ? ` · you logged ${r1(had)}h` : ""}</T>
                </View>
                {on ? <Icon name="check" size={16} color={c.ink} /> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={{ gap: 8 }}>
          <T v="label" color={c.ink3}>Hours</T>
          <View style={styles.stepper}>
            <StepBtn glyph="−" label="Half an hour less" onPress={() => setHours(h => Math.max(0.5, h - 0.5))} />
            <T v="hero" style={{ fontSize: 36, minWidth: 90, textAlign: "center" }} accessibilityLiveRegion="polite">{r1(hours)}h</T>
            <StepBtn glyph="+" label="Half an hour more" onPress={() => setHours(h => Math.min(24, h + 0.5))} />
          </View>
        </View>
      </View>
    </Sheet>
  );
}

function StepBtn({ glyph, label, onPress }: { glyph: string; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { haptics.select(); onPress(); }} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => [styles.step, { borderColor: c.ink, backgroundColor: pressed ? c.paper2 : c.card }]}>
      <T v="title" style={{ fontSize: 22, lineHeight: 26 }}>{glyph}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  step: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1.5, borderRadius: 14, borderTopLeftRadius: 4, transform: [{ rotate: "-0.6deg" }] },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: 16, paddingTop: 12, paddingBottom: 8, paddingLeft: 14, borderBottomWidth: 3 },
  who: { flexDirection: "row", alignItems: "baseline", gap: 10, marginHorizontal: 16, marginTop: 12, paddingBottom: 3, borderBottomWidth: 1 },
  big: { flexDirection: "row", alignItems: "flex-end", gap: 12, paddingHorizontal: 16, paddingTop: 14 },
  foot: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14 },
  list: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  pick: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 },
});
