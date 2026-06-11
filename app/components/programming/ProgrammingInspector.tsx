"use client";

import type { ProgrammingTask } from "../../data";
import { ProgrammingDetailPanel } from "./ProgrammingDetailPanel";

export function ProgrammingInspector({
  event,
  canManage,
  onPatch,
  onEdit,
  onDelete,
}: {
  event: ProgrammingTask;
  canManage: boolean;
  onPatch: (id: number, patch: Partial<ProgrammingTask>) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <ProgrammingDetailPanel
      event={event}
      canManage={canManage}
      onPatch={onPatch}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}
