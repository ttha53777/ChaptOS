"use client";

import { useState } from "react";
import { FieldLabel } from "../../../components/dashboard/primitives";
import { folderHue, type Folder } from "./lib";

const FOLDER_PATH = "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z";

/**
 * "File in" for the Add sheet: every folder as a small manila tab, in section
 * order and wearing its section's colour, plus Unfiled (dashed, like its
 * section) and an inline New folder that creates and selects in one go. Real
 * radio inputs underneath, so arrow keys move between tabs for free.
 */
export function FolderPicker({
  folders,
  counts,
  value,
  onChange,
  onCreate,
}: {
  /** Already in section order (pinned, then hand order, then name). */
  folders: Folder[];
  counts: Map<number, number>;
  value: number | null;
  onChange: (folderId: number | null) => void;
  /** Resolves with the new folder, or null when creation failed (the page toasts). */
  onCreate: (name: string) => Promise<Folder | null>;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const made = await onCreate(n);
    setBusy(false);
    if (!made) return;
    onChange(made.id);
    setName("");
    setNaming(false);
  }

  const dest = value == null ? null : folders.find(f => f.id === value) ?? null;
  const destCount = dest ? counts.get(dest.id) ?? 0 : 0;

  return (
    <div className="dx-fp">
      <FieldLabel tone="dusk">File in</FieldLabel>
      <div className="dx-fp-tabs" role="radiogroup" aria-label="File in">
        <label className="dx-fp-tab unfiled">
          <input type="radio" name="dx-fp" checked={value == null} onChange={() => onChange(null)} />
          <span className="nm">Unfiled</span>
        </label>
        {folders.map((f, i) => (
          <label key={f.id} className={`dx-fp-tab hue-${folderHue(i)}`} title={f.name}>
            <input type="radio" name="dx-fp" checked={value === f.id} onChange={() => onChange(f.id)} />
            <svg className="fi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d={FOLDER_PATH} />
            </svg>
            <span className="nm">{f.name}</span>
            <span className="ct">{counts.get(f.id) ?? 0}</span>
          </label>
        ))}

        {naming ? (
          <span className="dx-fp-new">
            <svg className="fi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d={FOLDER_PATH} />
            </svg>
            <input
              autoFocus
              value={name}
              maxLength={120}
              placeholder="Folder name"
              aria-label="New folder name"
              disabled={busy}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                // Enter here must create the folder, not submit the Add form.
                if (e.key === "Enter") { e.preventDefault(); create(); }
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setNaming(false); setName(""); }
              }}
            />
            <button type="button" className="ok" onClick={create} disabled={busy || !name.trim()}>
              {busy ? "…" : "Create"}
            </button>
          </span>
        ) : (
          <button type="button" className="dx-fp-add" onClick={() => setNaming(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            New folder
          </button>
        )}
      </div>
      <p className="dx-fp-lands">
        {dest
          ? <>Lands in <b>{dest.name}</b>{destCount > 0 ? <> with {destCount} other{destCount === 1 ? "" : "s"}</> : <>, its first doc</>}.</>
          : <>Lands in <b>Unfiled</b>. You can move it any time.</>}
      </p>
    </div>
  );
}
