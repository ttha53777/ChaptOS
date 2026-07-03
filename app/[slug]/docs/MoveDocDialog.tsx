"use client";

import { useState } from "react";
import type { Folder } from "./lib";
import { FolderForm } from "./FolderForm";

/**
 * A small picker for moving a doc into a folder (or back to the library root).
 * Renders inside a Modal supplied by the page.
 */
export function MoveDocDialog({
  folders,
  currentFolderId,
  onMove,
  onCreateFolder,
  submitting,
  onClose,
}: {
  folders: Folder[];
  currentFolderId: number | null;
  onMove: (folderId: number | null) => void;
  onCreateFolder: (name: string) => void;
  submitting: boolean;
  onClose: () => void;
}) {
  const [creating, setCreating] = useState(false);
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
          <li className="dx-move-empty">No folders yet — create one below.</li>
        )}
      </ul>

      {/* Create a new folder and move this doc into it in one step. */}
      {creating ? (
        <div className="dx-move-new">
          <FolderForm
            initial=""
            submitLabel={submitting ? "Creating…" : "Create & move"}
            onSubmit={(name) => onCreateFolder(name)}
            onClose={() => setCreating(false)}
          />
        </div>
      ) : (
        <button type="button" className="dx-move-newbtn" onClick={() => setCreating(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          New folder
        </button>
      )}

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
