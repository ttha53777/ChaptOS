"use client";

import { useEffect, useState } from "react";
import type { ProgrammingTask } from "../../data";
import { fmt$, fmtDate } from "../../data";
import { Card, FieldLabel, Modal } from "../dashboard/primitives";
import { inputCls } from "../dashboard/styles";
import { PrepStatusPill, StarRating, TypeBadge } from "./PrepStatusPill";
import { DocCard, type Doc } from "@/app/[slug]/docs/DocCard";
import { DocForm, type DocDraft } from "@/app/[slug]/docs/DocForm";
import { requestJson } from "../../lib/api";
import { programmingPrepScore } from "@/lib/programming";
import { todayStr } from "../../lib/dates";

const EMPTY_DOC: DocDraft = { title: "", url: "", description: "" };

export function ProgrammingDetailPanel({
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
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [docSubmitting, setDocSubmitting] = useState(false);
  const [notes, setNotes] = useState(event.wrapUpNotes ?? "");

  const isPast = event.dueDate < todayStr();
  const prep = programmingPrepScore(event);

  useEffect(() => {
    setNotes(event.wrapUpNotes ?? "");
  }, [event.id, event.wrapUpNotes]);

  useEffect(() => {
    setDocsLoading(true);
    requestJson<Doc[]>(`/api/programming/${event.id}/docs`)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false));
  }, [event.id, event.docCount]);

  async function handleAddDoc(draft: DocDraft) {
    setDocSubmitting(true);
    try {
      const created = await requestJson<Doc>(`/api/programming/${event.id}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          url: draft.url.trim(),
          description: draft.description.trim() || null,
        }),
      });
      setDocs(prev => [created, ...prev]);
      setShowAddDoc(false);
      await onPatch(event.id, { docCount: event.docCount + 1 });
    } finally {
      setDocSubmitting(false);
    }
  }

  async function handleDeleteDoc(doc: Doc) {
    await requestJson<void>(`/api/programming/${event.id}/docs/${doc.id}`, { method: "DELETE" });
    setDocs(prev => prev.filter(d => d.id !== doc.id));
    await onPatch(event.id, { docCount: Math.max(0, event.docCount - 1) });
  }

  return (
    <Card className="flex flex-col overflow-hidden" style={{ background: "linear-gradient(to bottom,#ffffff08 0%,#10121a 45%)" }}>
      <div className="border-b border-white/[0.07] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-white">{event.title}</h2>
            <p className="mt-1 text-[12px] text-slate-400">
              {fmtDate(event.dueDate)}{event.time ? ` · ${event.time}` : ""}{event.location ? ` · ${event.location}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TypeBadge type={event.type} />
              {event.collab && (
                <span className="text-[11px] text-slate-500">w/ {event.collab}</span>
              )}
            </div>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-1.5">
              <button onClick={onEdit} className="rounded-md bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-inset ring-white/[0.1] hover:bg-indigo-500/15 hover:text-indigo-300">
                Edit
              </button>
              <button onClick={onDelete} className="rounded-md bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400 ring-1 ring-inset ring-red-500/20 hover:bg-red-500/20">
                Delete
              </button>
            </div>
          )}
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
            <span>Prep progress</span>
            <span className="tabular-nums">{prep.done}/{prep.total}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${prep.total ? (prep.done / prep.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <section className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Checklist</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Room confirmed</FieldLabel>
              <PrepStatusPill
                value={event.roomStatus}
                disabled={!canManage}
                onChange={v => onPatch(event.id, { roomStatus: v as ProgrammingTask["roomStatus"] })}
              />
            </div>
            <div>
              <FieldLabel>Itinerary</FieldLabel>
              {canManage ? (
                <input
                  className={inputCls}
                  value={event.itineraryUrl ?? ""}
                  placeholder="https://…"
                  onChange={e => onPatch(event.id, { itineraryUrl: e.target.value.trim() || null })}
                />
              ) : event.itineraryUrl ? (
                <a href={event.itineraryUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] text-indigo-400 hover:underline truncate block">
                  Open itinerary
                </a>
              ) : (
                <span className="text-[12px] text-slate-600">—</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className={`flex items-center gap-2 text-[12px] ${canManage ? "cursor-pointer" : ""} text-slate-300`}>
              <input
                type="checkbox"
                checked={event.flyerPosted}
                disabled={!canManage}
                onChange={e => onPatch(event.id, { flyerPosted: e.target.checked })}
                className="h-4 w-4 rounded accent-indigo-500"
              />
              Flyer posted
            </label>
            <label className={`flex items-center gap-2 text-[12px] ${canManage ? "cursor-pointer" : ""} text-slate-300`}>
              <input
                type="checkbox"
                checked={event.socialsMeeting}
                disabled={!canManage}
                onChange={e => onPatch(event.id, { socialsMeeting: e.target.checked })}
                className="h-4 w-4 rounded accent-indigo-500"
              />
              Socials meeting
            </label>
          </div>
          <div>
            <FieldLabel>Spending</FieldLabel>
            {canManage ? (
              <input
                type="number"
                min={0}
                step={0.01}
                className={`${inputCls} max-w-[140px] tabular-nums`}
                value={(event.spendingCents / 100).toFixed(2)}
                onChange={e => {
                  const cents = Math.round(parseFloat(e.target.value || "0") * 100);
                  if (Number.isFinite(cents)) onPatch(event.id, { spendingCents: Math.max(0, cents) });
                }}
              />
            ) : (
              <p className="text-[13px] tabular-nums text-white">{fmt$(event.spendingCents / 100)}</p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Attachments</h3>
            {canManage && (
              <button
                onClick={() => setShowAddDoc(true)}
                className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
              >
                + Add link
              </button>
            )}
          </div>
          {docsLoading ? (
            <p className="text-[12px] text-slate-600">Loading…</p>
          ) : docs.length === 0 ? (
            <p className="text-[12px] text-slate-600">No files linked yet.</p>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="relative">
                  <DocCard
                    doc={doc}
                    canManage={canManage}
                    onEdit={() => {}}
                    onDelete={() => handleDeleteDoc(doc)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {isPast && (
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Post-event</h3>
            <FieldLabel>Event success</FieldLabel>
            <StarRating
              value={event.successRating}
              disabled={!canManage}
              onChange={v => onPatch(event.id, { successRating: v })}
            />
            {canManage && (
              <>
                <FieldLabel>Notes</FieldLabel>
                <textarea
                  className={`${inputCls} min-h-[72px] resize-y`}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  onBlur={() => {
                    if (notes !== (event.wrapUpNotes ?? "")) {
                      onPatch(event.id, { wrapUpNotes: notes.trim() || null });
                    }
                  }}
                  placeholder="Debrief, lessons learned…"
                />
              </>
            )}
          </section>
        )}
      </div>

      {showAddDoc && (
        <Modal title="Add attachment" onClose={() => !docSubmitting && setShowAddDoc(false)}>
          <DocForm
            initial={EMPTY_DOC}
            submitLabel={docSubmitting ? "Adding…" : "Add"}
            onSubmit={handleAddDoc}
            onClose={() => setShowAddDoc(false)}
          />
        </Modal>
      )}
    </Card>
  );
}
