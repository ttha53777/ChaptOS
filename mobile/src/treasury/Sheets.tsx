/**
 * The Treasury page's modals as sheets, with the web's fields and words
 * (app/components/treasury/TxForm.tsx, treasury/page.tsx PartyForm / DeleteConfirm):
 *
 *   LedgerTxForm  "Add Transaction" / "Edit Transaction": Type, Category, Amount ($), Date,
 *                 the Scheduled switch (an expense dated ahead), Description, Payment Method,
 *                 the Period (the org's terms, "(current)"), Linked Events (the term's
 *                 calendar). Cancel / Add Transaction / Save Changes.
 *   PartyForm     "Add Party Event" / "Edit Party Event": Event Name, Date, Door Revenue ($),
 *                 Attendance, Notes. Cancel / Add Event / Save Changes.
 *   DeleteConfirm "Delete Transaction" / "Delete Party Event".
 *
 * The date is the app's day stepper rather than a calendar input (as on Tasks and
 * Meetings); a pick list stands in for each <select>.
 */
import type { CalendarEvent, SemesterRow, Transaction } from "@/lib/api-types";
import type { Catalog } from "@/lib/treasury/ledger";
import { inTerm } from "@/lib/treasury-term";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { localDay } from "~/data/home";
import { createTransaction, deleteTransaction, PAYMENT_METHODS, patchTransaction, type NewTxBody, type TxPatch } from "~/data/money";
import { createParty, deleteParty, patchParty } from "~/data/parties";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { useTheme } from "~/theme/PaperProvider";
import { monthDay, weekdayShort } from "~/today/time";
import { Field } from "~/ui/Field";
import { Switch } from "~/ui/Switch";
import { T } from "~/ui/T";

const shiftDay = (d: string, n: number) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return localDay(x); };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Lab({ children }: { children: string }) {
  const { c } = useTheme();
  return <T v="label" color={c.ink2}>{children}</T>;
}

/** A <select> as a row of chips. */
function Choices<V extends string | number>({ value, options, onChange, label }: { value: V | null; options: { v: V; l: string }[]; onChange: (v: V) => void; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Lab>{label}</Lab>
      <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map(o => {
          const on = o.v === value;
          return (
            <Pressable key={String(o.v)} onPress={() => { if (!on) { haptics.select(); onChange(o.v); } }} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={[styles.chip, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.card }]}>
              <T v="pill" size={12.5} color={on ? c.paper : c.ink2}>{o.l}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DayField({ date, onChange, label = "Date" }: { date: string; onChange: (d: string) => void; label?: string }) {
  const { c } = useTheme();
  const today = localDay();
  const shown = date === today ? "Today" : date === shiftDay(today, -1) ? "Yesterday" : date === shiftDay(today, 1) ? "Tomorrow" : `${weekdayShort(date)}, ${monthDay(date)}`;
  return (
    <View style={{ gap: 6 }}>
      <Lab>{label}</Lab>
      <View style={[styles.day, { borderColor: c.line2, backgroundColor: c.card }]}>
        <Pressable onPress={() => { haptics.select(); onChange(shiftDay(date, -1)); }} accessibilityRole="button" accessibilityLabel="A day earlier" hitSlop={8} style={styles.dayBtn}><Icon name="chev-l" size={16} color={c.ink2} /></Pressable>
        <T v="callout" style={{ flex: 1, textAlign: "center" }} accessibilityLiveRegion="polite">{shown}</T>
        <Pressable onPress={() => { haptics.select(); onChange(shiftDay(date, 1)); }} accessibilityRole="button" accessibilityLabel="A day later" hitSlop={8} style={styles.dayBtn}><Icon name="chev-r" size={16} color={c.ink2} /></Pressable>
      </View>
    </View>
  );
}

function Foot({ busy, label, ok, onCancel, onSave, err, danger }: { busy: boolean; label: string; ok: boolean; onCancel: () => void; onSave: () => void; err: string | null; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {err ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T> : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
        <Button label={busy ? "Saving…" : label} tone={danger ? "rose" : "mint"} onPress={onSave} disabled={!ok || busy} style={{ flex: 1 }} block />
      </View>
    </View>
  );
}

/* ── Add / Edit Transaction ──────────────────────────────────────────────────── */

export function LedgerTxForm({ open, tx, catalog, terms, activeTerm, events, onClose }: {
  open: boolean; tx: Transaction | null; catalog: Catalog; terms: SemesterRow[]; activeTerm: string | null; events: CalendarEvent[]; onClose: () => void;
}) {
  const { c } = useTheme();
  const today = localDay();
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState("");
  const [semester, setSemester] = useState("");
  const [status, setStatus] = useState<"posted" | "scheduled">("posted");
  const [eventIds, setEventIds] = useState<number[]>([]);
  const picked = useRef<"posted" | "scheduled" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType(tx?.type ?? "expense"); setCategory(tx?.category ?? ""); setAmount(tx ? String(tx.amount) : "");
    setDate(tx?.date ?? localDay()); setDescription(tx?.description ?? ""); setMethod(tx?.paymentMethod ?? "");
    setSemester(tx?.semester ?? ""); setStatus(tx?.status === "scheduled" ? "scheduled" : "posted");
    setEventIds(tx?.calendarEvents?.map(e => e.id) ?? []);
    picked.current = tx && tx.date > localDay() ? (tx.status as "posted" | "scheduled") : null;
    setBusy(false); setErr(null);
  }, [open, tx?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const termLabel = semester || activeTerm || "";
  const termOptions = [...terms.map(t => t.label), ...(semester && !terms.some(t => t.label === semester) ? [semester] : [])];
  const termEvents = events.filter(e => (termLabel ? inTerm(e.date, termLabel, terms) : true));
  const addable = termEvents.filter(e => !eventIds.includes(e.id));
  const cats = catalog.options(type, tx?.category ?? null);
  const ok = !!category && Number(amount) > 0 && /^\d+(\.\d{1,2})?$/.test(amount.trim());

  const onDate = (d: string) => { setDate(d); setStatus(d > today ? (picked.current ?? "scheduled") : "posted"); };

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    const body: NewTxBody = {
      type, category, amount: Number(amount), date, description, paymentMethod: method || undefined, semester: semester || undefined,
      status, calendarEventIds: eventIds,
    };
    try {
      if (tx) await patchTransaction(tx.id, body as TxPatch);
      else await createTransaction(body);
      haptics.success();
      onClose();
    } catch (e) {
      haptics.error();
      setErr(errorMessage(e, tx ? "Failed to update transaction. Changes were reverted." : "Failed to add transaction. Please try again."));
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone="lilac" icon="wallet" title={tx ? "Edit Transaction" : "Add Transaction"}
      footer={<Foot busy={busy} err={err} ok={ok} onCancel={onClose} onSave={() => void save()} label={tx ? "Save Changes" : "Add Transaction"} />}>
      <View style={{ gap: 16 }}>
        <Choices label="Type" value={type} onChange={t => { setType(t); setCategory(""); }} options={[{ v: "income", l: "Income" }, { v: "expense", l: "Expense" }]} />
        <Choices label="Category" value={category || null} onChange={setCategory} options={cats.map(x => ({ v: x.slug, l: x.label }))} />
        <Field label="Amount ($)" value={amount} onChangeText={t => setAmount(t.replace(/[^\d.]/g, ""))} placeholder="0.00" keyboardType="decimal-pad" />
        <DayField date={date} onChange={onDate} />
        {type === "expense" && date > today ? (
          <View style={[styles.sched, { borderColor: status === "scheduled" ? c.pastel.butter.border : c.line2, backgroundColor: status === "scheduled" ? c.pastel.butter.soft : c.card }]}>
            <T v="meta" size={12.5} color={c.ink3} style={{ flex: 1 }}>
              {status === "scheduled"
                ? <><T v="bodyStrong" size={12.5} color={c.pastel.butter.ink}>Scheduled</T> — not paid yet</>
                : <>Scheduled <T v="meta" size={12.5} color={c.faint}>(toggle if not paid)</T></>}
            </T>
            <Switch value={status === "scheduled"} tone="butter" label="Scheduled"
              onChange={v => { const next = v ? "scheduled" : "posted"; picked.current = next; setStatus(next); }} />
          </View>
        ) : null}
        <Field label="Description" value={description} onChangeText={setDescription} placeholder="e.g. Asia Night door cut" maxLength={500} />
        <Choices label="Payment Method" value={method} onChange={setMethod} options={[{ v: "", l: "—" }, ...PAYMENT_METHODS.map(m => ({ v: m as string, l: cap(m) }))]} />
        {termOptions.length
          ? <Choices label="Period" value={termLabel} onChange={setSemester} options={termOptions.map(l => ({ v: l, l: `${l}${l === activeTerm ? " (current)" : ""}` }))} />
          : <View style={{ gap: 6 }}><Lab>Period</Lab><T v="meta" color={c.ink3}>No period set up</T></View>}
        {termEvents.length ? (
          <View style={{ gap: 6 }}>
            <Lab>Linked Events</Lab>
            {eventIds.length ? (
              <View style={styles.wrap}>
                {eventIds.map(id => {
                  const ev = termEvents.find(e => e.id === id);
                  if (!ev) return null;
                  return (
                    <Pressable key={id} onPress={() => setEventIds(xs => xs.filter(x => x !== id))} accessibilityRole="button" accessibilityLabel={`Remove ${ev.title}`}
                      style={[styles.ev, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}>
                      <Icon name="cal" size={12} color={c.pastel.lilac.ink} />
                      <T v="pill" size={11} color={c.pastel.lilac.ink}>{ev.title}</T>
                      <Icon name="x" size={10} color={c.pastel.lilac.ink} />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {addable.length ? (
              <View style={{ gap: 4 }}>
                <T v="meta" color={c.ink3}>+ Add event link…</T>
                <View style={styles.wrap}>
                  {addable.map(ev => (
                    <Pressable key={ev.id} onPress={() => setEventIds(xs => [...xs, ev.id])} accessibilityRole="button"
                      style={[styles.chip, { borderColor: c.line2, backgroundColor: c.card, borderStyle: "dashed" }]}>
                      <T v="pill" size={12} color={c.ink2}>{ev.title} · {ev.date}</T>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : eventIds.length ? <T v="meta" size={11} color={c.faint}>All semester events linked.</T> : null}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

/* ── Add / Edit Party Event ──────────────────────────────────────────────────── */

export interface PartyLike { id: number; name: string; date: string; doorRevenue: number; attendance: number; notes?: string | null; partyType?: string; completed?: boolean }

export function PartyForm({ open, party, onClose }: { open: boolean; party: PartyLike | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(localDay());
  const [door, setDoor] = useState("");
  const [att, setAtt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(party?.name ?? ""); setDate(party?.date ?? localDay()); setDoor(party ? String(party.doorRevenue) : "");
    setAtt(party ? String(party.attendance) : ""); setNotes(party?.notes ?? ""); setBusy(false); setErr(null);
  }, [open, party?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ok = !!name.trim() && door.trim() !== "" && att.trim() !== "";
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    const partyType = (party?.partyType === "Closed" ? "Closed" : "Open") as "Open" | "Closed";
    const data = { name, date, doorRevenue: Number(door), attendance: Number(att), notes, theme: "", collabOrg: "", expenses: 0, partyType };
    try {
      if (party) await patchParty(party.id, { ...data, completed: party.completed ?? false });
      else await createParty(data);
      haptics.success();
      onClose();
    } catch (e) {
      haptics.error();
      setErr(errorMessage(e, party ? "Failed to update party event. Changes were reverted." : "Failed to add party event. Please try again."));
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone="rose" icon="ticket" title={party ? "Edit Party Event" : "Add Party Event"}
      footer={<Foot busy={busy} err={err} ok={ok} onCancel={onClose} onSave={() => void save()} label={party ? "Save Changes" : "Add Event"} />}>
      <View style={{ gap: 16 }}>
        <Field label="Event Name" value={name} onChangeText={setName} placeholder="Spring Rush Social" />
        <DayField date={date} onChange={setDate} />
        <Field label="Door Revenue ($)" value={door} onChangeText={t => setDoor(t.replace(/[^\d.]/g, ""))} placeholder="0" keyboardType="decimal-pad" />
        <Field label="Attendance" value={att} onChangeText={t => setAtt(t.replace(/\D/g, ""))} placeholder="0" keyboardType="number-pad" />
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional notes" />
      </View>
    </Sheet>
  );
}

/* ── Delete ──────────────────────────────────────────────────────────────────── */

export type Doomed = { kind: "tx"; tx: Transaction } | { kind: "party"; party: PartyLike };

export function DeleteConfirm({ doomed, onClose, onDeleted }: { doomed: Doomed | null; onClose: () => void; onDeleted?: (d: Doomed) => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setBusy(false); setErr(null); }, [doomed]);
  const label = !doomed ? "" : doomed.kind === "tx" ? doomed.tx.description || doomed.tx.category : doomed.party.name;
  const go = async () => {
    if (!doomed) return;
    setBusy(true);
    try {
      if (doomed.kind === "tx") await deleteTransaction(doomed.tx.id);
      else await deleteParty(doomed.party.id);
      haptics.success();
      onDeleted?.(doomed);
      onClose();
    } catch (e) {
      haptics.error();
      setErr(errorMessage(e, doomed.kind === "tx" ? "Failed to delete transaction. It was restored." : "Failed to delete party event. It was restored."));
      setBusy(false);
    }
  };
  return (
    <Sheet open={!!doomed} onClose={onClose} locked={busy} tone="rose" icon="trash" title={doomed?.kind === "party" ? "Delete Party Event" : "Delete Transaction"}
      footer={<Foot busy={busy} err={err} ok onCancel={onClose} onSave={() => void go()} label="Delete" danger />}>
      <T v="body" size={14} color={c.ink2}>Are you sure you want to delete <T v="bodyStrong" size={14}>{label}</T>? This action cannot be undone.</T>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  day: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, minHeight: 48, paddingHorizontal: 6 },
  dayBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  sched: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  ev: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
});
