/**
 * Settings → Event types (the web's sections/EventTypesSection.tsx at phone width).
 * Every word and rule from @/lib/settings/event-types:
 *
 *   one card of rows (colour dot, label, BUILT-IN / NEEDS … / HIDDEN tags, the slug and
 *   where it's booked) with Edit (Label, the permanent slug, Color on the timeline) and
 *   Delete for custom types (confirm) · the 40-cap note · + Add event type → New event
 *   type (Label, the slug it will get, colour)
 *
 * Refusals (in use, duplicate) come back from the API and are shown as returned. The list
 * is the Timeline's own (calKeys.types), so its picker and legend follow. MANAGE_SETTINGS.
 */
import type { CalEventType } from "@/lib/api-types";
import { EVENT_TYPE_PALETTE, nextPaletteColor, type EventTypeColor } from "@/lib/event-types";
import { EVENT_TYPES_COPY as C, MAX_EVENT_TYPES, TYPE_LABEL_MAX, newTypeSlug, slugifyType, typeTag } from "@/lib/settings/event-types";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { useEventTypes } from "~/data/calendar";
import { createEventType, deleteEventType, updateEventType } from "~/data/settings";
import { ConfirmSheet } from "~/docs/Sheets";
import { useEntryOf } from "~/entry/EntryContext";
import { haptics } from "~/motion/haptics";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { AddLine, Dot, FormCard, Note, ScBtn, ScCard, ScInput, ScPill, Swatches } from "./ledger";
import { can } from "./model";

export function EventTypesSection() {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const q = useEventTypes();
  const [showNew, setShowNew] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<EventTypeColor>(EVENT_TYPE_PALETTE[0]!);
  const [creating, setCreating] = useState(false);
  if (!me || !can(me, "MANAGE_SETTINGS")) return null;
  if (q.isPending) return <Note style={{ textAlign: "center", paddingVertical: 24 }}>{C.loading}</Note>;
  if (q.isError) return <T v="meta" color={c.pastel.rose.ink}>{C.loadFailed}</T>;
  const types = q.data;
  const enabled = me.org?.enabledWorkflows ?? [];

  const openNew = () => { setColor(nextPaletteColor(types.map(t => t.color))); setLabel(""); setShowNew(true); };
  const create = async () => {
    const l = label.trim();
    if (!l || creating) return;
    setCreating(true);
    try {
      const t = await createEventType({
        slug: newTypeSlug(l, types.map(x => x.slug)), label: l, color: color.color, colorDark: color.colorDark,
        // Ungated, as on the web: a type typed by hand shouldn't vanish with a page toggle.
        workflowId: null, displayOrder: types.length,
      });
      haptics.success();
      setShowNew(false);
      toast.show(C.added(t.label));
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.createFailed));
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={{ gap: 18 }}>
      <ScCard>
        {types.map((t, i) => <TypeRow key={t.id} type={t} enabled={enabled} last={i === types.length - 1} />)}
      </ScCard>

      {types.length >= MAX_EVENT_TYPES ? <Note>{C.maxed.join("")}</Note> : null}

      {showNew ? (
        <FormCard title={C.newType}>
          <View style={{ gap: 4 }}>
            <ScInput label={C.labelReq} value={label} onChangeText={setLabel} maxLength={TYPE_LABEL_MAX} placeholder={C.labelPlaceholder}
              returnKeyType="done" onSubmitEditing={() => void create()} />
            {label.trim() ? (
              <Note>{C.slugPreview("")[0]}<T v="mono" size={11.5} color={c.ink2}>{slugifyType(label) || "type"}</T>{C.slugPreview("")[2]}</Note>
            ) : null}
          </View>
          <Swatches label={C.color} palette={EVENT_TYPE_PALETTE} colorDark={color.colorDark} onPick={p => setColor(p)} />
          <View style={styles.acts}>
            <ScBtn kind="primary" small label={creating ? C.creating : C.create} disabled={creating || !label.trim()} onPress={() => void create()} />
            <ScBtn small label={C.cancel} disabled={creating} onPress={() => setShowNew(false)} />
          </View>
        </FormCard>
      ) : null}

      {!showNew && types.length < MAX_EVENT_TYPES ? <AddLine label={C.add} onPress={openNew} /> : null}
    </View>
  );
}

function TypeRow({ type, enabled, last }: { type: CalEventType; enabled: readonly string[]; last: boolean }) {
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(type.label);
  const [color, setColor] = useState({ color: type.color, colorDark: type.colorDark ?? type.color });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const tag = typeTag(type, enabled);
  const edge = !last && { borderBottomWidth: 1, borderBottomColor: c.lineSoft };

  const open = () => { setLabel(type.label); setColor({ color: type.color, colorDark: type.colorDark ?? type.color }); setEditing(true); };
  const save = async () => {
    setSaving(true);
    try {
      const t = await updateEventType(type.id, { label: label.trim(), color: color.color, colorDark: color.colorDark });
      haptics.success();
      setEditing(false);
      toast.show(C.saved(t.label));
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.saveFailed));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setConfirm(false);
    setDeleting(true);
    try {
      await deleteEventType(type.id);
      haptics.success();
      toast.show(C.removed(type.label));
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.deleteFailed));
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <View style={[styles.form, edge]}>
        <ScInput label={C.label} value={label} onChangeText={setLabel} maxLength={TYPE_LABEL_MAX} />
        <ScInput label={C.slug} mono value={type.slug} editable={false} style={{ opacity: 0.6 }} />
        <Swatches label={C.color} palette={EVENT_TYPE_PALETTE} colorDark={color.colorDark} onPick={p => setColor({ color: p.color, colorDark: p.colorDark })} />
        <View style={styles.acts}>
          <ScBtn kind="primary" small label={saving ? C.saving : C.save} disabled={saving || !label.trim()} onPress={() => void save()} />
          <ScBtn small label={C.cancel} disabled={saving} onPress={() => setEditing(false)} />
        </View>
      </View>
    );
  }
  const follows = type.workflowId ? C.follows(type.workflowId) : null;
  return (
    <View style={[styles.row, edge]}>
      <Dot color={type.colorDark ?? type.color} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={styles.key}>
          <T v="bodyStrong" size={14.4}>{type.label}</T>
          {type.builtin ? <ScPill label={C.builtin} /> : null}
          {tag ? <ScPill tone="gold" label={tag} /> : null}
        </View>
        <T v="meta" size={12.5} color={c.ink3}>
          <T v="mono" size={11.5} color={c.ink3}>{type.slug}</T>
          {!type.creatable ? C.bookedElsewhere : ""}
          {follows ? follows.join("") : ""}
        </T>
        <View style={styles.btns}>
          <ScBtn small label={C.edit} onPress={open} />
          {!type.builtin ? <ScBtn small kind="danger" label={deleting ? C.removing : C.delete} disabled={deleting} onPress={() => setConfirm(true)} /> : null}
        </View>
      </View>
      <ConfirmSheet open={confirm} title={C.deleteTitle(type.label)} message={C.deleteMessage} confirmLabel={C.delete}
        onConfirm={() => void remove()} onClose={() => setConfirm(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  key: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  btns: { flexDirection: "row", gap: 6, alignItems: "center", paddingTop: 6 },
  form: { paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
  acts: { flexDirection: "row", gap: 8, paddingTop: 4 },
});
