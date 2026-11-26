/**
 * Settings → Member fields (the web's sections/MemberFieldsSection.tsx at phone width).
 * Every word and rule from @/lib/settings/member-fields:
 *
 *   lede · empty state · one card per field (reorder, label, type pill, Roster pill,
 *   Edit/Done, ✕) with its edit form in place (Label, Type, Placeholder, Show as roster
 *   column, Required) · + Add field · the 20-cap note · Save changes / Reset / Unsaved
 *
 * One draft, saved whole (PATCH /api/orgs/config { customMemberFields }). Removing asks
 * first and takes effect on save. Type is a row of choices (the web's <select>).
 * MANAGE_SETTINGS only.
 */
import type { CustomMemberFieldDef, FieldType } from "@/lib/custom-member-fields";
import {
  FIELD_TYPES, MAX_FIELDS, MAX_LABEL, MEMBER_FIELDS_COPY as C, PLACEHOLDER_MAX,
  blankField, fieldsDirty, fieldsPayload, fieldsSaveError, moveField, toDraft, type DraftField,
} from "@/lib/settings/member-fields";
import { saveErrorOf } from "@/lib/settings/workflows";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { saveMemberFields } from "~/data/settings";
import { ConfirmSheet } from "~/docs/Sheets";
import { useEntryOf } from "~/entry/EntryContext";
import { haptics } from "~/motion/haptics";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { useDirtyGuard } from "./dirty";
import { Actions, AddLine, Choices, Empty, Lede, Note, Reorder, ScBtn, ScCard, ScCheck, ScInput, ScPill } from "./ledger";
import { can } from "./model";

const TYPES = FIELD_TYPES.map(t => ({ id: t.value, label: t.label }));
const EMPTY: CustomMemberFieldDef[] = [];

export function MemberFieldsSection() {
  const me = useEntryOf("ready")?.me ?? null;
  const persisted = me?.org?.customMemberFields ?? EMPTY;
  const persistedKey = useMemo(() => JSON.stringify(persisted), [persisted]);
  const [draft, setDraft] = useState<DraftField[]>(() => toDraft(persisted));
  const [synced, setSynced] = useState(persistedKey);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // A save (here or elsewhere) re-seeds the draft.
  if (synced !== persistedKey) {
    setSynced(persistedKey);
    setDraft(toDraft(persisted));
    setEditingIdx(null);
    setConfirmIdx(null);
  }
  const dirty = fieldsDirty(draft, persisted);
  useDirtyGuard("member-fields", dirty);
  if (!me || !can(me, "MANAGE_SETTINGS")) return null;

  const update = (idx: number, patch: Partial<DraftField>) => setDraft(prev => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const add = () => {
    if (draft.length >= MAX_FIELDS) return;
    setDraft(prev => [...prev, blankField(prev.length)]);
    setEditingIdx(draft.length);
  };
  const remove = (idx: number) => {
    setDraft(prev => prev.filter((_, i) => i !== idx));
    setConfirmIdx(null);
    if (editingIdx === idx) setEditingIdx(null);
  };
  const reset = () => { setDraft(toDraft(persisted)); setEditingIdx(null); setConfirmIdx(null); };
  const save = async () => {
    if (saving) return;
    const problem = fieldsSaveError(draft);
    if (problem) { haptics.warn(); toast.error(problem); return; }
    setSaving(true);
    try {
      await saveMemberFields(fieldsPayload(draft));
      haptics.success();
      setEditingIdx(null);
      toast.show(C.saved);
    } catch (e) {
      haptics.error();
      toast.error(saveErrorOf(errorMessage(e, ""), C.forbidden));
    } finally {
      setSaving(false);
    }
  };

  const target = confirmIdx != null ? draft[confirmIdx] : undefined;
  const targetSaved = !!target?.id && persisted.some(p => p.id === target.id);

  return (
    <View style={{ gap: 18 }}>
      <Lede>{C.lede}</Lede>

      <View style={{ gap: 8 }}>
        {draft.length === 0 ? <Empty title={C.emptyTitle} hint={C.emptyHint} /> : null}
        {draft.map((field, idx) => (
          <FieldCard key={field.id || `new-${idx}`} field={field} first={idx === 0} last={idx === draft.length - 1}
            editing={editingIdx === idx} onToggleEdit={() => setEditingIdx(editingIdx === idx ? null : idx)}
            onMove={dir => setDraft(prev => moveField(prev, idx, dir))} onRemove={() => setConfirmIdx(idx)}
            onChange={patch => update(idx, patch)} />
        ))}
      </View>

      {draft.length < MAX_FIELDS ? <AddLine label={C.add} onPress={add} /> : <Note>{C.maxed.join("")}</Note>}

      <Actions dirty={dirty ? C.unsaved : null}
        save={{ label: saving ? C.saving : C.save, onPress: () => void save(), disabled: !dirty || saving }}
        reset={{ label: C.reset, onPress: reset, disabled: !dirty || saving }} />

      <ConfirmSheet open={confirmIdx != null} title={C.removeTitle(target?.label ?? "")} message={C.removeMessage(targetSaved)} confirmLabel={C.remove}
        onConfirm={() => { if (confirmIdx != null) remove(confirmIdx); }} onClose={() => setConfirmIdx(null)} />
    </View>
  );
}

function FieldCard({ field, first, last, editing, onToggleEdit, onMove, onRemove, onChange }: {
  field: DraftField; first: boolean; last: boolean; editing: boolean;
  onToggleEdit: () => void; onMove: (dir: -1 | 1) => void; onRemove: () => void; onChange: (p: Partial<DraftField>) => void;
}) {
  const { c } = useTheme();
  return (
    <ScCard>
      <View style={styles.head}>
        <Reorder first={first} last={last} onMove={onMove} up={C.moveUp} down={C.moveDown} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {field.label
            ? <T v="body" size={14.4} numberOfLines={1}>{field.label}</T>
            : <T v="body" size={14} color={c.faint} style={{ fontStyle: "italic" }} numberOfLines={1}>{C.untitled}</T>}
        </View>
        <ScPill label={field.type} />
        {field.showOnRoster ? <ScPill tone="vio" label={C.roster} /> : null}
        <ScBtn small label={editing ? C.done : C.edit} onPress={onToggleEdit} />
        <ScBtn small kind="danger" label="✕" accessibilityLabel={C.deleteLabel(field.label)} onPress={onRemove} />
      </View>
      {editing ? (
        <View style={[styles.form, { borderTopColor: c.lineSoft }]}>
          <ScInput label={C.label} value={field.label} onChangeText={v => onChange({ label: v })} maxLength={MAX_LABEL} placeholder={C.labelPlaceholder} />
          <Choices label={C.type} value={field.type} options={TYPES} onChange={(v: FieldType) => onChange({ type: v })} />
          <ScInput label={C.placeholder} value={field.placeholder ?? ""} onChangeText={v => onChange({ placeholder: v || undefined })}
            maxLength={PLACEHOLDER_MAX} placeholder={C.placeholderHint} />
          <View style={{ gap: 2 }}>
            <ScCheck on={field.showOnRoster} label={C.showOnRoster} onChange={() => onChange({ showOnRoster: !field.showOnRoster })} />
            <ScCheck on={field.required} label={C.required} onChange={() => onChange({ required: !field.required })} />
          </View>
        </View>
      ) : null}
    </ScCard>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 10, paddingLeft: 8, paddingRight: 12 },
  form: { borderTopWidth: 1, paddingVertical: 14, paddingHorizontal: 14, gap: 14 },
});
