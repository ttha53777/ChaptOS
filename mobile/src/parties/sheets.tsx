/**
 * The house ledger's forms, as the web's modals (app/org/[slug]/parties), on the phone:
 *
 *   PartyForm     "Add Party" / "Edit Party": Party name, When (the stacked schedule),
 *                 Party type off two wristband cards, Theme opt, Collab org opt
 *   WrapUp        "Mark Completed", two steps: door + expenses (+ notes) with the net
 *                 preview, then Who came? (everyone starts ticked) and Mandatory. Step 2
 *                 is skipped with no one to roll or the roll already in.
 *   DeleteParty   the web's confirm
 *   DoorMoment    after the server has the wrap-up: the night's receipt feeds out of the
 *                 till and CLOSED OUT stamps across it (~/moments/Till), over the page
 *
 * Saves hand their body to the page, which writes optimistically as the web does.
 */
import type { Brother, Party } from "@/lib/api-types";
import { memo, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInRight, FadeOut, FadeOutLeft, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { localDay } from "~/data/home";
import type { Schedule } from "~/data/parties";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { deviceZone } from "~/meetings/model";
import { Till, type TillSlip, type TillState } from "~/moments/Till";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { alpha } from "~/theme/palette";
import { useFontScale, useMotion, useTheme } from "~/theme/PaperProvider";
import { resolveType } from "~/theme/type";
import { Switch } from "~/ui/Switch";
import { T } from "~/ui/T";
import { FormField, FormLabel, WhenFields, initialWhen, timingOf, type When } from "~/ui/WhenFields";
import { Wristband } from "./bits";
import { DELETE, FIND_AFTER, FORM, PARTY_TYPES, WRAP, canTakeRoll as canRoll, money, signed$ } from "./model";

function Foot({ note, cancel, go, ok, onCancel, onGo }: { note: string; cancel: string; go: string; ok: boolean; onCancel: () => void; onGo: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10, flex: 1 }}>
      <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{note}</T>
      <View style={styles.footBtns}>
        <Button label={cancel} variant="ghost" onPress={onCancel} />
        <Button label={go} tone="rose" onPress={onGo} disabled={!ok} />
      </View>
    </View>
  );
}

/* ── Add Party / Edit Party ───────────────────────────────────────────────────── */

export interface PartyFormBody { name: string; date: string; schedule?: Schedule; partyType: "Open" | "Closed"; theme: string; collabOrg: string }

export function PartyForm({ open, party, onClose, onSave }: { open: boolean; party: Party | null; onClose: () => void; onSave: (body: PartyFormBody) => void }) {
  const me = useEntryOf("ready")?.me ?? null;
  const term = me?.org?.activeTerm ?? null;
  const orgZone = me?.org?.timeZone ?? null;
  const zone = orgZone || deviceZone();
  const [name, setName] = useState("");
  const [type, setType] = useState<"Open" | "Closed">("Open");
  const [theme, setTheme] = useState("");
  const [collab, setCollab] = useState("");
  const [when, setWhen] = useState<When>(() => initialWhen(null, zone, localDay()));
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    setName(party?.name ?? ""); setType(party?.partyType ?? "Open"); setTheme(party?.theme ?? ""); setCollab(party?.collabOrg ?? "");
    setWhen(initialWhen(party, zone, localDay()));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!name) return;
    const timing = timingOf(when, zone);
    if ("error" in timing) { setErr(timing.error); return; }
    onSave({ name, ...timing, partyType: type, theme, collabOrg: collab });
  };

  return (
    <Sheet open={open} onClose={onClose} size="tall" tone="rose" icon="note" title={party ? FORM.editTitle : FORM.addTitle}
      footer={<Foot note={party ? FORM.editFoot : FORM.addFoot} cancel={FORM.cancel} go={party ? FORM.save : FORM.add} ok={!!name} onCancel={onClose} onGo={save} />}>
      <View style={{ gap: 18 }}>
        <View>
          <FormLabel text={FORM.name} />
          <FormField value={name} onChange={setName} placeholder={party ? undefined : FORM.namePh} label={FORM.name} autoFocus={!party} />
        </View>
        <WhenFields value={when} onChange={setWhen} label={FORM.when} err={err} open={open} editing={!!party} term={term} orgZone={orgZone} tone="rose" />
        <View>
          <FormLabel text={FORM.type} />
          <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={FORM.type}>
            {PARTY_TYPES.map(t => <TypeCard key={t.v} v={t.v} blurb={t.blurb} on={type === t.v} onPress={() => { if (type !== t.v) { haptics.select(); setType(t.v); } }} />)}
          </View>
        </View>
        <View>
          <FormLabel text={FORM.theme} opt={FORM.opt} />
          <FormField value={theme} onChange={setTheme} placeholder={party ? FORM.themePhEdit : FORM.themePhAdd} label={FORM.theme} />
        </View>
        <View>
          <FormLabel text={FORM.collab} opt={FORM.opt} />
          <FormField value={collab} onChange={setCollab} placeholder={FORM.collabPh} label={FORM.collab} />
        </View>
      </View>
    </Sheet>
  );
}

function TypeCard({ v, blurb, on, onPress }: { v: "Open" | "Closed"; blurb: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${v}. ${blurb}`}
      style={[styles.type, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel.rose.soft : c.card }, on && { boxShadow: `2px 2px 0 ${c.note.fill.rose}` }]}>
      <Wristband type={v} size="md" />
      <T v="meta" color={on ? c.ink2 : c.ink3} style={{ flex: 1 }}>{blurb}</T>
    </Pressable>
  );
}

/* ── Mark Completed ───────────────────────────────────────────────────────────── */

export interface WrapUpForm { doorRevenue: string; expenses: string; notes: string; attendedIds?: number[]; mandatory?: boolean }

export function WrapUp({ party, people, rolled, onClose, onSubmit }: {
  party: Party | null; people: Brother[]; rolled: boolean; onClose: () => void; onSubmit: (party: Party, form: WrapUpForm) => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const scale = useFontScale();
  const [step, setStep] = useState<1 | 2>(1);
  const [door, setDoor] = useState("");
  const [spent, setSpent] = useState("");
  const [notes, setNotes] = useState("");
  const [present, setPresent] = useState<Set<number>>(new Set());
  const [mandatory, setMandatory] = useState(false);
  const [find, setFind] = useState("");

  useEffect(() => {
    if (!party) return;
    setStep(1); setDoor(""); setSpent(""); setNotes(""); setMandatory(party.mandatory); setFind("");
    // Everyone starts ticked; untick the no-shows.
    setPresent(new Set(people.map(b => b.id)));
  }, [party?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const take = canRoll(people.length, rolled);
  const net = money(door) - money(spent);
  const moneyOk = door.trim() !== "" && spent.trim() !== "" && Number(door) >= 0 && Number(spent) >= 0 && !Number.isNaN(Number(door)) && !Number.isNaN(Number(spent));
  // A search hides rows; it never drops them: everyone still ticked still submits.
  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? people.filter(b => b.name.toLowerCase().includes(q)) : people;
  }, [people, find]);

  const toggle = (id: number) => { haptics.select(); setPresent(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  // All / None act on the rows in view, so "find Sam → None" unticks just Sam.
  const markShown = (on: boolean) => { haptics.select(); setPresent(s => { const n = new Set(s); for (const b of shown) if (on) n.add(b.id); else n.delete(b.id); return n; }); };

  if (!party) return <Sheet open={false} onClose={onClose} title={WRAP.title}>{null}</Sheet>;
  const money1 = { doorRevenue: door, expenses: spent, notes };
  const next = () => { if (!moneyOk) return; if (take) setStep(2); else onSubmit(party, money1); };
  const finish = () => onSubmit(party, { ...money1, attendedIds: [...present], mandatory });

  const footer = step === 1
    ? <Foot note={take ? WRAP.footRoll : WRAP.footMoney} cancel={WRAP.cancel} go={take ? WRAP.next : WRAP.done} ok={moneyOk} onCancel={onClose} onGo={next} />
    : <Foot note={WRAP.footTick} cancel={WRAP.back} go={WRAP.done} ok onCancel={() => setStep(1)} onGo={finish} />;
  const enter = (m.reduced ? FadeIn.duration(120) : FadeInRight.springify().damping(20)).reduceMotion(ReduceMotion.Never);
  const exit = (m.reduced ? FadeOut.duration(100) : FadeOutLeft.duration(140)).reduceMotion(ReduceMotion.Never);

  return (
    <Sheet open={!!party} onClose={onClose} size="tall" tone="rose" icon="receipt" title={WRAP.title} footer={footer}>
      <View style={{ gap: 14 }}>
        <View style={[styles.wrapHead, { backgroundColor: alpha(c.ink, 0.04) }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="callout" style={{ fontWeight: "600" }}>{party.name}</T>
            <T v="meta" color={c.ink3} style={{ fontSize: 11.5 }}>{WRAP.head(party)}</T>
          </View>
          {take ? <Steps step={step} /> : null}
        </View>
        {step === 1 ? (
          <Animated.View key="money" entering={enter} exiting={exit} style={{ gap: 14 }}>
            <View style={styles.amounts}>
              <View style={{ flex: 1 }}>
                <FormLabel text={WRAP.door} />
                <FormField value={door} onChange={setDoor} placeholder={WRAP.amtPh} label={WRAP.door} keyboardType="decimal-pad" autoFocus />
              </View>
              <View style={{ flex: 1 }}>
                <FormLabel text={WRAP.spent} />
                <FormField value={spent} onChange={setSpent} placeholder={WRAP.amtPh} label={WRAP.spent} keyboardType="decimal-pad" />
              </View>
            </View>
            <View style={[styles.preview, { backgroundColor: alpha(c.ink, 0.04) }]} accessible accessibilityLabel={`${WRAP.preview} ${signed$(net)}`}>
              <T v="meta" color={c.faint} style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>{WRAP.preview}</T>
              <T v="title" color={net >= 0 ? c.pastel.mint.ink : c.pastel.rose.ink} style={{ fontSize: 18, lineHeight: 22 }}>{signed$(net)}</T>
            </View>
            <View>
              <FormLabel text={WRAP.notes} />
              <TextInput value={notes} onChangeText={setNotes} multiline placeholder={WRAP.notesPh} placeholderTextColor={c.faint} accessibilityLabel={WRAP.notes}
                style={[resolveType("body", scale), styles.notes, { color: c.ink, borderColor: c.line2, backgroundColor: c.card }]} />
            </View>
          </Animated.View>
        ) : (
          <Animated.View key="roll" entering={enter} exiting={exit} style={{ gap: 12 }}>
            <View style={styles.rollHead}>
              <FormLabel text={WRAP.who(present.size, people.length)} />
              <View style={{ flexDirection: "row", gap: 4 }}>
                <Pressable onPress={() => markShown(true)} hitSlop={6} style={({ pressed }) => [styles.allNone, pressed && pressedDim]} accessibilityRole="button" accessibilityLabel={WRAP.all}><T v="kicker" color={c.ink3}>{WRAP.all}</T></Pressable>
                <Pressable onPress={() => markShown(false)} hitSlop={6} style={({ pressed }) => [styles.allNone, pressed && pressedDim]} accessibilityRole="button" accessibilityLabel={WRAP.none}><T v="kicker" color={c.ink3}>{WRAP.none}</T></Pressable>
              </View>
            </View>
            {people.length > FIND_AFTER ? (
              <View style={[styles.find, { borderColor: c.line2, backgroundColor: c.card }]}>
                <Icon name="search" size={15} color={c.ink3} />
                <TextInput value={find} onChangeText={setFind} placeholder={WRAP.find} placeholderTextColor={c.faint} style={[styles.findIn, { color: c.ink }]} accessibilityLabel="Find a member" autoCorrect={false} />
              </View>
            ) : null}
            <View style={[styles.list, { borderColor: c.line, backgroundColor: c.card }]}>
              {shown.map((b, i) => <CheckRow key={b.id} id={b.id} name={b.name} on={present.has(b.id)} first={i === 0} onToggle={toggle} />)}
              {!shown.length ? <T v="meta" color={c.ink3} style={{ padding: 14 }}>{WRAP.nobody}</T> : null}
            </View>
            <View style={[styles.req, { backgroundColor: alpha(c.ink, 0.03) }]}>
              <T v="meta" color={c.ink2} style={{ flex: 1 }}>
                <T v="meta" color={c.ink} style={{ fontWeight: "700" }}>{WRAP.mandatory[0]}</T>{WRAP.mandatory[1]}
              </T>
              <Switch value={mandatory} onChange={setMandatory} tone="rose" label={WRAP.mandatory[0]} />
            </View>
          </Animated.View>
        )}
      </View>
    </Sheet>
  );
}

/** The web's roll line: a tick box and the name (no avatar). */
const CheckRow = memo(function CheckRow({ id, name, on, first, onToggle }: { id: number; name: string; on: boolean; first: boolean; onToggle: (id: number) => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => onToggle(id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={name}
      style={({ pressed }) => [styles.check, !first && { borderTopWidth: 1, borderTopColor: alpha(c.ink, 0.05) }, pressed && { backgroundColor: alpha(c.ink, 0.03) }]}>
      <View style={[styles.box, on ? { borderColor: c.pastel.mint.ink, backgroundColor: alpha(c.pastel.mint.ink, 0.2) } : { borderColor: alpha(c.ink, 0.18) }]}>
        {on ? <Icon name="check" size={11} color={c.pastel.mint.ink} /> : null}
      </View>
      <T v="callout" color={on ? c.ink : c.ink3} numberOfLines={1} style={{ flex: 1 }}>{name}</T>
    </Pressable>
  );
});

/** Two dots; the current one stretches into an ink bar (pop spring; reduced, it just changes). */
function Steps({ step }: { step: 1 | 2 }) {
  const { c } = useTheme();
  return (
    <View style={styles.steps} accessible accessibilityLabel={WRAP.step(step)}>
      <StepDot on={step === 1} color={c.pastel.lilac.ink} off={c.line2} />
      <StepDot on={step === 2} color={c.pastel.lilac.ink} off={c.line2} />
    </View>
  );
}

function StepDot({ on, color, off }: { on: boolean; color: string; off: string }) {
  const m = useMotion();
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => { v.value = m.reduced ? (on ? 1 : 0) : withSpring(on ? 1 : 0, m.spring("pop")); }, [on, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const ink = useAnimatedStyle(() => ({ opacity: v.value }));
  return (
    <View style={{ width: 7, height: 7 }}>
      <View style={[styles.stepDot, { backgroundColor: off }]} />
      <Animated.View style={[styles.stepDot, { backgroundColor: color }, ink]} />
    </View>
  );
}

/* ── Delete Party ─────────────────────────────────────────────────────────────── */

export function DeleteParty({ party, onClose, onConfirm }: { party: Party | null; onClose: () => void; onConfirm: (p: Party) => void }) {
  const { c } = useTheme();
  const msg = party ? DELETE.message(party.name) : null;
  return (
    <Sheet open={!!party} onClose={onClose} size="fit" tone="rose" icon="trash" title={DELETE.title}
      footer={
        <View style={styles.footBtns}>
          <Button label="Cancel" variant="ghost" onPress={onClose} />
          <Button label="Delete" tone="rose" onPress={() => party && onConfirm(party)} />
        </View>
      }>
      {msg ? (
        <T v="body" color={c.ink2}>
          {msg[0]}<T v="body" color={c.ink} style={{ fontWeight: "600" }}>{msg[1]}</T>{msg[2]}
        </T>
      ) : null}
    </Sheet>
  );
}

/* ── the door moment ──────────────────────────────────────────────────────────── */

export function DoorMoment({ slip, onDone }: { slip: TillSlip | null; onDone: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const [state, setState] = useState<TillState>("ready");
  useEffect(() => {
    if (!slip) return;
    setState("ready");
    const a = setTimeout(() => setState("print"), m.reduced ? 60 : 220);
    return () => clearTimeout(a);
  }, [slip]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!slip) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onDone} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel="Close">
        <Animated.View entering={FadeIn.duration(m.reduced ? 120 : 180)} exiting={FadeOut.duration(160)}
          style={[StyleSheet.absoluteFill, styles.scrim, { backgroundColor: alpha(c.ink, 0.35) }]} accessibilityLiveRegion="polite"
          accessibilityLabel={`${slip.name}: door ${slip.door}, spent ${slip.spent}, net ${slip.net}`}>
          <Till state={state} slip={slip} onDone={() => setTimeout(onDone, m.reduced ? 700 : 900)} />
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  footBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 10, flex: 1 },
  type: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  wrapHead: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  amounts: { flexDirection: "row", gap: 10 },
  preview: { alignItems: "center", gap: 2, paddingVertical: 10, borderRadius: 10 },
  notes: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 72, textAlignVertical: "top" },
  rollHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  allNone: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  find: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, minHeight: 44 },
  findIn: { flex: 1, fontSize: 16, paddingVertical: 8 },
  list: { borderWidth: 1.5, borderRadius: 12, overflow: "hidden" },
  check: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 9 },
  box: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  req: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 10 },
  steps: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepDot: { position: "absolute", left: 0, top: 0, width: 7, height: 7, borderRadius: 4 },
  scrim: { alignItems: "center", justifyContent: "center", padding: 24 },
});
