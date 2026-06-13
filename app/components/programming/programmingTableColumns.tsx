"use client";

import type { SheetColumn } from "../grid/SheetGrid";
import { SheetCheckboxCell, SheetTextCell } from "../grid/SheetGrid";
import { PrepStatusPill, StarRating, TYPE_DOT } from "./PrepStatusPill";
import type { ProgrammingTask } from "../../data";
import { fmtDate } from "../../data";

/**
 * Column config for the Programming table view — one row per event, ops fields
 * inline-editable. Month grouping is handled by ProgrammingTable as sections,
 * so there is no Month column here.
 */
export function programmingTableColumns({
  onPatch,
  onSelect,
  resolveAttachmentUrl,
}: {
  onPatch: (id: number, patch: Record<string, unknown>) => void;
  onSelect: (id: number) => void;
  resolveAttachmentUrl: (task: ProgrammingTask) => string | null;
}): SheetColumn<ProgrammingTask>[] {
  return [
    {
      key: "event",
      label: "Event",
      kind: "text",
      width: "w-56",
      accent: true,
      summary: rows => `${rows.length} event${rows.length === 1 ? "" : "s"}`,
      render: (e, canManage) => (
        <span className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[e.type] ?? "bg-slate-500"}`} />
          <SheetTextCell
            value={e.title}
            canManage={canManage}
            required
            onCommit={next => onPatch(e.id, { title: next })}
          />
        </span>
      ),
    },
    {
      key: "date",
      label: "Date",
      kind: "date",
      width: "w-36",
      render: (e, canManage) => (
        <SheetTextCell
          type="date"
          value={e.dueDate ?? ""}
          display={e.dueDate ? fmtDate(e.dueDate) : "—"}
          canManage={canManage}
          // Promoted events have a calendar entry; their date can change but not clear.
          required={!!e.dueDate}
          onCommit={next => onPatch(e.id, { dueDate: next || null })}
        />
      ),
    },
    {
      key: "time",
      label: "Time",
      kind: "time",
      width: "w-28",
      render: (e, canManage) => (
        <SheetTextCell
          value={e.time ?? ""}
          canManage={canManage}
          placeholder="7:00 PM"
          onCommit={next => onPatch(e.id, { time: next || null })}
        />
      ),
    },
    {
      key: "location",
      label: "Location",
      kind: "text",
      width: "w-44",
      render: (e, canManage) => (
        <SheetTextCell
          value={e.location}
          canManage={canManage}
          onCommit={next => onPatch(e.id, { location: next })}
        />
      ),
    },
    {
      key: "room",
      label: "Room Confirmed?",
      kind: "select",
      width: "w-40",
      render: (e, canManage) => (
        <PrepStatusPill
          value={e.roomStatus}
          onChange={v => onPatch(e.id, { roomStatus: v })}
          disabled={!canManage}
        />
      ),
    },
    {
      key: "attachment",
      label: "Attachment",
      kind: "link",
      width: "w-24",
      align: "center",
      render: e => {
        const hasAttachment = Boolean(e.attachmentUrl || e.attachmentDocId);
        const url = resolveAttachmentUrl(e);
        const icon = (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        );
        const cls = `inline-flex items-center justify-center rounded-md p-1 transition-colors ${
          hasAttachment ? "text-indigo-400 hover:text-indigo-300" : "text-slate-700 hover:text-slate-500"
        }`;
        // Open the attachment directly when we can resolve a URL; otherwise
        // (no attachment, or doc list not loaded yet) fall back to the panel.
        if (url) {
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={ev => ev.stopPropagation()}
              title="Open attachment"
              className={cls}
            >
              {icon}
            </a>
          );
        }
        return (
          <button
            onClick={ev => {
              ev.stopPropagation();
              onSelect(e.id);
            }}
            title={hasAttachment ? "View attachment" : "No attachment"}
            className={cls}
          >
            {icon}
          </button>
        );
      },
    },
    {
      key: "collab",
      label: "Collab?",
      kind: "text",
      width: "w-36",
      render: (e, canManage) => (
        <SheetTextCell
          value={e.collab ?? ""}
          canManage={canManage}
          onCommit={next => onPatch(e.id, { collab: next || null })}
        />
      ),
    },
    {
      key: "spending",
      label: "Spending",
      kind: "currency",
      width: "w-28",
      summary: rows => `$${(rows.reduce((sum, r) => sum + r.spendingCents, 0) / 100).toFixed(2)}`,
      render: (e, canManage) => (
        <SheetTextCell
          type="number"
          value={(e.spendingCents / 100).toFixed(2)}
          display={`$${(e.spendingCents / 100).toFixed(2)}`}
          canManage={canManage}
          onCommit={next => {
            const dollars = parseFloat(next);
            if (!Number.isFinite(dollars) || dollars < 0) return;
            onPatch(e.id, { spendingCents: Math.round(dollars * 100) });
          }}
        />
      ),
    },
    {
      key: "flyer",
      label: "Flyer Posted?",
      kind: "checkbox",
      width: "w-24",
      align: "center",
      render: (e, canManage) => (
        <SheetCheckboxCell
          checked={e.flyerPosted}
          canManage={canManage}
          onChange={next => onPatch(e.id, { flyerPosted: next })}
        />
      ),
    },
    {
      key: "success",
      label: "Event Success",
      kind: "rating",
      width: "w-32",
      summary: rows => {
        const rated = rows.filter(r => r.successRating != null);
        if (rated.length === 0) return null;
        const avg = rated.reduce((sum, r) => sum + (r.successRating ?? 0), 0) / rated.length;
        return `★ ${avg.toFixed(1)} avg`;
      },
      render: (e, canManage) => (
        <StarRating
          value={e.successRating}
          onChange={v => onPatch(e.id, { successRating: v })}
          disabled={!canManage}
        />
      ),
    },
  ];
}
