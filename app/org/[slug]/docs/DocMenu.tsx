"use client";

import { useState } from "react";
import { docMenu, type DocAction } from "@/lib/docs/library";

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
  const run: Record<DocAction, () => void> = {
    copy: opts.onCopy, pin: opts.onPin, edit: opts.onEdit, move: opts.onMove, refresh: opts.onRefresh, delete: opts.onDelete,
  };
  return docMenu(opts.pinned, opts.canManage).map(i => ({ label: i.label, onClick: run[i.id], danger: i.danger }));
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
