/**
 * Settings → Event fields (the web's sections/EventFieldsSection.tsx at phone width).
 * Every word and rule from @/lib/settings/event-fields:
 *
 *   lede · one card per field (reorder, label, kind / Built-in / Off pills, Rename,
 *   Stop collecting / Collect again, Delete for custom fields) with the kind's example
 *   under it · + New field → label, kind chips, what the kind means, the fixed-type note,
 *   Add field / Cancel · the 24-cap line
 *
 * Each change writes on its own and re-reads the list (the Programming sheet shares it,
 * progKeys.fields); the API's refusals are shown as returned. Rename edits the label in
 * place: done or blur saves. Org admins or MANAGE_EVENTS.
 */
import type { EventFieldRow } from "@/lib/api-types";
import {
  EVENT_FIELDS_COPY as C, FIELD_KINDS, KIND_COPY, MAX_EVENT_FIELDS, MAX_FIELD_LABEL,
  fieldNote, kindLabel, sortFields, toggleMessage, type FieldKind,
} from "@/lib/settings/event-fields";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { useEventFields } from "~/data/programming";
import { addEventField, deleteEventField, patchEventField, refreshEventFields } from "~/data/settings";
import { ConfirmSheet } from "~/docs/Sheets";
import { useEntryOf } from "~/entry/EntryContext";
import { haptics } from "~/motion/haptics";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { Lede, Note, Reorder, ScBtn, ScCard, ScInput, ScPill } from "./ledger";
import { can, isOrgAdmin } from "./model";

export function EventFieldsSection() {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const allowed = !!me && (isOrgAdmin(me) || can(me, "MANAGE_EVENTS"));
  const q = useEventFields(allowed);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EventFieldRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<FieldKind>("text");
  if (!me || !allowed) return null;
  if (q.isPending) return <Lede>{C.loading}</Lede>;
  if (q.isError) return <T v="meta" color={c.pastel.rose.ink}>{errorMessage(q.error, C.loadFailed)}</T>;
  const sorted = sortFields(q.data);
  const atCeiling = sorted.length >= MAX_EVENT_FIELDS;

  /** Every write goes through here so one failure path shows the API's words. */
  const mutate = async (run: () => Promise<unknown>, ok: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      await run();
      await refreshEventFields();
      haptics.success();
      toast.show(ok);
      return true;
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.saveFailed));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const move = (idx: number, dir: -1 | 1) => {
    const a = sorted[idx], b = sorted[idx + dir];
    if (!a || !b) return;
    void mutate(async () => {
      await patchEventField(a.id, { displayOrder: b.displayOrder });
      await patchEventField(b.id, { displayOrder: a.displayOrder });
    }, C.orderSaved);
  };
  const commitRename = (f: EventFieldRow) => {
    setRenaming(null);
    const l = draftLabel.trim();
    if (l && l !== f.label) void mutate(() => patchEventField(f.id, { label: l }), C.renamed);
  };
  const add = async () => {
    const l = newLabel.trim();
    if (!l) return;
    if (await mutate(() => addEventField(l, newKind), C.added(l))) { setAdding(false); setNewLabel(""); setNewKind("text"); }
  };

  return (
    <View style={{ gap: 18 }}>
      <Lede>{C.lede}</Lede>

      <View style={{ gap: 8 }}>
        {sorted.map((f, idx) => (
          <ScCard key={f.slug}>
            <View style={styles.head}>
              <Reorder first={idx === 0} last={idx === sorted.length - 1} disabled={busy} onMove={dir => move(idx, dir)} up={C.moveUp} down={C.moveDown} />
              {renaming === f.slug ? (
                <TextInput autoFocus value={draftLabel} onChangeText={setDraftLabel} maxLength={MAX_FIELD_LABEL} returnKeyType="done"
                  onSubmitEditing={() => commitRename(f)} onBlur={() => commitRename(f)} accessibilityLabel={C.rename}
                  style={[styles.rename, { borderColor: c.line2, backgroundColor: c.card, color: c.ink }]} />
              ) : (
                <T v="bodyStrong" size={14} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{f.label}</T>
              )}
              <View style={styles.pills}>
                <ScPill label={kindLabel(f.kind)} />
                {f.builtin ? <ScPill label={C.builtin} /> : null}
                {!f.enabled ? <ScPill label={C.off} /> : null}
              </View>
            </View>
            <View style={styles.btns}>
              <ScBtn small label={C.rename} disabled={busy} onPress={() => { setRenaming(f.slug); setDraftLabel(f.label); }} />
              <ScBtn small label={f.enabled ? C.stop : C.again} disabled={busy}
                onPress={() => void mutate(() => patchEventField(f.id, { enabled: !f.enabled }), toggleMessage(f))} />
              {!f.builtin ? <ScBtn small label={C.delete} disabled={busy} onPress={() => setDeleteTarget(f)} /> : null}
            </View>
            <T v="meta" size={11.5} color={c.faint} style={styles.note}>{fieldNote(f)}</T>
          </ScCard>
        ))}
      </View>

      {adding ? (
        <ScCard style={{ padding: 14, gap: 12 }}>
          <ScInput autoFocus placeholder={C.newPlaceholder} maxLength={MAX_FIELD_LABEL} value={newLabel} onChangeText={setNewLabel} accessibilityLabel={C.addField} />
          <View style={styles.kinds} accessibilityRole="radiogroup">
            {FIELD_KINDS.map(k => {
              const on = newKind === k;
              return (
                <Pressable key={k} onPress={() => { if (!on) { haptics.select(); setNewKind(k); } }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  accessibilityLabel={KIND_COPY[k].label} hitSlop={4}>
                  <ScPill tone={on ? "vio" : "muted"} label={KIND_COPY[k].label} />
                </Pressable>
              );
            })}
          </View>
          <T v="meta" size={11.5} color={c.faint}>{KIND_COPY[newKind].eg}</T>
          <T v="meta" size={11.5} color={c.faint}>{C.fixedType}</T>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <ScBtn kind="primary" small label={C.addField} disabled={!newLabel.trim() || busy} onPress={() => void add()} />
            <ScBtn small label={C.cancel} onPress={() => { setAdding(false); setNewLabel(""); }} />
          </View>
        </ScCard>
      ) : (
        <ScBtn small label={C.newField} disabled={atCeiling || busy} onPress={() => setAdding(true)} accessibilityLabel={atCeiling ? C.ceilingTitle : C.newField} />
      )}
      {atCeiling ? <Note style={{ fontSize: 11.5, color: c.faint }}>{C.ceiling}</Note> : null}

      <ConfirmSheet open={deleteTarget != null} title={C.deleteTitle(deleteTarget?.label ?? "")} message={C.deleteMessage} confirmLabel={C.delete}
        onConfirm={() => { const t = deleteTarget; setDeleteTarget(null); if (t) void mutate(() => deleteEventField(t.id), C.deleted(t.label)); }}
        onClose={() => setDeleteTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, paddingLeft: 8, paddingRight: 12 },
  pills: { flexDirection: "row", gap: 5, alignItems: "center" },
  rename: { flex: 1, minWidth: 0, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, height: 38, fontSize: 15 },
  btns: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, paddingLeft: 42, paddingTop: 8 },
  note: { paddingHorizontal: 14, paddingLeft: 42, paddingTop: 8, paddingBottom: 12 },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
