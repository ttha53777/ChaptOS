/**
 * The Docs page's modals as sheets, with the web's fields and words
 * (app/org/[slug]/docs/DocForm, FolderForm, FolderPicker, MoveDocDialog, and the page's
 * ConfirmDialogs):
 *
 *   DocSheet     "Add doc" / "Edit doc": Title *, URL *, Description; Add also files it
 *                (FolderPicker: Unfiled, every folder as a manila tab in its section colour
 *                with its count, New folder inline, and the "Lands in …" line).
 *                Cancel / Add (Adding…) / Save (Saving…).
 *   FolderSheet  "New folder" / "Rename folder": Folder name *. Create (Creating…) / Save.
 *   MoveSheet    Move "<title>": Library (root) and the folders by name, "Here" on the
 *                current one; New folder → Create & move; Done.
 *   ConfirmSheet "Delete this doc?" / "Delete this folder?" with the web's message.
 *
 * The page runs the writes (as the web page does); each submit resolves true when it
 * saved, and the sheet stays open on a refusal so nothing typed is lost.
 */
import type { DocFolder } from "@/lib/api-types";
import { folderHue, landsIn, moveTargets } from "@/lib/docs/library";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { useTheme } from "~/theme/PaperProvider";
import { Field } from "~/ui/Field";
import { T } from "~/ui/T";

export interface DocDraft { title: string; url: string; description: string }

function Foot({ busy, label, busyLabel, ok, onCancel, onSave, danger, cancel = "Cancel" }: {
  busy: boolean; label: string; busyLabel?: string; ok: boolean; onCancel: () => void; onSave: () => void; danger?: boolean; cancel?: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <Button label={cancel} variant="ghost" onPress={onCancel} disabled={busy} />
      <Button label={busy && busyLabel ? busyLabel : label} tone={danger ? "rose" : "lilac"} onPress={onSave} disabled={!ok || busy} style={{ flex: 1 }} block />
    </View>
  );
}

/* ── Add / Edit doc ──────────────────────────────────────────────────────────── */

export function DocSheet({ open, mode, initial, startFolder, folders, totals, onSubmit, onCreateFolder, onClose }: {
  open: boolean; mode: "add" | "edit"; initial: DocDraft; startFolder: number | null;
  /** Section order, so each tab wears its section's colour. */
  folders: DocFolder[]; totals: Map<number, number>;
  onSubmit: (d: DocDraft, folderId: number | null) => Promise<boolean>;
  onCreateFolder: (name: string) => Promise<DocFolder | null>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<DocDraft>(initial);
  const [folderId, setFolderId] = useState<number | null>(startFolder);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(initial); setFolderId(startFolder); setBusy(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const ok = form.title.trim() !== "" && form.url.trim() !== "";
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const saved = await onSubmit(form, folderId);
    if (!saved) setBusy(false);
  };
  const add = mode === "add";

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="fit" tone="sky" icon="folder" title={add ? "Add doc" : "Edit doc"}
      footer={<Foot busy={busy} ok={ok} onCancel={onClose} onSave={() => void save()} label={add ? "Add" : "Save"} busyLabel={add ? "Adding…" : "Saving…"} />}>
      <View style={{ gap: 12 }}>
        <Field label="Title *" value={form.title} onChangeText={t => setForm(f => ({ ...f, title: t }))} placeholder="Chapter Constitution" />
        <Field label="URL *" value={form.url} onChangeText={t => setForm(f => ({ ...f, url: t }))} placeholder="https://docs.google.com/document/d/…"
          keyboardType="url" autoCapitalize="none" autoCorrect={false} />
        <Field label="Description" value={form.description} onChangeText={t => setForm(f => ({ ...f, description: t }))} placeholder="Short note about what this is for"
          multiline style={{ minHeight: 72, textAlignVertical: "top" }} />
        {add ? <FolderPicker folders={folders} counts={totals} value={folderId} onChange={setFolderId} onCreate={onCreateFolder} /> : null}
      </View>
    </Sheet>
  );
}

function FolderPicker({ folders, counts, value, onChange, onCreate }: {
  folders: DocFolder[]; counts: Map<number, number>; value: number | null; onChange: (id: number | null) => void;
  onCreate: (name: string) => Promise<DocFolder | null>;
}) {
  const { c } = useTheme();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const dest = value == null ? null : folders.find(f => f.id === value) ?? null;
  const lands = landsIn(dest, dest ? counts.get(dest.id) ?? 0 : 0);

  const create = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const made = await onCreate(n);
    setBusy(false);
    if (!made) return;
    onChange(made.id);
    setName("");
    setNaming(false);
  };
  const pick = (id: number | null) => { if (id !== value) { haptics.select(); onChange(id); } };

  const tabStyle = (on: boolean, fc: string | null, dashed = false) => [styles.fpTab, {
    borderColor: on ? c.ink : c.line2, backgroundColor: c.card, borderStyle: dashed ? "dashed" as const : "solid" as const,
    transform: [{ translateY: on ? -3 : 0 }], boxShadow: on ? `3px 3px 0 ${fc ?? c.line2}` : undefined,
  }];

  return (
    <View style={{ gap: 6 }}>
      <T v="label" color={c.ink2}>File in</T>
      <View style={styles.fpTabs} accessibilityRole="radiogroup" accessibilityLabel="File in">
        <Pressable onPress={() => pick(null)} accessibilityRole="radio" accessibilityState={{ selected: value == null }} style={tabStyle(value == null, null)}>
          <T v="subhead" size={14} ls={-0.015} color={value == null ? c.ink : c.ink2}>Unfiled</T>
        </Pressable>
        {folders.map((f, i) => {
          const on = value === f.id;
          const fc = c.pastel[folderHue(i)].fill;
          return (
            <Pressable key={f.id} onPress={() => pick(f.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={f.name} style={tabStyle(on, fc)}>
              <View style={[styles.fpStripe, { backgroundColor: fc }]} />
              <Icon name="folder" size={14} color={on ? c.ink : c.ink2} />
              <T v="subhead" size={14} ls={-0.015} numberOfLines={1} color={on ? c.ink : c.ink2} style={{ maxWidth: 150 }}>{f.name}</T>
              <T v="mono" size={11} color={c.ink3}>{String(counts.get(f.id) ?? 0)}</T>
            </Pressable>
          );
        })}
        {naming ? (
          <View style={[styles.fpTab, { borderColor: c.ink, backgroundColor: c.pastel.butter.soft, boxShadow: `3px 3px 0 ${c.pastel.butter.fill}` }]}>
            <Icon name="folder" size={14} color={c.ink2} />
            <TextInput autoFocus value={name} maxLength={120} placeholder="Folder name" placeholderTextColor={c.ink3} accessibilityLabel="New folder name"
              editable={!busy} onChangeText={setName} onSubmitEditing={() => void create()} returnKeyType="done"
              style={[styles.fpInput, { color: c.ink }]} />
            <Pressable onPress={() => void create()} disabled={busy || !name.trim()} accessibilityRole="button"
              style={({ pressed }) => [styles.fpOk, { backgroundColor: c.ink, borderColor: c.ink, opacity: busy || !name.trim() ? 0.5 : 1 }, pressed && pressedDim]}>
              <T v="buttonSm" size={12.5} color={c.paper}>{busy ? "…" : "Create"}</T>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setNaming(true)} accessibilityRole="button"
            style={({ pressed }) => [[styles.fpTab, { borderColor: c.line2, borderStyle: "dashed" }], pressed && pressedDim]}>
            <Icon name="plus" size={13} color={c.ink2} />
            <T v="buttonSm" size={13} color={c.ink2}>New folder</T>
          </Pressable>
        )}
      </View>
      <T v="body" size={13} color={c.ink2} style={{ fontStyle: "italic" }}>
        {"Lands in "}<T v="bodyStrong" size={13} style={{ backgroundColor: c.pastel.butter.fill }}>{lands.name}</T>{lands.tail}
      </T>
    </View>
  );
}

/* ── New / Rename folder ─────────────────────────────────────────────────────── */

export function FolderSheet({ open, mode, initial, onSubmit, onClose }: {
  open: boolean; mode: "new" | "rename"; initial: string; onSubmit: (name: string) => Promise<boolean>; onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(initial); setBusy(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = name.trim() !== "";
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    if (!(await onSubmit(name))) setBusy(false);
  };
  const isNew = mode === "new";
  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="fit" tone="butter" icon="folder" title={isNew ? "New folder" : "Rename folder"}
      footer={<Foot busy={busy} ok={ok} onCancel={onClose} onSave={() => void save()} label={isNew ? "Create" : "Save"} busyLabel={isNew ? "Creating…" : "Saving…"} />}>
      <Field label="Folder name *" value={name} onChangeText={setName} placeholder="Recruitment" maxLength={120} autoFocus onSubmitEditing={() => void save()} returnKeyType="done" />
    </Sheet>
  );
}

/* ── Move ────────────────────────────────────────────────────────────────────── */

export function MoveSheet({ open, title, folders, current, onMove, onCreateAndMove, onClose }: {
  open: boolean; title: string; folders: DocFolder[]; current: number | null;
  onMove: (folderId: number | null) => void; onCreateAndMove: (name: string) => Promise<boolean>; onClose: () => void;
}) {
  const { c } = useTheme();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setCreating(false); setName(""); setBusy(false); } }, [open]);
  const sorted = moveTargets(folders);
  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    if (!(await onCreateAndMove(name))) setBusy(false);
  };

  const Opt = (id: number | null, label: string) => {
    const on = current === id;
    return (
      <Pressable key={String(id)} onPress={() => onMove(id)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={({ pressed }) => [[styles.moveRow, {
          borderColor: on ? c.ink : c.line, backgroundColor: on ? c.card : c.paper, boxShadow: on ? `2.5px 2.5px 0 ${c.pastel.butter.fill}` : undefined,
        }], pressed && pressedDim]}>
        <Icon name={id == null ? "home" : "folder"} size={16} color={c.ink2} />
        <T v="callout" size={14.5} style={{ flex: 1 }} numberOfLines={1}>{label}</T>
        {on ? <View style={[styles.here, { backgroundColor: c.paper3 }]}><T v="mono" size={10} color={c.ink3}>Here</T></View> : null}
      </Pressable>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="half" tone="butter" icon="move" title={`Move "${title}"`}
      footer={<Button label="Done" variant="ghost" onPress={onClose} disabled={busy} block />}>
      <View style={{ gap: 8 }}>
        {Opt(null, "Library (root)")}
        {sorted.map(f => Opt(f.id, f.name))}
        {sorted.length === 0 ? (
          <View style={[styles.moveEmpty, { borderColor: c.line2 }]}><T v="meta" size={13.8} color={c.ink3}>No folders yet — create one below.</T></View>
        ) : null}
        {creating ? (
          <View style={[styles.moveNew, { borderTopColor: c.line2 }]}>
            <Field label="Folder name *" value={name} onChangeText={setName} placeholder="Recruitment" maxLength={120} autoFocus onSubmitEditing={() => void create()} returnKeyType="done" />
            <Foot busy={busy} ok={name.trim() !== ""} onCancel={() => setCreating(false)} onSave={() => void create()} label="Create & move" busyLabel="Creating…" />
          </View>
        ) : (
          <Pressable onPress={() => setCreating(true)} accessibilityRole="button"
            style={({ pressed }) => [[styles.newBtn, { borderColor: c.line2 }], pressed && pressedDim]}>
            <Icon name="plus" size={13} color={c.ink} />
            <T v="buttonSm" size={13}>New folder</T>
          </Pressable>
        )}
      </View>
    </Sheet>
  );
}

/* ── Confirm ─────────────────────────────────────────────────────────────────── */

export function ConfirmSheet({ open, title, message, confirmLabel, onConfirm, onClose }: {
  open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void; onClose: () => void;
}) {
  const { c } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} size="fit" tone="rose" icon="trash" title={title}
      footer={<Foot busy={false} ok onCancel={onClose} onSave={() => { onClose(); onConfirm(); }} label={confirmLabel} danger />}>
      <T v="body" size={14} color={c.ink2}>{message}</T>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fpTabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, rowGap: 10, paddingVertical: 8 },
  fpTab: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingLeft: 11, paddingRight: 13, paddingTop: 2, borderWidth: 1.5, borderTopLeftRadius: 12, borderTopRightRadius: 15, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  fpStripe: { position: "absolute", left: 11, right: 11, top: -1.5, height: 4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  fpInput: { minWidth: 110, fontSize: 14, paddingVertical: 0 },
  fpOk: { height: 28, paddingHorizontal: 10, borderWidth: 1.5, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  moveRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12 },
  here: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  moveEmpty: { paddingVertical: 16, paddingHorizontal: 12, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12 },
  moveNew: { gap: 10, paddingTop: 12, borderTopWidth: 1.5, borderStyle: "dashed" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1.5, borderStyle: "dashed", borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13 },
});
