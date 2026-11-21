"use client";

/**
 * Rescheduling a published event from the calendar.
 *
 * A Confirmed event's date is frozen while the chapter can see it, so moving it
 * to another day means taking it off the Timeline first. This says so before
 * doing it, names both dates, and does the two as one server move — the event
 * never lands demoted on its old date.
 */

import { useState } from "react";
import { Modal } from "../dashboard/primitives";
import { btnDuskPrimaryCls } from "../dashboard/styles";
import type { ProgrammingTask } from "../../data";
import { DEMOTE } from "@/lib/programme/board";


export function EventDemoteStep({
  event,
  date,
  onCancel,
  onCommit,
}: {
  event: ProgrammingTask;
  date: string;
  onCancel: () => void;
  onCommit: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const from = DEMOTE.from(event.dueDate);

  async function commit() {
    if (saving) return;
    setSaving(true);
    try { await onCommit(); } finally { setSaving(false); }
  }

  return (
    <Modal tone="dusk" title={DEMOTE.title} onClose={onCancel} maxWidthClass="max-w-lg">
      <div className="ev-ov space-y-4">
        <p className="ev-ov-sub">
          <b>{event.title}</b>{DEMOTE.mid}<b>{from}</b>{DEMOTE.tail(date)}
        </p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="ev-ov-cancel" autoFocus>
            {DEMOTE.keep(from)}
          </button>
          <button type="button" onClick={commit} disabled={saving} className={`${btnDuskPrimaryCls} w-auto`}>
            {saving ? DEMOTE.moving : DEMOTE.go(date)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
