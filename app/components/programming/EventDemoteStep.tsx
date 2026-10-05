"use client";

/**
 * Rescheduling a published event from the calendar.
 *
 * A Confirmed event's date is frozen while the chapter can see it, so moving it
 * to another day means taking it off the Timeline first. This says so before
 * doing it, names both dates, and does the two as one server move — the event
 * never lands demoted on its old date.
 *
 * Paper only: the Ledger look offers the same move from a toast.
 */

import { useState } from "react";
import { Modal } from "../dashboard/primitives";
import { btnDuskPrimaryCls } from "../dashboard/styles";
import type { ProgrammingTask } from "../../data";
import { fmtDate } from "../../data";

const WEEKDAY = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

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
  const from = event.dueDate ? fmtDate(event.dueDate) : "its date";

  async function commit() {
    if (saving) return;
    setSaving(true);
    try { await onCommit(); } finally { setSaving(false); }
  }

  return (
    <Modal tone="dusk" title="Move it off the Timeline?" onClose={onCancel} maxWidthClass="max-w-lg">
      <div className="ev-ov space-y-4">
        <p className="ev-ov-sub">
          <b>{event.title}</b>{" "}is on the chapter&apos;s timeline for <b>{from}</b>.{" "}
          Moving it to {WEEKDAY(date)}, {fmtDate(date)} takes it back to Planning first —
          confirm it again once the new date&apos;s right.
        </p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="ev-ov-cancel" autoFocus>
            Keep {from}
          </button>
          <button type="button" onClick={commit} disabled={saving} className={`${btnDuskPrimaryCls} w-auto`}>
            {saving ? "Moving…" : `Move to Planning · ${fmtDate(date)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
