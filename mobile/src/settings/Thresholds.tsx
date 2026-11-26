/**
 * Settings → Thresholds (the web's sections/ThresholdsSection.tsx at phone width). Every
 * word and rule from @/lib/settings/thresholds:
 *
 *   lede · Attendance / GPA / Service cards · each value is a dashed chip with a pen;
 *   tap it to edit inline (number keyboard), commit on Done or blur. An out-of-range
 *   value keeps the editor open and says why. · Save thresholds / Reset to defaults / Unsaved
 *
 * One PATCH /api/orgs/config { thresholds }, then /me, Home and the roster (standing
 * reads these cutoffs). MANAGE_SETTINGS only.
 */
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/thresholds";
import { THRESHOLD_GROUPS, THRESHOLDS_COPY as C, checkThreshold, thresholdsDirty, type ThresholdRowSpec } from "@/lib/settings/thresholds";
import { saveErrorOf } from "@/lib/settings/workflows";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { saveThresholds } from "~/data/settings";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { toast } from "~/shell/toast";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { useDirtyGuard } from "./dirty";
import { Actions, GrpLabel, Lede, ScCard, ScRow } from "./ledger";
import { can } from "./model";

export function ThresholdsSection() {
  const me = useEntryOf("ready")?.me ?? null;
  const canManage = !!me && can(me, "MANAGE_SETTINGS");
  const persisted = useMemo<Thresholds>(() => me?.org?.thresholds ?? DEFAULT_THRESHOLDS, [me?.org?.thresholds]);
  const persistedKey = JSON.stringify(persisted);
  const [draft, setDraft] = useState<Thresholds>(() => ({ ...persisted }));
  const [saving, setSaving] = useState(false);

  const synced = useRef(persistedKey);
  useEffect(() => {
    if (synced.current === persistedKey) return;
    synced.current = persistedKey;
    setDraft({ ...persisted });
  }, [persistedKey, persisted]);

  const dirty = thresholdsDirty(draft, persisted);
  useDirtyGuard("thresholds", dirty);
  if (!me || !canManage) return null;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveThresholds(draft);
      haptics.success();
      toast.show(C.saved);
    } catch (e) {
      haptics.error();
      toast.error(saveErrorOf(errorMessage(e, ""), C.forbidden));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 18 }}>
      <Lede>{C.lede}</Lede>
      {THRESHOLD_GROUPS.map(g => (
        <View key={g.label}>
          <GrpLabel label={g.label} />
          <ScCard pad>
            {g.rows.map((r, i) => (
              <ThresholdRow key={r.field} row={r} value={draft[r.field]} last={i === g.rows.length - 1}
                onChange={v => setDraft(prev => ({ ...prev, [r.field]: v }))} />
            ))}
          </ScCard>
        </View>
      ))}
      <Actions
        save={{ label: saving ? C.saving : C.save, onPress: () => void save(), disabled: !dirty || saving }}
        reset={{ label: C.reset, onPress: () => setDraft({ ...DEFAULT_THRESHOLDS }), disabled: saving }}
        dirty={dirty ? C.unsaved : null} />
    </View>
  );
}

function ThresholdRow({ row, value, last, onChange }: { row: ThresholdRowSpec; value: number; last: boolean; onChange: (v: number) => void }) {
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const [invalid, setInvalid] = useState<string | null>(null);
  const ref = useRef<ComponentRef<typeof TextInput>>(null);

  const start = () => { setText(String(value)); setInvalid(null); setEditing(true); };
  const commit = () => {
    const checked = checkThreshold(text, row);
    if ("error" in checked) { haptics.warn(); setInvalid(checked.error); return; }
    onChange(checked.value);
    setInvalid(null);
    setEditing(false);
  };

  return (
    <ScRow last={last} style={{ justifyContent: "space-between", alignItems: editing ? "flex-start" : "center" }}>
      <T v="bodyStrong" size={14.4} style={editing ? { marginTop: 8 } : undefined}>{row.label}</T>
      {editing ? (
        <View style={{ alignItems: "flex-end", gap: 4, flexShrink: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <TextInput ref={ref} value={text} onChangeText={t => { setText(t); setInvalid(null); }} autoFocus selectTextOnFocus
              keyboardType={row.step < 1 ? "decimal-pad" : "number-pad"} returnKeyType="done" onSubmitEditing={commit} onBlur={commit}
              accessibilityLabel={row.label} accessibilityHint={invalid ?? undefined}
              style={[styles.input, { borderColor: invalid ? alpha(c.pastel.rose.ink, 0.6) : c.line2, backgroundColor: c.card, color: c.ink }]} />
            {row.unit ? <T v="meta" size={12.2} color={c.ink3}>{row.unit}</T> : null}
          </View>
          {invalid ? <T v="meta" size={12.5} color={c.pastel.rose.ink} style={{ fontWeight: "600", textAlign: "right" }} accessibilityRole="alert">{invalid}</T> : null}
        </View>
      ) : (
        <Pressable onPress={start} accessibilityRole="button" accessibilityLabel={`${row.label}: ${value}${row.unit}`} accessibilityHint="Edit" hitSlop={6}
          style={({ pressed }) => [styles.chip, { borderColor: pressed ? c.ink : c.line2, backgroundColor: c.card }, pressed && pressedDim]}>
          <T v="mono" size={14} style={{ fontWeight: "600" }}>{`${value}${row.unit}`}</T>
          <Icon name="pencil" size={12} color={c.ink3} />
        </Pressable>
      )}
    </ScRow>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1.5, borderStyle: "dashed" },
  input: { width: 84, height: 38, borderWidth: 1.5, borderRadius: 9, paddingHorizontal: 9, fontFamily: "PlexMono-500", fontSize: 15, textAlign: "right" },
});
