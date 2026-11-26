/**
 * Settings → Money categories (the web's sections/TransactionCategoriesSection.tsx at
 * phone width). Every word and rule from @/lib/settings/categories:
 *
 *   two books, Money in and Money out, each: title + note, one card of rows (colour dot,
 *   label, BUILT-IN / HIDDEN, "filed as …" and why it's locked) with Edit (Label, the
 *   permanent slug, the rename note, Color in the charts), Hide/Show and Delete (confirm)
 *   for unlocked rows · + Add … category → New … category (Name, the slug it gets, colour)
 *   · the 60-cap note across both books
 *
 * Which book's Add you press is the kind. The list is Treasury's own
 * (moneyKeys.categories). Refusals come back from the API as written. Treasury orgs:
 * org admins or MANAGE_TREASURY.
 */
import type { TransactionCategory } from "@/lib/api-types";
import {
  BOOKS, CATEGORIES_COPY as C, CATEGORY_LABEL_MAX, MAX_CATEGORIES_PER_ORG,
  byBook, categorySub, hiddenMessage, isLocked, previewSlug, type Book,
} from "@/lib/settings/categories";
import { categoryPalette, nextCategoryColor, type CategoryKind } from "@/lib/transaction-categories";
import { Fragment, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { useCategories } from "~/data/money";
import { createCategory, deleteCategory, updateCategory } from "~/data/settings";
import { ConfirmSheet } from "~/docs/Sheets";
import { useEntryOf } from "~/entry/EntryContext";
import { haptics } from "~/motion/haptics";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { AddLine, Dot, FormCard, Note, ScBtn, ScCard, ScInput, ScPill, Swatches } from "./ledger";
import { can, isOrgAdmin } from "./model";

export function CategoriesSection() {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const allowed = !!me && !!me.org?.enabledWorkflows.includes("finance") && (isOrgAdmin(me) || can(me, "MANAGE_TREASURY"));
  const q = useCategories(allowed);
  if (!me || !allowed) return null;
  if (q.isPending) return <Note style={{ textAlign: "center", paddingVertical: 24 }}>{C.loading}</Note>;
  if (q.isError) return <T v="meta" color={c.pastel.rose.ink}>{C.loadFailed}</T>;
  const books = byBook(q.data);
  const atLimit = q.data.length >= MAX_CATEGORIES_PER_ORG;
  return (
    <View style={{ gap: 26 }}>
      {BOOKS.map(b => <BookCard key={b.kind} book={b} cats={books[b.kind]} atLimit={atLimit} />)}
      {atLimit ? <Note>{C.maxed.join("")}</Note> : null}
    </View>
  );
}

function BookCard({ book, cats, atLimit }: { book: Book; cats: TransactionCategory[]; atLimit: boolean }) {
  const { c } = useTheme();
  const [showNew, setShowNew] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(() => categoryPalette(book.kind)[0]!);
  const [creating, setCreating] = useState(false);

  const openNew = () => { setColor(nextCategoryColor(book.kind, cats.map(x => x.color))); setLabel(""); setShowNew(true); };
  const create = async () => {
    const l = label.trim();
    if (!l || creating) return;
    setCreating(true);
    try {
      // No slug: the server derives and de-dupes it; the preview is advisory.
      const made = await createCategory({ kind: book.kind, label: l, color: color.color, colorDark: color.colorDark, displayOrder: cats.length });
      haptics.success();
      setShowNew(false);
      toast.show(C.added(made.label));
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.createFailed));
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <T v="title" size={16} accessibilityRole="header">{book.title}</T>
        <Note>{book.note}</Note>
      </View>
      <ScCard>
        {cats.length === 0
          ? <View style={styles.row}><Note>{C.empty(book.kind)}</Note></View>
          : cats.map((cat, i) => <CategoryRow key={cat.id} cat={cat} last={i === cats.length - 1} />)}
      </ScCard>
      {showNew ? (
        <FormCard title={C.newTitle(book.kind).join("")}>
          <View style={{ gap: 4 }}>
            <ScInput label={C.nameReq} value={label} onChangeText={setLabel} maxLength={CATEGORY_LABEL_MAX} placeholder={book.placeholder}
              returnKeyType="done" onSubmitEditing={() => void create()} />
            {label.trim() ? (
              <Note>{C.slugPreview("")[0]}<T v="mono" size={11.5} color={c.ink2}>{previewSlug(label)}</T>{C.slugPreview("")[2]}</Note>
            ) : null}
          </View>
          <Swatches label={C.color} palette={categoryPalette(book.kind)} colorDark={color.colorDark} onPick={setColor} />
          <View style={styles.acts}>
            <ScBtn kind="primary" small label={creating ? C.creating : C.create} disabled={creating || !label.trim()} onPress={() => void create()} />
            <ScBtn small label={C.cancel} disabled={creating} onPress={() => setShowNew(false)} />
          </View>
        </FormCard>
      ) : null}
      {!showNew && !atLimit ? <AddLine label={book.addLabel} onPress={openNew} /> : null}
    </View>
  );
}

function CategoryRow({ cat, last }: { cat: TransactionCategory; last: boolean }) {
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(cat.label);
  const [color, setColor] = useState({ color: cat.color, colorDark: cat.colorDark ?? cat.color });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const locked = isLocked(cat);
  const sub = categorySub(cat);
  const edge = !last && { borderBottomWidth: 1, borderBottomColor: c.lineSoft };

  const open = () => { setLabel(cat.label); setColor({ color: cat.color, colorDark: cat.colorDark ?? cat.color }); setEditing(true); };
  const save = async () => {
    setSaving(true);
    try {
      const u = await updateCategory(cat.id, { label: label.trim(), color: color.color, colorDark: color.colorDark });
      haptics.success();
      setEditing(false);
      toast.show(C.saved(u.label));
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.saveFailed));
    } finally {
      setSaving(false);
    }
  };
  const toggleHidden = async () => {
    setBusy(true);
    try {
      const u = await updateCategory(cat.id, { hidden: !cat.hidden });
      haptics.success();
      toast.show(hiddenMessage(u.label, u.hidden));
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.saveFailed));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setConfirm(false);
    setBusy(true);
    try {
      await deleteCategory(cat.id);
      haptics.success();
      toast.show(C.removed(cat.label));
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.deleteFailed));
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <View style={[styles.form, edge]}>
        <ScInput label={C.label} value={label} onChangeText={setLabel} maxLength={CATEGORY_LABEL_MAX} returnKeyType="done"
          onSubmitEditing={() => { if (label.trim()) void save(); }} />
        <ScInput label={C.filedPermanent} mono value={cat.slug} editable={false} style={{ opacity: 0.6 }} />
        <Note>{C.renameNote}</Note>
        <Swatches label={C.color} palette={categoryPalette(cat.kind as CategoryKind)} colorDark={color.colorDark}
          onPick={p => setColor({ color: p.color, colorDark: p.colorDark })} />
        <View style={styles.acts}>
          <ScBtn kind="primary" small label={saving ? C.saving : C.save} disabled={saving || !label.trim()} onPress={() => void save()} />
          <ScBtn small label={C.cancel} disabled={saving} onPress={() => setEditing(false)} />
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.row, edge]}>
      <Dot color={cat.colorDark ?? cat.color} dim={cat.hidden} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={styles.key}>
          <T v="bodyStrong" size={14.4}>{cat.label}</T>
          {locked ? <ScPill label={C.builtin} /> : null}
          {cat.hidden ? <ScPill tone="gold" label={C.hidden} /> : null}
        </View>
        {sub.length ? (
          <T v="meta" size={12.5} color={c.ink3}>
            {sub.map((part, i) => (
              <Fragment key={i}>
                {i > 0 ? " · " : ""}
                {typeof part === "string" ? part : <>{C.filedAs}<T v="mono" size={11.5} color={c.ink3}>{part.slug}</T></>}
              </Fragment>
            ))}
          </T>
        ) : null}
        <View style={styles.btns}>
          <ScBtn small label={C.edit} onPress={open} />
          {!locked ? <ScBtn small label={cat.hidden ? C.show : C.hide} disabled={busy} onPress={() => void toggleHidden()} /> : null}
          {!locked ? <ScBtn small kind="danger" label={C.delete} disabled={busy} onPress={() => setConfirm(true)} /> : null}
        </View>
      </View>
      <ConfirmSheet open={confirm} title={C.deleteTitle(cat.label)} message={C.deleteMessage} confirmLabel={C.delete}
        onConfirm={() => void remove()} onClose={() => setConfirm(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  key: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  btns: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 6 },
  form: { paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
  acts: { flexDirection: "row", gap: 8, paddingTop: 4 },
});
