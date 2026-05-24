"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "../../context/ChapterContext";

interface AvailableRole {
  id: number;
  name: string;
  color: string | null;
  rank: number;
}

interface AssignedRole {
  id: number;
  name: string;
  color: string | null;
  rank: number;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.error === "string" ? `: ${body.error}` : "";
    } catch { /* ignore */ }
    throw new Error(`${url} returned ${res.status}${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Inline per-brother role editor used inside Accounts rows. Shows colored
 * chips for each assigned role with a × to revoke; an "+ role" button opens
 * a popover of assignable roles (rank-filtered to roles strictly below the
 * caller's own max rank).
 */
export function BrotherRoleChips({
  brotherId,
  initialRoles,
  onChange,
  onError,
}: {
  brotherId: number;
  initialRoles: AssignedRole[];
  onChange?: () => void;
  onError: (msg: string) => void;
}) {
  const { currentUser, can } = useChapter();
  const canManage = can("MANAGE_ROLES");
  const myMaxRank = currentUser?.maxRank ?? 0;

  const [assigned, setAssigned] = useState<AssignedRole[]>(initialRoles);
  const [available, setAvailable] = useState<AvailableRole[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [busyRoleId, setBusyRoleId] = useState<number | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Sync external prop updates back into local state (e.g. parent refresh).
  useEffect(() => { setAssigned(initialRoles); }, [initialRoles]);

  // Close the popover when clicking outside it.
  useEffect(() => {
    if (!picking) return;
    function onDocClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPicking(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [picking]);

  async function openPicker() {
    setPicking(true);
    if (available) return;
    try {
      const all = await requestJson<AvailableRole[]>("/api/roles");
      setAvailable(all);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not load roles.");
      setPicking(false);
    }
  }

  async function grant(role: AvailableRole) {
    setBusyRoleId(role.id);
    try {
      await requestJson(`/api/brothers/${brotherId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: role.id }),
      });
      setAssigned(prev => [...prev, role].sort((a, b) => b.rank - a.rank));
      setPicking(false);
      onChange?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to grant role.");
    } finally {
      setBusyRoleId(null);
    }
  }

  async function revoke(role: AssignedRole) {
    setBusyRoleId(role.id);
    try {
      await requestJson(`/api/brothers/${brotherId}/roles/${role.id}`, { method: "DELETE" });
      setAssigned(prev => prev.filter(r => r.id !== role.id));
      onChange?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to revoke role.");
    } finally {
      setBusyRoleId(null);
    }
  }

  // Roles eligible to grant: not already assigned, and rank strictly below mine.
  const grantable = useMemo(() => {
    if (!available) return [];
    const have = new Set(assigned.map(r => r.id));
    return available.filter(r => !have.has(r.id) && r.rank < myMaxRank);
  }, [available, assigned, myMaxRank]);

  if (assigned.length === 0 && !canManage) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {assigned.map(r => {
        const revokeable = canManage && r.rank < myMaxRank;
        return (
          <span
            key={r.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset"
            style={{
              background: r.color ? `${r.color}1a` : "rgba(255,255,255,0.04)",
              color: r.color ?? "rgba(255,255,255,0.7)",
              borderColor: r.color ? `${r.color}40` : "rgba(255,255,255,0.1)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: r.color ?? "rgba(255,255,255,0.3)" }}
              aria-hidden="true"
            />
            {r.name}
            {revokeable && (
              <button
                onClick={() => revoke(r)}
                disabled={busyRoleId === r.id}
                aria-label={`Revoke ${r.name}`}
                className="ml-0.5 -mr-0.5 rounded-full px-1 leading-none text-current/70 hover:bg-white/10 disabled:opacity-40"
              >
                ×
              </button>
            )}
          </span>
        );
      })}

      {canManage && (
        <div className="relative">
          <button
            onClick={openPicker}
            className="inline-flex items-center gap-0.5 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/55 ring-1 ring-inset ring-white/10 hover:bg-white/[0.08] hover:text-white/80"
          >
            + role
          </button>

          {picking && (
            <div
              ref={popoverRef}
              role="dialog"
              className="absolute left-0 top-full z-30 mt-1 w-52 rounded-lg border border-white/[0.1] bg-[#0e1018] p-1.5 shadow-lg shadow-black/40"
            >
              {!available ? (
                <p className="px-2 py-1.5 text-[11px] text-white/40">Loading…</p>
              ) : grantable.length === 0 ? (
                <p className="px-2 py-1.5 text-[11px] text-white/40">No roles you can grant.</p>
              ) : (
                <ul className="space-y-0.5">
                  {grantable.map(r => (
                    <li key={r.id}>
                      <button
                        onClick={() => grant(r)}
                        disabled={busyRoleId === r.id}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-white/85 hover:bg-white/[0.06] disabled:opacity-50"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: r.color ?? "rgba(255,255,255,0.3)" }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{r.name}</span>
                        <span className="ml-auto text-[10px] text-white/35">r{r.rank}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
