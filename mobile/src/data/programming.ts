/**
 * Programming over the wire (GET /api/programming, writes MANAGE_EVENTS):
 *
 *   useProgramming        the board, every lane
 *   useRoles              GET /api/roles, for the owner picker
 *   useEventFields        GET /api/events/fields, the org's optional fields
 *   useEventTransactions  GET /api/transactions?calendarEventId=, a published event's spend
 *
 * Writes return the saved event, which replaces its row in the cache at once.
 * Optimistic where the web is (a stage move shows in its new lane while it saves and
 * snaps back on a refusal). A move into or out of Confirmed also changes the calendar
 * (publishing mirrors the event onto the Timeline), so those refresh it.
 *
 * Request bodies are written out here: lib/validation/programming pulls the schedule
 * schema, which needs Temporal, and mobile/ only imports types from the server.
 */
import type { EventFieldRow, ProgrammingEvent, ProgrammingStage, RoleChip, Transaction } from "@/lib/api-types";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { calKeys } from "./calendar";
import { queryClient } from "./query";

export const progKeys = {
  list: (slug: string | null) => ["programming", slug] as const,
  roles: (slug: string | null) => ["roles", slug] as const,
  fields: (slug: string | null) => ["eventFields", slug] as const,
  txns: (slug: string | null, calendarEventId: number) => ["transactions", slug, "event", calendarEventId] as const,
};

const slugNow = () => activeOrg.get().slug;

export function useProgramming(enabled = true) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: progKeys.list(slug),
    queryFn: () => api<ProgrammingEvent[]>("/api/programming", { org: slug }),
    enabled,
  });
}

export function useRoles(enabled: boolean) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: progKeys.roles(slug),
    queryFn: () => api<RoleChip[]>("/api/roles", { org: slug }),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useEventFields(enabled = true) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: progKeys.fields(slug),
    queryFn: () => api<EventFieldRow[]>("/api/events/fields", { org: slug }),
    enabled,
  });
}

/** Linked transactions for a published event (the treasury writes them; anyone may read). */
export function useEventTransactions(calendarEventId: number | null) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: progKeys.txns(slug, calendarEventId ?? 0),
    queryFn: () => api<Transaction[]>(`/api/transactions?calendarEventId=${calendarEventId}`, { org: slug }),
    enabled: calendarEventId != null,
  });
}

/* ── bodies (lib/validation/programming, as the app sends them) ─────────────────── */

type Schedule =
  | { kind: "timed"; start: string; end?: string; timeZone: string }
  | { kind: "allDay"; start: string; end: string };

export interface NewProgrammingBody {
  title: string;
  category: string;
  dueDate?: string | null;
  schedule?: Schedule | null;
  time?: string | null;
  location?: string | null;
  collab?: string | null;
  mandatory?: boolean;
  ownerBrotherId?: number | null;
  ownerRoleId?: number | null;
  /** Sent as the web sends them; the create schema keeps status and drops description. */
  status?: string;
  description?: string | null;
}

export interface ProgrammingPatch {
  title?: string;
  category?: string;
  dueDate?: string | null;
  schedule?: Schedule | null;
  time?: string | null;
  location?: string | null;
  collab?: string | null;
  mandatory?: boolean;
  description?: string | null;
  ownerBrotherId?: number | null;
  ownerRoleId?: number | null;
  spendingCents?: number;
  successRating?: number | null;
  wrapUpNotes?: string | null;
  attachmentUrl?: string | null;
  attachmentDocId?: number | null;
  fieldValues?: Record<string, string | number | boolean | null>;
  detachedFields?: string[];
}

/* ── cache ──────────────────────────────────────────────────────────────────────── */

function put(saved: ProgrammingEvent) {
  queryClient.setQueryData<ProgrammingEvent[]>(progKeys.list(slugNow()), l => {
    if (!l) return [saved];
    return l.some(e => e.id === saved.id) ? l.map(e => (e.id === saved.id ? saved : e)) : [...l, saved];
  });
}

/** Change rows in place; returns the undo. */
export function setProgramming(fn: (l: ProgrammingEvent[]) => ProgrammingEvent[]): () => void {
  const key = progKeys.list(slugNow());
  const before = queryClient.getQueryData<ProgrammingEvent[]>(key);
  if (before) queryClient.setQueryData(key, fn(before));
  return () => queryClient.setQueryData(key, before);
}

const published = (s: ProgrammingStage) => s === "confirmed" || s === "done";

function calendarMoved() {
  void queryClient.invalidateQueries({ queryKey: calKeys.events(slugNow()) });
  void queryClient.invalidateQueries({ queryKey: ["home", slugNow()] });
}

/* ── writes ─────────────────────────────────────────────────────────────────────── */

export async function createProgramming(body: NewProgrammingBody): Promise<ProgrammingEvent> {
  const saved = await api<ProgrammingEvent>("/api/programming", { method: "POST", body, org: slugNow() });
  put(saved);
  return saved;
}

export async function patchProgramming(id: number, patch: ProgrammingPatch): Promise<ProgrammingEvent> {
  const saved = await api<ProgrammingEvent>(`/api/programming/${id}`, { method: "PATCH", body: patch, org: slugNow() });
  put(saved);
  if (published(saved.stage)) calendarMoved();
  return saved;
}

/**
 * Move lanes. Shows the event in its new lane at once and puts it back if the server
 * refuses. `dueDate` rides along only when taking a published event back off the
 * Timeline onto a new day.
 */
export async function moveStage(ev: ProgrammingEvent, stage: ProgrammingStage, dueDate?: string): Promise<ProgrammingEvent> {
  const undo = setProgramming(l => l.map(e => (e.id === ev.id ? { ...e, stage } : e)));
  try {
    const saved = await api<ProgrammingEvent>(`/api/programming/${ev.id}/stage`, {
      method: "PATCH", body: dueDate ? { stage, dueDate } : { stage }, org: slugNow(),
    });
    put(saved);
    if (published(stage) !== published(ev.stage)) calendarMoved();
    return saved;
  } catch (e) {
    undo();
    throw e;
  }
}

export async function deleteProgramming(id: number): Promise<void> {
  const before = queryClient.getQueryData<ProgrammingEvent[]>(progKeys.list(slugNow()))?.find(e => e.id === id);
  await api<null>(`/api/programming/${id}`, { method: "DELETE", org: slugNow() });
  setProgramming(l => l.filter(e => e.id !== id));
  if (before && published(before.stage)) calendarMoved();
}

/** A new optional field for every event (MANAGE_EVENTS): the server derives its slug. */
export async function createEventField(label: string, kind: EventFieldRow["kind"]): Promise<EventFieldRow> {
  const row = await api<EventFieldRow>("/api/events/fields", { method: "POST", body: { label, kind }, org: slugNow() });
  queryClient.setQueryData<EventFieldRow[]>(progKeys.fields(slugNow()), l => [...(l ?? []), row]);
  return row;
}

/** A transaction landed against an event: its linked list re-reads. */
export function eventTxnsMoved(calendarEventId: number) {
  void queryClient.invalidateQueries({ queryKey: progKeys.txns(slugNow(), calendarEventId) });
}
