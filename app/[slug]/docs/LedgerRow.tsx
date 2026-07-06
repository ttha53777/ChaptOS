"use client";

import { useState } from "react";
import { DocMenu, docMenuItems } from "./DocMenu";
import { KIND_ICON, KIND_LABEL, fmtDate, hostOf, kindOf, type Doc } from "./lib";

/** One reference in a folder's ledger: icon tile, title + description, host,
 *  kind, added date, and hover-revealed open arrow + actions menu.
 *
 *  When `reorderable` (admin + Manual sort) the row is also a reorder drop
 *  target: hovering its top half shows a drop-line and dropping a dragged doc
 *  files it just before this one. Cross-folder drops still go through the
 *  section header (a move, not a reorder). */
export function LedgerRow({
  doc,
  canManage,
  reorderable,
  readDropId,
  onReorderBefore,
  onEdit,
  onDelete,
  onMove,
  onCopy,
  onRefresh,
  onPin,
}: {
  doc: Doc;
  canManage: boolean;
  reorderable: boolean;
  readDropId: (e: React.DragEvent) => number | null;
  onReorderBefore: (draggedId: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
  onCopy: () => void;
  onRefresh: () => void;
  onPin: () => void;
}) {
  const [favFailed, setFavFailed] = useState(false);
  const [dropCue, setDropCue] = useState(false);
  const kind = kindOf(doc.url);
  const showFavicon = doc.faviconUrl && !favFailed;

  // The row opens the doc in a new tab on click. It is NOT an <a href>: a
  // draggable anchor with an href makes the browser start a native *link* drag
  // (dragging the URL), which hijacks the HTML5 drag gesture so our drop targets
  // never receive the doc-id payload — reorder/move silently no-op. The folder
  // header (which drags fine) is a plain div for the same reason, so the row
  // follows suit: a div that navigates on click / Enter.
  // DocMenu stops propagation on all its buttons/overlay, so this only fires for
  // clicks on the row body itself.
  function openDoc() {
    window.open(doc.url, "_blank", "noopener,noreferrer");
  }

  // Admins can drag a row onto a section header (move) or another row (reorder).
  function handleDragStart(e: React.DragEvent) {
    if (!canManage) return;
    e.dataTransfer.clearData();
    e.dataTransfer.setData("application/x-doc-id", String(doc.id));
    e.dataTransfer.setData("text/plain", String(doc.id));
    e.dataTransfer.effectAllowed = "move";
  }

  // Reorder drop target (Manual sort only). preventDefault marks us a valid drop
  // and shows the line; on drop we ask the parent to file the dragged doc before
  // this row. A no-op guard (dragging onto itself) lives in the parent handler.
  const reorderHandlers = reorderable ? {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDropCue(true); },
    onDragLeave: () => setDropCue(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation(); // don't also bubble to the section header (a move)
      setDropCue(false);
      const id = readDropId(e);
      if (id != null && id !== doc.id) onReorderBefore(id);
    },
  } : {};

  return (
    <div
      role="link"
      tabIndex={0}
      title={doc.url}
      className={`dx-row k-${kind}${dropCue ? " drop-before" : ""}`}
      style={{ ["--kc" as string]: `var(--k-${kind})` }}
      draggable={canManage}
      onDragStart={handleDragStart}
      onClick={openDoc}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDoc(); }
      }}
      {...reorderHandlers}
    >
      <div className="fav">
        {showFavicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doc.faviconUrl!} alt="" onError={() => setFavFailed(true)} />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>{KIND_ICON[kind]}</svg>
        )}
      </div>
      <div className="what">
        <span className="t">{doc.title}</span>
        <span className={`d${doc.description ? "" : " none"}`}>
          {doc.description || "No description yet."}
        </span>
      </div>
      <span className="host">{hostOf(doc.url)}</span>
      <span className="kind">{KIND_LABEL[kind]}</span>
      <span className="added" title={doc.createdByName ? `Added by ${doc.createdByName}` : undefined}>
        {fmtDate(doc.createdAt)}
      </span>
      <span className="open" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </span>
      <DocMenu
        label="Doc actions"
        items={docMenuItems({ pinned: false, canManage, onCopy, onPin, onEdit, onMove, onRefresh, onDelete })}
      />
    </div>
  );
}
