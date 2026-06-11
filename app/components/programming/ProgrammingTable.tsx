"use client";

import { useMemo } from "react";
import type { SheetSection } from "../grid/SheetGrid";
import { SheetGrid } from "../grid/SheetGrid";
import { programmingTableColumns } from "./programmingTableColumns";
import type { ProgrammingTask } from "../../data";

const NO_DATE_KEY = "zzzz-no-date"; // sorts after every "YYYY-MM" key

function monthLabel(key: string): string {
  if (key === NO_DATE_KEY) return "No date";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function ProgrammingTable({
  tasks,
  selectedId,
  canManage,
  onSelect,
  onPatch,
}: {
  tasks: ProgrammingTask[];
  selectedId: number | null;
  canManage: boolean;
  onSelect: (id: number) => void;
  onPatch: (id: number, patch: Record<string, unknown>) => void;
}) {
  const columns = useMemo(() => programmingTableColumns({ onPatch, onSelect }), [onPatch, onSelect]);

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
