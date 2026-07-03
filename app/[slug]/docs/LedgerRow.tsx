"use client";

import { useState } from "react";
import { DocMenu, docMenuItems } from "./DocMenu";
import { KIND_ICON, KIND_LABEL, fmtDate, hostOf, kindOf, type Doc } from "./lib";

/** One reference in a folder's ledger: icon tile, title + description, host,
 *  kind, added date, and hover-revealed open arrow + actions menu. */
export function LedgerRow({
  doc,
  canManage,
  onEdit,
  onDelete,
  onMove,
  onCopy,
  onRefresh,
  onPin,
}: {
  doc: Doc;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
  onCopy: () => void;
  onRefresh: () => void;
  onPin: () => void;
}) {
  const [favFailed, setFavFailed] = useState(false);
  const kind = kindOf(doc.url);
  const showFavicon = doc.faviconUrl && !favFailed;

  // Admins can drag a row onto a section header to move it. The root is an
  // <a>, which the browser drags as a URL link by default — so we overwrite
  // the payload with our doc id and let the drop targets read that.
  function handleDragStart(e: React.DragEvent) {
    if (!canManage) return;
    e.dataTransfer.clearData();
    e.dataTransfer.setData("application/x-doc-id", String(doc.id));
    e.dataTransfer.setData("text/plain", String(doc.id));
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <a
      href={doc.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`dx-row k-${kind}`}
      style={{ ["--kc" as string]: `var(--k-${kind})` }}
      draggable={canManage}
      onDragStart={handleDragStart}
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
    </a>
  );
}
