"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../../../components/dashboard/primitives";
import { requestJson } from "../../../../lib/api";
import type { CustomMetricDefinition } from "@/lib/metrics";
import {
  AGGREGATION_LABELS, EMPTY_FORM, MAX_METRICS, METRICS_COPY as C, createBody, editBody, metricSub, toEditState, withField,
  type EditState, type NewMetricForm,
} from "@/lib/settings/metrics";

// Settings → Custom Metrics. Org-defined tracked metrics beyond the fixed built-ins.
// Each definition has its own edit state — this is a list-based CRUD section,
// not a fixed-shape draft like ThresholdsSection.

// The headline choices, the slug rule, the forms, the bodies and every sentence
// live in lib/settings/metrics.ts (the app renders the same section from it).

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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<EditState>(() => toEditState(def));

  function field(k: keyof EditState, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const built = editBody(form);
      if ("error" in built) {
        onError(built.error);
        return;
      }
      const body = built.body;

      const updated = await requestJson<CustomMetricDefinition>(
        `/api/metrics/definitions/${def.id}`,
        { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
      );
      onUpdated(updated);
      setEditing(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : C.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await requestJson(`/api/metrics/definitions/${def.id}`, { method: "DELETE" });
      onDeleted(def.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : C.deleteFailed);
      setDeleting(false);
    }
  }

  if (!editing) {
    const sub = metricSub(def);
    return (
      <div className="sc-row" style={{ borderBottom: "none" }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="sc-row-key">{def.name}</span>
            {def.unit && <span className="text-[11px]" style={{ color: "var(--faint)" }}>({def.unit})</span>}
          </div>
          <div className="sc-row-sub">
            {sub[0]}{sub[1]}{sub[2]}{sub[3]}{sub[4]}{sub[5]}{sub[6]}
          </div>
        </div>
        <button
          onClick={() => { setForm(toEditState(def)); setEditing(true); }}
          className="sc-btn sc-btn-ghost sc-btn-sm shrink-0"
        >
          {C.edit}
        </button>
        <button onClick={() => setConfirmDelete(true)} disabled={deleting} className="sc-btn sc-btn-danger sc-btn-sm shrink-0">
          {deleting ? C.removing : C.remove}
        </button>
        {confirmDelete && (
          <ConfirmDialog
            title={C.removeTitle(def.name)}
            message={C.removeMessage}
            confirmLabel={C.remove}
            tone="dusk"
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl px-4 py-3 space-y-3" style={{ border: "1px solid rgba(var(--vio-rgb),.35)", background: "var(--card)" }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="sc-mlabel">{C.name}</label>
          <input className="sc-input sc-input-sm mt-1" value={form.name} onChange={e => field("name", e.target.value)} maxLength={40} />
        </div>
        <div>
          <label className="sc-mlabel">{C.unit}</label>
          <input className="sc-input sc-input-sm mt-1" value={form.unit} onChange={e => field("unit", e.target.value)} placeholder={C.unitPlaceholder} maxLength={10} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="sc-mlabel">{C.goal}</label>
          <input type="number" min={0} step="any" className="sc-input sc-input-sm mt-1" value={form.goal} onChange={e => field("goal", e.target.value)} />
        </div>
        <div>
          <label className="sc-mlabel">{C.atRisk}</label>
          <input type="number" min={0} step="any" className="sc-input sc-input-sm mt-1" value={form.atRiskBelow} onChange={e => field("atRiskBelow", e.target.value)} />
        </div>
        <div>
          <label className="sc-mlabel">{C.watch}</label>
          <input type="number" min={0} step="any" className="sc-input sc-input-sm mt-1" value={form.watchBelow} onChange={e => field("watchBelow", e.target.value)} placeholder={C.optional} />
        </div>
      </div>
      <div>
        <label className="sc-mlabel">{C.headline}</label>
        <select className="sc-select sc-input-sm mt-1" value={form.aggregation} onChange={e => field("aggregation", e.target.value as EditState["aggregation"])}>
          {Object.entries(AGGREGATION_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving || !form.name.trim()} className="sc-btn sc-btn-primary sc-btn-sm">
          {saving ? C.saving : C.save}
        </button>
        <button onClick={() => setEditing(false)} disabled={saving} className="sc-btn sc-btn-ghost sc-btn-sm">
          {C.cancel}
        </button>
      </div>
    </div>
  );
}

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
      if (mounted.current) onError(C.loadFailed);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  function field(k: keyof Omit<NewMetricForm, "slugTouched">, v: string) {
    setForm(prev => k === "slug" ? { ...prev, slug: v } : withField(prev, k, v));
  }

  async function handleCreate() {
    const built = createBody(form);
    if ("error" in built) {
      onError(built.error);
      return;
    }
    setCreating(true);
    try {
      const body = built.body;

      const created = await requestJson<CustomMetricDefinition>(
        "/api/metrics/definitions",
        { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
      );
      setDefs(prev => [...prev, created]);
      setForm(EMPTY_FORM);
      setShowNew(false);
      onStatus(C.created(created.name));
    } catch (e) {
      onError(e instanceof Error ? e.message : C.createFailed);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <div className="py-8 text-center sc-note">{C.loading}</div>;
  }

  return (
    <div className="sc-stack-tight">
      <p className="sc-lede" style={{ margin: 0 }}>{C.lede}</p>

      {defs.length === 0 && !showNew && (
        <div className="sc-empty">
          <div className="t">{C.emptyTitle}</div>
          <div className="h">{C.emptyHint}</div>
        </div>
      )}

      {defs.length > 0 && (
        <div className="sc-card" style={{ display: "flex", flexDirection: "column" }}>
          {defs.map((def, i) => (
            <div key={def.id} style={i < defs.length - 1 ? { borderBottom: "1px solid var(--line-soft)" } : undefined}>
              <MetricRow
                def={def}
                onUpdated={updated => setDefs(prev => prev.map(d => d.id === updated.id ? updated : d))}
                onDeleted={id => { setDefs(prev => prev.filter(d => d.id !== id)); onStatus(C.removed); }}
                onError={onError}
              />
            </div>
          ))}
        </div>
      )}

      {defs.length >= MAX_METRICS && (
        <p className="sc-note">{C.maxed}</p>
      )}

      {showNew && (
        <div className="rounded-xl px-4 py-4 space-y-3" style={{ border: "1px solid rgba(var(--vio-rgb),.35)", background: "var(--card)" }}>
          <h3 className="sc-h" style={{ fontSize: 14 }}>{C.newMetric}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="sc-mlabel">{C.nameReq}</label>
              <input className="sc-input sc-input-sm mt-1" value={form.name} onChange={e => field("name", e.target.value)} placeholder={C.namePlaceholder} maxLength={40} />
            </div>
            <div>
              <label className="sc-mlabel">{C.slugReq}</label>
              <input
                className="sc-input sc-input-sm mt-1"
                style={{ fontFamily: "var(--mono)" }}
                value={form.slug}
                onChange={e => { setForm(p => ({ ...p, slug: e.target.value, slugTouched: true })); }}
                placeholder={C.slugPlaceholder}
                maxLength={50}
              />
            </div>
          </div>
          <div>
            <label className="sc-mlabel">{C.unit}</label>
            <input className="sc-input sc-input-sm mt-1" value={form.unit} onChange={e => field("unit", e.target.value)} placeholder={C.unitPlaceholder} maxLength={10} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="sc-mlabel">{C.goalReq}</label>
              <input type="number" min={0} step="any" className="sc-input sc-input-sm mt-1" value={form.goal} onChange={e => field("goal", e.target.value)} placeholder="10" />
            </div>
            <div>
              <label className="sc-mlabel">{C.atRiskReq}</label>
              <input type="number" min={0} step="any" className="sc-input sc-input-sm mt-1" value={form.atRiskBelow} onChange={e => field("atRiskBelow", e.target.value)} placeholder="5" />
            </div>
            <div>
              <label className="sc-mlabel">{C.watch}</label>
              <input type="number" min={0} step="any" className="sc-input sc-input-sm mt-1" value={form.watchBelow} onChange={e => field("watchBelow", e.target.value)} placeholder={C.optional} />
            </div>
          </div>
          <div>
            <label className="sc-mlabel">{C.headline}</label>
            <select className="sc-select sc-input-sm mt-1" value={form.aggregation} onChange={e => field("aggregation", e.target.value as EditState["aggregation"])}>
              {Object.entries(AGGREGATION_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleCreate} disabled={creating || !form.name.trim() || !form.slug.trim()} className="sc-btn sc-btn-primary sc-btn-sm">
              {creating ? C.creating : C.create}
            </button>
            <button onClick={() => { setShowNew(false); setForm(EMPTY_FORM); }} disabled={creating} className="sc-btn sc-btn-ghost sc-btn-sm">
              {C.cancel}
            </button>
          </div>
        </div>
      )}

      {!showNew && defs.length < MAX_METRICS && (
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition-colors"
          style={{ border: "1px dashed var(--line)", color: "var(--muted)" }}
        >
          <span className="text-base leading-none">+</span>{` ${C.add}`}
        </button>
      )}
    </div>
  );
}
