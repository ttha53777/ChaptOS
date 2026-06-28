"use client";

import type { Folder } from "./FolderCard";

/**
 * A small picker for moving a doc into a folder (or back to the library root).
 * Renders inside a Modal supplied by the page.
 */
export function MoveDocDialog({
  folders,
  currentFolderId,
  onMove,
  onClose,
}: {
  folders: Folder[];
  currentFolderId: number | null;
  onMove: (folderId: number | null) => void;
  onClose: () => void;
}) {
  const sorted = [...folders].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="dx-move">
      <ul className="dx-move-list">
        <li>
          <button
            type="button"
            className={currentFolderId === null ? "on" : ""}
            onClick={() => onMove(null)}
          >
            <span className="ic" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10h14V10" />
              </svg>
            </span>
            Library (root)
            {currentFolderId === null && <span className="here">Here</span>}
          </button>
        </li>
        {sorted.map(f => (
          <li key={f.id}>
            <button
              type="button"
              className={currentFolderId === f.id ? "on" : ""}
              onClick={() => onMove(f.id)}
            >
              <span className="ic" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
              </span>
              {f.name}
              {currentFolderId === f.id && <span className="here">Here</span>}
            </button>
          </li>
        ))}
        {sorted.length === 0 && (
          <li className="dx-move-empty">No folders yet — create one first.</li>
        )}
      </ul>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[rgba(236,231,221,0.12)] bg-[#161310] px-4 py-1.5 text-[13px] text-[#c9c2b4] transition-colors hover:border-[rgba(236,231,221,0.22)] hover:text-[#ece7dd]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
