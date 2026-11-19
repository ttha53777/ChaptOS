/**
 * The reimbursement request sheet (amount, what for, the day, a category, then the receipt
 * from the camera, a photo or a PDF; sent with the envelope moment) and the sheet that
 * adds a receipt to a pending request. Shared by More → Reimbursements and Create.
 */
import type { Reimbursement, TransactionCategory } from "@/lib/api-types";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { errorMessage, isApiError } from "~/api/errors";
import { localDay } from "~/data/home";
import { attachReceipt, createReimbursement, putReimbursement } from "~/data/money";
import { Icon, type IconName } from "~/icons/Icon";
import { money } from "~/members/model";
import { Envelope } from "~/moments/Envelope";
import { pickReceipt, type PickedReceipt, type ReceiptSource } from "~/money/receipt";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Tape } from "~/paper/bits";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { Field } from "~/ui/Field";
import { T } from "~/ui/T";

const receiptWhy = (e: unknown) => {
  const msg = isApiError(e) && e.status >= 500 ? "The server couldn't store it right now" : errorMessage(e);
  return /[.!?]$/.test(msg) ? msg : `${msg}.`;
};

/* ── one request ──────────────────────────────────────────────────────────────── */


export function Pencil({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.pencil, { borderColor: c.ink3 }]}>
      <Icon name="pencil" size={11} color={c.ink3} />
      <T v="label" color={c.ink3} style={{ fontSize: 10 }}>{label}</T>
    </View>
  );
}

/* ── the receipt choices + the taped print ────────────────────────────────────── */

const SOURCES: { id: ReceiptSource; label: string; icon: IconName }[] = [
  { id: "camera", label: "Take a photo", icon: "camera" },
  { id: "library", label: "Choose a photo", icon: "board" },
  { id: "pdf", label: "A PDF", icon: "doc" },
];

function Sources({ onPick, busy }: { onPick: (s: ReceiptSource) => void; busy?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {SOURCES.map(s => (
        <Pressable key={s.id} disabled={busy} onPress={() => { haptics.select(); onPick(s.id); }} accessibilityRole="button" accessibilityLabel={s.label}
          style={({ pressed }) => [styles.source, { borderColor: c.line2, backgroundColor: pressed ? c.pastel.sky.soft : c.card, opacity: busy ? 0.5 : 1 }]}>
          <Icon name={s.icon} size={18} color={c.pastel.sky.ink} />
          <T v="meta" color={c.ink2} align="center" numberOfLines={1}>{s.label}</T>
        </Pressable>
      ))}
    </View>
  );
}

/** What's on the taped print: the photo, or a PDF slip. */
function PrintFace({ file, amount }: { file: PickedReceipt | null; amount: string }) {
  const { c } = useTheme();
  if (file?.preview) return <Image source={{ uri: file.preview }} style={{ flex: 1, borderRadius: 2 }} resizeMode="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 6 }}>
      <Icon name={file ? "doc" : "receipt"} size={26} color={c.thermal.faint} />
      <T v="mono" color={c.thermal.ink} style={{ fontSize: 15 }}>{amount || "$0"}</T>
      <T v="meta" color={c.thermal.faint}>{file ? "PDF receipt" : "No receipt"}</T>
    </View>
  );
}

function TapedPrint({ file, onRemove }: { file: PickedReceipt; onRemove: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingTop: 10 }}>
      <View style={[styles.print, { backgroundColor: c.thermal.paper, boxShadow: `2px 3px 0 ${c.thermal.shadow}` }]}>
        <View style={{ flex: 1, padding: 8 }}><PrintFace file={file} amount="" /></View>
        <Tape width={56} rotate={-4} style={{ position: "absolute", top: -10, alignSelf: "center" }} />
      </View>
      <Pressable onPress={() => { haptics.select(); onRemove(); }} accessibilityRole="button" accessibilityLabel="Remove the receipt" hitSlop={8}
        style={[styles.remove, { backgroundColor: c.ink }]}>
        <Icon name="x" size={13} color={c.paper} />
      </Pressable>
    </View>
  );
}

/* ── new request ──────────────────────────────────────────────────────────────── */

const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/;
const shiftDay = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + n);
  return localDay(x);
};

type Phase = "form" | "sending" | "sent";

/** `onSent` runs once the envelope has landed (after `onClose`), for a caller that opened
 *  this sheet over its own (Create) and folds that away too. */
export function RequestSheet({ open, onClose, onSent, meId, categories }: { open: boolean; onClose: () => void; onSent?: () => void; meId: number; categories: TransactionCategory[] }) {
  const { c } = useTheme();
  const today = localDay();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [what, setWhat] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [file, setFile] = useState<PickedReceipt | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [err, setErr] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ receiptFailed: string | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(""); setDate(localDay()); setWhat(""); setFile(null); setPhase("form"); setErr(null); setOutcome(null);
    setCat(null);
  }, [open]);
  useEffect(() => { if (open && cat == null && categories[0]) setCat(categories[0].slug); }, [open, cat, categories]);

  const clean = amount.trim().replace(/^\$/, "");
  const amountOk = AMOUNT_RE.test(clean) && Number(clean) > 0;
  const ready = amountOk && what.trim().length > 0 && phase === "form";
  const shown = amountOk ? money(Number(clean)) : "";

  const choose = async (s: ReceiptSource) => {
    const f = await pickReceipt(s);
    if (f) { haptics.soft(); setFile(f); }
  };

  const send = async () => {
    if (!ready) return;
    setErr(null);
    setPhase("sending");
    let created: Reimbursement;
    try {
      created = await createReimbursement({ brotherId: meId, amount: Number(clean), date, description: what.trim(), category: cat });
    } catch (e) {
      haptics.error();
      setErr(errorMessage(e, "Couldn't send the request. Try again."));
      setPhase("form");
      return;
    }
    let receiptFailed: string | null = null;
    if (file) {
      try { created = await attachReceipt(created.id, file); } catch (e) { receiptFailed = receiptWhy(e); }
    }
    putReimbursement(created);
    setOutcome({ receiptFailed });
    setPhase("sent");
  };

  const landed = () => {
    onClose();
    onSent?.();
    if (outcome?.receiptFailed) {
      toast.error("Sent, but the receipt didn't attach", { detail: `${outcome.receiptFailed} Add it from the request.` });
    } else {
      toast.show("Request sent", { detail: "The treasurer sees it now." });
    }
  };

  const busy = phase !== "form";

  return (
    <Sheet open={open} onClose={onClose} locked={busy} title="Request reimbursement" kicker="Paid out of pocket" tone="sky" icon="receipt" size="tall"
      footer={busy ? null : <Button label="Send it" icon="send" tone="sky" block onPress={() => void send()} disabled={!ready} style={{ flex: 1 }} />}>
      {busy ? (
        <View style={{ gap: 18, paddingTop: 12 }}>
          <Envelope state={phase === "sent" ? "sent" : "ready"} print={<PrintFace file={file} amount={shown} />} onDone={landed} />
          <View style={{ alignItems: "center", gap: 4 }}>
            <T v="subhead">{shown} · {what.trim()}</T>
            <T v="meta" color={c.ink3} accessibilityLiveRegion="polite">{phase === "sending" ? (file ? "Sending it with the receipt…" : "Sending…") : "On the treasurer's desk."}</T>
          </View>
        </View>
      ) : (
        <View style={{ gap: 18 }}>
          <Field label="Amount" value={amount} onChangeText={t => setAmount(t.replace(/[^\d.$]/g, ""))} placeholder="$0.00" keyboardType="decimal-pad"
            error={amount && !amountOk ? "An amount like 24.50" : null} />
          <View style={{ gap: 6 }}>
            <T v="label" color={c.ink2}>Day you paid</T>
            <View style={[styles.day, { borderColor: c.line2, backgroundColor: c.card }]}>
              <Pressable onPress={() => { haptics.select(); setDate(d => shiftDay(d, -1)); }} accessibilityRole="button" accessibilityLabel="A day earlier" hitSlop={8} style={styles.dayBtn}>
                <Icon name="chev-l" size={16} color={c.ink2} />
              </Pressable>
              <T v="callout" style={{ flex: 1, textAlign: "center" }} accessibilityLiveRegion="polite">
                {date === today ? "Today" : date === shiftDay(today, -1) ? "Yesterday" : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </T>
              <Pressable onPress={() => { haptics.select(); setDate(d => shiftDay(d, 1)); }} disabled={date >= today} accessibilityRole="button" accessibilityLabel="A day later" hitSlop={8}
                style={[styles.dayBtn, { opacity: date >= today ? 0.3 : 1 }]}>
                <Icon name="chev-r" size={16} color={c.ink2} />
              </Pressable>
            </View>
          </View>
          <Field label="What it was for" value={what} onChangeText={setWhat} placeholder="Decorations for spring formal" maxLength={500} />
          {categories.length ? (
            <View style={{ gap: 6 }}>
              <T v="label" color={c.ink2}>Budget line</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
                {categories.map(x => {
                  const on = x.slug === cat;
                  return (
                    <Pressable key={x.slug} onPress={() => { haptics.select(); setCat(x.slug); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                      style={[styles.cat, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel.sky.soft : c.card }]}>
                      <T v="pill">{x.label}</T>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
            <T v="label" color={c.ink2}>Receipt</T>
            {file ? <TapedPrint file={file} onRemove={() => setFile(null)} /> : <Sources onPick={s => void choose(s)} />}
            <T v="meta" color={c.ink3}>Only you and the treasurer can open it.</T>
          </View>
          {err ? <T v="callout" color={c.pastel.rose.ink} accessibilityLiveRegion="assertive">{err}</T> : null}
        </View>
      )}
    </Sheet>
  );
}

/* ── add the receipt later ────────────────────────────────────────────────────── */

export function AttachSheet({ r, onClose }: { r: Reimbursement | null; onClose: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Reimbursement | null>(r);
  useEffect(() => { if (r) { setLast(r); setBusy(false); } }, [r]);
  const shown = r ?? last;

  const go = async (s: ReceiptSource) => {
    if (!shown) return;
    const f = await pickReceipt(s);
    if (!f) return;
    setBusy(true);
    try {
      putReimbursement(await attachReceipt(shown.id, f));
      haptics.success();
      onClose();
      toast.show("Receipt added", { detail: shown.description });
    } catch (e) {
      haptics.error();
      setBusy(false);
      toast.error("Couldn't add the receipt", { detail: receiptWhy(e) });
    }
  };

  return (
    <Sheet open={!!r} onClose={onClose} locked={busy} title="Add the receipt" kicker={shown ? `${money(shown.amount)} · ${shown.description}` : undefined} tone="sky" icon="camera">
      <View style={{ gap: 12 }}>
        <Sources onPick={s => void go(s)} busy={busy} />
        <T v="meta" color={c.ink3} accessibilityLiveRegion="polite">{busy ? "Uploading…" : "Only you and the treasurer can open it."}</T>
      </View>
    </Sheet>
  );
}


const styles = StyleSheet.create({
  pencil: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.2, borderStyle: "dashed", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, transform: [{ rotate: "-2deg" }] },
  source: { flex: 1, alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 4 },
  print: { width: 150, height: 180, borderRadius: 4, transform: [{ rotate: "-2deg" }] },
  remove: { position: "absolute", top: 2, right: "28%", width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  day: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, minHeight: 48, paddingHorizontal: 6 },
  dayBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  cat: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: "center" },
});
