/**
 * Edit one charge (ChargeEditSheet.tsx): rename it, move its due date, change the note
 * members see, or take it back. Taking back voids every live line; the server refuses
 * (409) once anyone has paid toward it, and that copy is shown as sent. The carried-over
 * "Earlier balance" can be renamed but not taken back from here.
 */
import type { DuesChargeSummary } from "@/lib/api-types";
import { addDays, chargeChanges, fmtDay, money, plural } from "@/lib/treasury/dues";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { updateCharge, voidCharge } from "~/data/dues";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Sheet } from "~/shell/sheets";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { DuBtn, DuLink } from "./bits";

export function DueChoiceBtn({ t, s, on, onPress, children }: { t: string; s?: string; on: boolean; onPress: () => void; children?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { haptics.select(); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[styles.dt, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.card : c.paper }, on && { borderWidth: 2 }]}>
      <T v="bodyStrong" size={13.5}>{t}</T>
      {s ? <T v="meta" size={12} color={c.ink3}>{s}</T> : null}
      {children}
    </Pressable>
  );
}

/** The date inside "Due on" / "Pick a date": a day stepper, as the app's other forms. */
export function DayStep({ date, min, onChange }: { date: string; min?: string; onChange: (d: string) => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.step}>
      <Pressable onPress={() => { const d = addDays(date, -1); if (!min || d >= min) onChange(d); }} accessibilityRole="button" accessibilityLabel="A day earlier" hitSlop={8}><Icon name="chev-l" size={14} color={c.ink2} /></Pressable>
      <T v="mono" size={12.5} color={c.ink2}>{fmtDay(date)}</T>
      <Pressable onPress={() => onChange(addDays(date, 1))} accessibilityRole="button" accessibilityLabel="A day later" hitSlop={8}><Icon name="chev-r" size={14} color={c.ink2} /></Pressable>
    </View>
  );
}

export function ChargeEditSheet({ charge, today, onClose, onSaved, onTakenBack }: {
  charge: DuesChargeSummary | null; today: string; onClose: () => void; onSaved: () => void; onTakenBack: () => void;
}) {
  const { c } = useTheme();
  const [name, setName] = useState("");
  const [noDue, setNoDue] = useState(false);
  const [dueDate, setDueDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!charge) return;
    setName(charge.name); setNoDue(charge.dueDate === null); setDueDate(charge.dueDate ?? today); setNote(charge.note ?? "");
    setBusy(false); setConfirm(false); setError(null);
  }, [charge?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ch = charge ? chargeChanges(charge, name, noDue, dueDate, note) : null;
  const save = async () => {
    if (!charge || !ch?.dirty || !ch.valid) return;
    setBusy(true); setError(null);
    try { await updateCharge(charge.id, ch.changes); haptics.success(); onSaved(); }
    catch (e) { haptics.error(); setError(errorMessage(e, "Couldn't save that. Try again.")); setBusy(false); }
  };
  const takeBack = async () => {
    if (!charge) return;
    setBusy(true); setError(null);
    try { await voidCharge(charge.id); haptics.success(); onTakenBack(); }
    catch (e) { haptics.error(); setError(errorMessage(e, "Couldn't take it back. Try again.")); setBusy(false); setConfirm(false); }
  };
  const carry = charge?.audienceKind === "carryover";

  return (
    <Sheet open={!!charge} onClose={onClose} locked={busy} tone="butter" icon="pencil" title="Edit charge"
      kicker={charge ? `${charge.audienceLabel} · ${plural(charge.people, "person", "people")} · ${money(charge.total)} billed` : undefined}
      accessibilityLabel={charge ? `Edit ${charge.name}` : undefined}>
      {charge ? (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 6 }}>
            <T v="label" color={c.ink2}>Name</T>
            <TextInput value={name} onChangeText={setName} maxLength={60} accessibilityLabel="Name" autoFocus
              style={[styles.txt, { borderColor: c.line2, backgroundColor: c.card, color: c.ink }]} />
          </View>
          <View style={{ gap: 6 }}>
            <T v="label" color={c.ink2}>Due date</T>
            <View style={styles.dates}>
              <DueChoiceBtn t="Due on" on={!noDue} onPress={() => setNoDue(false)}><DayStep date={dueDate} onChange={d => { setDueDate(d); setNoDue(false); }} /></DueChoiceBtn>
              <DueChoiceBtn t="No due date" s="never late" on={noDue} onPress={() => setNoDue(true)} />
            </View>
            {!noDue && dueDate < today && charge.outstanding > 0 ? <T v="meta" size={12.5} color={c.ink3}>A date in the past makes everyone who still owes on this overdue.</T> : null}
          </View>
          <View style={{ gap: 6 }}>
            <T v="label" color={c.ink2}>Note for members <T v="meta" color={c.ink3}>(optional)</T></T>
            <TextInput value={note} onChangeText={setNote} maxLength={500} multiline placeholder="Where to pay, a payment plan, who to ask" placeholderTextColor={c.ink3}
              accessibilityLabel="Note for members" style={[styles.txt, styles.area, { borderColor: c.line2, backgroundColor: c.card, color: c.ink }]} />
          </View>
          {error ? <View style={[styles.err, { backgroundColor: c.pastel.rose.soft, borderColor: c.pastel.rose.border }]}><T v="meta" size={13} color={c.pastel.rose.ink} accessibilityRole="alert">{error}</T></View> : null}
          <View style={styles.r}>
            <DuBtn label="Save changes" onPress={() => void save()} disabled={!ch?.dirty || !ch.valid || busy} />
            <DuLink label="Cancel" onPress={onClose} />
          </View>
          <View style={[styles.danger, { borderTopColor: c.line2 }]}>
            {carry ? (
              <T v="body" size={13.5} color={c.ink3}>This is what members owed before charges were tracked one by one. To clear some of it, open a member and waive it, so there’s a record of why.</T>
            ) : confirm ? <>
              <T v="body" size={13.5} color={c.ink2}><T v="bodyStrong" size={13.5}>Take back “{charge.name}”?</T> It comes off {plural(charge.people, "tab")} and {money(charge.outstanding)} stops being owed. Nothing hits the books.</T>
              <View style={styles.r}>
                <DuBtn danger label="Take it back" onPress={() => void takeBack()} disabled={busy} />
                <DuLink label="Keep it" onPress={() => setConfirm(false)} />
              </View>
            </> : <>
              <T v="body" size={13.5} color={c.ink3}>Billed the wrong people or the wrong amount? Take it back and hand it out again.</T>
              <View style={{ alignItems: "flex-start" }}><DuBtn ghost danger icon="trash" label="Take back this charge" onPress={() => setConfirm(true)} /></View>
            </>}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  txt: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, fontFamily: "Inter-400", fontSize: 15 },
  area: { minHeight: 84, textAlignVertical: "top" },
  dates: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dt: { flexGrow: 1, flexBasis: "45%", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  step: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  r: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14 },
  err: { borderWidth: 1, borderRadius: 12, padding: 12 },
  danger: { gap: 10, paddingTop: 16, borderTopWidth: 1.5, borderStyle: "dashed" },
});
