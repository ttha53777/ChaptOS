"use client";

import { useMemo } from "react";
import type { ProgrammingTask } from "../../data";
import { SheetGrid } from "../grid/SheetGrid";
import { programmingColumns } from "./programmingColumns";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type ApiPatch = Record<string, unknown>;

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function ProgrammingMatrix({
  monthGroups,
  selectedId,
  canManage,
  onSelect,
  onPatch,
  onDocs,
}: {
  monthGroups: [string, ProgrammingTask[]][];
  selectedId: number | null;
  canManage: boolean;
  onSelect: (id: number) => void;
  onPatch: (id: number, patch: ApiPatch) => Promise<void>;
  onDocs: (id: number) => void;
}) {
  const columns = useMemo(() => programmingColumns({ onPatch, onDocs }), [onPatch, onDocs]);
  const sections = useMemo(
    () => monthGroups.map(([key, rows]) => ({ key, label: monthLabel(key), rows })),
    [monthGroups],
  );

  return (
    <SheetGrid
      title="Programming Matrix"
      badge="editable grid"
      columns={columns}
      sections={sections}
      canManage={canManage}
      selectedId={selectedId}
      minWidthClass="min-w-[760px]"
      emptyLabel="No events yet."
      onSelectRow={onSelect}
    />
  );
}
