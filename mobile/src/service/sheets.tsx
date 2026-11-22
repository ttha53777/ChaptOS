/**
 * Service's sheets, as the web's modals (app/org/[slug]/service/page.tsx):
 *
 *   ServiceForm   Log service event / Edit service event (title, When as the web's
 *                 stacked ScheduleFields with legacyReadOnly, location, notes)
 *   LogHours      Log hours · <event>: everyone's hours on one sheet (MANAGE_SERVICE)
 *   LogMine       Log my hours: which event, how many hours
 *   MemberSheet   a member's hours by event, and what came before per-event tracking
 *   PunchMoment   the signature: my card punches the new holes once the server has them
 */
import type { Brother, ServiceEvent, ServiceParticipationRow } from "@/lib/api-types";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";
import { localDay } from "~/data/home";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { deviceZone } from "~/meetings/model";
import { PunchHoles } from "~/moments/Punch";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { Avatar } from "~/paper/bits";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { alpha } from "~/theme/palette";
import { useFontScale, useMotion, useTheme } from "~/theme/PaperProvider";
import { resolveType } from "~/theme/type";
import { T } from "~/ui/T";
import { Chip, FormField, FormLabel, WhenFields, initialWhen, timingOf, type When } from "~/ui/WhenFields";
import { DeskDate } from "./bits";
import { FORM, LOG, MEMBER, MINE, MINE_CHIPS, dayLabel, logTally, memberGoalLine, memberLedger, r1 } from "./model";

type Schedule = NonNullable<ServiceEvent["schedule"]>;

/* ── shared bits ──────────────────────────────────────────────────────────────── */

function Foot({ note, cancel, go, ok, busy, onCancel, onGo }: { note?: string; cancel: string; go: string; ok: boolean; busy?: boolean; onCancel: () => void; onGo: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10, flex: 1 }}>
      {note ? <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{note}</T> : null}
      <View style={styles.footBtns}>
        <Button label={cancel} variant="ghost" onPress={onCancel} disabled={busy} />
        <Button label={go} tone="mint" onPress={onGo} disabled={!ok || busy} />
      </View>
    </View>
  );
}

/* ── Log service event / Edit service event ───────────────────────────────────── */

export interface ServiceFormBody { title: string; date: string; location: string; notes: string; schedule?: Schedule | null }

export function ServiceForm({ open, editing, onClose, onSave }: {
  open: boolean; editing: ServiceEvent | null; onClose: () => void; onSave: (body: ServiceFormBody) => void;
}) {
  const { c } = useTheme();
  const scale = useFontScale();
  const me = useEntryOf("ready")?.me ?? null;
  const term = me?.org?.activeTerm ?? null;
  const orgZone = me?.org?.timeZone ?? null;
  const zone = orgZone || deviceZone();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState<When>(() => initialWhen(null, zone));
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    setTitle(editing?.title ?? ""); setLocation(editing?.location ?? ""); setNotes(editing?.notes ?? "");
    setWhen(initialWhen(editing, zone));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!title) return;
    const timing = timingOf(when, zone);
    if ("error" in timing) { setErr(timing.error); return; }
    onSave({ title, location, notes, ...timing });
  };

  return (
    <Sheet open={open} onClose={onClose} size="tall" tone="mint" icon="heart" title={editing ? FORM.edit : FORM.add}
      footer={<Foot note={FORM.foot(term?.label ?? null)} cancel={FORM.cancel} go={FORM.save(!editing)} ok={!!title} onCancel={onClose} onGo={save} />}>
      <View style={{ gap: 18 }}>
        <View>
          <FormLabel text={FORM.title} />
          <FormField value={title} onChange={setTitle} placeholder={FORM.titlePh} label={FORM.title} autoFocus={!editing} />
        </View>

        <WhenFields value={when} onChange={setWhen} label={FORM.when} err={err} open={open} editing={!!editing} term={term} orgZone={orgZone} tone="mint" />

        <View>
          <FormLabel text={FORM.location} opt={FORM.opt} />
          <FormField value={location} onChange={setLocation} placeholder={FORM.locationPh} label={FORM.location} />
        </View>
        <View>
          <FormLabel text={FORM.notes} opt={FORM.opt} />
          <TextInput value={notes} onChangeText={setNotes} placeholder={FORM.notesPh} placeholderTextColor={c.faint} accessibilityLabel={FORM.notes} multiline
            style={[resolveType("body", scale), styles.input, { color: c.ink, borderColor: c.line2, backgroundColor: c.card, minHeight: 110, textAlignVertical: "top" }]} />
        </View>
      </View>
    </Sheet>
  );
}

/* ── Log hours (officers) ─────────────────────────────────────────────────────── */

const LogRow = ({ b, value, onChange }: { b: Brother; value: string; onChange: (id: number, v: string) => void }) => {
  const { c } = useTheme();
  const active = value !== "" && parseFloat(value) > 0;
  return (
    <View style={[styles.logRow, { borderBottomColor: c.line }, active && { backgroundColor: alpha(c.pastel.mint.fill, 0.3) }]}>
      <Avatar name={b.name} uri={b.avatarUrl} px={26} />
      <View style={{ flex: 1 }}>
        <T v="callout" numberOfLines={1}>{b.name}</T>
        <T v="meta" color={c.ink3}>{LOG.total(b.serviceHours)}</T>
      </View>
      <TextInput value={value} onChangeText={t => onChange(b.id, t)} placeholder="0" placeholderTextColor={c.faint} keyboardType="decimal-pad"
        accessibilityLabel={`${b.name} hours`} style={[styles.hrIn, { color: c.ink, borderColor: c.line2, backgroundColor: c.card }]} />
      <T v="meta" color={c.ink3}>{LOG.unit}</T>
    </View>
  );
};

export function LogHours({ event, roster, rows, onClose, onSave }: {
  event: ServiceEvent | null; roster: Brother[]; rows: ServiceParticipationRow[] | undefined; onClose: () => void;
  onSave: (event: ServiceEvent, draft: Record<number, string>) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const { c } = useTheme();
  const open = event != null;
  useEffect(() => {
    if (!open) return;
    const seed: Record<number, string> = {};
    for (const p of rows ?? []) seed[p.brotherId] = String(p.hours);
    setDraft(seed); setFind(""); setBusy(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => roster.filter(b => b.name.toLowerCase().includes(find.toLowerCase())), [roster, find]);
  const setOne = (id: number, v: string) => setDraft(d => ({ ...d, [id]: v }));
  const save = async () => {
    if (!event) return;
    setBusy(true);
    const ok = await onSave(event, draft);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet open={open} onClose={() => { if (!busy) onClose(); }} locked={busy} size="tall" tone="mint" icon="clock" title={event ? LOG.title(event.title) : ""}
      footer={<Foot note={logTally(draft)} cancel={LOG.cancel} go={busy ? LOG.saving : LOG.save} ok busy={busy} onCancel={onClose} onGo={() => void save()} />}>
      <View style={{ gap: 12 }}>
        <T v="body" color={c.ink2}>{LOG.hint}</T>
        <View style={[styles.search, { borderColor: c.line2, backgroundColor: c.card }]}>
          <Icon name="search" size={15} color={c.ink3} />
          <TextInput value={find} onChangeText={setFind} placeholder={LOG.find} placeholderTextColor={c.ink3} accessibilityLabel={LOG.findLabel}
            autoCorrect={false} style={[styles.searchIn, { color: c.ink }]} />
        </View>
        <View style={[styles.logList, { borderColor: c.line }]}>
          {shown.map(b => <LogRow key={b.id} b={b} value={draft[b.id] ?? ""} onChange={setOne} />)}
        </View>
      </View>
    </Sheet>
  );
}

/* ── Log my hours ─────────────────────────────────────────────────────────────── */

export function LogMine({ open, events, rows, selfId, myTotal, goal, onClose, onSave }: {
  open: boolean; events: ServiceEvent[]; rows: ServiceParticipationRow[]; selfId: number; myTotal: number; goal: number;
  onClose: () => void; onSave: (eventId: number, hours: string) => Promise<boolean>;
}) {
  const { c } = useTheme();
  const scale = useFontScale();
  const [pick, setPick] = useState<number | null>(null);
  const [hours, setHours] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPick(events[0]?.id ?? null); setHours(""); setBusy(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = localDay();
  const save = async () => {
    if (pick == null) return;
    setBusy(true);
    const ok = await onSave(pick, hours);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet open={open} onClose={() => { if (!busy) onClose(); }} locked={busy} size="tall" tone="mint" icon="clock" title={MINE.title}
      footer={<Foot cancel={MINE.cancel} go={busy ? MINE.saving : MINE.save} ok={pick != null && hours !== ""} busy={busy} onCancel={onClose} onGo={() => void save()} />}>
      <View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <T v="callout" color={c.ink2} style={{ fontWeight: "600" }}>{MINE.which}</T>
          <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={MINE.whichLabel}>
            {events.map(ev => {
              const on = pick === ev.id;
              const had = rows.find(p => p.serviceEventId === ev.id && p.brotherId === selfId)?.hours;
              return (
                <Pressable key={ev.id} onPress={() => { haptics.select(); setPick(ev.id); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  accessibilityLabel={`${ev.title}, ${dayLabel(ev.date)}${ev.location ? ` · ${ev.location}` : ""}${had != null ? `, ${r1(had)}h` : ""}`}
                  style={[styles.mineEv, { borderColor: on ? c.ink : c.line, backgroundColor: c.card }, on && { borderWidth: 2 }]}>
                  <DeskDate date={ev.date} up={ev.date > today} />
                  <View style={{ flex: 1 }}>
                    <T v="callout" style={{ fontWeight: "600" }} numberOfLines={1}>{ev.title}</T>
                    <T v="meta" color={c.ink3} numberOfLines={1}>{`${dayLabel(ev.date)}${ev.location ? ` · ${ev.location}` : ""}`}</T>
                  </View>
                  {had != null ? <View style={[styles.had, { backgroundColor: c.pastel.mint.soft, borderColor: c.pastel.mint.border }]}><T v="mono" size={11} color={c.pastel.mint.ink}>{`${r1(had)}h`}</T></View> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={{ gap: 10 }}>
          <T v="callout" color={c.ink2} style={{ fontWeight: "600" }}>{MINE.how}</T>
          <View style={[styles.big, { borderColor: c.line2, backgroundColor: c.card }]}>
            <TextInput value={hours} onChangeText={setHours} placeholder="0" placeholderTextColor={c.ink3} keyboardType="decimal-pad" accessibilityLabel={MINE.hoursLabel}
              style={[resolveType("hero", scale), { flex: 1, fontSize: 40, color: c.ink }]} />
            <T v="body" color={c.ink3}>h</T>
          </View>
          <View style={styles.chips}>
            {MINE_CHIPS.map(n => {
              const on = hours === String(n);
              return (
                <Pressable key={n} onPress={() => { haptics.select(); setHours(String(n)); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={[styles.hChip, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel.mint.soft : c.card }]}>
                  <T v="buttonSm" color={c.ink}>{MINE.chip(n)}</T>
                </Pressable>
              );
            })}
          </View>
          <T v="meta" color={c.ink2}>{MINE.hintA}<T v="meta" color={c.ink} style={{ fontWeight: "700" }}>{`${r1(myTotal)}h`}</T>{MINE.hintB(goal)}</T>
        </View>
      </View>
    </Sheet>
  );
}

/* ── a member's hours ─────────────────────────────────────────────────────────── */

export function MemberSheet({ member, goal, events, byEvent, onClose }: {
  member: Brother | null; goal: number; events: ServiceEvent[]; byEvent: Record<number, ServiceParticipationRow[] | undefined>; onClose: () => void;
}) {
  const { c } = useTheme();
  const ledger = useMemo(() => (member ? memberLedger(member.id, member.serviceHours, events, byEvent) : null), [member, events, byEvent]);
  return (
    <Sheet open={member != null} onClose={onClose} tone="mint" icon="heart" title={member?.name ?? ""}
      footer={<View style={styles.footBtns}><Button label={MEMBER.done} tone="mint" onPress={onClose} /></View>}>
      {member && ledger ? (
        <View style={{ gap: 14 }}>
          <View style={[styles.pmdBig, { borderBottomColor: c.line }]}>
            <T v="hero" size={40}>{r1(member.serviceHours)}</T>
            <T v="mono" color={c.ink3} style={{ fontSize: 12, marginBottom: 6 }}>{memberGoalLine(member.serviceHours, goal)}</T>
          </View>
          {!ledger.loaded ? <T v="meta" color={c.ink3}>{MEMBER.reading}</T>
            : !ledger.list.length && ledger.early <= 0 ? <T v="meta" color={c.ink3}>{MEMBER.none}</T>
            : (
              <View>
                {ledger.list.map(({ event, hours }) => (
                  <View key={event.id} style={[styles.pmdRow, { borderBottomColor: c.line }]}>
                    <T v="callout" style={{ flex: 1 }} numberOfLines={1}>{event.title}</T>
                    <T v="meta" color={c.ink3}>{dayLabel(event.date)}</T>
                    <T v="mono" style={styles.pmdH}>{`${r1(hours)}h`}</T>
                  </View>
                ))}
                {ledger.early > 0 ? (
                  <View style={[styles.pmdRow, { borderBottomColor: c.line }]}>
                    <T v="callout" color={c.ink2} style={{ flex: 1, fontStyle: "italic" }}>{MEMBER.early}</T>
                    <T v="meta" color={c.ink3}>—</T>
                    <T v="mono" style={[styles.pmdH, { fontStyle: "italic" }]}>{`${r1(ledger.early)}h`}</T>
                  </View>
                ) : null}
              </View>
            )}
        </View>
      ) : null}
    </Sheet>
  );
}

/* ── the punch (signature moment) ─────────────────────────────────────────────── */

export interface Punch { name: string; role: string; from: number; to: number; goal: number }

/**
 * My service card over the page: it lands with my old hours, then the new holes punch
 * in (PunchHoles: press, chad drops, a soft haptic each). Tap or wait and it's gone.
 * Shown only after the server has logged the hours, and only when whole holes were added.
 */
export function PunchMoment({ punch, onDone }: { punch: Punch | null; onDone: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const [punched, setPunched] = useState(0);
  useEffect(() => {
    if (!punch) return;
    setPunched(Math.floor(punch.from));
    const a = setTimeout(() => setPunched(Math.floor(punch.to)), m.reduced ? 120 : 380);
    const added = Math.max(0, Math.floor(punch.to) - Math.floor(punch.from));
    const b = setTimeout(onDone, (m.reduced ? 1400 : 1900) + added * 90);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [punch]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!punch) return null;
  const stock = c.pastel.butter.soft, print = c.pastel.peach.ink;
  const total = Math.min(40, Math.max(punch.goal, Math.floor(punch.to)));
  return (
    <Modal transparent visible animationType="none" onRequestClose={onDone} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel="Close">
        <Animated.View entering={FadeIn.duration(m.reduced ? 120 : 180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, styles.scrim, { backgroundColor: alpha(c.ink, 0.35) }]}>
          <Animated.View entering={m.reduced ? FadeIn.duration(160) : ZoomIn.springify().damping(16)}
            style={[styles.punch, { backgroundColor: stock, borderColor: c.ink }, { boxShadow: `4px 4px 0 ${c.pastel.peach.fill}` }]}
            accessibilityLiveRegion="polite" accessibilityLabel={`${r1(punch.to)} of ${punch.goal} service hours`}>
            <View style={[styles.punchHead, { borderBottomColor: alpha(print, 0.38) }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="heart" size={12} color={print} />
                <T v="label" color={print} style={{ fontSize: 9.5 }}>Service card</T>
              </View>
              <T v="label" color={print} style={{ fontSize: 9.5, opacity: 0.85 }}>{`Goal · ${punch.goal} hrs`}</T>
            </View>
            <View style={[styles.punchWho, { borderBottomColor: alpha(print, 0.38) }]}>
              <T v="subhead" style={{ flex: 1 }} numberOfLines={1}>{punch.name}</T>
              <T v="mono" color={c.ink3} style={{ fontSize: 10 }} numberOfLines={1}>{punch.role}</T>
            </View>
            <T v="hero" style={{ fontSize: 44, lineHeight: 48, paddingHorizontal: 16, paddingTop: 12 }}>
              {r1(punched === Math.floor(punch.to) ? punch.to : punch.from)}<T v="subhead" color={print}>{` / ${punch.goal}h`}</T>
            </T>
            <View style={{ padding: 16 }}>
              <PunchHoles punched={punched} total={total} stock={stock} print={print} />
            </View>
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  footBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 10, flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 13, minHeight: 34, justifyContent: "center" },
  times: { gap: 12 },
  pick: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
  u: { textDecorationLine: "underline" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, minHeight: 44 },
  searchIn: { flex: 1, fontSize: 16, paddingVertical: 8 },
  logList: { borderWidth: 1.5, borderRadius: 14, overflow: "hidden" },
  logRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  hrIn: { width: 64, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, textAlign: "right" },
  mineEv: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 10 },
  had: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  big: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 16, minHeight: 70 },
  hChip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, minHeight: 34, justifyContent: "center" },
  pmdBig: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingBottom: 12, borderBottomWidth: 1 },
  pmdRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  pmdH: { width: 48, textAlign: "right", fontWeight: "600" },
  scrim: { alignItems: "center", justifyContent: "center", padding: 24 },
  punch: { width: "100%", maxWidth: 360, borderWidth: 1.5, borderRadius: 14, borderTopLeftRadius: 4, transform: [{ rotate: "-0.6deg" }] },
  punchHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 3 },
  punchWho: { flexDirection: "row", alignItems: "baseline", gap: 10, marginHorizontal: 16, marginTop: 12, paddingBottom: 3, borderBottomWidth: 1 },
});
