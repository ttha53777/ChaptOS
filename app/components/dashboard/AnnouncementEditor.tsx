"use client";

import React, { useState } from "react";
import { Modal, FieldLabel } from "./primitives";
import type { Announcement } from "./AnnouncementCard";

export function AnnouncementEditor({
  current,
  onClose,
  onSave,
}: {
  current: Announcement | null;
  onClose: () => void;
  onSave: (saved: Announcement) => void;
}) {
  const [title, setTitle] = useState(current?.title ?? "");
  const [body, setBody] = useState(current?.body ?? "");
  const [ctaLabel, setCtaLabel] = useState(current?.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(current?.ctaUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setErr(null);
    if (!title.trim()) { setErr("Title is required"); return; }
    const hasLabel = ctaLabel.trim().length > 0;
    const hasUrl = ctaUrl.trim().length > 0;
    if (hasLabel !== hasUrl) {
      setErr("CTA label and URL must both be provided, or both left blank");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/announcement", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          ctaLabel: hasLabel ? ctaLabel.trim() : null,
          ctaUrl: hasUrl ? ctaUrl.trim() : null,
        }),
      });
      if (!res.ok) {
        let detail = "";
        try { const j = await res.json(); detail = typeof j?.error === "string" ? j.error : ""; } catch {}
        setErr(detail || `Failed to save (${res.status})`);
        setSaving(false);
        return;
      }
      const saved = (await res.json()) as Announcement;
      onSave(saved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit announcement" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <FieldLabel htmlFor="ann-title">Title</FieldLabel>
          <input
            id="ann-title"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Rush kickoff Saturday"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-red-500/40 focus:outline-none"
          />
        </div>
        <div>
          <FieldLabel htmlFor="ann-body">Body <span className="text-slate-600">(optional)</span></FieldLabel>
          <textarea
            id="ann-body"
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Doors open at 8pm. Wear letters."
            className="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-red-500/40 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="ann-cta-label">CTA label <span className="text-slate-600">(optional)</span></FieldLabel>
            <input
              id="ann-cta-label"
              type="text"
              value={ctaLabel}
              onChange={e => setCtaLabel(e.target.value)}
              maxLength={40}
              placeholder="RSVP"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-red-500/40 focus:outline-none"
            />
          </div>
          <div>
            <FieldLabel htmlFor="ann-cta-url">CTA URL <span className="text-slate-600">(optional)</span></FieldLabel>
            <input
              id="ann-cta-url"
              type="url"
              value={ctaUrl}
              onChange={e => setCtaUrl(e.target.value)}
              maxLength={500}
              placeholder="https://"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-red-500/40 focus:outline-none"
            />
          </div>
        </div>
        {err && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
