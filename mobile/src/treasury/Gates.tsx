/**
 * Day one of the books, as the web draws it (TreasuryLocked / TreasuryOpenBooks on .tr-locked):
 *
 *   Locked     a member, books never opened: the lock, "The books aren't open yet.", and
 *              (under it, on the page) their own reimbursement requests
 *   OpenBooks  a treasurer, books never opened: "Let’s open the books." and the one
 *              question, what's in the account today ($0 is a fine answer)
 */
import { formatAmount, parseOpening } from "@/lib/treasury/ledger";
import { useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { openBooks } from "~/data/money";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { TrBtn } from "./bits";

function Frame({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.frame, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.mint.fill, 8)]}>
      <View style={[styles.tape, { backgroundColor: c.pastel.butter.fill }]} />
      {children}
    </View>
  );
}

export function Locked({ treasuryWord }: { treasuryWord: string }) {
  const { c } = useTheme();
  return (
    <Frame>
      <View style={[styles.lglyph, { backgroundColor: c.pastel.peach.soft, borderColor: c.line2 }]}><Icon name="lock" size={22} color={c.ink2} /></View>
      <T v="title" size={30} ls={-0.04} align="center" accessibilityRole="header">The books aren't open yet.</T>
      <T v="body" size={15} color={c.ink2} align="center">
        Your chapter hasn't started recording finances here. Once the books are open, your dues balance and the chapter's {treasuryWord.toLowerCase()} show up on this page.
      </T>
    </Frame>
  );
}

const UNLOCKS = [["Balance", "mint"], ["Breakdown", "peach"], ["Dues", "butter"], ["Reports", "sky"]] as const;

export function OpenBooks() {
  const { c } = useTheme();
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const v = parseOpening(raw);
    if (v === null) { setErr("Enter what’s in the account today — $0 is fine."); return; }
    setSaving(true); setErr(null);
    try { await openBooks(v); haptics.success(); }
    catch (e) { haptics.error(); setErr(errorMessage(e, "Couldn't open the books. Try again.")); setSaving(false); }
  };

  return (
    <Frame>
      <View style={styles.eyebrow}>
        <View style={[styles.eyebar, { backgroundColor: c.pastel.mint.ink }]} />
        <T v="label" size={11} ls={0.11} color={c.ink3}>Day one of the books</T>
      </View>
      <View style={styles.h2} accessibilityRole="header" accessibilityLabel="Let’s open the books.">
        <T v="title" size={32} ls={-0.04} lh={1.05}>Let’s open the </T>
        <View>
          <View style={[styles.hi, { backgroundColor: c.pastel.mint.fill }]} />
          <T v="title" size={32} ls={-0.04} lh={1.05}>books</T>
        </View>
        <T v="title" size={32} ls={-0.04} lh={1.05}>.</T>
      </View>
      <T v="body" size={15} color={c.ink2} align="center">One question: what’s in the account today? Every number after this is a transaction you can trace back.</T>
      <View style={[styles.cash, { borderBottomColor: c.ink }]}>
        <T v="title" size={34} color={raw ? c.pastel.mint.ink : c.ink3}>$</T>
        <TextInput value={raw} onChangeText={t => { setRaw(formatAmount(t)); setErr(null); }} placeholder="0.00" placeholderTextColor={c.line2}
          keyboardType="decimal-pad" autoFocus accessibilityLabel="Opening balance" onSubmitEditing={() => void submit()}
          style={[styles.cashIn, { color: c.ink }]} />
      </View>
      {err ? <T v="meta" size={13} color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T> : null}
      <View style={{ alignItems: "center" }}><TrBtn label={saving ? "Opening…" : "Open the books"} icon="check" onPress={() => void submit()} disabled={saving} /></View>
      <T v="meta" size={13} color={c.ink3} align="center">Starting from nothing? $0 is a fine answer.</T>
      <View style={[styles.unl, { borderTopColor: c.line2 }]}>
        <T v="meta" size={12.5} color={c.ink3}>This turns on</T>
        {UNLOCKS.map(([l, tone]) => (
          <View key={l} style={[styles.pl, { backgroundColor: c.pastel[tone].soft, borderColor: c.pastel[tone].border }]}>
            <T v="meta" size={12} style={{ fontFamily: "Inter-500" }} color={c.pastel[tone].ink}>{l}</T>
          </View>
        ))}
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
  frame: { marginTop: 22, borderWidth: 1.5, borderRadius: 30, paddingHorizontal: 18, paddingTop: 28, paddingBottom: 22, gap: 14, alignItems: "stretch" },
  tape: { position: "absolute", top: -9, alignSelf: "center", left: "50%", marginLeft: -35, width: 70, height: 18, opacity: 0.75, transform: [{ rotate: "-3deg" }] },
  lglyph: { alignSelf: "center", width: 52, height: 52, borderRadius: 16, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 9, alignSelf: "center" },
  eyebar: { width: 18, height: 2, borderRadius: 2 },
  h2: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end" },
  hi: { position: "absolute", left: -2, right: -2, bottom: 3, height: "34%", opacity: 0.75 },
  cash: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, alignSelf: "center", borderBottomWidth: 2, marginTop: 8, paddingBottom: 4 },
  cashIn: { fontFamily: "Bricolage-600", fontSize: 42, letterSpacing: -1.7, width: 170, textAlign: "left", padding: 0 },
  unl: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 14, borderTopWidth: 1.5, borderStyle: "dashed" },
  pl: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
});
