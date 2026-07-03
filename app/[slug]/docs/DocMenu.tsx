"use client";

import { useState } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/** The doc menu item list shared by shelf cards and ledger rows — Copy link is
 *  available to everyone; the rest are admin-only (gated by canManage). */
export function docMenuItems(opts: {
  pinned: boolean;
  canManage: boolean;
  onCopy: () => void;
  onPin: () => void;
  onEdit: () => void;
  onMove: () => void;
  onRefresh: () => void;
  onDelete: () => void;
}): MenuItem[] {
  const items: MenuItem[] = [{ label: "Copy link", onClick: opts.onCopy }];
  if (opts.canManage) {
    items.push(
      { label: opts.pinned ? "Unpin" : "Pin to top", onClick: opts.onPin },
      { label: "Edit", onClick: opts.onEdit },
      { label: "Move to folder…", onClick: opts.onMove },
      { label: "Refresh preview", onClick: opts.onRefresh },
      { label: "Delete", onClick: opts.onDelete, danger: true },
    );
  }
  return items;
}

/**
 * Three-dot actions trigger + popup. Lives inside an <a> row/card or the
 * section header (a div role="button"), so every click stops propagation and
 * prevents default — the wrapper must never navigate or toggle.
 */
export function DocMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  return (
    <>
      <button
        type="button"
        className="dx-menu-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => { stop(e); setOpen(v => !v); }}
      >
        <svg fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { stop(e); setOpen(false); }} />
          <div className="dx-menu">
            {items.map(item => (
              <button
                key={item.label}
                type="button"
                className={item.danger ? "del" : undefined}
                onClick={(e) => { stop(e); setOpen(false); item.onClick(); }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
