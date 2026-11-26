/**
 * Settings → Opening balance (the web's sections/OpeningBalanceSection.tsx at phone
 * width). Every word and rule from @/lib/settings/opening-balance:
 *
 *   lede · Starting balance (Not set until answered) with its $ field and the error under
 *   it · Set / Save opening balance, Undo and Unsaved while changed
 *
 * The same number Treasury's day one asks for (PATCH /api/treasury/settings); Treasury and
 * Home re-read after a save, since the balance and trend are folded server-side. Treasury
 * orgs: org admins or MANAGE_TREASURY.
 */
import {
  OPENING_BALANCE_COPY as C, balanceDirty, parseBalance, toBalanceDraft,
} from "@/lib/settings/opening-balance";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { useTreasury } from "~/data/money";
import { setOpeningBalance } from "~/data/settings";
import { useEntryOf } from "~/entry/EntryContext";
import { haptics } from "~/motion/haptics";
import { toast } from "~/shell/toast";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { useDirtyGuard } from "./dirty";
import { Dirty, Lede, ScBtn, ScCard } from "./ledger";
import { can, isOrgAdmin } from "./model";

export function OpeningBalanceSection() {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const allowed = !!me && !!me.org?.enabledWorkflows.includes("finance") && (isOrgAdmin(me) || can(me, "MANAGE_TREASURY"));
  const q = useTreasury(allowed);
  const loading = q.isPending;
  const persisted = q.data?.openingBalance ?? null;
  const [draft, setDraft] = useState("");
  const [seeded, setSeeded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  // Seed (and re-seed after a save lands) from the server's figure.
  const key = loading ? null : String(persisted);
  if (key !== null && key !== seeded) { setSeeded(key); setDraft(toBalanceDraft(persisted)); }
  const parsed = parseBalance(draft);
  const dirty = balanceDirty(parsed, persisted, loading);
  useDirtyGuard("opening-balance", dirty);
  if (!me || !allowed) return null;

  const save = async () => {
    if (saving) return;
    if (parsed === null || Number.isNaN(parsed)) { haptics.warn(); setInvalid(C.invalid); return; }
    setSaving(true);
    try {
      const next = await setOpeningBalance(parsed);
      haptics.success();
      setDraft(toBalanceDraft(next));
      toast.show(C.saved(next));
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.saveFailed));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 18 }}>
      <Lede>{C.lede}</Lede>
      {q.isError ? <T v="meta" size={12.8} color={c.pastel.rose.ink} style={{ fontWeight: "600" }} accessibilityRole="alert">{C.loadFailed}</T> : null}

      <ScCard pad>
        <View style={styles.row}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <T v="bodyStrong" size={14.4}>{C.key}</T>
            {!loading && persisted == null ? <Dirty label={C.notSet} /> : null}
          </View>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <T v="mono" size={13} color={c.ink3}>{C.unit}</T>
              <TextInput value={draft} onChangeText={v => { setDraft(v); setInvalid(null); }} keyboardType="numbers-and-punctuation" inputMode="decimal"
                placeholder={loading ? C.loadingPlaceholder : C.placeholder} placeholderTextColor={c.ink3} editable={!loading && !saving}
                accessibilityLabel={C.aria} returnKeyType="done" onSubmitEditing={() => { if (dirty) void save(); }}
                style={[styles.input, { borderColor: invalid ? alpha(c.pastel.rose.ink, 0.6) : c.line2, backgroundColor: c.card, color: c.ink }]} />
            </View>
            {invalid ? <T v="meta" size={12} color={c.pastel.rose.ink} accessibilityRole="alert">{invalid}</T> : null}
          </View>
        </View>
      </ScCard>

      <View style={styles.actions}>
        <ScBtn kind="primary" label={saving ? C.saving : persisted == null ? C.set : C.save} disabled={!dirty || saving} onPress={() => void save()} />
        {dirty ? <ScBtn label={C.undo} disabled={saving} onPress={() => { setDraft(toBalanceDraft(persisted)); setInvalid(null); }} /> : null}
        {dirty ? <Dirty label={C.unsaved} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 12 },
  input: { width: 180, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, height: 38, fontSize: 15, fontFamily: "PlexMono-500", textAlign: "right" },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
});
