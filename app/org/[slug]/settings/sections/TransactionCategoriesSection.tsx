"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../../../../components/dashboard/primitives";
import { apiErrorMessage, requestJson } from "../../../../lib/api";
import { useChapter, type TransactionCategory } from "../../../../context/ChapterContext";
import { categoryPalette, nextCategoryColor, type CategoryKind } from "@/lib/transaction-categories";
import {
  BOOKS, CATEGORIES_COPY as C, CATEGORY_LABEL_MAX, MAX_CATEGORIES_PER_ORG,
  byBook as splitBooks, categorySub, hiddenMessage, isLocked, previewSlug, type Book,
} from "@/lib/settings/categories";
import { sameColor } from "@/lib/settings/event-types";
import type { EventTypeColor } from "@/lib/event-types";

// Settings → Money categories. The org's own income and expense vocabulary: what
// the treasury's Type picker offers, what colors the charts, and what every
// budget line is filed under.
//
// Two books, two cards, because `kind` is immutable — which card's "Add" you
// press IS the choice, so there is no kind selector to get wrong and no way to
// drag a category across the ledger (that would orphan every row filed under it).
//
// Three kinds of row, and the difference is enforced by the service, not here:
//   · RESERVED (income "Dues", expense "Reimbursement") — rename + recolor only.
//     The server posts to them without asking a picker, so they can't be hidden
//     or deleted. Their sub-line says so; the buttons simply aren't offered.
//   · HIDDEN — still resolves the label and color of money already filed under
//     it, just no longer offered on new transactions. The graceful retirement
//     for a category that delete refuses because it's in use.
//   · ORDINARY — everything above plus delete.
//
// Duplicate labels, in-use refusals and the org ceiling are all decided by the
// API and surfaced as returned, rather than re-litigated here where the two
// could drift.

/** Palette picker for one book. Both hexes move together — a category is one
 *  ivory/dusk pair. Swatches render the DUSK hex; settings is on dark paper. */
function ColorPicker({
  kind,
  colorDark,
  onPick,
}: {
  kind: CategoryKind;
  colorDark: string | null;
  onPick: (c: { color: string; colorDark: string }) => void;
}) {
  return (
    <div className="et-swatches">
      {categoryPalette(kind).map(c => (
        <button
          key={c.id}
          type="button"
          className={`et-swatch${sameColor(colorDark, c.colorDark) ? " on" : ""}`}
          style={{ background: c.colorDark, ["--sc" as string]: c.colorDark }}
          title={c.label}
          aria-label={`Use ${c.label}`}
          onClick={() => onPick({ color: c.color, colorDark: c.colorDark })}
        />
      ))}
    </div>
  );
}

function CategoryRow({
  cat,
  onUpdated,
  onDeleted,
  onStatus,
  onError,
}: {
  cat: TransactionCategory;
  onUpdated: (c: TransactionCategory) => void;
  onDeleted: (id: number) => void;
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [label, setLabel] = useState(cat.label);
  const [color, setColor] = useState({ color: cat.color, colorDark: cat.colorDark ?? cat.color });

  useEffect(() => {
    setLabel(cat.label);
    setColor({ color: cat.color, colorDark: cat.colorDark ?? cat.color });
  }, [cat]);

  const locked = isLocked(cat);

  async function patch(body: Record<string, unknown>): Promise<TransactionCategory | null> {
    try {
      return await requestJson<TransactionCategory>(`/api/treasury/categories/${cat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // The server writes these for a human ("…is used by 3 transactions —
      // reassign or remove them first"); ApiError.message is the diagnostic form
      // with the URL and status glued on.
      onError(apiErrorMessage(e, C.saveFailed));
      return null;
    }
  }

  async function handleSave() {
    setSaving(true);
    const updated = await patch({ label: label.trim(), color: color.color, colorDark: color.colorDark });
    setSaving(false);
    if (!updated) return;
    onUpdated(updated);
    setEditing(false);
    onStatus(C.saved(updated.label));
  }

  async function handleToggleHidden() {
    setBusy(true);
    const updated = await patch({ hidden: !cat.hidden });
    setBusy(false);
    if (!updated) return;
    onUpdated(updated);
    onStatus(hiddenMessage(updated.label, updated.hidden));
  }

  async function handleDelete() {
    setConfirmDelete(false);
    setBusy(true);
    try {
      await requestJson(`/api/treasury/categories/${cat.id}`, { method: "DELETE" });
      onDeleted(cat.id);
      onStatus(C.removed(cat.label));
    } catch (e) {
      // The server writes these for a human ("…is used by 3 transactions —
      // reassign or remove them first"); ApiError.message is the diagnostic form
      // with the URL and status glued on.
      onError(apiErrorMessage(e, C.deleteFailed));
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="sc-row sc-row-between">
        <div className="sc-row-lead et-lead">
          <span
            className="et-dot"
            style={{ background: cat.colorDark ?? cat.color, opacity: cat.hidden ? 0.4 : 1 }}
          />
          <div>
            <div className="sc-row-key">
              {cat.label}
              {locked && <span className="sc-pill sc-pill-muted et-tag">{C.builtin}</span>}
              {cat.hidden && <span className="sc-pill sc-pill-gold et-tag">{C.hidden}</span>}
            </div>
            {/* The stored key only earns a line when it has drifted from the
                label. Every category that predates renaming has slug === label,
                and printing "Door · Door" under "Door" is pure stutter — the
                Edit form shows the key unconditionally, which is where someone
                asking "what is this actually filed as" already looks. */}
            {(cat.slug !== cat.label || locked || cat.hidden) && (
              <div className="sc-row-sub">
                {categorySub(cat)
                  .map(part => (typeof part === "string" ? part : <>{C.filedAs}<code key="s">{part.slug}</code></>))
                  .map((part, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && " · "}
                      {part}
                    </React.Fragment>
                  ))}
              </div>
            )}
          </div>
        </div>
        <div className="sc-actions">
          <button className="sc-btn sc-btn-ghost sc-btn-sm" onClick={() => setEditing(true)}>
            {C.edit}
          </button>
          {!locked && (
            <button className="sc-btn sc-btn-ghost sc-btn-sm" onClick={handleToggleHidden} disabled={busy}>
              {cat.hidden ? C.show : C.hide}
            </button>
          )}
          {!locked && (
            <button className="sc-btn sc-btn-danger sc-btn-sm" onClick={() => setConfirmDelete(true)} disabled={busy}>
              {C.delete}
            </button>
          )}
        </div>
        {confirmDelete && (
          <ConfirmDialog
            title={C.deleteTitle(cat.label)}
            message={C.deleteMessage}
            confirmLabel={C.delete}
            tone="dusk"
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="sc-row" style={{ display: "block" }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="sc-mlabel">{C.label}</label>
          <input
            className="sc-input sc-input-sm mt-1"
            value={label}
            maxLength={CATEGORY_LABEL_MAX}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && label.trim()) handleSave();
            }}
          />
        </div>
        <div>
          <label className="sc-mlabel">{C.filedPermanent}</label>
          <input className="sc-input sc-input-sm mt-1" style={{ fontFamily: "var(--mono)" }} value={cat.slug} disabled />
        </div>
      </div>
      {/* The one thing worth explaining in place: renaming is safe precisely
          because it doesn't touch what's stored. */}
      <p className="sc-note mt-2">
        {C.renameNote}
      </p>
      <div className="mt-3">
        <label className="sc-mlabel">{C.color}</label>
        <ColorPicker kind={cat.kind} colorDark={color.colorDark} onPick={setColor} />
      </div>
      <div className="flex gap-2 pt-3">
        <button className="sc-btn sc-btn-primary sc-btn-sm" onClick={handleSave} disabled={saving || !label.trim()}>
          {saving ? C.saving : C.save}
        </button>
        <button className="sc-btn sc-btn-ghost sc-btn-sm" onClick={() => setEditing(false)} disabled={saving}>
          {C.cancel}
        </button>
      </div>
    </div>
  );
}

function BookCard({
  book,
  cats,
  atLimit,
  onCreated,
  onUpdated,
  onDeleted,
  onStatus,
  onError,
}: {
  book: Book;
  cats: TransactionCategory[];
  atLimit: boolean;
  onCreated: (c: TransactionCategory) => void;
  onUpdated: (c: TransactionCategory) => void;
  onDeleted: (id: number) => void;
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<EventTypeColor>(categoryPalette(book.kind)[0]!);

  function openNew() {
    // Pre-pick a color nobody in THIS book is using, so two new streams on the
    // same side of the ledger never land the same dot.
    setNewColor(nextCategoryColor(book.kind, cats.map(c => c.color)));
    setNewLabel("");
    setShowNew(true);
  }

  async function handleCreate() {
    const label = newLabel.trim();
    if (!label) return;
    setCreating(true);
    try {
      // No slug in the body on purpose — the server derives and de-dupes it (see
      // the note on createTransactionCategoryInput). The preview below is
      // advisory; a collision resolves server-side to "rush-2" and the row that
      // comes back is the truth.
      const created = await requestJson<TransactionCategory>("/api/treasury/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind:         book.kind,
          label,
          color:        newColor.color,
          colorDark:    newColor.colorDark,
          displayOrder: cats.length,
        }),
      });
      onCreated(created);
      setShowNew(false);
      onStatus(C.added(created.label));
    } catch (e) {
      // The server writes these for a human ("…is used by 3 transactions —
      // reassign or remove them first"); ApiError.message is the diagnostic form
      // with the URL and status glued on.
      onError(apiErrorMessage(e, C.createFailed));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="sc-stack-tight">
      <div>
        <h3 className="sc-h">{book.title}</h3>
        <p className="sc-note">{book.note}</p>
      </div>

      <div className="sc-card" style={{ display: "flex", flexDirection: "column" }}>
        {cats.length === 0 ? (
          <div className="sc-row">
            <p className="sc-note">{C.empty(book.kind)}</p>
          </div>
        ) : (
          cats.map((cat, i) => (
            <div
              key={cat.id}
              style={i < cats.length - 1 ? { borderBottom: "1px solid var(--line-soft)" } : undefined}
            >
              <CategoryRow
                cat={cat}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
                onStatus={onStatus}
                onError={onError}
              />
            </div>
          ))
        )}
      </div>

      {showNew && (
        <div
          className="rounded-xl px-4 py-4 space-y-3"
          style={{ border: "1px solid rgba(var(--vio-rgb),.35)", background: "var(--card)" }}
        >
          <h3 className="sc-h" style={{ fontSize: 14 }}>
            {C.newTitle(book.kind)[0]}{C.newTitle(book.kind)[1]}{C.newTitle(book.kind)[2]}
          </h3>
          <div>
            <label className="sc-mlabel">{C.nameReq}</label>
            <input
              className="sc-input sc-input-sm mt-1"
              value={newLabel}
              maxLength={CATEGORY_LABEL_MAX}
              placeholder={book.placeholder}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && newLabel.trim()) handleCreate();
              }}
            />
            {newLabel.trim() && (
              <p className="sc-note mt-1">
                {C.slugPreview("")[0]}<code>{previewSlug(newLabel)}</code>{C.slugPreview("")[2]}
              </p>
            )}
          </div>
          <div>
            <label className="sc-mlabel">{C.color}</label>
            <ColorPicker
              kind={book.kind}
              colorDark={newColor.colorDark}
              onPick={c => setNewColor({ ...newColor, ...c })}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              className="sc-btn sc-btn-primary sc-btn-sm"
              onClick={handleCreate}
              disabled={creating || !newLabel.trim()}
            >
              {creating ? C.creating : C.create}
            </button>
            <button className="sc-btn sc-btn-ghost sc-btn-sm" onClick={() => setShowNew(false)} disabled={creating}>
              {C.cancel}
            </button>
          </div>
        </div>
      )}

      {!showNew && !atLimit && (
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition-colors"
          style={{ border: "1px dashed var(--line)", color: "var(--muted)" }}
        >
          <span className="text-base leading-none">+</span> {book.addLabel}
        </button>
      )}
    </div>
  );
}

export function TransactionCategoriesSection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { setTransactionCategories } = useChapter();
  const [cats, setCats] = useState<TransactionCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Mirrors `cats`. Mutations read the current list from here rather than from a
  // setState updater — the updater runs during render, and touching another
  // component's state (ChapterContext) from there is a React warning.
  const catsRef = useRef<TransactionCategory[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await requestJson<TransactionCategory[]>("/api/treasury/categories");
      if (mounted.current) {
        catsRef.current = data;
        setCats(data);
      }
    } catch {
      if (mounted.current) onError(C.loadFailed);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  // Every mutation lands in local state AND in ChapterContext. Settings doesn't
  // load the transactionCategories section itself, but the treasury page does —
  // and a session that visited Treasury first won't refetch on the way back, so
  // without this the picker would still be offering a category just deleted here.
  const apply = useCallback(
    (fn: (prev: TransactionCategory[]) => TransactionCategory[]) => {
      const next = fn(catsRef.current);
      catsRef.current = next;
      setCats(next);
      setTransactionCategories(next);
    },
    [setTransactionCategories],
  );

  const onCreated = useCallback((c: TransactionCategory) => apply(prev => [...prev, c]), [apply]);
  const onUpdated = useCallback(
    (c: TransactionCategory) => apply(prev => prev.map(x => (x.id === c.id ? c : x))),
    [apply],
  );
  const onDeleted = useCallback((id: number) => apply(prev => prev.filter(x => x.id !== id)), [apply]);

  const byBook = useMemo(() => splitBooks(cats), [cats]);

  // The ceiling spans both books, so hitting it closes both adders at once.
  const atLimit = cats.length >= MAX_CATEGORIES_PER_ORG;

  if (loading) return <div className="py-8 text-center sc-note">{C.loading}</div>;

  return (
    <div className="sc-stack">
      {BOOKS.map(book => (
        <BookCard
          key={book.kind}
          book={book}
          cats={byBook[book.kind]}
          atLimit={atLimit}
          onCreated={onCreated}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
          onStatus={onStatus}
          onError={onError}
        />
      ))}

      {atLimit && (
        <p className="sc-note">
          {C.maxed[0]}{C.maxed[1]}{C.maxed[2]}
        </p>
      )}
    </div>
  );
}
