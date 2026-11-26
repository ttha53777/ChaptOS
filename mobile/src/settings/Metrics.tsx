/**
 * Settings → Custom metrics (the web's sections/CustomMetricsSection.tsx at phone width).
 * Every word and rule from @/lib/settings/metrics:
 *
 *   lede · empty state · rows (name, unit, the Goal · At risk below · headline line) with
 *   Edit (opens the row's form in place) and Remove (confirm) · the 20-cap note ·
 *   + Add metric → the New metric form (Name, Slug that follows the name until edited,
 *   Unit, Goal, At Risk below, Watch below, KPI card headline)
 *
 * The headline is a row of choices (the web's <select>). MANAGE_SETTINGS only.
 */
import type { MetricDefinition } from "@/lib/api-types";
import {
  AGGREGATIONS, AGGREGATION_LABELS, EMPTY_FORM, MAX_METRICS, METRICS_COPY as C, NAME_MAX, SLUG_MAX, UNIT_MAX,
  createBody, editBody, metricSub, toEditState, withField, type Aggregation, type EditState, type NewMetricForm,
} from "@/lib/settings/metrics";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { createMetric, deleteMetric, updateMetric, useMetricDefinitions } from "~/data/settings";
import { ConfirmSheet } from "~/docs/Sheets";
import { useEntryOf } from "~/entry/EntryContext";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { toast } from "~/shell/toast";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { Choices, Empty, Lede, Note, ScBtn, ScCard, ScInput } from "./ledger";
import { can } from "./model";

const HEADLINES = AGGREGATIONS.map(a => ({ id: a, label: AGGREGATION_LABELS[a] }));

export function MetricsSection() {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const canManage = !!me && can(me, "MANAGE_SETTINGS");
  const q = useMetricDefinitions(canManage);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<NewMetricForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  if (!me || !canManage) return null;
  if (q.isPending) return <Note style={{ textAlign: "center", paddingVertical: 24 }}>{C.loading}</Note>;
  if (q.isError) return <T v="meta" color={c.pastel.rose.ink}>{C.loadFailed}</T>;
  const defs = q.data;

  const create = async () => {
    const built = createBody(form);
    if ("error" in built) { haptics.warn(); toast.error(built.error); return; }
    setCreating(true);
    try {
      const d = await createMetric(built.body);
      haptics.success();
      setForm(EMPTY_FORM);
      setShowNew(false);
      toast.show(C.created(d.name));
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.createFailed));
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={{ gap: 18 }}>
      <Lede>{C.lede}</Lede>

      {defs.length === 0 && !showNew ? <Empty title={C.emptyTitle} hint={C.emptyHint} /> : null}

      {defs.length > 0 ? (
        <ScCard>
          {defs.map((d, i) => <MetricRow key={d.id} def={d} last={i === defs.length - 1} />)}
        </ScCard>
      ) : null}

      {defs.length >= MAX_METRICS ? <Note>{C.maxed}</Note> : null}

      {showNew ? (
        <View style={[styles.form, { borderColor: alpha(c.pastel.lilac.ink, 0.35), backgroundColor: c.card }]}>
          <T v="title" size={14}>{C.newMetric}</T>
          <ScInput label={C.nameReq} value={form.name} onChangeText={v => setForm(p => withField(p, "name", v))} placeholder={C.namePlaceholder} maxLength={NAME_MAX} />
          <ScInput label={C.slugReq} mono value={form.slug} onChangeText={v => setForm(p => ({ ...p, slug: v, slugTouched: true }))} placeholder={C.slugPlaceholder}
            maxLength={SLUG_MAX} autoCapitalize="none" autoCorrect={false} />
          <ScInput label={C.unit} value={form.unit} onChangeText={v => setForm(p => withField(p, "unit", v))} placeholder={C.unitPlaceholder} maxLength={UNIT_MAX} autoCapitalize="none" />
          <Numbers form={form} req onField={(k, v) => setForm(p => withField(p, k, v))} />
          <Choices label={C.headline} value={form.aggregation} options={HEADLINES} onChange={(v: Aggregation) => setForm(p => withField(p, "aggregation", v))} />
          <View style={styles.acts}>
            <ScBtn kind="primary" small label={creating ? C.creating : C.create} disabled={creating || !form.name.trim() || !form.slug.trim()} onPress={() => void create()} />
            <ScBtn small label={C.cancel} disabled={creating} onPress={() => { setShowNew(false); setForm(EMPTY_FORM); }} />
          </View>
        </View>
      ) : null}

      {!showNew && defs.length < MAX_METRICS ? (
        <Pressable onPress={() => setShowNew(true)} accessibilityRole="button" accessibilityLabel={C.add}
          style={({ pressed }) => [styles.add, { borderColor: c.line2 }, pressed && pressedDim]}>
          <T v="body" size={16} color={c.ink3}>+</T>
          <T v="body" size={13.4} color={c.ink3}>{C.add}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Goal / At Risk below / Watch below, stacked (the web's grid is one column on phones). */
function Numbers({ form, req, onField }: { form: EditState; req?: boolean; onField: (k: keyof EditState, v: string) => void }) {
  return (
    <>
      <ScInput label={req ? C.goalReq : C.goal} value={form.goal} onChangeText={v => onField("goal", v)} keyboardType="decimal-pad" placeholder={req ? "10" : undefined} />
      <ScInput label={req ? C.atRiskReq : C.atRisk} value={form.atRiskBelow} onChangeText={v => onField("atRiskBelow", v)} keyboardType="decimal-pad" placeholder={req ? "5" : undefined} />
      <ScInput label={C.watch} value={form.watchBelow} onChangeText={v => onField("watchBelow", v)} keyboardType="decimal-pad" placeholder={C.optional} />
    </>
  );
}

function MetricRow({ def, last }: { def: MetricDefinition; last: boolean }) {
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>(() => toEditState(def));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const save = async () => {
    const built = editBody(form);
    if ("error" in built) { haptics.warn(); toast.error(built.error); return; }
    setSaving(true);
    try {
      await updateMetric(def.id, built.body);
      haptics.success();
      setEditing(false);
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.saveFailed));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteMetric(def.id);
      haptics.success();
      toast.show(C.removed);
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.deleteFailed));
      setDeleting(false);
    }
  };

  const edge = !last && { borderBottomWidth: 1, borderBottomColor: c.lineSoft };
  if (editing) {
    return (
      <View style={[{ padding: 8 }, edge]}>
        <View style={[styles.form, { borderColor: alpha(c.pastel.lilac.ink, 0.35), backgroundColor: c.card }]}>
          <ScInput label={C.name} value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} maxLength={NAME_MAX} />
          <ScInput label={C.unit} value={form.unit} onChangeText={v => setForm(p => ({ ...p, unit: v }))} placeholder={C.unitPlaceholder} maxLength={UNIT_MAX} autoCapitalize="none" />
          <Numbers form={form} onField={(k, v) => setForm(p => ({ ...p, [k]: v }))} />
          <Choices label={C.headline} value={form.aggregation} options={HEADLINES} onChange={(v: Aggregation) => setForm(p => ({ ...p, aggregation: v }))} />
          <View style={styles.acts}>
            <ScBtn kind="primary" small label={saving ? C.saving : C.save} disabled={saving || !form.name.trim()} onPress={() => void save()} />
            <ScBtn small label={C.cancel} disabled={saving} onPress={() => setEditing(false)} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.row, edge]}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T v="bodyStrong" size={14.4}>{def.name}</T>
          {def.unit ? <T v="meta" size={11} color={c.faint}>{`(${def.unit})`}</T> : null}
        </View>
        <T v="meta" size={12.5} color={c.ink3}>{metricSub(def).join("")}</T>
      </View>
      <ScBtn small label={C.edit} onPress={() => { setForm(toEditState(def)); setEditing(true); }} />
      <ScBtn small kind="danger" label={deleting ? C.removing : C.remove} disabled={deleting} onPress={() => setConfirm(true)} />
      <ConfirmSheet open={confirm} title={C.removeTitle(def.name)} message={C.removeMessage} confirmLabel={C.remove}
        onConfirm={() => void remove()} onClose={() => setConfirm(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14, minHeight: 52 },
  form: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
  acts: { flexDirection: "row", gap: 8, paddingTop: 4 },
  add: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
});
