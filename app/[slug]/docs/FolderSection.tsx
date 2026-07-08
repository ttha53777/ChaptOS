"use client";

import type { ReactNode } from "react";
import { DocMenu } from "./DocMenu";
import type { Folder } from "./lib";

/**
 * A collapsible ledger section — one per folder, plus "Unfiled" (folder=null)
 * for root docs. The header is the drag-drop target for moving docs here, and
 * under Manual sort (reorderable) it's also a folder drag handle + a drop target
 * for reordering sections. While a search or kind filter is active (forceOpen)
 * every section is held open so matches show through, without touching the
 * persisted fold state.
 */
export function FolderSection({
  name,
  folder,
  totalCount,
  visibleCount,
  collapsed,
  forceOpen,
  queryActive,
  canManage,
  reorderable,
  onToggle,
  onGhostAdd,
  onDropDoc,
  onDropDocAtEnd,
  onDragOverEnd,
  onReorderFolderBefore,
  readDropId,
  readFolderDropId,
  onRename,
  onDelete,
  onPin,
  children,
}: {
  name: string;
  folder: Folder | null;
  totalCount: number;
  visibleCount: number;
  collapsed: boolean;
  forceOpen: boolean;
  queryActive: boolean;
  canManage: boolean;
  reorderable: boolean;
  onToggle: () => void;
  onGhostAdd: (folderId: number) => void;
  onDropDoc: (docId: number) => void;
  onDropDocAtEnd: (docId: number) => void;
  /** Fires while a doc drag hovers the end zone — previews it landing last. */
  onDragOverEnd?: () => void;
  onReorderFolderBefore: (draggedFolderId: number) => void;
  readDropId: (e: React.DragEvent) => number | null;
  readFolderDropId: (e: React.DragEvent) => number | null;
  onRename: () => void;
  onDelete: () => void;
  onPin: () => void;
  children: ReactNode;
}) {
  const pinned = folder?.pinnedAt != null;
  const open = forceOpen || !collapsed;
  // Only real folders reorder (Unfiled is a virtual, always-last section).
  const folderDraggable = reorderable && folder != null;

  // The header handles two drop kinds: a folder id → reorder this section; a doc
  // id → move that doc into this folder. Folder wins when present.
  function handleHeadDrop(e: React.DragEvent) {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over", "drag-over-folder");
    const fid = readFolderDropId(e);
    // A folder drag → reorder this section. Ignore a folder dropped on itself.
    if (fid != null) { if (folder && fid !== folder.id) onReorderFolderBefore(fid); return; }
    const id = readDropId(e);
    if (id != null) onDropDoc(id);
  }

  return (
    <section className={`dx-section${open ? "" : " closed"}`}>
      {/* Not a <button>: the folder menu renders nested <button>s, which is
          invalid inside a real button and breaks hydration. */}
      <div
        role="button"
        tabIndex={0}
        className={`dx-sec-head${folderDraggable ? " draggable" : ""}`}
        aria-expanded={open}
        draggable={folderDraggable}
        onDragStart={folderDraggable ? (e) => {
          e.dataTransfer.clearData();
          e.dataTransfer.setData("application/x-folder-id", String(folder!.id));
          e.dataTransfer.effectAllowed = "move";
        } : undefined}
        onClick={() => { if (!forceOpen) onToggle(); }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !forceOpen) { e.preventDefault(); onToggle(); }
        }}
        onDragOver={canManage ? (e) => {
          e.preventDefault();
          // A folder drag cues a section reorder; a doc drag cues a move-into.
          const folderDrag = e.dataTransfer.types.includes("application/x-folder-id");
          e.currentTarget.classList.add(folderDrag ? "drag-over-folder" : "drag-over");
        } : undefined}
        onDragLeave={canManage ? (e) => e.currentTarget.classList.remove("drag-over", "drag-over-folder") : undefined}
        onDrop={canManage ? handleHeadDrop : undefined}
      >
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        <span className="name">{name}</span>
        <span className="ct">{totalCount === 1 ? "1 doc" : `${totalCount} docs`}</span>
        {pinned && (
          <span className="pin" title="Pinned" aria-label="Pinned">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 17v5M9 3h6l-.75 6.5L18 12H6l3.75-2.5z" />
            </svg>
          </span>
        )}
        <span className="rule" />
        {!forceOpen && <span className="fold-hint">{collapsed ? "Expand" : "Collapse"}</span>}
        {canManage && folder && (
          <DocMenu
            label="Folder actions"
            items={[
              { label: pinned ? "Unpin" : "Pin to top", onClick: onPin },
              { label: "Rename", onClick: onRename },
              { label: "Delete", onClick: onDelete, danger: true },
            ]}
          />
        )}
      </div>

      {open && (
        <div className="dx-ledger">
          {visibleCount === 0 && queryActive && (
            <p className="dx-none-match">
              {folder ? <>Nothing in {folder.name} matches this filter.</> : <>Nothing unfiled matches this filter.</>}
            </p>
          )}
          {visibleCount === 0 && !queryActive && !(canManage && folder) && (
            <p className="dx-none-match">Nothing filed here yet.</p>
          )}
          {children}
          {reorderable && visibleCount > 0 && (
            // Drop below the last row to file a doc at the end of this section.
            <div
              className="dx-drop-end"
              aria-hidden
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("application/x-folder-id")) {
                  e.preventDefault();
                  e.currentTarget.classList.add("over");
                  onDragOverEnd?.();
                }
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove("over")}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("over");
                const id = readDropId(e);
                if (id != null) onDropDocAtEnd(id);
              }}
            />
          )}
          {canManage && folder && (
            <div
              role="button"
              tabIndex={0}
              className="dx-row ghost-add"
              onClick={() => onGhostAdd(folder.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGhostAdd(folder.id); }
              }}
            >
              <div className="fav">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <div className="what"><span className="t">Add to{" "}{folder.name}…</span></div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
