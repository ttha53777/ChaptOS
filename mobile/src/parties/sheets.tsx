/**
 * Parties' sheets (the web page's drawer, modals and confirm, on the phone):
 *
 *   PartySheet    one party: the night's till receipt, its notes, the facts (wristband,
 *                 theme, collab, mandatory), who came as dots; officers get Wrap up (once
 *                 it's happened), Edit and Delete. Open in Timeline shows its Timeline
 *                 entry's sheet on top
 *   PartyForm     add / edit: name, when (day stubs + the clock), the two wristband
 *                 cards, theme, collab org
 *   WrapUp        "Mark completed", two steps as on the web: door + expenses (+ notes)
 *                 with the net preview, then who came (everyone ticked; untick the
 *                 no-shows) and Mandatory. Step two is skipped once a roll exists, when
 *                 the roster is empty, or with no active term (the server refuses a roll
 *                 without one). Saving plays the till (~/moments/Till)
 *   DeleteParty   the web's confirm, word for word
 *
 * Every write is MANAGE_PARTIES; members see the party sheet read-only.
 */
import type { Brother, Party } from "@/lib/api-types";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInRight, FadeOutLeft, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { errorMessage } from "~/api/errors";
import { localDay } from "~/data/home";
import { createParty, deleteParty, patchParty, wrapUpParty, type PartyPatch, type Schedule } from "~/data/parties";
import { useRoster } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon, type IconName } from "~/icons/Icon";
import { Clock, DayStrip } from "~/meetings/EventForm";
import { addDays, deviceZone, wallOf, wallToInstant } from "~/meetings/model";
import { RollRow } from "~/meetings/TakeAttendance";
import { Till, type TillSlip } from "~/moments/Till";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { TickingNumber } from "~/paper/TickingNumber";
import { Receipt } from "~/paper/stationery";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { parseClock } from "~/today/time";
import { Field } from "~/ui/Field";
import { Switch } from "~/ui/Switch";
import { T } from "~/ui/T";
import { ReceiptLines, RollDots, Wristband } from "./bits";
import { canManage, cash, dow, isUpcoming, longDate, monDay, needsWrapUp, PARTY_TYPES, partyTime, profit, signed, subLine } from "./model";
import { pressedDim } from "~/motion/press";

function useOrgBits() {
  const me = useEntryOf("ready")?.me ?? null;
  return { me, org: me?.org?.name ?? "ChaptOS", term: me?.org?.activeTerm ?? null, zone: me?.org?.timeZone || deviceZone(), today: localDay() };
}

function Err({ text }: { text: string | null }) {
  const { c } = useTheme();
  return text ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{text}</T> : null;
}

/* ── PartySheet ───────────────────────────────────────────────────────────────── */

export function PartySheet({ party, roll, onClose, onWrap, onEdit, onDelete, onTimeline }: {
  party: Party | null;
  roll: { present: number; eligible: number } | null;
  onClose: () => void;
  onWrap: (p: Party) => void;
  onEdit: (p: Party) => void;
  onDelete: (p: Party) => void;
  onTimeline: (eventId: number) => void;
}) {
  const { c } = useTheme();
  const { me, org, today } = useOrgBits();
  const officer = !!me && canManage(me);
  // keep the last copy on screen while the sheet slides away after a delete
  const [last, setLast] = useState<Party | null>(null);
  useEffect(() => { if (party) setLast(party); }, [party]);
  const p = party ?? last;
  if (!p) return <Sheet open={false} onClose={onClose} />;
  const due = needsWrapUp(p, today);
  const up = isUpcoming(p, today);
  const rolled = roll && roll.eligible > 0 ? roll : null;

  return (
    <Sheet open={!!party} onClose={onClose} size="tall" tone="rose" icon="note" kicker={subLine(p) || "Party"} title={p.name}
      actions={officer ? <Button label="Edit" size="sm" variant="soft" icon="pencil" onPress={() => onEdit(p)} /> : null}>
      <View style={{ gap: 22 }}>
        {officer && due ? <Button label="Wrap it up" icon="check" tone="rose" block onPress={() => onWrap(p)} /> : null}

        <Receipt rotate={-1.2} style={{ alignSelf: "center", width: 262 }}>
          <ReceiptLines p={p} org={org} roll={rolled} today={today} />
        </Receipt>

        {p.notes ? (
          <T v="heading" color={c.ink2} style={{ fontSize: 18, lineHeight: 25 }}>
            <T v="heading" color={c.pastel.rose.ink} style={{ fontSize: 18 }}>“</T>{p.notes}<T v="heading" color={c.pastel.rose.ink} style={{ fontSize: 18 }}>”</T>
          </T>
        ) : (
          <T v="body" color={c.ink3}>{up ? "Numbers open until it's wrapped up." : due ? "Happened already. No figures recorded yet." : "No notes."}</T>
        )}

        <View style={styles.facts}>
          <Wristband type={p.partyType} size="md" />
          {p.theme ? <Fact icon="star" text={p.theme} /> : null}
          {p.collabOrg ? <Fact icon="people" text={`with ${p.collabOrg}`} /> : null}
          {p.mandatory ? <Fact icon="check" text="Mandatory: counts toward attendance" /> : null}
          <Fact icon="cal" text={`${longDate(p.date)}${partyTime(p) ? ` · ${partyTime(p)}` : ""}`} />
        </View>

        {rolled ? (
          <View style={{ gap: 8 }} accessible accessibilityLabel={`Who came: ${rolled.present} of ${rolled.eligible} members`}>
            <View style={styles.rollHead}>
              <T v="label" color={c.ink3}>Who came</T>
              <T v="mono" color={c.ink} style={{ fontWeight: "700" }}>{`${rolled.present} of ${rolled.eligible}`}</T>
            </View>
            <RollDots present={rolled.present} eligible={rolled.eligible} />
          </View>
        ) : null}

        <View style={styles.acts}>
          {p.attendanceEventId != null ? <Button label="Open in Timeline" size="sm" variant="ghost" icon="timeline" onPress={() => onTimeline(p.attendanceEventId!)} /> : null}
          {officer ? <Button label="Delete" size="sm" variant="ghost" icon="trash" tone="rose" onPress={() => onDelete(p)} /> : null}
        </View>
      </View>
    </Sheet>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={14} color={c.ink3} />
      <T v="meta" color={c.ink2} style={{ flexShrink: 1 }}>{text}</T>
    </View>
  );
}

/* ── PartyForm: add / edit ────────────────────────────────────────────────────── */

const NIGHT = 21 * 60;

/** The party's start on the wall clock, in minutes; null for all-day or unreadable text. */
function startOf(p: Party, zone: string): number | null {
  if (p.schedule?.kind === "timed") return wallOf(p.schedule.start, p.schedule.timeZone || zone)?.minutes ?? null;
  if (p.schedule?.kind === "allDay") return null;
  return parseClock(p.time);
}

/** A timed start keeps the old length (start → end) when it moves; all day spans the date. */
function scheduleOf(date: string, minutes: number | null, zone: string, was: Party | null): Schedule {
  if (minutes == null) return { kind: "allDay", start: date, end: addDays(date, 1) };
  const start = wallToInstant(date, minutes, zone);
  const old = was?.schedule?.kind === "timed" && was.schedule.end ? Date.parse(was.schedule.end) - Date.parse(was.schedule.start) : null;
  return old && old > 0 ? { kind: "timed", start, end: new Date(Date.parse(start) + old).toISOString(), timeZone: zone } : { kind: "timed", start, timeZone: zone };
}

export function PartyForm({ open, party, onClose, onSaved }: { open: boolean; party: Party | null; onClose: () => void; onSaved?: (p: Party) => void }) {
  const { c } = useTheme();
  const { term, zone, today } = useOrgBits();
  const editing = !!party;
  const [name, setName] = useState("");
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState<number | null>(NIGHT);
  const [clockTouched, setClockTouched] = useState(false);
  const [type, setType] = useState<"Open" | "Closed">("Open");
  const [theme, setTheme] = useState("");
  const [collab, setCollab] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const first = term && today < term.startDate ? term.startDate : today;
    setName(party?.name ?? ""); setDate(party?.date ?? first);
    setMinutes(party ? startOf(party, zone) : NIGHT); setClockTouched(false);
    setType(party?.partyType ?? "Open"); setTheme(party?.theme ?? ""); setCollab(party?.collabOrg ?? "");
    setErr(null); setBusy(false);
  }, [open, party?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // a legacy free-text time ("ninish") stays as written until a real time is set
  const legacy = party && !party.schedule && party.time && parseClock(party.time) == null ? party.time : null;
  const outside = !!term && (date < term.startDate || date > term.endDate);
  const canSave = !!name.trim() && !busy && !outside;

  const go = async () => {
    if (!canSave) return;
    setBusy(true); setErr(null);
    try {
      let saved: Party;
      if (party) {
        const patch: PartyPatch = { name: name.trim(), partyType: type, theme: theme.trim(), collabOrg: collab.trim() };
        if (clockTouched) { patch.date = date; patch.schedule = scheduleOf(date, minutes, zone, party); }
        else if (date !== party.date) patch.date = date; // the server moves the times with the day
        saved = await patchParty(party.id, patch);
      } else {
        saved = await createParty({ name: name.trim(), date, schedule: scheduleOf(date, minutes, zone, null), partyType: type, theme: theme.trim(), collabOrg: collab.trim() });
      }
      haptics.success();
      onClose();
      onSaved?.(saved);
      toast.show(party ? "Saved" : `${saved.name} is on the books`, { detail: party ? "Changes carry to its Timeline entry." : "It's on the Timeline as a party." });
    } catch (x) {
      haptics.error();
      setErr(errorMessage(x, "Couldn't save the party."));
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone="rose" icon="note" kicker={editing ? party!.name : "The house ledger"} title={editing ? "Edit party" : "Add party"}
      footer={
        <View style={{ flex: 1, gap: 6 }}>
          <Err text={err} />
          <Button label={busy ? "Saving…" : editing ? "Save changes" : "Add party"} icon="check" tone="rose" block onPress={() => void go()} disabled={!canSave} />
          <T v="meta" color={c.ink3} align="center">{editing ? "Changes carry to its Timeline entry." : "Lands on the Timeline as a party."}</T>
        </View>
      }>
      <View style={{ gap: 20 }}>
        <Field label="Party name" value={name} onChangeText={setName} placeholder="Spring Rush Social" maxLength={200} autoFocus={!editing} />
        <View style={{ gap: 8 }}>
          <T v="label" color={c.ink2}>When</T>
          <DayStrip value={date} onChange={setDate} today={today} term={term} usualDow={null} taken={new Set()} editing={editing} open={open} />
          <Clock minutes={minutes} onChange={v => { setMinutes(v); setClockTouched(true); }} tone="rose" />
          {legacy && !clockTouched ? <T v="meta" color={c.ink3}>{`The time reads "${legacy}" as written. Set one here to replace it.`}</T> : null}
          {outside ? <Err text="That's outside this term. Pick a day inside it." /> : null}
        </View>
        <View style={{ gap: 8 }}>
          <T v="label" color={c.ink2}>Party type</T>
          <View style={styles.types} accessibilityRole="radiogroup">
            {PARTY_TYPES.map(t => <TypeCard key={t.v} v={t.v} blurb={t.blurb} on={type === t.v} onPress={() => { if (type !== t.v) { haptics.select(); setType(t.v); } }} />)}
          </View>
        </View>
        <Field label="Theme (optional)" value={theme} onChangeText={setTheme} placeholder="All White, Black & Gold…" maxLength={120} />
        <Field label="Collab org (optional)" value={collab} onChangeText={setCollab} placeholder="KDF, DSP…" maxLength={120} />
      </View>
    </Sheet>
  );
}

/** A wristband card: the chosen one inks its border, lifts 2pt on the pop spring and takes a rose shadow. */
function TypeCard({ v, blurb, on, onPress }: { v: "Open" | "Closed"; blurb: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const s = useSharedValue(on ? 1 : 0);
  useEffect(() => { s.value = m.reduced ? withTiming(on ? 1 : 0, m.timing(140, "out")) : on ? withSpring(1, m.spring("pop")) : withTiming(0, m.timing(160, "out")); }, [on, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const lift = useAnimatedStyle(() => (m.reduced ? {} : { transform: [{ translateY: -2 * s.value }] }));
  const shadow = useAnimatedStyle(() => ({ opacity: s.value }));
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${v}: ${blurb}`}>
      <Animated.View style={lift}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.typeShadow, { backgroundColor: c.note.fill.rose }, shadow]} />
        <View style={[styles.type, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.card : c.paper }]}>
          <Wristband type={v} size="md" />
          <T v="meta" color={on ? c.ink2 : c.ink3}>{blurb}</T>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/* ── WrapUp ───────────────────────────────────────────────────────────────────── */

const amountOf = (s: string) => (s.trim() ? Number(s.replace(/[$,\s]/g, "")) : NaN);

export function WrapUp({ party, rolled, onClose }: { party: Party | null; rolled: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const { org, term } = useOrgBits();
  const roster = useRoster(!!party);
  const people = useMemo(() => (roster.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [roster.data]);
  const [step, setStep] = useState<1 | 2>(1);
  const [door, setDoor] = useState("");
  const [spent, setSpent] = useState("");
  const [notes, setNotes] = useState("");
  const [present, setPresent] = useState<Set<number>>(new Set());
  const [mandatory, setMandatory] = useState(false);
  const [find, setFind] = useState("");
  const [phase, setPhase] = useState<"form" | "saving" | "print">("form");
  const [slip, setSlip] = useState<TillSlip | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!party) return;
    setStep(1); setDoor(""); setSpent(""); setNotes(""); setMandatory(party.mandatory); setFind(""); setPhase("form"); setErr(null); setSlip(null);
  }, [party?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Everyone starts ticked; untick the no-shows (fills once the roster arrives).
  useEffect(() => { if (party && roster.data) setPresent(new Set(roster.data.map(b => b.id))); }, [party?.id, roster.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = amountOf(door), x = amountOf(spent);
  const moneyOk = Number.isFinite(d) && d >= 0 && Number.isFinite(x) && x >= 0;
  const net = (Number.isFinite(d) ? d : 0) - (Number.isFinite(x) ? x : 0);
  const canTakeRoll = people.length > 0 && !rolled && !!term;
  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? people.filter(b => b.name.toLowerCase().includes(q)) : people;
  }, [people, find]);

  const toggle = (id: number) => { haptics.tap(); setPresent(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  // All / None act on the rows in view, so "find Sam → None" unticks just Sam.
  const markShown = (on: boolean) => { haptics.select(); setPresent(s => { const n = new Set(s); for (const b of shown) if (on) n.add(b.id); else n.delete(b.id); return n; }); };

  const submit = async (withRoll: boolean) => {
    if (!party || !moneyOk || phase !== "form") return;
    setPhase("saving"); setErr(null);
    setSlip({ org, name: party.name, when: `${dow(party.date)} ${monDay(party.date)}`, door: cash(d), spent: cash(x), net: signed(net), neg: net < 0 });
    try {
      await wrapUpParty(party.id, { doorRevenue: d, expenses: x, notes: notes.trim(), ...(withRoll ? { attendedIds: [...present], mandatory } : {}) });
      setPhase("print");
    } catch (e) {
      haptics.error();
      setErr(errorMessage(e, "Couldn't mark the party completed."));
      setPhase("form");
    }
  };

  const printed = () => {
    if (!party) return;
    onClose();
    toast.show(`${party.name} is closed out`, { detail: `Net ${signed(net)}. The door's in the treasury now.` });
  };

  const footer = phase !== "form" ? null : step === 1 ? (
    <View style={{ flex: 1, gap: 6 }}>
      <Err text={err} />
      <Button label={canTakeRoll ? "Next: who came?" : "Mark completed"} icon={canTakeRoll ? "arrow-r" : "check"} tone="rose" block disabled={!moneyOk}
        onPress={() => { if (canTakeRoll) setStep(2); else void submit(false); }} />
      <T v="meta" color={c.ink3} align="center">{canTakeRoll ? "Next you'll tick off who came." : rolled ? "The roll's already in. This just saves the money." : !term ? "No active term, so no roll. This just saves the money." : "This saves the money."}</T>
    </View>
  ) : (
    <View style={{ flex: 1, gap: 6 }}>
      <Err text={err} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Back" variant="ghost" icon="chev-l" onPress={() => setStep(1)} />
        <Button label="Mark completed" icon="check" tone="rose" block style={{ flex: 1 }} onPress={() => void submit(true)} />
      </View>
      <T v="meta" color={c.ink3} align="center">Everyone starts ticked. Untick the no-shows.</T>
    </View>
  );

  const enter = (m.reduced ? FadeIn.duration(m.t(160)) : FadeInRight.duration(m.t(240))).reduceMotion(ReduceMotion.Never);
  const exit = (m.reduced ? undefined : FadeOutLeft.duration(m.t(160)).reduceMotion(ReduceMotion.Never));

  return (
    <Sheet open={!!party} onClose={onClose} locked={phase !== "form"} size="tall" tone="rose" icon="receipt" kicker={party ? `${monDay(party.date)} · ${subLine(party)}` : ""} title="Mark completed" footer={footer}>
      {phase !== "form" && slip ? (
        <View style={{ gap: 16, paddingTop: 8 }}>
          <Till state={phase === "print" ? "print" : "ready"} slip={slip} onDone={printed} />
          <T v="meta" color={c.ink3} align="center" accessibilityLiveRegion="polite">{phase === "saving" ? "Ringing it up…" : "Closed out."}</T>
        </View>
      ) : (
        <View style={{ gap: 18 }}>
          {canTakeRoll ? <Steps step={step} /> : null}
          {step === 1 ? (
            <Animated.View key="money" entering={enter} exiting={exit} style={{ gap: 18 }}>
              <View style={styles.amounts}>
                <View style={{ flex: 1 }}>
                  <Field label="Door revenue" value={door} onChangeText={t => setDoor(t.replace(/[^\d.$,]/g, ""))} placeholder="$0.00" keyboardType="decimal-pad" maxLength={12} autoFocus />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Expenses" value={spent} onChangeText={t => setSpent(t.replace(/[^\d.$,]/g, ""))} placeholder="$0.00" keyboardType="decimal-pad" maxLength={12} />
                </View>
              </View>
              <View style={[styles.preview, { borderColor: c.line2, backgroundColor: c.paper }]} accessible accessibilityLabel={`Net preview ${signed(net)}`}>
                <T v="kicker" color={c.ink3}>Net preview</T>
                <TickingNumber value={signed(net)} v="measure" color={net < 0 ? c.pastel.rose.ink : c.pastel.mint.ink} />
              </View>
              <View style={{ gap: 6 }}>
                <T v="label" color={c.ink2}>Post-event notes</T>
                <TextInput value={notes} onChangeText={setNotes} multiline maxLength={1000} placeholder="How did it go?" placeholderTextColor={c.faint} accessibilityLabel="Post-event notes"
                  style={[styles.notes, { color: c.note.ink, backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }]} />
              </View>
            </Animated.View>
          ) : (
            <Animated.View key="roll" entering={enter} exiting={exit} style={{ gap: 12 }}>
              <View style={styles.rollHead}>
                <T v="label" color={c.ink2}>{`Who came? (${present.size}/${people.length})`}</T>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  <Pressable onPress={() => markShown(true)} hitSlop={6} style={({ pressed }) => [styles.allNone, pressed && pressedDim]} accessibilityRole="button" accessibilityLabel="Tick everyone shown"><T v="kicker" color={c.ink3}>All</T></Pressable>
                  <Pressable onPress={() => markShown(false)} hitSlop={6} style={({ pressed }) => [styles.allNone, pressed && pressedDim]} accessibilityRole="button" accessibilityLabel="Untick everyone shown"><T v="kicker" color={c.ink3}>None</T></Pressable>
                </View>
              </View>
              {people.length > 8 ? (
                <View style={[styles.find, { borderColor: c.line2, backgroundColor: c.card }]}>
                  <Icon name="search" size={15} color={c.ink3} />
                  <TextInput value={find} onChangeText={setFind} placeholder="Find a member…" placeholderTextColor={c.faint} style={[styles.findIn, { color: c.ink }]} accessibilityLabel="Find a member" autoCorrect={false} />
                </View>
              ) : null}
              <View style={[styles.list, { borderColor: c.line, backgroundColor: c.card }]}>
                {shown.map((b: Brother, i) => <RollRow key={b.id} b={b} on={present.has(b.id)} first={i === 0} onPress={() => toggle(b.id)} />)}
                {!shown.length ? <T v="meta" color={c.ink3} style={{ padding: 14 }}>Nobody by that name.</T> : null}
              </View>
              <View style={[styles.req, { backgroundColor: c.paper2 }]}>
                <View style={{ flex: 1 }}>
                  <T v="callout">Mandatory</T>
                  <T v="meta" color={c.ink3}>Count this toward each member's attendance %.</T>
                </View>
                <Switch value={mandatory} onChange={setMandatory} tone="rose" label="Mandatory" />
              </View>
            </Animated.View>
          )}
        </View>
      )}
    </Sheet>
  );
}

/** Two dots; the current step stretches into an ink bar (pop spring; reduced, it just changes). */
function Steps({ step }: { step: 1 | 2 }) {
  const { c } = useTheme();
  return (
    <View style={styles.steps} accessible accessibilityLabel={`Step ${step} of 2`}>
      <StepDot on={step === 1} color={c.ink} off={c.line2} />
      <StepDot on={step === 2} color={c.ink} off={c.line2} />
      <T v="kicker" color={c.ink3} style={{ marginLeft: 6 }}>{step === 1 ? "The money" : "Who came"}</T>
    </View>
  );
}

function StepDot({ on, color, off }: { on: boolean; color: string; off: string }) {
  const m = useMotion();
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => { v.value = m.reduced ? (on ? 1 : 0) : withSpring(on ? 1 : 0, m.spring("pop")); }, [on, m]); // eslint-disable-line react-hooks/exhaustive-deps
  // width can't animate per frame; the dot is a fixed 18pt bar scaled down to a 7pt dot
  const st = useAnimatedStyle(() => ({ transform: [{ scaleX: (7 + 11 * v.value) / 18 }] }));
  const ink = useAnimatedStyle(() => ({ opacity: v.value }));
  return (
    <View style={{ width: 18, height: 7 }}>
      <Animated.View style={[styles.stepDot, { backgroundColor: off }, st]} />
      <Animated.View style={[styles.stepDot, { backgroundColor: color }, st, ink]} />
    </View>
  );
}

/* ── DeleteParty ──────────────────────────────────────────────────────────────── */

export function DeleteParty({ party, onClose, onDeleted }: { party: Party | null; onClose: () => void; onDeleted: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (party) setBusy(false); }, [party?.id]);
  const go = async () => {
    if (!party || busy) return;
    setBusy(true);
    try {
      await deleteParty(party.id);
      haptics.soft();
      onClose(); onDeleted();
      toast.show(`${party.name} deleted`, { detail: party.attendanceEventId != null ? "It's off the Timeline too." : "Off the books." });
    } catch (x) {
      haptics.error();
      toast.error("Couldn't delete the party", { detail: errorMessage(x) });
      setBusy(false);
    }
  };
  const n = party ? profit(party) : 0;
  return (
    <Sheet open={!!party} onClose={onClose} locked={busy} size="fit" tone="rose" icon="trash" kicker={party?.name ?? ""} title="Delete party"
      footer={
        <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
          <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
          <Button label={busy ? "Deleting…" : "Delete"} icon="trash" tone="rose" block style={{ flex: 1 }} onPress={() => void go()} disabled={busy} />
        </View>
      }>
      {party ? (
        <View style={{ gap: 12 }}>
          <T v="body" color={c.ink2}>
            {"Delete "}<T v="body" color={c.ink} style={{ fontWeight: "700" }}>{party.name}</T>
            {"? Its timeline entry, financial totals, attendance records, and excuses will also be removed. This cannot be undone."}
          </T>
          {party.completed ? <T v="meta" color={c.ink3}>{`Its ${cash(party.doorRevenue)} door comes out of the treasury balance (net ${signed(n)}).`}</T> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  facts: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 8 },
  fact: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  rollHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  types: { flexDirection: "row", gap: 8 },
  type: { gap: 8, padding: 12, borderRadius: 16, borderWidth: 1.5, minHeight: 92 },
  typeShadow: { borderRadius: 16, transform: [{ translateX: 2.5 }, { translateY: 2.5 }] },
  amounts: { flexDirection: "row", gap: 10 },
  preview: { alignItems: "center", gap: 4, paddingVertical: 12, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed" },
  notes: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, lineHeight: 24, minHeight: 96, textAlignVertical: "top" },
  allNone: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  find: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, minHeight: 44 },
  findIn: { flex: 1, fontSize: 16, paddingVertical: 8 },
  list: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  req: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12 },
  steps: { flexDirection: "row", alignItems: "center", gap: 5 },
  stepDot: { position: "absolute", left: 0, top: 0, width: 18, height: 7, borderRadius: 4, transformOrigin: "left center" },
});
