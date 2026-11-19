/**
 * Recording money (MANAGE_TREASURY, stage 6), the web's TxForm and ledger row actions
 * (app/components/treasury/TxForm.tsx, treasury/page.tsx) on the phone:
 *
 *   TxForm     Log expense / Log revenue / edit a line: amount, the day (any day; a
 *              future expense starts Scheduled, as on the web, and the switch sticks once
 *              flipped), what it was, the org's own category (a hidden or retired one is
 *              kept on edit, never offered new), and how it was paid. Editing can also
 *              flip income ↔ expense. POST /api/transactions or PATCH /api/transactions/[id]
 *   TxSheet    one ledger line: the amount as a till slip, then category, day, paid by,
 *              linked events. Keepers: Edit, Mark paid (a scheduled line → posted),
 *              Delete
 *   DeleteTx   the confirm; DELETE is a soft delete, as on the web
 *
 * The web's period picker and event links aren't offered here: a new line takes the
 * server's term for its date, and an edit leaves both as they were.
 */
import type { Transaction, TransactionCategory } from "@/lib/api-types";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { localDay } from "~/data/home";
import { createTransaction, deleteTransaction, PAYMENT_METHODS, patchTransaction, type TxPatch } from "~/data/money";
import { Icon } from "~/icons/Icon";
import { money } from "~/members/model";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { monthDay, weekdayShort } from "~/today/time";
import { Field } from "~/ui/Field";
import { Segmented } from "~/ui/Segmented";
import { Switch } from "~/ui/Switch";
import { T } from "~/ui/T";

export type TxKind = "income" | "expense";

const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/;
const KIND: Record<TxKind, { label: string; tone: Tone; icon: "wallet" | "cash"; verb: string; placeholder: string }> = {
  expense: { label: "Expense", tone: "rose", icon: "wallet", verb: "Log expense", placeholder: "e.g. Formal venue deposit" },
  income: { label: "Revenue", tone: "mint", icon: "cash", verb: "Log revenue", placeholder: "e.g. Asia Night door cut" },
};
const shiftDay = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + n);
  return localDay(x);
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The org's own categories of one kind, in its order; a line's current one stays even if hidden. */
export function optionsFor(cats: TransactionCategory[], kind: TxKind, current: string | null): { slug: string; label: string }[] {
  const shown = cats.filter(c => c.kind === kind && !c.hidden).sort((a, b) => a.displayOrder - b.displayOrder).map(c => ({ slug: c.slug, label: c.label }));
  if (current && !shown.some(o => o.slug === current)) shown.push({ slug: current, label: cats.find(c => c.kind === kind && c.slug === current)?.label ?? current });
  return shown;
}
export const labelOf = (cats: TransactionCategory[], t: Pick<Transaction, "type" | "category">) =>
  cats.find(x => x.kind === t.type && x.slug === t.category)?.label ?? t.category;

/* ── the form ─────────────────────────────────────────────────────────────────── */

export function TxForm({ open, kind, tx, cats, onClose, onSaved }: {
  open: boolean;
  /** What a new line is (the Create tile / button pressed). Ignored when editing. */
  kind: TxKind;
  tx: Transaction | null;
  cats: TransactionCategory[];
  onClose: () => void;
  onSaved?: (t: Transaction) => void;
}) {
  const { c } = useTheme();
  const today = localDay();
  const [type, setType] = useState<TxKind>(kind);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [what, setWhat] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [status, setStatus] = useState<"posted" | "scheduled">("posted");
  const picked = useRef<"posted" | "scheduled" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = tx?.type ?? kind;
    setType(t);
    setAmount(tx ? String(tx.amount) : "");
    setDate(tx?.date ?? localDay());
    setWhat(tx?.description ?? "");
    setCat(tx?.category ?? null);
    setMethod(tx?.paymentMethod ?? null);
    const st = tx?.status === "scheduled" ? "scheduled" : "posted";
    setStatus(st);
    picked.current = tx && tx.date > localDay() ? st : null;
    setBusy(false); setErr(null);
  }, [open, tx?.id, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = optionsFor(cats, type, tx && tx.type === type ? tx.category : null);
  // a new line (or a flipped type) starts on the first category
  useEffect(() => { if (open && (cat == null || !options.some(o => o.slug === cat)) && options[0]) setCat(options[0].slug); }, [open, type, options.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const future = date > today;
  const moveDay = (n: number) => {
    haptics.select();
    const next = shiftDay(date, n);
    setDate(next);
    setStatus(next > today ? (picked.current ?? "scheduled") : "posted");
  };
  // Segmented gives the select haptic
  const flipType = (t: TxKind) => {
    if (t === type) return;
    setType(t);
    setCat(null);
    if (t === "income") setStatus("posted");
  };

  const clean = amount.trim().replace(/^\$/, "");
  const amountOk = AMOUNT_RE.test(clean) && Number(clean) > 0;
  const ready = amountOk && what.trim().length > 0 && !!cat && !busy;
  const scheduled = type === "expense" && future && status === "scheduled";
  const k = KIND[type];

  const save = async () => {
    if (!ready || !cat) return;
    setBusy(true); setErr(null);
    const st = scheduled ? "scheduled" : "posted";
    try {
      let saved: Transaction;
      if (tx) {
        const patch: TxPatch = {};
        if (type !== tx.type) patch.type = type;
        if (cat !== tx.category) patch.category = cat;
        if (Number(clean) !== tx.amount) patch.amount = Number(clean);
        if (date !== tx.date) patch.date = date;
        if (what.trim() !== tx.description) patch.description = what.trim();
        if ((method ?? null) !== (tx.paymentMethod ?? null)) patch.paymentMethod = method;
        if (st !== (tx.status ?? "posted")) patch.status = st;
        if (!Object.keys(patch).length) { onClose(); return; }
        saved = await patchTransaction(tx.id, patch);
      } else {
        saved = await createTransaction({ type, category: cat, amount: Number(clean), date, description: what.trim(), paymentMethod: method, status: st });
      }
      haptics.success();
      onClose();
      onSaved?.(saved);
      toast.show(tx ? "Saved" : scheduled ? "Scheduled" : type === "expense" ? "Expense logged" : "Revenue logged",
        { detail: `${type === "expense" ? "−" : "+"}${money(saved.amount)} · ${saved.description}` });
    } catch (x) {
      haptics.error();
      setErr(errorMessage(x));
      setBusy(false);
    }
  };

  const dayLabel = date === today ? "Today" : date === shiftDay(today, -1) ? "Yesterday" : date === shiftDay(today, 1) ? "Tomorrow" : `${weekdayShort(date)}, ${monthDay(date)}`;

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone={k.tone} icon={k.icon}
      kicker={tx ? `${money(tx.amount)} · ${tx.description}` : "Into the ledger"} title={tx ? "Edit line" : k.verb}
      footer={
        <View style={{ gap: 8 }}>
          {err ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T> : null}
          <Button label={busy ? "Saving…" : tx ? "Save changes" : scheduled ? "Schedule it" : k.verb} icon="check" tone={k.tone} block onPress={() => void save()} disabled={!ready} />
        </View>
      }>
      <View style={{ gap: 18 }}>
        {tx ? (
          <Segmented label="Kind of line" value={type} onChange={flipType}
            options={[{ value: "income", label: KIND.income.label }, { value: "expense", label: KIND.expense.label }]} />
        ) : null}

        <Field label="Amount" value={amount} onChangeText={t => setAmount(t.replace(/[^\d.$]/g, ""))} placeholder="$0.00" keyboardType="decimal-pad" autoFocus={!tx}
          error={amount && !amountOk ? "An amount like 24.50" : null} />

        <View style={{ gap: 6 }}>
          <T v="label" color={c.ink2}>Day</T>
          <View style={[styles.day, { borderColor: c.line2, backgroundColor: c.card }]}>
            <Pressable onPress={() => moveDay(-1)} accessibilityRole="button" accessibilityLabel="A day earlier" hitSlop={8} style={styles.dayBtn}>
              <Icon name="chev-l" size={16} color={c.ink2} />
            </Pressable>
            <T v="callout" style={{ flex: 1, textAlign: "center" }} accessibilityLiveRegion="polite">{dayLabel}</T>
            <Pressable onPress={() => moveDay(1)} accessibilityRole="button" accessibilityLabel="A day later" hitSlop={8} style={styles.dayBtn}>
              <Icon name="chev-r" size={16} color={c.ink2} />
            </Pressable>
          </View>
          {date !== today ? (
            <Pressable onPress={() => { haptics.select(); setDate(today); setStatus("posted"); }} hitSlop={6} accessibilityRole="button" style={{ alignSelf: "flex-start" }}>
              <T v="meta" color={c.ink2} style={{ textDecorationLine: "underline" }}>Back to today</T>
            </Pressable>
          ) : null}
        </View>

        {type === "expense" && future ? (
          <View style={[styles.sched, { borderColor: status === "scheduled" ? c.pastel.butter.border : c.line2, backgroundColor: status === "scheduled" ? c.pastel.butter.soft : c.card }]}>
            <View style={{ flex: 1 }}>
              <T v="callout">{status === "scheduled" ? "Scheduled, not paid yet" : "Already paid"}</T>
              <T v="meta" color={c.ink3}>{status === "scheduled" ? "Mark it paid from the ledger once the money goes out." : "Switch on if it isn't paid yet."}</T>
            </View>
            <Switch value={status === "scheduled"} tone="butter" label="Scheduled, not paid yet"
              onChange={v => { const next = v ? "scheduled" : "posted"; picked.current = next; setStatus(next); }} />
          </View>
        ) : null}

        <Field label={type === "expense" ? "What it was for" : "Where it came from"} value={what} onChangeText={setWhat} placeholder={k.placeholder} maxLength={500} />

        <View style={{ gap: 6 }}>
          <T v="label" color={c.ink2}>Category</T>
          {options.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
              {options.map(o => {
                const on = o.slug === cat;
                return (
                  <Pressable key={o.slug} onPress={() => { if (!on) { haptics.select(); setCat(o.slug); } }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                    style={[styles.pill, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel[k.tone].soft : c.card }]}>
                    <T v="pill">{o.label}</T>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : <T v="meta" color={c.ink3}>{`No ${type === "expense" ? "expense" : "income"} categories yet. Add them in Treasury settings on the web.`}</T>}
        </View>

        <View style={{ gap: 6 }}>
          <T v="label" color={c.ink2}>Paid by (optional)</T>
          <View style={styles.wrap}>
            {[null, ...PAYMENT_METHODS].map(m => {
              const on = (method ?? null) === m;
              return (
                <Pressable key={m ?? "none"} onPress={() => { if (!on) { haptics.select(); setMethod(m); } }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  style={[styles.pill, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.paper2 : c.card, borderStyle: m == null && !on ? "dashed" : "solid" }]}>
                  <T v="pill" color={on ? c.ink : c.ink2}>{m ? cap(m) : "Not said"}</T>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Sheet>
  );
}

/* ── one line ─────────────────────────────────────────────────────────────────── */

export function TxSheet({ tx, cats, keeper, onClose, onEdit, onDelete }: {
  tx: Transaction | null; cats: TransactionCategory[]; keeper: boolean;
  onClose: () => void; onEdit: (t: Transaction) => void; onDelete: (t: Transaction) => void;
}) {
  const { c } = useTheme();
  const [last, setLast] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (tx) { setLast(tx); setBusy(false); } }, [tx]);
  const t = tx ?? last;
  if (!t) return <Sheet open={false} onClose={onClose} />;
  const inc = t.type === "income";
  const sched = t.status === "scheduled";

  const markPaid = async () => {
    setBusy(true);
    try {
      await patchTransaction(t.id, { status: "posted" });
      haptics.success();
      onClose();
      toast.show("Marked paid", { detail: `${money(t.amount)} · ${t.description}` });
    } catch (x) {
      haptics.error();
      setBusy(false);
      toast.error("Couldn't mark it paid", { detail: errorMessage(x) });
    }
  };

  return (
    <Sheet open={!!tx} onClose={onClose} locked={busy} size="fit" tone={inc ? "mint" : "rose"} icon={inc ? "cash" : "wallet"}
      kicker={labelOf(cats, t)} title={t.description}
      actions={keeper ? <Button label="Edit" size="sm" variant="soft" icon="pencil" onPress={() => onEdit(t)} /> : null}
      footer={keeper ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Delete" variant="ghost" icon="trash" onPress={() => onDelete(t)} disabled={busy} />
          {sched ? <Button label={busy ? "Saving…" : "Mark paid"} icon="check" tone="mint" block style={{ flex: 1 }} onPress={() => void markPaid()} disabled={busy} /> : null}
        </View>
      ) : null}>
      <View style={{ gap: 14 }}>
        <View style={[styles.slip, { backgroundColor: c.thermal.paper, boxShadow: `2px 3px 0 ${c.thermal.shadow}` }]}>
          <T v="kicker" color={c.thermal.faint} style={{ fontSize: 9.5 }}>{inc ? "Money in" : sched ? "Scheduled" : "Money out"}</T>
          <T v="hero" color={inc ? c.pastel.mint.ink : c.thermal.ink}>{`${inc ? "+" : "−"}${money(t.amount)}`}</T>
          <T v="mono" color={c.thermal.faint} style={{ fontSize: 11.5 }}>{`${weekdayShort(t.date)}, ${monthDay(t.date)}${t.semester ? ` · ${t.semester}` : ""}`}</T>
        </View>
        <Fact label="Category" value={labelOf(cats, t)} />
        {t.paymentMethod ? <Fact label="Paid by" value={cap(t.paymentMethod)} /> : null}
        {sched ? <Fact label="Status" value="Scheduled, not paid yet" /> : null}
        {t.calendarEvents?.length ? <Fact label="For" value={t.calendarEvents.map(e => e.title).join(", ")} /> : null}
      </View>
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.fact}>
      <T v="label" color={c.ink3} style={{ width: 82 }}>{label}</T>
      <T v="callout" style={{ flex: 1 }}>{value}</T>
    </View>
  );
}

/* ── delete ───────────────────────────────────────────────────────────────────── */

export function DeleteTx({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Transaction | null>(null);
  useEffect(() => { if (tx) { setLast(tx); setBusy(false); } }, [tx]);
  const t = tx ?? last;

  const go = async () => {
    if (!t) return;
    setBusy(true);
    try {
      await deleteTransaction(t.id);
      haptics.soft();
      onClose();
      toast.show("Line deleted", { detail: `${money(t.amount)} · ${t.description}` });
    } catch (x) {
      haptics.error();
      setBusy(false);
      toast.error("Couldn't delete it", { detail: errorMessage(x) });
    }
  };

  return (
    <Sheet open={!!tx} onClose={onClose} locked={busy} size="fit" tone="rose" icon="trash" kicker={t ? money(t.amount) : ""} title="Delete this line"
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
          <Button label={busy ? "Deleting…" : "Delete"} icon="trash" tone="rose" block style={{ flex: 1 }} onPress={() => void go()} disabled={busy} />
        </View>
      }>
      {t ? <T v="body" color={c.ink2}>{`Delete "${t.description}" (${monthDay(t.date)})? It comes out of the balance and the budget.`}</T> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  day: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, minHeight: 46 },
  dayBtn: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  sched: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 12 },
  pill: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, minHeight: 34, justifyContent: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  slip: { alignItems: "center", gap: 2, paddingVertical: 14, borderRadius: 4 },
  fact: { flexDirection: "row", alignItems: "baseline", gap: 10 },
});
