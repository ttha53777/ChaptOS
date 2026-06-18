"use client";

import { useState } from "react";
import type { ProgrammingChecklistItem } from "../../data";
import { requestJson } from "../../lib/api";

export function ProgrammingChecklist({
  eventId,
  items,
  canManage,
  onChange,
}: {
  eventId: number;
  items: ProgrammingChecklistItem[];
  canManage: boolean;
  onChange: (items: ProgrammingChecklistItem[]) => void;
}) {
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const done = items.filter(i => i.done).length;

  async function toggle(item: ProgrammingChecklistItem) {
    if (!canManage) return;
    const next = items.map(i => i.id === item.id ? { ...i, done: !i.done } : i);
    onChange(next);
    try {
      await requestJson(`/api/programming/${eventId}/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !item.done }),
      });
    } catch {
      onChange(items); // revert
    }
  }

  async function add() {
    const label = adding.trim();
    if (!label || busy) return;
    setBusy(true);
    try {
      const created = await requestJson<ProgrammingChecklistItem>(`/api/programming/${eventId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      onChange([...items, created]);
      setAdding("");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ProgrammingChecklistItem) {
    onChange(items.filter(i => i.id !== item.id));
    try {
      await requestJson(`/api/programming/${eventId}/checklist/${item.id}`, { method: "DELETE" });
    } catch {
      onChange(items); // revert
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6354]">Checklist</h3>
        {items.length > 0 && (
          <span className="text-[10px] tabular-nums text-[#6b6354]">{done}/{items.length}</span>
        )}
      </div>
      {items.length === 0 && !canManage && (
        <p className="text-[12px] text-[#6b6354]">No tasks yet.</p>
      )}
      <ul className="space-y-1.5">
        {items.map(item => (
          <li key={item.id} className="group flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.done}
              disabled={!canManage}
              onChange={() => toggle(item)}
              className="h-4 w-4 rounded accent-[#a78bfa]"
            />
            <span className={`flex-1 text-[12px] ${item.done ? "text-[#6b6354] line-through" : "text-[#c9c2b4]"}`}>
              {item.label}
            </span>
            {canManage && (
              <button
                onClick={() => remove(item)}
                className="text-[11px] text-[#6b6354] opacity-0 transition-opacity hover:text-[#d98ba3] group-hover:opacity-100"
                aria-label="Remove task"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="flex items-center gap-2">
          <input
            value={adding}
            onChange={e => setAdding(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") add(); }}
            placeholder="Add a task…"
            className="h-7 flex-1 rounded-md border border-[rgba(236,231,221,0.08)] bg-[rgba(236,231,221,0.02)] px-2 text-[12px] text-[#c9c2b4] placeholder:text-[#6b6354] focus:border-[#a78bfa]/40 focus:outline-none"
          />
          <button
            onClick={add}
            disabled={!adding.trim() || busy}
            className="rounded-md bg-[#a78bfa]/15 px-2.5 py-1 text-[11px] font-semibold text-[#c4b5fd] disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </section>
  );
}
