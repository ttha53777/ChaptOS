"use client";

import { useState } from "react";

export interface Folder {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
  pinnedAt: string | null;
}

export function FolderCard({
  folder,
  count,
  canManage,
  onOpen,
  onRename,
  onDelete,
  onPin,
  onDropDoc,
  readDropId,
}: {
  folder: Folder;
  count: number;
  canManage: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onPin: () => void;
  onDropDoc: (docId: number) => void;
  readDropId: (e: React.DragEvent) => number | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pinned = folder.pinnedAt != null;

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  return (
    <button
      type="button"
      className={`dx-folder${pinned ? " pinned" : ""}`}
      onClick={onOpen}
      onDragOver={canManage ? (e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); } : undefined}
      onDragLeave={canManage ? (e) => e.currentTarget.classList.remove("drag-over") : undefined}
      onDrop={canManage ? (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("drag-over");
        const id = readDropId(e);
        if (id != null) onDropDoc(id);
      } : undefined}
    >
      {pinned && (
        <span className="dx-pin-badge" title="Pinned" aria-label="Pinned">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M14.4 3.6a1 1 0 00-1.5.1L9.6 8H6.2a1 1 0 00-.7 1.7l3.4 3.4-4.2 5.6a.6.6 0 00.9.9l5.6-4.2 3.4 3.4a1 1 0 001.7-.7v-3.4l4.3-3.3a1 1 0 00.1-1.5z" />
          </svg>
        </span>
      )}
      <div className="ic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
      </div>
      <div className="meta">
        <div className="t">{folder.name}</div>
        <div className="ct">{count === 1 ? "1 doc" : `${count} docs`}</div>
      </div>

      {canManage && (
        <>
          <span
            role="button"
            tabIndex={0}
            className="dx-menu-btn"
            aria-label="Folder actions"
            aria-expanded={menuOpen}
            onClick={(e) => { stop(e); setMenuOpen(v => !v); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setMenuOpen(v => !v); } }}
          >
            <svg fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
            </svg>
          </span>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { stop(e); setMenuOpen(false); }} />
              <div className="dx-menu">
                <button type="button" onClick={(e) => { stop(e); setMenuOpen(false); onPin(); }}>{pinned ? "Unpin" : "Pin to top"}</button>
                <button type="button" onClick={(e) => { stop(e); setMenuOpen(false); onRename(); }}>Rename</button>
                <button type="button" className="del" onClick={(e) => { stop(e); setMenuOpen(false); onDelete(); }}>Delete</button>
              </div>
            </>
          )}
        </>
      )}
    </button>
  );
}
