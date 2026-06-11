"use client";

import type { ProgrammingTask } from "../../data";
import type { ProgrammingStage } from "@/lib/state/programming-stage";
import { ProgrammingDetailPanel } from "./ProgrammingDetailPanel";

export function ProgrammingInspector({
  event,
  canManage,
  onPatch,
  onStage,
  onEdit,
  onDelete,
}: {
  event: ProgrammingTask;
  canManage: boolean;
  onPatch: (id: number, patch: Partial<ProgrammingTask>) => Promise<void>;
  onStage?: (id: number, stage: ProgrammingStage) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <ProgrammingDetailPanel
      event={event}
      canManage={canManage}
      onPatch={onPatch}
      onStage={onStage}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}
