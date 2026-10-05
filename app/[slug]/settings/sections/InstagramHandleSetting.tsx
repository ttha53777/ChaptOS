"use client";

import { useEffect, useRef, useState } from "react";
import { useChapter } from "../../../context/ChapterContext";
import { useIsOrgAdmin } from "../../../hooks/useIsOrgAdmin";
import { requestJson } from "../../../lib/api";
import { useDirtyGuard } from "../SettingsDirtyContext";

export function InstagramHandleSetting({ onStatus, onError }: { onStatus: (message: string) => void; onError: (message: string) => void }) {
  const { currentUser, refreshChapterData } = useChapter();
  const admin = useIsOrgAdmin();
  const saved = currentUser?.org?.instagramHandle ?? "";
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  useEffect(() => { setDraft(saved); }, [saved, currentUser?.orgId]);
  useDirtyGuard("instagram-handle", admin && draft.trim().replace(/^@/, "") !== saved);
  if (!admin) return null;
  return <form onSubmit={async e => {
    e.preventDefault();
    if (saving.current) return;
    saving.current = true; setBusy(true);
    try {
      await requestJson("/api/orgs/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instagramHandle: draft }) });
      await refreshChapterData();
      onStatus("Instagram handle saved.");
    } catch (error) { onError(error instanceof Error ? error.message : "Couldn't save the handle. Try again."); }
    finally { saving.current = false; setBusy(false); }
  }}>
    <h3 className="sc-h">Instagram account</h3>
    <p className="sc-note" id="instagram-handle-help">The handle shown on your content calendar. Leave it blank to hide it.</p>
    <label className="mt-3 block text-sm" htmlFor="instagram-handle">Account handle</label>
    <div className="mt-2 flex flex-wrap gap-2">
      <input id="instagram-handle" className="sc-input" aria-describedby="instagram-handle-help" placeholder="@yourchapter" value={draft} onChange={e => setDraft(e.target.value)} maxLength={31} autoCapitalize="none" autoComplete="off" spellCheck={false} disabled={busy} />
      <button className="sc-btn sc-btn-accent" disabled={busy || draft.trim().replace(/^@/, "") === saved}>{busy ? "Saving…" : "Save handle"}</button>
    </div>
  </form>;
}
