"use client";

import React, { useState } from "react";
import type { CalendarEvent, CalEventCategory } from "../../data";
import { FieldLabel } from "../dashboard/primitives";
import { inputCls } from "../dashboard/styles";
import { toDateStr } from "../../lib/dates";

export type CalendarDraft = Omit<CalendarEvent, "id">;

export const CATEGORY_OPTIONS: { id: CalEventCategory; label: string }[] = [
  { id: "chapter", label: "Chapter" },
  { id: "social", label: "Social" },
  { id: "fundy", label: "Fundraiser" },
  { id: "program", label: "Program" },
  { id: "party", label: "Party" },
  { id: "deadline", label: "Deadline" },
  { id: "service", label: "Service" },
];

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const _now = new Date();
const TODAY = { year: _now.getFullYear(), month: _now.getMonth(), day: _now.getDate() };

export function CalendarEventForm({
  initialEvent,
  submitLabel,
  onSubmit,
}: {
  initialEvent?: CalendarEvent;
  submitLabel: string;
  onSubmit: (draft: CalendarDraft) => void;
}) {
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [date, setDate] = useState(initialEvent?.date ?? toDateStr(TODAY.year, TODAY.month, TODAY.day));
  const [time, setTime] = useState(initialEvent?.time ?? "");
  const [category, setCategory] = useState<CalEventCategory>(initialEvent?.category ?? "chapter");
  const [mandatory, setMandatory] = useState(initialEvent?.mandatory ?? false);
  const [location, setLocation] = useState(initialEvent?.location ?? "");
  const [description, setDescription] = useState(initialEvent?.description ?? "");
  const categoryOptions = CATEGORY_OPTIONS.filter(option =>
    option.id !== "deadline" && option.id !== "party" && option.id !== "service" || option.id === initialEvent?.category
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      title: title.trim(),
      date,
      time: optionalValue(time),
      category,
      mandatory,
      location: optionalValue(location),
      description: optionalValue(description),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <FieldLabel>Title</FieldLabel>
        <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Chapter meeting..." required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Date</FieldLabel>
          <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} required />
        </div>
        <div>
          <FieldLabel>Time</FieldLabel>
          <input className={inputCls} value={time} onChange={e => setTime(e.target.value)} placeholder="7:00 PM" />
        </div>
      </div>
      <div>
        <FieldLabel>Category</FieldLabel>
        <select className={inputCls} value={category} onChange={e => setCategory(e.target.value as CalEventCategory)}>
          {categoryOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-slate-600">Deadlines and parties are managed from their dashboard lists.</p>
      </div>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-300">
        <input type="checkbox" checked={mandatory} onChange={e => setMandatory(e.target.checked)} className="h-4 w-4 rounded border-white/[0.12] bg-[#0a0d14] accent-indigo-500" />
        Required attendance
      </label>
      <div>
        <FieldLabel>Location</FieldLabel>
        <input className={inputCls} value={location} onChange={e => setLocation(e.target.value)} placeholder="Chapter Room" />
      </div>
      <div>
        <FieldLabel>Description</FieldLabel>
        <textarea className={`${inputCls} min-h-20 resize-none`} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes..." />
      </div>
      <button type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-500">
        {submitLabel}
      </button>
    </form>
  );
}
