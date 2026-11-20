/**
 * Parties over the wire (GET /api/parties, writes MANAGE_PARTIES):
 *
 *   useParties      the house ledger, every party
 *   usePartyRolls   GET /api/parties/attendance-summary: present/eligible per rolled party
 *
 * A party is also a Timeline entry (its calendar event) and Treasury's door money
 * (/api/treasury adds every party's door into the balance and the monthly line), so
 * every write refreshes the calendar, home and the treasury along with the ledger.
 *
 * Writes return the saved party, which replaces its row at once. Delete is optimistic
 * (the row goes, and comes back on a refusal), as on the web.
 *
 * Request bodies are written out here: lib/validation/party pulls the schedule
 * schema, which needs Temporal, and mobile/ only imports types from the server.
 */
import type { Party, PartyRollRow } from "@/lib/api-types";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { calKeys } from "./calendar";
import { moneyKeys } from "./money";
import { queryClient } from "./query";

export const partyKeys = {
  list: (slug: string | null) => ["parties", slug] as const,
  rolls: (slug: string | null) => ["partyRolls", slug] as const,
};

const slugNow = () => activeOrg.get().slug;

export function useParties(enabled = true) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: partyKeys.list(slug),
    queryFn: () => api<Party[]>("/api/parties", { org: slug }),
    enabled,
  });
}

export function usePartyRolls(enabled = true) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: partyKeys.rolls(slug),
    queryFn: () => api<PartyRollRow[]>("/api/parties/attendance-summary", { org: slug }),
    enabled,
  });
}

/* ── bodies (lib/validation/party, as the app sends them) ────────────────────────── */

export type Schedule =
  | { kind: "timed"; start: string; end?: string; timeZone: string }
  | { kind: "allDay"; start: string; end: string };

export interface NewPartyBody {
  name: string;
  date: string;
  schedule?: Schedule | null;
  partyType: "Open" | "Closed";
  theme?: string;
  collabOrg?: string;
  /** Treasury's Add Party Event sends the door take with the party. */
  doorRevenue?: number;
  attendance?: number;
  expenses?: number;
  notes?: string;
}

export interface PartyPatch {
  name?: string;
  date?: string;
  schedule?: Schedule | null;
  partyType?: "Open" | "Closed";
  theme?: string;
  collabOrg?: string;
  doorRevenue?: number;
  attendance?: number;
  expenses?: number;
  notes?: string;
  completed?: boolean;
}

export interface WrapUpBody {
  doorRevenue: number;
  expenses: number;
  notes: string;
  /** Present = take the roll (everyone not listed is marked absent). */
  attendedIds?: number[];
  mandatory?: boolean;
}

/* ── cache ──────────────────────────────────────────────────────────────────────── */

function put(saved: Party) {
  queryClient.setQueryData<Party[]>(partyKeys.list(slugNow()), l => {
    if (!l) return [saved];
    return l.some(p => p.id === saved.id) ? l.map(p => (p.id === saved.id ? saved : p)) : [...l, saved];
  });
}

/** The Timeline entry and Treasury's door money move with every party write. */
function elsewhere() {
  const slug = slugNow();
  void queryClient.invalidateQueries({ queryKey: calKeys.events(slug) });
  void queryClient.invalidateQueries({ queryKey: ["home", slug] });
  void queryClient.invalidateQueries({ queryKey: moneyKeys.treasury(slug) });
}

/* ── writes ─────────────────────────────────────────────────────────────────────── */

export async function createParty(body: NewPartyBody): Promise<Party> {
  const saved = await api<Party>("/api/parties", { method: "POST", body, org: slugNow() });
  put(saved);
  elsewhere();
  return saved;
}

export async function patchParty(id: number, patch: PartyPatch): Promise<Party> {
  const saved = await api<Party>(`/api/parties/${id}`, { method: "PATCH", body: patch, org: slugNow() });
  put(saved);
  elsewhere();
  return saved;
}

export async function wrapUpParty(id: number, body: WrapUpBody): Promise<Party> {
  const saved = await api<Party>(`/api/parties/${id}`, { method: "PATCH", body: { wrapUp: true, ...body }, org: slugNow() });
  put(saved);
  elsewhere();
  if (body.attendedIds) {
    void queryClient.invalidateQueries({ queryKey: partyKeys.rolls(slugNow()) });
    void queryClient.invalidateQueries({ queryKey: calKeys.mine(slugNow()) });
  }
  return saved;
}

export async function deleteParty(id: number): Promise<void> {
  const key = partyKeys.list(slugNow());
  const before = queryClient.getQueryData<Party[]>(key);
  queryClient.setQueryData<Party[]>(key, l => (l ?? []).filter(p => p.id !== id));
  try {
    await api<null>(`/api/parties/${id}`, { method: "DELETE", org: slugNow() });
  } catch (e) {
    queryClient.setQueryData(key, before);
    throw e;
  }
  elsewhere();
  void queryClient.invalidateQueries({ queryKey: partyKeys.rolls(slugNow()) });
}
