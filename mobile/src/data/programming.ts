/**
 * Programming over the wire (GET /api/programming, writes MANAGE_EVENTS):
 *
 *   useProgramming        the board, every lane
 *   useRoles              GET /api/roles, for the owner picker
 *   useProgrammingDocs    links attached to one event
 *
 * Writes return the saved event, which replaces its row in the cache at once.
 * Optimistic where the web is (a stage move shows in its new lane while it saves and
 * snaps back on a refusal). A move into or out of Confirmed also changes the calendar
 * (publishing mirrors the event onto the Timeline), so those refresh it.
 *
 * Request bodies are written out here: lib/validation/programming pulls the schedule
 * schema, which needs Temporal, and mobile/ only imports types from the server.
 */
import type { ProgrammingDoc, ProgrammingEvent, ProgrammingStage, RoleChip } from "@/lib/api-types";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { calKeys } from "./calendar";
import { queryClient } from "./query";

export const progKeys = {
  list: (slug: string | null) => ["programming", slug] as const,
  roles: (slug: string | null) => ["roles", slug] as const,
  docs: (slug: string | null, id: number) => ["programmingDocs", slug, id] as const,
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

export function useProgrammingDocs(id: number | null) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: progKeys.docs(slug, id ?? 0),
    queryFn: () => api<ProgrammingDoc[]>(`/api/programming/${id}/docs`, { org: slug }),
    enabled: id != null,
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

export async function attachDoc(id: number, title: string, url: string): Promise<ProgrammingDoc> {
  const doc = await api<ProgrammingDoc>(`/api/programming/${id}/docs`, { method: "POST", body: { title, url }, org: slugNow() });
  queryClient.setQueryData<ProgrammingDoc[]>(progKeys.docs(slugNow(), id), l => [doc, ...(l ?? [])]);
  void queryClient.invalidateQueries({ queryKey: ["docs", slugNow()] });
  return doc;
}

export async function detachDoc(id: number, docId: number): Promise<void> {
  const key = progKeys.docs(slugNow(), id);
  const before = queryClient.getQueryData<ProgrammingDoc[]>(key);
  queryClient.setQueryData<ProgrammingDoc[]>(key, l => (l ?? []).filter(d => d.id !== docId));
  try {
    await api<null>(`/api/programming/${id}/docs/${docId}`, { method: "DELETE", org: slugNow() });
  } catch (e) {
    queryClient.setQueryData(key, before);
    throw e;
  }
}
