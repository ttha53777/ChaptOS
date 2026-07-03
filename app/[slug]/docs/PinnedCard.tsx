"use client";

import { useState } from "react";
import { DocMenu, docMenuItems } from "./DocMenu";
import { KIND_ICON, hostOf, kindOf, type Doc } from "./lib";

/**
 * A violet-edged card on the pinned shelf. Pinned docs live here exclusively —
 * their folder's ledger doesn't repeat them — so this card carries the full
 * actions menu. Deliberately not draggable: dragging a shelf card onto a
 * folder would change membership with no visible effect; Move stays in the menu.
 */
export function PinnedCard({
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

  return (
    <a
      href={doc.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`dx-pinned-card k-${kind}`}
      style={{ ["--kc" as string]: `var(--k-${kind})` }}
    >
      <span className="pin" title="Pinned" aria-label="Pinned">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 17v5M9 3h6l-.75 6.5L18 12H6l3.75-2.5z" />
        </svg>
      </span>
      <div className="top">
        <div className="fav">
          {showFavicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={doc.faviconUrl!} alt="" onError={() => setFavFailed(true)} />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>{KIND_ICON[kind]}</svg>
          )}
        </div>
        <div className="meta">
          <div className="t">{doc.title}</div>
          <div className="h">{hostOf(doc.url)}</div>
        </div>
      </div>
      <p className={`note${doc.description ? "" : " none"}`}>
        {doc.description || "No description yet."}
      </p>
      <DocMenu
        label="Doc actions"
        items={docMenuItems({ pinned: true, canManage, onCopy, onPin, onEdit, onMove, onRefresh, onDelete })}
      />
    </a>
  );
}
