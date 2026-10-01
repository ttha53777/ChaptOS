"use client";

import "./member-spotlight.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmt$, type Brother } from "../../data";
import { isAttendanceExempt } from "@/lib/thresholds";
import type { CustomFieldValues } from "@/lib/custom-member-fields";
import type { BrotherMetricRow } from "@/lib/services/metric-value-service";
import type { MemberProfile } from "@/lib/services/brother-service";
import { avatarDisplayUrl } from "@/lib/avatar";
import { useChapter } from "../../context/ChapterContext";
import { useThresholds } from "../../hooks/useThresholds";
import { useTrackedMetrics } from "../../hooks/useTrackedMetrics";
import { useVocab } from "../../hooks/useVocab";
import { useToast } from "../dashboard/Toast";
import { apiErrorMessage, requestJson } from "../../lib/api";
import { standingVerdict, toneAttendance, toneGpa } from "./spotlight-standing";
import { DoneFoot, DraftInput, Hint, Icon, Pop, Row, SaveFoot, Stat, type EditApi } from "./spotlight-parts";

/*
  Member Spotlight — the card that opens when you click a member.
  Built from _design/Member Spotlight v3.html.

  Four parts: who (name, roles, one sentence of standing), four numbers that each
  open their detail + the one thing you can do about it, Needs attention (only
  rows someone must act on; hidden when empty), and About.

  Editing rules carried over from the mock:
    - one value is edited and saved at a time; there's no form-wide Save;
    - leaving a dirty edit (another edit, next member, close) asks Save/Discard;
    - a failed save keeps the edit open with the input intact;
    - saves that have a real inverse get an Undo toast. Dues and excuse decisions
      don't: a waiver is an audited ledger fact, and there's no un-approve.
  Esc backs out one level (prompt → popover → card).
*/

type AttendanceRow = {
  calendarEventId: number;
  title: string;
  date: string;
  attended: boolean | null;
  excused: boolean;
  excuseId: number | null;
  excuseReason: string | null;
  excuseStatus: "pending" | "approved" | "rejected" | null;
  excuseRejection: string | null;
};

type AvailableRole = { id: number; name: string; color: string | null; rank: number };

/** What a finished save reports: toast text, plus how to reverse it if that's possible. */
type Done = { text: string; undo?: () => Promise<void> } | void;

interface Spec {
  label: string;
  initial: () => Record<string, string>;
  validate?: (d: Record<string, string>) => string | null;
  commit?: (d: Record<string, string>) => Promise<Done>;
}

const EXEMPT_REASONS = [
  { value: "abroad",   label: "Studying abroad" },
  { value: "coop",     label: "Co-op / internship" },
  { value: "inactive", label: "Inactive" },
  { value: "other",    label: "Other" },
];

const JSON_HEADERS = { "Content-Type": "application/json" };

function fmtEventDate(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.map(p => p[0]).join("").slice(0, 2).toUpperCase() : "?";
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function MemberSpotlight({
  brotherId,
  order,
  onNavigate,
  onClose,
  onPayDues,
  onLogServiceHours,
  onDelete,
  onExcuseDecided,
}: {
  brotherId: number | null;
  /** Roster order for ←/→, usually the page's filtered + sorted ids. Defaults to brotherList order. */
  order?: number[];
  /** Move to another member. Without it the ←/→ controls are hidden. */
  onNavigate?: (id: number) => void;
  onClose: () => void;
  /** Hands a dues payment to the page's ledger form, so the money and the balance move together. */
  onPayDues: (b: Brother) => void;
  /** Opens the page's "Log service hours" modal for this member. */
  onLogServiceHours: (b: Brother) => void;
  /** Permanent removal. The page owns it (it closes the card and reports failures). */
  onDelete?: (b: Brother) => void;
  /** After an excuse is approved/rejected here, so the page can update its pending-count chip. */
  onExcuseDecided?: (brotherId: number, action: "approve" | "reject", attendance: number | null) => void;
}) {
  const { currentUser, brotherList, setBrotherList, can, avatarRevision, setSelfNameLocal } = useChapter();
  const thresholds = useThresholds();
  const tracked = useTrackedMetrics();
  const v = useVocab();
  const appToast = useToast();

  const brother = brotherId !== null ? brotherList.find(b => b.id === brotherId) ?? null : null;
  const selfId = currentUser?.id ?? null;
  const isSelf = brother !== null && brother.id === selfId;

  const canBrothers   = can("MANAGE_BROTHERS");
  const canTreasury   = can("MANAGE_TREASURY");
  const canAttendance = can("MANAGE_ATTENDANCE");
  const canRoles      = can("MANAGE_ROLES");
  const canService    = can("MANAGE_SERVICE");
  // Standing, GPA, dues and metrics are for officers and the member themselves.
  // Everyone else gets the narrow contact card. MANAGE_SERVICE counts as an officer
  // here because Log hours lives on the full card; without it a service chair could
  // no longer log hours from the roster at all.
  const full = canBrothers || canTreasury || canAttendance || canService || isSelf;
  const canEditProfile = canBrothers || isSelf; // name, custom fields, metrics (server allows self)
  const myMaxRank = currentUser?.maxRank ?? 0;
  const fieldDefs = useMemo(
    () => [...(currentUser?.org?.customMemberFields ?? [])].sort((a, b) => a.rosterOrder - b.rosterOrder),
    [currentUser?.org?.customMemberFields],
  );
  const hasMetricDefs = (currentUser?.org?.metricDefinitionCount ?? 0) > 0;

  // ── Remote data for the open member ──────────────────────────────────────
  // Every fetched value is tagged with the member it belongs to and read back only
  // when it matches the open one. Resetting on change isn't enough on its own: the
  // reset lands after the first paint of the next member (one frame of the previous
  // person's Needs attention), and a retry, a 409 resync or a metric save that
  // resolves after ←/→ would otherwise write one member's rows onto another's card.
  const [profileState, setProfileState] = useState<{ id: number; data: MemberProfile | "error" } | null>(null);
  const [historyState, setHistoryState] = useState<{ id: number; rows: AttendanceRow[] | "error" } | null>(null);
  const [metricsState, setMetricsState] = useState<{ id: number; rows: BrotherMetricRow[] } | null>(null);
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[] | null>(null);

  const profileData = profileState?.id === brotherId ? profileState.data : null;
  const profile = profileData === "error" ? null : profileData;
  const historyData = historyState?.id === brotherId ? historyState.rows : null;
  const history = historyData === "error" ? null : historyData;
  const historyError = historyData === "error";
  const metrics = metricsState?.id === brotherId ? metricsState.rows : null;

  /** Patch one member's history rows, ignoring the update if that member is no longer loaded. */
  const updateHistory = useCallback((id: number, fn: (rows: AttendanceRow[]) => AttendanceRow[]) => {
    setHistoryState(prev => prev && prev.id === id && prev.rows !== "error" ? { id, rows: fn(prev.rows) } : prev);
  }, []);

  const loadHistory = useCallback(async (id: number, signal?: AbortSignal) => {
    setHistoryState(prev => prev?.id === id && prev.rows === "error" ? null : prev);
    try {
      const rows = await requestJson<AttendanceRow[]>(`/api/brothers/${id}/attendance`, { signal });
      setHistoryState({ id, rows });
    } catch {
      if (signal?.aborted) return;
      setHistoryState({ id, rows: "error" });
    }
  }, []);

  useEffect(() => {
    if (brotherId === null) return;
    const ac = new AbortController();
    requestJson<MemberProfile>(`/api/brothers/${brotherId}/profile`, { signal: ac.signal })
      .then(data => setProfileState({ id: brotherId, data }))
      .catch(() => { if (!ac.signal.aborted) setProfileState({ id: brotherId, data: "error" }); });
    if (full) {
      loadHistory(brotherId, ac.signal);
      if (hasMetricDefs) {
        requestJson<BrotherMetricRow[]>(`/api/brothers/${brotherId}/metrics`, { signal: ac.signal })
          .then(rows => setMetricsState({ id: brotherId, rows }))
          .catch(() => { if (!ac.signal.aborted) setMetricsState({ id: brotherId, rows: [] }); });
      }
    }
    return () => ac.abort();
  }, [brotherId, full, hasMetricDefs, loadHistory]);

  useEffect(() => {
    if (!canRoles || brotherId === null || availableRoles !== null) return;
    requestJson<AvailableRole[]>("/api/roles").then(setAvailableRoles).catch(() => setAvailableRoles([]));
  }, [canRoles, brotherId, availableRoles]);

  // ── Edit state: one value at a time ──────────────────────────────────────
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guard, setGuard] = useState<{ fn: () => void } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => Promise<void>; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapKey, setSwapKey] = useState(0);
  const baseline = useRef("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  const stopEdit = useCallback(() => {
    setEditing(null); setDraft({}); setError(null); setSaving(false); baseline.current = "";
  }, []);

  const showToast = useCallback((text: string, undo?: () => Promise<void>, err?: boolean) => {
    setToast({ text, undo, err });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), err ? 7000 : 6000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Reset per-member UI when the member changes (open, ←/→, close).
  useEffect(() => {
    stopEdit(); setGuard(null); setToast(null);
  }, [brotherId, stopEdit]);

  const isDirty = editing !== null && JSON.stringify(draft) !== baseline.current;

  /** Run fn now, or, if an edit is dirty, ask Save / Discard first. */
  const guarded = useCallback((fn: () => void) => {
    if (isDirty) { setGuard({ fn }); return; }
    stopEdit(); fn();
  }, [isDirty, stopEdit]);

  // ── Local roster patching ────────────────────────────────────────────────
  const patchLocal = useCallback((id: number, patch: Partial<Brother>) => {
    setBrotherList(list => list.map(b => b.id === id ? { ...b, ...patch } : b));
  }, [setBrotherList]);

  const patchBrother = useCallback(async (b: Brother, body: Record<string, unknown>) => {
    const updated = await requestJson<Partial<Brother> & { customFields?: CustomFieldValues }>(`/api/brothers/${b.id}`, {
      method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body),
    });
    const patch: Partial<Brother> = {};
    if (updated.name !== undefined) patch.name = updated.name;
    if (updated.gpa !== undefined) patch.gpa = updated.gpa;
    if (updated.customFields !== undefined) patch.customFields = (updated.customFields ?? {}) as CustomFieldValues;
    patchLocal(b.id, patch);
    // Renaming yourself also moves the greeting and sidebar, which read currentUser.
    if (b.id === selfId && patch.name) setSelfNameLocal(patch.name);
  }, [patchLocal, selfId, setSelfNameLocal]);

  // ── Editors ──────────────────────────────────────────────────────────────
  const metricRows = metrics ?? [];

  function specFor(key: string, b: Brother): Spec | null {
    if (key === "gpa") return {
      label: "GPA",
      initial: () => ({ value: b.gpa.toFixed(2) }),
      validate: d => {
        const n = Number(d.value);
        if (d.value.trim() === "" || !Number.isFinite(n) || n < 0 || n > 4) return "GPA must be between 0 and 4.00.";
        return null;
      },
      commit: async d => {
        const before = b.gpa;
        const next = Math.round(Number(d.value) * 100) / 100;
        await patchBrother(b, { gpa: next });
        return { text: `GPA ${before.toFixed(2)} → ${next.toFixed(2)}`, undo: () => patchBrother(b, { gpa: before }) };
      },
    };
    if (key === "name") return {
      label: "Name",
      initial: () => ({ value: b.name }),
      validate: d => d.value.trim() ? null : "A name is required.",
      commit: async d => {
        const before = b.name;
        await patchBrother(b, { name: d.value.trim() });
        return { text: "Name updated", undo: () => patchBrother(b, { name: before }) };
      },
    };
    if (key.startsWith("cf:")) {
      const def = fieldDefs.find(f => f.id === key.slice(3));
      if (!def) return null;
      return {
        label: def.label,
        initial: () => { const val = b.customFields?.[def.id]; return { value: val === null || val === undefined ? "" : String(val) }; },
        validate: d => {
          if (def.required && !d.value.trim()) return `${def.label} is required by your chapter.`;
          if (def.type === "number" && d.value.trim() !== "" && !Number.isFinite(Number(d.value))) return "Enter a number.";
          return null;
        },
        commit: async d => {
          const before = { ...(b.customFields ?? {}) };
          const raw = d.value.trim();
          const value = raw === "" ? null : def.type === "number" ? Number(raw) : raw;
          // The server replaces the whole map, so send every value with this one changed.
          await patchBrother(b, { customFields: { ...before, [def.id]: value } });
          return { text: `${def.label} updated`, undo: () => patchBrother(b, { customFields: before }) };
        },
      };
    }
    if (key.startsWith("metric:")) {
      const row = metricRows.find(m => m.definitionId === Number(key.slice(7)));
      if (!row) return null;
      return {
        label: row.name,
        initial: () => ({ value: row.value === null ? "" : String(row.value) }),
        validate: d => {
          const n = Number(d.value);
          if (d.value.trim() === "" || !Number.isFinite(n) || n < 0) return "Enter a number of 0 or more.";
          return null;
        },
        commit: async d => {
          const before = row.value;
          const save = async (value: number) => {
            const rows = await requestJson<BrotherMetricRow[]>(`/api/brothers/${b.id}/metrics`, {
              method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ values: { [row.definitionId]: value } }),
            });
            setMetricsState(prev => prev?.id === b.id ? { id: b.id, rows } : prev);
          };
          await save(Number(d.value));
          // A value can be changed but not cleared (the API has no null), so a first entry has no Undo.
          return { text: `${row.name} set to ${Number(d.value)}${row.unit ?? ""}`, undo: before === null ? undefined : () => save(before) };
        },
      };
    }
    if (key === "exempt") return {
      label: "Exemption",
      initial: () => ({ reason: "abroad" }),
      commit: async d => {
        const res = await requestJson<{ attendance: number | null }>("/api/exemptions", {
          method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ brotherId: b.id, reason: d.reason }),
        });
        if (res.attendance !== null) patchLocal(b.id, { attendance: res.attendance });
        return { text: `Exempt from attendance this ${v("Period").toLowerCase()}`, undo: () => clearExemption(b) };
      },
    };
    if (key === "dues") return {
      label: v("Dues"),
      initial: () => ({ kind: b.duesOwed > 0 ? "payment" : "charge", amount: "", reason: "" }),
      validate: d => {
        if (d.kind === "payment") return null;
        const n = Number(d.amount);
        if (!(n > 0)) return "Enter an amount above $0.";
        if (d.kind === "waive" && n > b.duesOwed) return `That's more than the ${fmt$(b.duesOwed)} they owe.`;
        if (!d.reason.trim()) return "Add a reason. It's kept in the audit log.";
        return null;
      },
      commit: async d => {
        if (d.kind === "payment") { onPayDues(b); return; }
        const n = Math.round(Number(d.amount) * 100) / 100;
        const res = await requestJson<{ duesOwed: number }>("/api/dues/adjustments", {
          method: "POST", headers: JSON_HEADERS,
          body: JSON.stringify({ brotherId: b.id, delta: d.kind === "charge" ? n : -n, reason: d.reason.trim() }),
        });
        patchLocal(b.id, { duesOwed: res.duesOwed });
        return { text: d.kind === "charge" ? `Charged ${fmt$(n)}` : `Waived ${fmt$(n)}` };
      },
    };
    if (key.startsWith("excuse:")) {
      const row = history?.find(r => r.calendarEventId === Number(key.slice(7)));
      if (!row) return null;
      return {
        label: "Excuse",
        initial: () => ({ text: "" }),
        validate: d => d.text.trim() ? null : "Add a reason.",
        commit: async d => {
          const res = await requestJson<{ attendance?: number; excuseStatus?: AttendanceRow["excuseStatus"] }>("/api/excuses", {
            method: "POST", headers: JSON_HEADERS,
            body: JSON.stringify({ calendarEventId: row.calendarEventId, brotherId: b.id, reason: d.text.trim() }),
          });
          const status = res.excuseStatus ?? "approved";
          updateHistory(b.id, rows => rows.map(r => r.calendarEventId === row.calendarEventId
            ? { ...r, excused: status === "approved", excuseReason: d.text.trim(), excuseStatus: status, excuseRejection: null }
            : r));
          if (typeof res.attendance === "number") patchLocal(b.id, { attendance: res.attendance });
          return { text: status === "pending" ? "Excuse sent for review" : `Excused ${firstName(b.name)} for ${row.title}` };
        },
      };
    }
    if (key.startsWith("reject:")) {
      const row = history?.find(r => r.excuseId === Number(key.slice(7)));
      if (!row || row.excuseId === null) return null;
      const excuseId = row.excuseId;
      return {
        label: "Rejection note",
        initial: () => ({ text: "" }),
        commit: async d => {
          await decideExcuse(b, excuseId, "reject", d.text.trim() || undefined);
          return { text: "Excuse rejected" };
        },
      };
    }
    if (key === "remove") return {
      label: "Removal",
      initial: () => ({ text: "" }),
      validate: d => d.text.trim().toLowerCase() === b.name.trim().toLowerCase() ? null : "Type their name exactly to confirm.",
      commit: async () => { onDelete?.(b); },
    };
    // View-only popovers: att, service, roles, menu.
    return { label: "", initial: () => ({}) };
  }

  // ── Writes that aren't an editor ─────────────────────────────────────────
  async function clearExemption(b: Brother) {
    const res = await requestJson<{ attendance: number | null }>(`/api/exemptions/${b.id}`, { method: "DELETE" });
    if (res.attendance !== null) patchLocal(b.id, { attendance: res.attendance });
  }

  async function decideExcuse(b: Brother, excuseId: number, action: "approve" | "reject", note?: string) {
    try {
      const res = await requestJson<{ attendance?: number | null }>(`/api/excuses/${excuseId}`, {
        method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ action, rejectionNote: note }),
      });
      const attendance = res.attendance ?? null;
      updateHistory(b.id, rows => rows.map(r => r.excuseId === excuseId
        ? { ...r, excused: action === "approve", excuseStatus: action === "approve" ? "approved" : "rejected", excuseRejection: action === "reject" ? (note ?? null) : null }
        : r));
      if (attendance !== null) patchLocal(b.id, { attendance });
      onExcuseDecided?.(b.id, action, attendance);
    } catch (e) {
      // Someone else already decided it (e.g. from Timeline): resync instead of guessing.
      if ((e as { status?: number }).status === 409) {
        loadHistory(b.id);
        throw new Error("Someone already decided this excuse. The list is refreshed.");
      }
      throw e;
    }
  }

  async function grantRole(b: Brother, role: AvailableRole) {
    await requestJson(`/api/brothers/${b.id}/roles`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ roleId: role.id }) });
    setBrotherList(list => list.map(x => x.id === b.id
      ? { ...x, roles: [...(x.roles ?? []).filter(r => r.id !== role.id), role].sort((p, q) => q.rank - p.rank) }
      : x));
  }

  async function revokeRole(b: Brother, role: AvailableRole) {
    await requestJson(`/api/brothers/${b.id}/roles/${role.id}`, { method: "DELETE" });
    setBrotherList(list => list.map(x => x.id === b.id ? { ...x, roles: (x.roles ?? []).filter(r => r.id !== role.id) } : x));
  }

  /** A one-click write with a toast (and Undo when it has an inverse). */
  function runAction(work: () => Promise<Done>, failure: string) {
    if (busy) return;
    setBusy(true);
    work()
      .then(done => { if (done) showToast(done.text, done.undo); })
      .catch(e => showToast(apiErrorMessage(e, e instanceof Error && !("status" in e) ? e.message : failure), undefined, true))
      .finally(() => setBusy(false));
  }

  async function archive(b: Brother) {
    if (busy) return;
    setBusy(true);
    try {
      await requestJson(`/api/brothers/${b.id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ archived: true }) });
      // Archived members leave the default roster read, so drop the row and close.
      setBrotherList(list => list.filter(x => x.id !== b.id));
      onClose();
      appToast.success(`${firstName(b.name)} archived · seat freed`, {
        action: {
          label: "Undo",
          onClick: () => {
            requestJson(`/api/brothers/${b.id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ archived: false }) })
              .then(() => setBrotherList(list => list.some(x => x.id === b.id) ? list : [...list, b]))
              .catch(e => appToast.error(apiErrorMessage(e, `Couldn't restore ${firstName(b.name)}.`)));
          },
        },
      });
    } catch (e) {
      showToast(apiErrorMessage(e, "Couldn't archive. Nothing changed."), undefined, true);
    } finally {
      setBusy(false);
    }
  }

  // ── Edit API ─────────────────────────────────────────────────────────────
  const startEdit = (key: string) => {
    if (!brother) return;
    guarded(() => {
      const spec = specFor(key, brother);
      if (!spec) return;
      const init = spec.initial();
      setEditing(key); setDraft(init); baseline.current = JSON.stringify(init); setError(null);
    });
  };

  const save = (then?: () => void) => {
    if (!brother || !editing || saving) return;
    const spec = specFor(editing, brother);
    if (!spec?.commit) { stopEdit(); then?.(); return; }
    const err = spec.validate?.(draft) ?? null;
    if (err) { setError(err); return; }
    setSaving(true); setError(null);
    spec.commit(draft)
      .then(done => {
        stopEdit();
        if (done) showToast(done.text, done.undo);
        then?.();
      })
      .catch(e => {
        setSaving(false);
        setError(apiErrorMessage(e, e instanceof Error && !("status" in e) ? e.message : "Couldn't save. Nothing changed and your edit is still here. Try again."));
      });
  };

  const edit: EditApi = {
    editing, draft, saving, error,
    // Clicking the open popover's own trigger closes it, but still asks first if it's dirty.
    toggle: key => { if (editing === key) { guarded(() => {}); return; } startEdit(key); },
    set: (field, value) => { setDraft(d => ({ ...d, [field]: value })); if (error) setError(null); },
    save: () => save(),
    cancel: () => stopEdit(),
    act: fn => guarded(fn),
  };

  // ── Navigation ───────────────────────────────────────────────────────────
  const ids = order ?? brotherList.map(b => b.id);
  const pos = brother ? ids.indexOf(brother.id) : -1;
  const close = useCallback(() => guarded(() => onClose()), [guarded, onClose]);
  const step = (dir: 1 | -1) => {
    const next = ids[pos + dir];
    if (next === undefined || !onNavigate) return;
    guarded(() => { onNavigate(next); setSwapKey(k => k + 1); });
  };

  // Focus the card on open; return focus to whatever opened it on close.
  const isOpen = brother !== null;
  useEffect(() => {
    if (!isOpen) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    spotRef.current?.focus();
    return () => { if (lastFocus.current && document.contains(lastFocus.current)) lastFocus.current.focus(); };
  }, [isOpen]);

  // Keyboard: Esc backs out one level, Enter saves, ←/→ (j/k) step, Tab is trapped.
  // Ignored while focus is in a page modal stacked above (Record payment, Log hours).
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const spot = spotRef.current;
    if (!spot) return;
    const target = e.target as HTMLElement;
    if (target !== document.body && !spot.contains(target)) return;
    const inField = target.matches("input, select, textarea");
    if (e.key === "Escape") {
      e.preventDefault();
      if (guard) { setGuard(null); return; }
      if (editing) { stopEdit(); spot.focus(); return; }
      close();
      return;
    }
    if (e.key === "Enter" && inField && editing && target.tagName !== "SELECT") { e.preventDefault(); save(); return; }
    if (!inField && !editing && !guard) {
      if (e.key === "ArrowRight" || e.key === "j") { e.preventDefault(); step(1); return; }
      if (e.key === "ArrowLeft" || e.key === "k") { e.preventDefault(); step(-1); return; }
    }
    if (e.key === "Tab") {
      const f = [...spot.querySelectorAll<HTMLElement>("button:not(:disabled), input, select")].filter(x => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && (document.activeElement === f[0] || document.activeElement === spot)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => keyRef.current(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [isOpen]);

  if (!brother) return null;
  const b = brother;

  // ── Derived display ──────────────────────────────────────────────────────
  const exempt = isAttendanceExempt(b.attendance);
  const verdict = standingVerdict(b, thresholds, tracked, { self: isSelf, duesLabel: v("Dues"), serviceLabel: v("Service") });
  const roleNames = (b.roles ?? []).map(r => r.name);
  const subParts = [roleNames.join(" · ") || "Member"];
  if (profile) subParts.push(`since ${new Date(profile.joinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`);
  if (isSelf) subParts.push("you");

  const todayIso = new Date().toLocaleDateString("en-CA");
  const pastRows = (history ?? []).filter(r => r.attended !== null || r.excuseStatus !== null);
  const counted = pastRows.filter(r => r.attended !== null && !r.excused);
  const attendedCount = counted.filter(r => r.attended === true).length;
  // Only rows someone has to act on. Exempt members owe nothing, so nothing shows.
  const attention = exempt || !tracked.attendance ? [] : [
    ...pastRows.filter(r => r.excuseStatus === "pending"),
    ...pastRows.filter(r => r.attended === false && !r.excused && r.excuseStatus !== "pending")
      .sort((x, y) => y.date.localeCompare(x.date)),
  ];
  const showAttention = full && attention.length > 0;

  const avatarSrc = avatarDisplayUrl(isSelf ? (currentUser?.avatarUrl ?? b.avatarUrl ?? null) : (b.avatarUrl ?? null), isSelf ? avatarRevision : 0);
  const ringTone = full ? verdict.tone : "";
  const hasMenu = canBrothers || isSelf;
  const menuOpen = editing === "menu" || editing === "remove" || editing === "name";

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats: React.ReactNode[] = [];
  if (full && tracked.attendance) {
    stats.push(
      <Stat key="att" id="att" label="Attendance" edit={edit}
        value={exempt ? "Exempt" : `${b.attendance}%`}
        valueCls={exempt ? "none" : toneAttendance(b.attendance, thresholds)}
        caption={exempt ? `no obligation this ${v("Period").toLowerCase()}` : history ? `${attendedCount} of ${counted.length} events` : `goal ${thresholds.attendanceWatch}%`}>
        {editing === "exempt" ? (
          <>
            <p className="ttl">Exempt from attendance</p>
            <p className="sm">Their absences stop counting for this {v("Period").toLowerCase()} only.</p>
            <div className="fr">
              <select autoFocus className="wide" aria-label="Reason" value={draft.reason ?? "abroad"} onChange={e => edit.set("reason", e.target.value)}>
                {EXEMPT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <Hint edit={edit} />
            <SaveFoot edit={edit} label="Exempt" />
          </>
        ) : (
          <>
            <p className="ttl">Attendance · this {v("Period").toLowerCase()}</p>
            <p className="sm">
              {exempt ? "Exempt. Absences don't count this term."
                : history ? `${attendedCount} of ${counted.length} mandatory events · goal ${thresholds.attendanceWatch}%`
                : `Goal ${thresholds.attendanceWatch}%`}
            </p>
            {historyError ? (
              <p className="sm last">Couldn&apos;t load the event list. <button type="button" className="ms-linkbtn" onClick={() => loadHistory(b.id)}>Retry</button></p>
            ) : history === null ? (
              <div aria-hidden><div className="skel" /><div className="skel" style={{ width: "70%" }} /><div className="skel" style={{ width: "85%" }} /></div>
            ) : (
              <ul className="list">
                {[...history].sort((x, y) => y.date.localeCompare(x.date)).map(r => {
                  const [label, cls] = r.excused ? ["Excused", ""]
                    : r.excuseStatus === "pending" ? ["Excuse pending", "warn"]
                    : r.excuseStatus === "rejected" ? ["Not excused", "risk"]
                    : r.attended === true ? ["Attended", ""]
                    : r.attended === false ? ["Absent", "risk"]
                    : r.date.slice(0, 10) > todayIso ? ["Upcoming", ""]
                    : ["No record", ""];
                  return (
                    <li key={r.calendarEventId}>
                      <span>{r.title} <span className="when">· {fmtEventDate(r.date)}</span></span>
                      <span className={cls}>{label}</span>
                    </li>
                  );
                })}
                {history.length === 0 && <li><span>No mandatory events yet.</span><span /></li>}
              </ul>
            )}
            <DoneFoot edit={edit} extra={canAttendance ? (exempt
              ? <button type="button" className="ms-btn ghost" disabled={busy} onClick={() => edit.act(() => runAction(async () => {
                  await clearExemption(b);
                  return { text: "Exemption cleared" };
                }, "Couldn't clear the exemption."))}>Clear exemption</button>
              : <button type="button" className="ms-btn ghost" onClick={() => edit.toggle("exempt")}>Mark exempt…</button>
            ) : undefined} />
          </>
        )}
      </Stat>,
    );
  }
  if (full && tracked.gpa) {
    stats.push(
      <Stat key="gpa" id="gpa" label="GPA" edit={edit} value={b.gpa.toFixed(2)} valueCls={toneGpa(b.gpa, thresholds)} caption={`goal ${thresholds.gpaWatch.toFixed(2)}`}>
        {canBrothers ? (
          <>
            <p className="ttl">GPA</p>
            <p className="sm">Goal is {thresholds.gpaWatch.toFixed(2)}.</p>
            <div className="fr"><DraftInput edit={edit} label="GPA" numeric wide={false} step="0.01" max={4} /><span className="of">of 4.00</span></div>
            <Hint edit={edit} />
            <SaveFoot edit={edit} />
          </>
        ) : (
          <>
            <p className="ttl">GPA</p>
            <p className="sm last">{isSelf ? "Officers update it. If it looks wrong, tell an officer." : "Changing it needs Manage members."}</p>
            <DoneFoot edit={edit} />
          </>
        )}
      </Stat>,
    );
  }
  if (full && tracked.duesOwed) {
    const kind = draft.kind ?? "payment";
    stats.push(
      <Stat key="dues" id="dues" label={v("Dues")} edit={edit} align="right"
        value={b.duesOwed > 0 ? fmt$(b.duesOwed) : "Paid"} valueCls={b.duesOwed > 0 ? "t-warn" : ""}
        caption={b.duesOwed > 0 ? "owed" : "nothing owed"}>
        {canTreasury ? (
          <>
            <p className="ttl">{v("Dues")}</p>
            <p className="sm">{b.duesOwed > 0 ? `${fmt$(b.duesOwed)} owed.` : "Nothing owed."}</p>
            <div className="seg" role="group" aria-label="Kind">
              {(["payment", "charge", "waive"] as const).map(k => (
                <button key={k} type="button" aria-pressed={kind === k} disabled={k !== "charge" && b.duesOwed === 0}
                  onClick={() => { edit.set("kind", k); edit.set("amount", ""); }}>
                  {k[0].toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
            {kind === "payment" ? (
              <>
                <p className="sm last">Payments are recorded in Treasury, so the income entry and the balance move together.</p>
                <SaveFoot edit={edit} label="Record payment…" />
              </>
            ) : (
              <>
                <div className="fr">
                  <span className="of">$</span>
                  <DraftInput edit={edit} field="amount" label="Amount" numeric wide={false} step="0.01" />
                  <input className="wide" placeholder="Reason" aria-label="Reason" value={draft.reason ?? ""} onChange={e => edit.set("reason", e.target.value)} />
                </div>
                <Hint edit={edit} text="No money moves. Kept with your reason in the audit log." />
                <SaveFoot edit={edit} label={kind === "charge" ? "Charge" : "Waive"} />
              </>
            )}
          </>
        ) : (
          <>
            <p className="ttl">{v("Dues")}</p>
            <p className="sm last">{b.duesOwed > 0 ? `${fmt$(b.duesOwed)} owed.` : "Nothing owed."} {isSelf ? "Pay the treasurer and it shows up here." : "Recording payments needs Manage treasury."}</p>
            <DoneFoot edit={edit} />
          </>
        )}
      </Stat>,
    );
  }
  if (full && tracked.serviceHours) {
    const goal = thresholds.serviceHoursGoal;
    const met = b.serviceHours >= goal;
    stats.push(
      <Stat key="service" id="service" label={v("Service")} edit={edit} align="right"
        value={`${b.serviceHours}h`} valueCls={met ? "" : "t-warn"} caption={met ? "goal met" : `of ${goal}h`}>
        <p className="ttl">{v("Service")} · {b.serviceHours} of {goal}h</p>
        <p className="sm last">{canService ? "Hours come from service events. Log them against the event they were earned at." : `The ${v("Service").toLowerCase()} chair logs hours after each event.`}</p>
        <DoneFoot edit={edit} extra={canService
          ? <button type="button" className="ms-btn primary" onClick={() => edit.act(() => onLogServiceHours(b))}>Log hours…</button>
          : undefined} />
      </Stat>,
    );
  }

  // ── Needs attention ──────────────────────────────────────────────────────
  const attentionSection = showAttention && (
    <section aria-label="Needs attention">
      <h3 className="ms-h3">Needs attention</h3>
      {attention.slice(0, 3).map(r => {
        const pending = r.excuseStatus === "pending";
        const meta = `${fmtEventDate(r.date)} · ${pending ? `excuse pending: “${r.excuseReason ?? ""}”`
          : r.excuseStatus === "rejected" ? `excuse not approved${r.excuseRejection ? ` (${r.excuseRejection})` : ""}`
          : "absent, no excuse"}`;
        const excuseKey = `excuse:${r.calendarEventId}`;
        const rejectKey = r.excuseId !== null ? `reject:${r.excuseId}` : "";
        const open = editing === excuseKey || (rejectKey !== "" && editing === rejectKey);
        let acts: React.ReactNode = null;
        if (!open) {
          if (pending && canAttendance && r.excuseId !== null) {
            const excuseId = r.excuseId;
            acts = <>
              <button type="button" className="ms-tact" disabled={busy} onClick={() => edit.act(() => runAction(async () => {
                await decideExcuse(b, excuseId, "approve");
                return { text: `Approved: ${r.title}, ${fmtEventDate(r.date)}` };
              }, "Couldn't approve the excuse."))}>Approve</button>
              <button type="button" className="ms-tact quiet" onClick={() => edit.toggle(rejectKey)}>Reject</button>
            </>;
          } else if (pending && isSelf) {
            acts = <span className="ms-waiting">Waiting</span>;
          } else if (!pending && (canAttendance || isSelf)) {
            acts = <button type="button" className="ms-tact" onClick={() => edit.toggle(excuseKey)}>{isSelf && !canAttendance ? "Request excuse" : "Excuse"}</button>;
          }
        }
        const rejecting = editing === rejectKey && rejectKey !== "";
        const selfRequest = isSelf && !canAttendance;
        return (
          <div key={r.calendarEventId} className="ms-ev">
            <div style={{ minWidth: 0 }}>
              <div className="t">{r.title}</div>
              <div className="m2" title={r.excuseReason ?? r.excuseRejection ?? ""}>{meta}</div>
            </div>
            <div className="acts">{acts}</div>
            {open && (
              <Pop label={rejecting ? "Reject excuse" : "Excuse"} cls="up right">
                <p className="ttl">{rejecting ? "Reject excuse" : selfRequest ? "Request an excuse" : `Excuse ${firstName(b.name)}`}</p>
                <p className="sm">{r.title}, {fmtEventDate(r.date)}. {rejecting ? `${firstName(b.name)} sees your note.` : selfRequest ? "Goes to the attendance chair." : "Approved right away."}</p>
                <div className="fr"><DraftInput edit={edit} field="text" label={rejecting ? "Rejection note" : "Reason"} placeholder={rejecting ? "Note (optional)" : "Reason"} /></div>
                <Hint edit={edit} />
                <SaveFoot edit={edit} label={rejecting ? "Reject" : selfRequest ? "Send" : "Excuse"} tone={rejecting ? "danger" : "primary"} />
              </Pop>
            )}
          </div>
        );
      })}
      {attention.length > 3 && (
        <p className="ms-calm">+{attention.length - 3} more in <button type="button" className="ms-linkbtn" onClick={() => edit.toggle("att")}>Attendance</button></p>
      )}
    </section>
  );

  // ── About ────────────────────────────────────────────────────────────────
  const assigned = b.roles ?? [];
  const grantable = (availableRoles ?? []).filter(r => !assigned.some(a => a.id === r.id) && r.rank < myMaxRank);
  const rows: React.ReactNode[] = [];
  rows.push(
    <Row key="roles" id="roles" label="Roles" edit={edit} editable={canRoles}
      value={roleNames.join(", ") || "Member"} valueCls={roleNames.length ? "" : "empty"}
      editor={() => (
        <>
          <p className="ttl">Roles</p>
          <p className="sm">Changes save right away.</p>
          <div className="ms-chips" style={{ marginBottom: 12 }}>
            {assigned.length === 0 && <span style={{ color: "var(--faint)", fontSize: 13 }}>No roles</span>}
            {assigned.map(r => {
              const revokeable = r.rank < myMaxRank;
              return (
                <span key={r.id} className={`ms-chip ${revokeable ? "" : "fixed"}`}>
                  <i style={{ background: r.color ?? "var(--muted)" }} />
                  {r.name}
                  {revokeable && (
                    <button type="button" aria-label={`Remove ${r.name}`} disabled={busy} onClick={() => runAction(async () => {
                      await revokeRole(b, r);
                      return { text: `Removed ${r.name}`, undo: () => grantRole(b, r) };
                    }, `Couldn't remove ${r.name}.`)}>{Icon.xs}</button>
                  )}
                </span>
              );
            })}
          </div>
          {grantable.length > 0 ? (
            <div className="fr">
              <select autoFocus className="wide" aria-label="Add a role" value="" disabled={busy} onChange={e => {
                const role = grantable.find(r => r.id === Number(e.target.value));
                if (role) runAction(async () => {
                  await grantRole(b, role);
                  return { text: `Added ${role.name}`, undo: () => revokeRole(b, role) };
                }, `Couldn't add ${role.name}.`);
              }}>
                <option value="">Add a role…</option>
                {grantable.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          ) : (
            <p className="sm last">{availableRoles === null ? "Loading roles…" : "No other roles you can grant."}</p>
          )}
          <DoneFoot edit={edit} />
        </>
      )}
    />,
  );
  rows.push(
    <Row key="email" id="email" label="Email" edit={edit}
      value={profileData === "error" ? "Couldn't load" : profile ? (profile.email ?? "Not on file") : "…"}
      valueCls={profile?.email ? "" : "empty"} title={profile?.email ?? undefined}
      action={profile?.email
        ? <button type="button" className="ms-tact quiet e" onClick={() => {
            const email = profile.email!;
            edit.act(() => {
              // navigator.clipboard is undefined outside a secure context (plain-http LAN dev).
              if (!navigator.clipboard) { showToast("Couldn't copy. Select it instead.", undefined, true); return; }
              navigator.clipboard.writeText(email).then(() => showToast("Email copied"), () => showToast("Couldn't copy. Select it instead.", undefined, true));
            });
          }}>Copy</button>
        : <span />}
    />,
  );
  for (const def of fieldDefs) {
    const raw = b.customFields?.[def.id];
    const empty = raw === null || raw === undefined || String(raw).trim() === "";
    rows.push(
      <Row key={`cf:${def.id}`} id={`cf:${def.id}`} plain={def.label} edit={edit} editable={canEditProfile}
        label={<>{def.label}{def.required && <span className="req" aria-label="required">*</span>}</>}
        value={empty ? (def.required ? "Missing" : "—") : String(raw)}
        valueCls={empty ? (def.required ? "miss" : "empty") : ""}
        title={empty ? undefined : String(raw)}
        editor={() => (
          <>
            <p className="ttl">{def.label}</p>
            {def.required && <p className="sm">Required by your chapter.</p>}
            <div className="fr"><DraftInput edit={edit} label={def.label} numeric={def.type === "number"} placeholder={def.placeholder ?? undefined} /></div>
            <Hint edit={edit} />
            <SaveFoot edit={edit} />
          </>
        )}
      />,
    );
  }
  if (full) {
    for (const m of metricRows) {
      const unit = m.unit ?? "";
      rows.push(
        <Row key={`metric:${m.definitionId}`} id={`metric:${m.definitionId}`} label={m.name} plain={m.name} edit={edit} editable={canEditProfile}
          value={m.value === null ? "—" : <>{m.value}{unit} <span className="of">of {m.goal}{unit}</span></>}
          valueCls={m.value === null ? "empty" : m.status === "at_risk" ? "miss" : ""}
          editor={() => (
            <>
              <p className="ttl">{m.name}</p>
              <p className="sm">Goal {m.goal}{unit}.</p>
              <div className="fr"><DraftInput edit={edit} label={m.name} numeric wide={false} step="any" />{unit && <span className="of">{unit}</span>}</div>
              <Hint edit={edit} />
              <SaveFoot edit={edit} />
            </>
          )}
        />,
      );
    }
  }

  const lowerCls = !full ? "solo" : showAttention ? "" : "span";

  return (
    <div className="ms-overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div
        ref={spotRef}
        className={`ms-spot ${full ? "" : "narrow"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ms-name"
        tabIndex={-1}
        onClick={e => {
          // A click outside the open popover closes it (asking first if it's dirty).
          if (editing && !(e.target as Element).closest(".ms-pop, .ms-guard, button, input, select")) guarded(() => {});
        }}
      >
        <div className="ms-head">
          {avatarSrc
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className={`ms-av ${ringTone}`} src={avatarSrc} alt="" referrerPolicy="no-referrer" />
            : <span className={`ms-av ${ringTone}`} aria-hidden>{initials(b.name)}</span>}
          <div className="ms-who">
            <h2 id="ms-name">{b.name}</h2>
            <div className="ms-sub">{subParts.join(" · ")}</div>
          </div>
          <div className="ms-ctl">
            {hasMenu && (
              <button type="button" className="ms-ibtn" aria-label="More" aria-haspopup="true" aria-expanded={menuOpen} onClick={() => edit.toggle(menuOpen ? editing! : "menu")}>{Icon.more}</button>
            )}
            {onNavigate && <>
              <button type="button" className="ms-ibtn hide-sm" aria-label="Previous member (←)" title="Previous (←)" disabled={pos <= 0} onClick={() => step(-1)}>{Icon.left}</button>
              <button type="button" className="ms-ibtn hide-sm" aria-label="Next member (→)" title="Next (→)" disabled={pos < 0 || pos >= ids.length - 1} onClick={() => step(1)}>{Icon.right}</button>
            </>}
            <button type="button" className="ms-ibtn" aria-label="Close (esc)" title="Close (esc)" onClick={close}>{Icon.x}</button>

            {editing === "menu" && (
              <Pop label="More" cls="right">
                <div className="ms-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => edit.toggle("name")}>
                    <b>Rename</b><small>How this chapter shows {isSelf ? "you" : "them"}</small>
                  </button>
                  {canBrothers && !isSelf && <>
                    <button type="button" role="menuitem" disabled={busy} onClick={() => { stopEdit(); archive(b); }}>
                      <b>Archive</b><small>Hide from the roster and free a seat. History stays.</small>
                    </button>
                    {onDelete && (
                      <button type="button" role="menuitem" className="danger" onClick={() => edit.toggle("remove")}>
                        <b>Remove permanently…</b><small>For erasure requests or mistakes</small>
                      </button>
                    )}
                  </>}
                </div>
              </Pop>
            )}
            {editing === "name" && (
              <Pop label="Rename" cls="right">
                <p className="ttl">Name in {currentUser?.org?.name ?? "this chapter"}</p>
                <p className="sm">Other chapters keep their own name for {isSelf ? "you" : "them"}.</p>
                <div className="fr"><DraftInput edit={edit} label="Name" /></div>
                <Hint edit={edit} />
                <SaveFoot edit={edit} />
              </Pop>
            )}
            {editing === "remove" && (
              <Pop label="Remove permanently" cls="right danger">
                <p className="ttl">Remove {b.name} permanently?</p>
                <p className="sm">Erases their attendance, excuses, service log and metrics here. Ledger entries stay, without their name.</p>
                <div className="fr"><DraftInput edit={edit} field="text" label="Type the member's name to confirm" placeholder="Type their name to confirm" /></div>
                <Hint edit={edit} />
                <SaveFoot edit={edit} label="Remove" tone="danger"
                  disabled={(draft.text ?? "").trim().toLowerCase() !== b.name.trim().toLowerCase()} />
              </Pop>
            )}
          </div>
        </div>

        <div className="ms-swapper" key={swapKey}>
          {full ? (
            <>
              <p className="ms-verdict" aria-live="polite">
                {verdict.lead}<em className={verdict.tone}>{verdict.em}</em>{verdict.tail}
              </p>
              {stats.length > 0 && <div className={`ms-stats c${stats.length}`}>{stats}</div>}
              <div className="ms-rule" />
            </>
          ) : (
            <div className="ms-rule" style={{ marginTop: 26 }} />
          )}
          <div className={`ms-lower ${lowerCls}`}>
            {attentionSection}
            <section aria-label="About">
              <h3 className="ms-h3">About</h3>
              <div className="ms-rows">{rows}</div>
              {!full && <p className="ms-note">Standing, GPA and {v("Dues").toLowerCase()} are only visible to officers and to {firstName(b.name)}.</p>}
            </section>
          </div>
        </div>

        {guard && (
          <div className="ms-guard" role="alertdialog" aria-label="Unsaved change">
            <span>Unsaved change to <b>{brother && editing ? specFor(editing, brother)?.label : ""}</b></span>
            <button type="button" className="ms-btn ghost" onClick={() => { const fn = guard.fn; setGuard(null); stopEdit(); fn(); }}>Discard</button>
            <button type="button" className="ms-btn primary" autoFocus onClick={() => { const fn = guard.fn; setGuard(null); save(fn); }}>Save</button>
          </div>
        )}
        {toast && !guard && (
          <div className={`ms-toast ${toast.err ? "err" : ""}`} role="status">
            <span>{toast.text}</span>
            {toast.undo && (
              <button type="button" className="ms-linkbtn" disabled={busy} onClick={() => {
                const undo = toast.undo!;
                setToast(null);
                runAction(async () => { await undo(); return { text: "Undone" }; }, "Couldn't undo.");
              }}>Undo</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
