"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "../../../lib/api";
import type { CustomMetricDefinition } from "@/lib/metrics";

// Settings → Custom Metrics. Org-defined tracked metrics beyond the fixed built-ins.
// Each definition has its own edit state — this is a list-based CRUD section,
// not a fixed-shape draft like ThresholdsSection.

const AGGREGATION_LABELS: Record<string, string> = {
  avg:            "Average per member",
  sum:            "Chapter total",
  count_on_track: "# members on track",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

interface EditState {
  name:        string;
  unit:        string;
  goal:        string;
  atRiskBelow: string;
  watchBelow:  string;
  aggregation: "avg" | "sum" | "count_on_track";
}

function toEditState(def: CustomMetricDefinition): EditState {
  return {
    name:        def.name,
    unit:        def.unit ?? "",
    goal:        String(def.goal),
    atRiskBelow: String(def.atRiskBelow),
    watchBelow:  def.watchBelow != null ? String(def.watchBelow) : "",
    aggregation: def.aggregation,
  };
}

function MetricRow({
  def,
  onUpdated,
  onDeleted,
  onError,
}: {
  def: CustomMetricDefinition;
  onUpdated: (d: CustomMetricDefinition) => void;
  onDeleted: (id: number) => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<EditState>(() => toEditState(def));

  function field(k: keyof EditState, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name:        form.name.trim(),
        unit:        form.unit.trim() || null,
        goal:        parseFloat(form.goal),
        atRiskBelow: parseFloat(form.atRiskBelow),
        aggregation: form.aggregation,
      };
      if (form.watchBelow.trim()) body.watchBelow = parseFloat(form.watchBelow);
      else body.watchBelow = null;

      if (isNaN(body.goal as number) || isNaN(body.atRiskBelow as number)) {
        onError("Goal and At-Risk threshold must be valid numbers");
        return;
      }

      const updated = await requestJson<CustomMetricDefinition>(
        `/api/metrics/definitions/${def.id}`,
        { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
      );
      onUpdated(updated);
      setEditing(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save metric");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${def.name}"? Existing member values will be preserved but the metric will no longer appear.`)) return;
    setDeleting(true);
    try {
      await requestJson(`/api/metrics/definitions/${def.id}`, { method: "DELETE" });
      onDeleted(def.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to delete metric");
      setDeleting(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-white">{def.name}</span>
            {def.unit && <span className="text-[11px] text-slate-500">({def.unit})</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Goal: {def.goal}{def.unit ? ` ${def.unit}` : ""} · At risk below: {def.atRiskBelow} · {AGGREGATION_LABELS[def.aggregation]}
          </div>
        </div>
        <button
          onClick={() => { setForm(toEditState(def)); setEditing(true); }}
          className="shrink-0 rounded-md px-2.5 py-1 text-[11px] text-slate-400 hover:bg-white/[0.06] hover:text-white transition-colors"
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 rounded-md px-2.5 py-1 text-[11px] text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors disabled:opacity-40"
        >
          {deleting ? "Removing…" : "Remove"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-500/30 bg-white/[0.03] px-4 py-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-slate-400">Name</label>
          <input
            className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white focus:border-indigo-500/60 focus:outline-none"
            value={form.name}
            onChange={e => field("name", e.target.value)}
            maxLength={40}
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-400">Unit (optional)</label>
          <input
            className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white focus:border-indigo-500/60 focus:outline-none"
            value={form.unit}
            onChange={e => field("unit", e.target.value)}
            placeholder="hrs, reps, %…"
            maxLength={10}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] text-slate-400">Goal (per member)</label>
          <input
            type="number" min={0} step="any"
            className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white focus:border-indigo-500/60 focus:outline-none"
            value={form.goal}
            onChange={e => field("goal", e.target.value)}
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-400">At Risk below</label>
          <input
            type="number" min={0} step="any"
            className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white focus:border-indigo-500/60 focus:outline-none"
            value={form.atRiskBelow}
            onChange={e => field("atRiskBelow", e.target.value)}
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-400">Watch below (optional)</label>
          <input
            type="number" min={0} step="any"
            className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white focus:border-indigo-500/60 focus:outline-none"
            value={form.watchBelow}
            onChange={e => field("watchBelow", e.target.value)}
            placeholder="optional"
          />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-slate-400">KPI card headline</label>
        <select
          className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white focus:border-indigo-500/60 focus:outline-none"
          value={form.aggregation}
          onChange={e => field("aggregation", e.target.value as EditState["aggregation"])}
        >
          {Object.entries(AGGREGATION_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-[12px] text-slate-400 hover:bg-white/[0.06] hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface NewMetricForm {
  name:        string;
  slug:        string;
  unit:        string;
  goal:        string;
  atRiskBelow: string;
  watchBelow:  string;
  aggregation: "avg" | "sum" | "count_on_track";
  slugTouched: boolean;
}

const EMPTY_FORM: NewMetricForm = {
  name:        "",
  slug:        "",
  unit:        "",
  goal:        "",
  atRiskBelow: "",
  watchBelow:  "",
  aggregation: "avg",
  slugTouched: false,
};

export function CustomMetricsSection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError:  (msg: string) => void;
}) {
  const [defs,    setDefs]    = useState<CustomMetricDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [form,     setForm]     = useState<NewMetricForm>(EMPTY_FORM);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await requestJson<CustomMetricDefinition[]>("/api/metrics/definitions");
      if (mounted.current) setDefs(data);
    } catch {
      if (mounted.current) onError("Failed to load custom metrics");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  function field(k: keyof Omit<NewMetricForm, "slugTouched">, v: string) {
    setForm(prev => {
      const next = { ...prev, [k]: v };
      if (k === "name" && !prev.slugTouched) {
        next.slug = slugify(v);
      }
      return next;
    });
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.slug.trim() || !form.goal || !form.atRiskBelow) {
      onError("Name, slug, goal, and at-risk threshold are required");
      return;
    }
    const goalNum        = parseFloat(form.goal);
    const atRiskBelowNum = parseFloat(form.atRiskBelow);
    if (isNaN(goalNum) || isNaN(atRiskBelowNum)) {
      onError("Goal and At-Risk threshold must be valid numbers");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        name:        form.name.trim(),
        slug:        form.slug.trim(),
        unit:        form.unit.trim() || null,
        goal:        goalNum,
        atRiskBelow: atRiskBelowNum,
        aggregation: form.aggregation,
      };
      if (form.watchBelow.trim()) body.watchBelow = parseFloat(form.watchBelow);

      const created = await requestJson<CustomMetricDefinition>(
        "/api/metrics/definitions",
        { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
      );
      setDefs(prev => [...prev, created]);
      setForm(EMPTY_FORM);
      setShowNew(false);
      onStatus(`Custom metric "${created.name}" created`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to create metric");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-[13px] text-slate-500">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-white">Custom Metrics</h2>
        <p className="mt-1 text-[13px] text-slate-400">
          Define org-specific tracked metrics beyond the built-ins. Values are entered per member in the member drawer.
        </p>
      </div>

      {defs.length === 0 && !showNew && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-[13px] text-slate-500">
          No custom metrics yet. Add one to start tracking additional data.
        </div>
      )}

      <div className="space-y-2">
        {defs.map(def => (
          <MetricRow
            key={def.id}
            def={def}
            onUpdated={updated => setDefs(prev => prev.map(d => d.id === updated.id ? updated : d))}
            onDeleted={id => { setDefs(prev => prev.filter(d => d.id !== id)); onStatus("Metric removed"); }}
            onError={onError}
          />
        ))}
      </div>

      {defs.length >= 20 && (
        <p className="text-[12px] text-slate-500">Maximum of 20 custom metrics reached.</p>
      )}

      {showNew && (
        <div className="rounded-lg border border-indigo-500/30 bg-white/[0.03] px-4 py-4 space-y-3">
          <h3 className="text-[13px] font-medium text-white">New metric</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-400">Name *</label>
              <input
                className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white focus:border-indigo-500/60 focus:outline-none"
                value={form.name}
                onChange={e => field("name", e.target.value)}
                placeholder="Practice Reps"
                maxLength={40}
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Slug *</label>
              <input
                className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white font-mono focus:border-indigo-500/60 focus:outline-none"
                value={form.slug}
                onChange={e => { setForm(p => ({ ...p, slug: e.target.value, slugTouched: true })); }}
                placeholder="practice-reps"
                maxLength={50}
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-400">Unit (optional)</label>
            <input
              className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white focus:border-indigo-500/60 focus:outline-none"
              value={form.unit}
              onChange={e => field("unit", e.target.value)}
              placeholder="hrs, reps, %…"
              maxLength={10}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-slate-400">Goal (per member) *</label>
              <input
                type="number" min={0} step="any"
                className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white focus:border-indigo-500/60 focus:outline-none"
                value={form.goal}
                onChange={e => field("goal", e.target.value)}
                placeholder="10"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">At Risk below *</label>
              <input
                type="number" min={0} step="any"
                className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white focus:border-indigo-500/60 focus:outline-none"
                value={form.atRiskBelow}
                onChange={e => field("atRiskBelow", e.target.value)}
                placeholder="5"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Watch below (optional)</label>
              <input
                type="number" min={0} step="any"
                className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white focus:border-indigo-500/60 focus:outline-none"
                value={form.watchBelow}
                onChange={e => field("watchBelow", e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-400">KPI card headline</label>
            <select
              className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[13px] text-white focus:border-indigo-500/60 focus:outline-none"
              value={form.aggregation}
              onChange={e => field("aggregation", e.target.value as EditState["aggregation"])}
            >
              {Object.entries(AGGREGATION_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={creating || !form.name.trim() || !form.slug.trim()}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
            >
              {creating ? "Creating…" : "Create metric"}
            </button>
            <button
              onClick={() => { setShowNew(false); setForm(EMPTY_FORM); }}
              disabled={creating}
              className="rounded-md px-3 py-1.5 text-[12px] text-slate-400 hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showNew && defs.length < 20 && (
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-md border border-white/[0.08] px-3 py-2 text-[13px] text-slate-400 hover:border-indigo-500/40 hover:bg-white/[0.04] hover:text-white transition-colors"
        >
          <span className="text-base leading-none">+</span> Add metric
        </button>
      )}
    </div>
  );
}
