"use client";

import type { RoomConfirmedStatus } from "@/lib/state/programming-prep";
import { ROOM_CONFIRMED_LABELS, ROOM_CONFIRMED_PILL, ROOM_CONFIRMED_STATUSES } from "@/lib/state/programming-prep";

export function PrepStatusPill({
  value,
  onChange,
  disabled,
}: {
  value: RoomConfirmedStatus;
  onChange?: (v: RoomConfirmedStatus) => void;
  disabled?: boolean;
}) {
  const pill = ROOM_CONFIRMED_PILL[value];
  const label = ROOM_CONFIRMED_LABELS[value];

  const PILL_BASE =
    "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset";

  if (!onChange || disabled) {
    return <span className={`${PILL_BASE} ${pill.text} ${pill.bg} ${pill.ring}`}>{label}</span>;
  }

  return (
    <div className="relative inline-flex">
      <select
        value={value}
        onChange={e => onChange(e.target.value as RoomConfirmedStatus)}
        onClick={e => e.stopPropagation()}
        className={`${PILL_BASE} max-w-[130px] cursor-pointer appearance-none border-0 pr-5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${pill.text} ${pill.bg} ${pill.ring}`}
      >
        {ROOM_CONFIRMED_STATUSES.map(s => (
          <option key={s} value={s} className="bg-[#10131c] text-slate-200">{ROOM_CONFIRMED_LABELS[s]}</option>
        ))}
      </select>
      <svg className={`pointer-events-none absolute right-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 ${pill.text}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const cls: Record<string, { chip: string; dot: string }> = {
    Program:             { chip: "bg-sky-500/[0.08] text-sky-300 ring-sky-500/20",      dot: "bg-sky-400" },
    Social:              { chip: "bg-violet-500/[0.08] text-violet-300 ring-violet-500/20", dot: "bg-violet-400" },
    Fundraiser:          { chip: "bg-amber-500/[0.08] text-amber-300 ring-amber-500/20",  dot: "bg-amber-400" },
    "Community Service": { chip: "bg-teal-500/[0.08] text-teal-300 ring-teal-500/20",    dot: "bg-teal-400" },
  };
  const c = cls[type] ?? { chip: "bg-white/[0.04] text-slate-400 ring-white/10", dot: "bg-slate-500" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${c.chip}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
      {type}
    </span>
  );
}

export function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange?.(value === n ? null : n)}
          className={`text-[14px] leading-none transition-colors ${disabled ? "cursor-default" : "cursor-pointer hover:scale-110"} ${value != null && n <= value ? "text-amber-400" : "text-slate-600"}`}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
