import React from "react";
import { QuickActionsMenu, type QuickActionKey } from "../QuickActionsMenu";

/**
 * The dashboard's primary action bar, in the warm "Chapter Ledger" (dusk) idiom.
 *
 * These controls used to live in the page's frosted top toolbar (the cold-slate
 * <header> in app/[slug]/page.tsx). With the toolbar removed at md+, they fold
 * into the briefing so the serif greeting becomes the page's command center:
 * "who you are → what's happening → what you can do" reads as one masthead block.
 *
 * Reusable across the topbar-less pages (Timeline / Chapter / Brothers coming
 * later): every control is optional. Pass only the handlers a given page needs —
 * omitted ones render nothing. Styling is scoped under `.dash` in
 * dashboard-ledger.css (`.brief-actions`, `.ba-chip`, `.ba-search`).
 */
export function BriefingActions({
  onMyStanding,
  onLogAttendance,
  onQuickAction,
  quickActionsAdmin,
  quickActionsCanManageTasks,
  enabledWorkflows,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  onExport,
}: {
  /** Opens the viewer's own Brother drawer. Omit when there's no self record. */
  onMyStanding?: () => void;
  /** Opens the attendance-logging flow (primary action). Omit to hide. */
  onLogAttendance?: () => void;
  /** Quick Actions menu select handler. Omit (with quickActionsAdmin) to hide. */
  onQuickAction?: (key: QuickActionKey) => void;
  /** Passed to QuickActionsMenu's `isAdmin` to gate admin-only entries. */
  quickActionsAdmin?: boolean;
  /** Passed to QuickActionsMenu's `canManageTasks` to gate "Add Deadline". */
  quickActionsCanManageTasks?: boolean;
  /** Org workflows — hides workflow-gated quick actions (e.g. finance). */
  enabledWorkflows?: readonly string[];
  /** Controlled search value. Omit (with onSearchChange) to hide the field. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Export/print handler. Omit to hide the Export chip. */
  onExport?: () => void;
}) {
  const hasSearch = search !== undefined && onSearchChange !== undefined;

  return (
    <div className="brief-actions">
      {onMyStanding && (
        <button type="button" className="ba-chip" onClick={onMyStanding}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          My Standing
        </button>
      )}

      {onLogAttendance && (
        <button type="button" className="ba-chip primary" onClick={onLogAttendance}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          Log Attendance
        </button>
      )}

      {onQuickAction && (
        <QuickActionsMenu
          isAdmin={!!quickActionsAdmin}
          canManageTasks={!!quickActionsCanManageTasks}
          onSelect={onQuickAction}
          variant="ledger"
          enabledWorkflows={enabledWorkflows}
        />
      )}

      {(hasSearch || onExport) && <span className="ba-sep" aria-hidden="true" />}

      {hasSearch && (
        <div className="ba-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => onSearchChange!(e.target.value)}
          />
        </div>
      )}

      {onExport && (
        <button type="button" className="ba-chip" onClick={onExport}>
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M11.5 4.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM4.25 8.5a3.25 3.25 0 0 0-3.25 3.25v.5A1.75 1.75 0 0 0 2.75 14h10.5A1.75 1.75 0 0 0 15 12.25v-.5A3.25 3.25 0 0 0 11.75 8.5h-7.5Z" clipRule="evenodd" />
          </svg>
          Export
        </button>
      )}
    </div>
  );
}
