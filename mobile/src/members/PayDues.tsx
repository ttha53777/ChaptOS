/**
 * Record Payment (MANAGE_TREASURY), from Pay on a roster row: the web's "X currently owes
 * $Y" and "Amount Paid ($)", then how it was paid and Record. The web hands this to its
 * transaction form pre-filled (income · Dues · today · "Dues payment — X"); on a phone
 * that form is folded in: the same line is posted here, with brotherId, so it also brings
 * down what they owe. POST /api/transactions
 *
 * Success: haptic + "Recorded $X from Y." (the web's toast); roster and dues refresh.
 */
import type { Brother } from "@/lib/api-types";
import { fmtUsd } from "@/lib/money";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { errorMessage } from "~/api/errors";
import { localDay } from "~/data/home";
import { recordDuesPayment, refreshDuesBoard, refreshRoster } from "~/data/members";
import { PAYMENT_METHODS } from "~/data/money";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { Field } from "~/ui/Field";
import { Segmented } from "~/ui/Segmented";
import { T } from "~/ui/T";

const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function PayDues({ member, onClose }: { member: Brother | null; onClose: () => void }) {
  const { c } = useTheme();
  const [amt, setAmt] = useState("");
  const [method, setMethod] = useState<string>("venmo");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (member) { setAmt(String(member.duesOwed)); setErr(null); setBusy(false); } }, [member?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = Number(amt);
  const ok = AMOUNT_RE.test(amt.trim()) && n > 0;
  const record = async () => {
    if (!member || !ok) return;
    setBusy(true); setErr(null);
    try {
      await recordDuesPayment(member, n, localDay(), method);
      haptics.success();
      toast.show(`Recorded ${fmtUsd(n)} from ${member.name}.`);
      void refreshRoster(); void refreshDuesBoard();
      onClose();
    } catch (e) {
      haptics.error();
      setErr(errorMessage(e, "Dues payment failed. Nothing was recorded."));
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={member != null} onClose={() => (busy ? undefined : onClose())} size="fit" tone="mint" icon="cash" kicker="Dues" title="Record Payment"
      footer={
        <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
          <Button label="Cancel" variant="soft" disabled={busy} onPress={onClose} style={{ flex: 1 }} />
          <Button label={busy ? "Recording…" : "Record payment"} icon="check" disabled={busy || !ok} onPress={record} style={{ flex: 1.4 }} />
        </View>
      }>
      {member ? (
        <View style={{ gap: 14 }}>
          <T v="callout" size={14} color={c.ink3}>
            {member.name} currently owes <T v="bodyStrong" size={14} color={c.warn}>{fmtUsd(member.duesOwed)}</T>
          </T>
          <Field label="Amount Paid ($)" value={amt} onChangeText={setAmt} keyboardType="decimal-pad" inputMode="decimal" autoFocus
            error={amt && !ok ? "Enter an amount like 120 or 59.50" : null} />
          <Segmented label="Paid by" value={method} onChange={setMethod}
            options={PAYMENT_METHODS.slice(0, 4).map(m => ({ value: m, label: cap(m) }))} />
          {err ? <T v="callout" size={13.5} color={c.risk} accessibilityRole="alert">{err}</T> : null}
          <T v="meta" size={12.5} color={c.ink3}>{`Posts to the books as income · Dues · today, “Dues payment — ${member.name}”.`}</T>
        </View>
      ) : null}
    </Sheet>
  );
}
