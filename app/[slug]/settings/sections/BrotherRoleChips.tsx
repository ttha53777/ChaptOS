"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "../../../context/ChapterContext";
import { requestJson } from "../../../lib/api";

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

  // Eagerly load the role list once per chip-managing user so we can:
  //   1. hide the "+ role" button entirely when there's nothing to grant
  //   2. open the popover with no perceptible loading delay
  // The list is small (≤ a dozen roles), the endpoint is cached server-side
  // by Next, and we never refetch — assignments mutate, role definitions don't.
  useEffect(() => {
    if (!canManage) return;
    if (available !== null) return;
    let cancelled = false;
    requestJson<AvailableRole[]>("/api/roles")
      .then(list => { if (!cancelled) setAvailable(list); })
      .catch(err => { if (!cancelled) onError(err instanceof Error ? err.message : "Could not load roles."); });
    return () => { cancelled = true; };
  }, [canManage, available, onError]);

  // Close the popover when clicking outside it OR when Escape is pressed.
  // Both listeners are scoped to `picking === true` so they detach when closed.
  useEffect(() => {
    if (!picking) return;
    function onDocClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPicking(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPicking(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [picking]);

  function openPicker() {
    // `available` is loaded eagerly in the effect above, so opening the picker
    // is just a state toggle now — no async fetch, no "Loading…" jank.
    setPicking(true);
  }

  async function grant(role: AvailableRole) {
    setBusyRoleId(role.id);
    try {
      await requestJson(`/api/brothers/${brotherId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: role.id }),
      });
      // Idempotent insert: never add a role the brother already holds. Guards
      // against a double-click / fast re-grant racing ahead of this state update,
      // which would otherwise show the same role chip twice (the DB composite PK
      // already rejects a true duplicate row — this keeps the UI in sync).
      setAssigned(prev =>
        prev.some(r => r.id === role.id)
          ? prev
          : [...prev, role].sort((a, b) => b.rank - a.rank)
      );
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
              // Stronger ring alpha (0x66 vs 0x40) so chips are visibly bounded
              // on dark backgrounds. Null-color chips fall back to a neutral
              // light gray that doesn't disappear.
              borderColor: r.color ? `${r.color}66` : "rgba(255,255,255,0.18)",
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

      {/* Hide the button entirely when there's nothing the caller can grant —
          either because every assignable role is already on this brother, or
          because rank hierarchy puts every role out of reach. Avoids a dead
          click that just opens an empty popover. While `available` is still
          loading we keep the button visible so it doesn't pop in late. */}
      {canManage && (available === null || grantable.length > 0) && (
        <div className="relative">
          <button
            onClick={openPicker}
            disabled={available === null}
            aria-label="Grant role"
            aria-haspopup="menu"
            aria-expanded={picking}
            className="inline-flex items-center gap-0.5 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/55 ring-1 ring-inset ring-white/10 hover:bg-white/[0.08] hover:text-white/80 disabled:opacity-50 disabled:cursor-wait"
          >
            + role
          </button>

          {picking && (
            <div
              ref={popoverRef}
              role="menu"
              aria-label="Grant role"
              aria-orientation="vertical"
              className="absolute left-0 top-full z-30 mt-1 w-52 rounded-lg border border-white/[0.1] bg-[#0e1018] p-1.5 shadow-lg shadow-black/40"
            >
              {!available ? (
                // Skeleton rows give a clear "still fetching" feel that
                // visually differs from the "no roles to grant" empty state.
                <div className="space-y-1 px-2 py-1.5" aria-hidden="true">
                  <div className="h-3 w-3/4 rounded bg-white/[0.05]" />
                  <div className="h-3 w-1/2 rounded bg-white/[0.05]" />
                  <div className="h-3 w-2/3 rounded bg-white/[0.05]" />
                </div>
              ) : grantable.length === 0 ? (
                <p className="px-2 py-1.5 text-[11px] text-white/40">No roles you can grant.</p>
              ) : (
                <ul className="space-y-0.5">
                  {grantable.map(r => (
                    <li key={r.id} role="none">
                      <button
                        role="menuitem"
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
