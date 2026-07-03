"use client";

import { useMemo } from "react";
import type { SheetSection } from "../grid/SheetGrid";
import { SheetGrid } from "../grid/SheetGrid";
import { programmingTableColumns } from "./programmingTableColumns";
import type { ProgrammingTask } from "../../data";
import type { Doc } from "../../[slug]/docs/lib";

const NO_DATE_KEY = "zzzz-no-date"; // sorts after every "YYYY-MM" key

function monthLabel(key: string): string {
  if (key === NO_DATE_KEY) return "No date";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function ProgrammingTable({
  tasks,
  docs,
  selectedId,
  canManage,
  onSelect,
  onPatch,
}: {
  tasks: ProgrammingTask[];
  docs: Doc[];
  selectedId: number | null;
  canManage: boolean;
  onSelect: (id: number) => void;
  onPatch: (id: number, patch: Record<string, unknown>) => void;
}) {
  // Resolve a row's attachment to an openable URL: raw URL wins, else the
  // picked doc's URL (looked up by id). null when the doc isn't in the list.
  const resolveAttachmentUrl = useMemo(() => {
    const byId = new Map(docs.map(d => [d.id, d.url]));
    return (task: ProgrammingTask): string | null =>
      task.attachmentUrl?.trim() ||
      (task.attachmentDocId != null ? byId.get(task.attachmentDocId) ?? null : null);
  }, [docs]);

  const columns = useMemo(
    () => programmingTableColumns({ onPatch, onSelect, resolveAttachmentUrl }),
    [onPatch, onSelect, resolveAttachmentUrl],
  );

  const sections = useMemo<SheetSection<ProgrammingTask>[]>(() => {
    const byMonth = new Map<string, ProgrammingTask[]>();
    for (const t of tasks) {
      const key = t.dueDate ? t.dueDate.slice(0, 7) : NO_DATE_KEY;
      const bucket = byMonth.get(key);
      if (bucket) bucket.push(t);
      else byMonth.set(key, [t]);
    }
    return [...byMonth.keys()].sort().map(key => ({
      key,
      label: monthLabel(key),
      rows: byMonth.get(key)!.sort((a, b) =>
        (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || a.title.localeCompare(b.title),
      ),
    }));
  }, [tasks]);

  return (
    <SheetGrid
      title="Programming"
      badge={`${tasks.length} event${tasks.length === 1 ? "" : "s"}`}
      columns={columns}
      sections={sections}
      canManage={canManage}
      selectedId={selectedId}
      minWidthClass="min-w-[1280px]"
      emptyLabel="No events yet."
      onSelectRow={onSelect}
    />
  );
}
