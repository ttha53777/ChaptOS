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
      <div className="sc-row" style={{ borderBottom: "none" }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="sc-row-key">{def.name}</span>
            {def.unit && <span className="text-[11px]" style={{ color: "var(--faint)" }}>({def.unit})</span>}
          </div>
          <div className="sc-row-sub">
            Goal: {def.goal}{def.unit ? ` ${def.unit}` : ""} · At risk below: {def.atRiskBelow} · {AGGREGATION_LABELS[def.aggregation]}
          </div>
        </div>
        <button
          onClick={() => { setForm(toEditState(def)); setEditing(true); }}
          className="sc-btn sc-btn-ghost sc-btn-sm shrink-0"
        >
          Edit
        </button>
        <button onClick={handleDelete} disabled={deleting} className="sc-btn sc-btn-danger sc-btn-sm shrink-0">
          {deleting ? "Removing…" : "Remove"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl px-4 py-3 space-y-3" style={{ border: "1px solid rgba(167,139,250,.35)", background: "var(--card)" }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="sc-mlabel">Name</label>
          <input className="sc-input sc-input-sm mt-1" value={form.name} onChange={e => field("name", e.target.value)} maxLength={40} />
        </div>
        <div>
          <label className="sc-mlabel">Unit (optional)</label>
          <input className="sc-input sc-input-sm mt-1" value={form.unit} onChange={e => field("unit", e.target.value)} placeholder="hrs, reps, %…" maxLength={10} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="sc-mlabel">Goal (per member)</label>
          <input type="number" min={0} step="any" className="sc-input sc-input-sm mt-1" value={form.goal} onChange={e => field("goal", e.target.value)} />
        </div>
        <div>
          <label className="sc-mlabel">At Risk below</label>
          <input type="number" min={0} step="any" className="sc-input sc-input-sm mt-1" value={form.atRiskBelow} onChange={e => field("atRiskBelow", e.target.value)} />
        </div>
        <div>
          <label className="sc-mlabel">Watch below (optional)</label>
          <input type="number" min={0} step="any" className="sc-input sc-input-sm mt-1" value={form.watchBelow} onChange={e => field("watchBelow", e.target.value)} placeholder="optional" />
        </div>
      </div>
      <div>
        <label className="sc-mlabel">KPI card headline</label>
        <select className="sc-select sc-input-sm mt-1" value={form.aggregation} onChange={e => field("aggregation", e.target.value as EditState["aggregation"])}>
          {Object.entries(AGGREGATION_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving || !form.name.trim()} className="sc-btn sc-btn-primary sc-btn-sm">
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setEditing(false)} disabled={saving} className="sc-btn sc-btn-ghost sc-btn-sm">
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
    return <div className="py-8 text-center sc-note">Loading…</div>;
  }

  return (
    <div className="sc-stack-tight">
      <p className="sc-lede" style={{ margin: 0 }}>
        Define org-specific tracked metrics beyond the built-ins. Values are entered per member in the member drawer.
      </p>

      {defs.length === 0 && !showNew && (
        <div className="sc-empty">
          <div className="t">No custom metrics yet</div>
          <div className="h">Add one to start tracking additional data.</div>
        </div>
      )}

      {defs.length > 0 && (
        <div className="sc-card" style={{ display: "flex", flexDirection: "column" }}>
          {defs.map((def, i) => (
            <div key={def.id} style={i < defs.length - 1 ? { borderBottom: "1px solid var(--line-soft)" } : undefined}>
              <MetricRow
                def={def}
                onUpdated={updated => setDefs(prev => prev.map(d => d.id === updated.id ? updated : d))}
                onDeleted={id => { setDefs(prev => prev.filter(d => d.id !== id)); onStatus("Metric removed"); }}
                onError={onError}
              />
            </div>
          ))}
        </div>
      )}

      {defs.length >= 20 && (
        <p className="sc-note">Maximum of 20 custom metrics reached.</p>
      )}

      {showNew && (
        <div className="rounded-xl px-4 py-4 space-y-3" style={{ border: "1px solid rgba(167,139,250,.35)", background: "var(--card)" }}>
          <h3 className="sc-h" style={{ fontSize: 14 }}>New metric</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="sc-mlabel">Name *</label>
              <input className="sc-input sc-input-sm mt-1" value={form.name} onChange={e => field("name", e.target.value)} placeholder="Practice Reps" maxLength={40} />
            </div>
            <div>
              <label className="sc-mlabel">Slug *</label>
              <input
                className="sc-input sc-input-sm mt-1"
                style={{ fontFamily: "var(--mono)" }}
                value={form.slug}
                onChange={e => { setForm(p => ({ ...p, slug: e.target.value, slugTouched: true })); }}
                placeholder="practice-reps"
                maxLength={50}
              />
            </div>
          </div>
          <div>
            <label className="sc-mlabel">Unit (optional)</label>
            <input className="sc-input sc-input-sm mt-1" value={form.unit} onChange={e => field("unit", e.target.value)} placeholder="hrs, reps, %…" maxLength={10} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="sc-mlabel">Goal (per member) *</label>
              <input type="number" min={0} step="any" className="sc-input sc-input-sm mt-1" value={form.goal} onChange={e => field("goal", e.target.value)} placeholder="10" />
            </div>
            <div>
              <label className="sc-mlabel">At Risk below *</label>
              <input type="number" min={0} step="any" className="sc-input sc-input-sm mt-1" value={form.atRiskBelow} onChange={e => field("atRiskBelow", e.target.value)} placeholder="5" />
            </div>
            <div>
              <label className="sc-mlabel">Watch below (optional)</label>
              <input type="number" min={0} step="any" className="sc-input sc-input-sm mt-1" value={form.watchBelow} onChange={e => field("watchBelow", e.target.value)} placeholder="optional" />
            </div>
          </div>
          <div>
            <label className="sc-mlabel">KPI card headline</label>
            <select className="sc-select sc-input-sm mt-1" value={form.aggregation} onChange={e => field("aggregation", e.target.value as EditState["aggregation"])}>
              {Object.entries(AGGREGATION_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleCreate} disabled={creating || !form.name.trim() || !form.slug.trim()} className="sc-btn sc-btn-primary sc-btn-sm">
              {creating ? "Creating…" : "Create metric"}
            </button>
            <button onClick={() => { setShowNew(false); setForm(EMPTY_FORM); }} disabled={creating} className="sc-btn sc-btn-ghost sc-btn-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showNew && defs.length < 20 && (
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition-colors"
          style={{ border: "1px dashed var(--line)", color: "var(--muted)" }}
        >
          <span className="text-base leading-none">+</span> Add metric
        </button>
      )}
    </div>
  );
}
