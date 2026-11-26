/**
 * Settings data (the web's app/org/[slug]/settings sections), Phase 9a:
 *
 *   GET    /api/auth/accounts                 AccountRow[]        Accounts, Roles (any member)
 *   GET    /api/roles                         RoleDetail[]        (permissions + isSystem only for MANAGE_ROLES)
 *   POST   /api/roles                         RoleSaved           (MANAGE_ROLES; body createRoleInput)
 *   PATCH  /api/roles/[id]                    RoleSaved           (MANAGE_ROLES; only what changed)
 *   DELETE /api/roles/[id]                    204
 *   POST   /api/brothers/[id]/roles           RoleGranted         (MANAGE_ROLES; 409 = already held, fine)
 *   DELETE /api/brothers/[id]/roles/[roleId]  204
 *   PATCH  /api/auth/accounts/[id]            AdminChanged        (platform admins; { isAdmin })
 *   PATCH  /api/brothers/[id]                 { name }            (MANAGE_BROTHERS or yourself: this org's name)
 *   DELETE /api/brothers/[id]                 204                 (MANAGE_BROTHERS; not yourself)
 *   GET    /api/invites[?include=all]         InviteRow[]         (MANAGE_SETTINGS)
 *   POST   /api/invites                       InviteRow           (MANAGE_SETTINGS; body createInviteInput)
 *   DELETE /api/invites/[id]                  204
 *   GET    /api/invites/[id]/redemptions      InviteRedemption[]
 *   PATCH  /api/orgs/config                   OrgConfigSaved      (MANAGE_SETTINGS; instagramHandle / vocabularyOverrides)
 *   POST   /api/orgs/logo                     OrgLogoSaved        (multipart `file`; DELETE clears it)
 *
 * Phase 9b:
 *   PATCH  /api/orgs/config                   OrgConfigSaved      (Workflows: enabledWorkflows + disabledFeatures (+ navOrder); Thresholds)
 *   GET    /api/semesters                     SemesterRow[]       (shared with Treasury's moneyKeys.semesters)
 *   POST   /api/semesters                     SemesterRow         (MANAGE_SEMESTERS; becomes active)
 *   PATCH  /api/semesters/[id]                SemesterRow         (no body = activate; body + activate:false = fix dates)
 *   GET    /api/metrics/definitions           MetricDefinition[]
 *   POST   /api/metrics/definitions           MetricDefinition    (MANAGE_SETTINGS)
 *   PATCH  /api/metrics/definitions/[id]      MetricDefinition
 *   DELETE /api/metrics/definitions/[id]      204
 *   GET    /api/calendar/subscription         CalendarSubscriptionView (+ the admin checklist fields for org admins)
 *   PATCH  /api/calendar/subscription         CalendarFeedChanged (org admins; turnOn, timeZone, disable, rotate, link)
 *   PATCH  /api/calendar/[id]                 { schedule } (set a typed time)   DELETE /api/calendar/[id] (old deadline)
 *
 * Role and roster changes show up on the roster, member cards, task pickers and /me
 * (your own roles decide what you can touch), so each write refreshes those too.
 */
import type { CalendarFeedChanged, CalendarSubscriptionView, MetricDefinition, SemesterRow } from "@/lib/api-types";
import type { Thresholds } from "@/lib/thresholds";
import type { DisabledFeatures } from "@/lib/workflow-features";
import { calKeys } from "./calendar";
import { moneyKeys } from "./money";
import type { AccountRow, InviteRedemption, InviteRow, MemberUpdated, OrgConfigSaved, OrgLogoSaved, RoleChip, RoleDetail, RoleGranted, RoleSaved } from "@/lib/api-types";
import type { createInviteInput } from "@/lib/validation/invite";
import type { createRoleInput } from "@/lib/validation/role";
import type { VocabOverrides } from "@/lib/vocab-keys";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { keys } from "./hooks";
import { queryClient } from "./query";

const slugNow = () => activeOrg.get().slug;

export const settingsKeys = {
  accounts: (slug: string | null) => ["settings", slug, "accounts"] as const,
  roles: (slug: string | null) => ["settings", slug, "roles"] as const,
  invites: (slug: string | null, all: boolean) => ["settings", slug, "invites", all] as const,
  joins: (slug: string | null, id: number) => ["settings", slug, "invite-joins", id] as const,
  metrics: (slug: string | null) => ["settings", slug, "metrics"] as const,
  calendar: (slug: string | null) => ["settings", slug, "calendar"] as const,
};

/* ── reads ──────────────────────────────────────────────────────────────────── */

export function useAccounts(enabled = true) {
  const { slug } = useActiveOrg();
  return useQuery({ queryKey: settingsKeys.accounts(slug), queryFn: () => api<AccountRow[]>("/api/auth/accounts", { org: slug }), enabled });
}

/** Every role. Detailed (bits + isSystem) for MANAGE_ROLES holders; the chips otherwise. */
export function useSettingsRoles(enabled = true) {
  const { slug } = useActiveOrg();
  return useQuery({ queryKey: settingsKeys.roles(slug), queryFn: () => api<(RoleChip | RoleDetail)[]>("/api/roles", { org: slug }), enabled });
}

export function useInvites(includeInactive: boolean, enabled = true) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: settingsKeys.invites(slug, includeInactive),
    queryFn: () => api<InviteRow[]>("/api/invites", { org: slug, query: includeInactive ? { include: "all" } : undefined }),
    enabled,
  });
}

export function useInviteJoins(id: number | null) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: settingsKeys.joins(slug, id ?? 0),
    queryFn: () => api<InviteRedemption[]>(`/api/invites/${id}/redemptions`, { org: slug }),
    enabled: id != null,
    retry: false,
  });
}

/* ── after a write ──────────────────────────────────────────────────────────── */

/** Who holds what changed: the roster's titles, task pickers, /me (your own powers). */
function peopleChanged() {
  const slug = slugNow();
  void queryClient.invalidateQueries({ queryKey: settingsKeys.accounts(slug) });
  void queryClient.invalidateQueries({ queryKey: settingsKeys.roles(slug) });
  void queryClient.invalidateQueries({ queryKey: ["roster", slug] });
  void queryClient.invalidateQueries({ queryKey: ["roles", slug] });
  void queryClient.invalidateQueries({ queryKey: keys.me(slug) });
  void queryClient.invalidateQueries({ queryKey: ["home", slug] });
}

const patchAccount = (id: number, fn: (a: AccountRow) => AccountRow) =>
  queryClient.setQueryData<AccountRow[]>(settingsKeys.accounts(slugNow()), l => l?.map(a => (a.id === id ? fn(a) : a)));

/* ── accounts ───────────────────────────────────────────────────────────────── */

/** This org's name for someone (Membership.name). */
export async function renameMember(id: number, name: string): Promise<string> {
  const updated = await api<MemberUpdated>(`/api/brothers/${id}`, { method: "PATCH", body: { name } });
  queryClient.setQueryData<AccountRow[]>(settingsKeys.accounts(slugNow()), l =>
    l?.map(a => (a.id === id ? { ...a, name: updated.name } : a)).sort((x, y) => x.name.localeCompare(y.name)));
  peopleChanged();
  return updated.name;
}

export async function setAdmin(id: number, isAdmin: boolean): Promise<void> {
  await api(`/api/auth/accounts/${id}`, { method: "PATCH", body: { isAdmin } });
  patchAccount(id, a => ({ ...a, isAdmin }));
  peopleChanged();
}

export async function removeMember(id: number): Promise<void> {
  await api(`/api/brothers/${id}`, { method: "DELETE" });
  queryClient.setQueryData<AccountRow[]>(settingsKeys.accounts(slugNow()), l => l?.filter(a => a.id !== id));
  peopleChanged();
}

/* ── roles ──────────────────────────────────────────────────────────────────── */

/** Give or take one role. A 409 on a grant means it was already there. The cached
 *  accounts flip first (the tap should feel instant) and flip back on a refusal. */
export async function setHolds(personId: number, role: { id: number; name: string; color: string | null; rank: number }, give: boolean): Promise<void> {
  const flip = (on: boolean) => patchAccount(personId, a => ({
    ...a,
    // Idempotent: a double tap must never draw the same chip twice.
    roles: on
      ? (a.roles.some(r => r.id === role.id) ? a.roles : [...a.roles, { id: role.id, name: role.name, color: role.color, rank: role.rank }].sort((m, n) => n.rank - m.rank))
      : a.roles.filter(r => r.id !== role.id),
  }));
  flip(give);
  try {
    if (give) {
      await api<RoleGranted>(`/api/brothers/${personId}/roles`, { method: "POST", body: { roleId: role.id } })
        .catch(e => { if ((e as { status?: number }).status !== 409) throw e; });
    } else {
      await api(`/api/brothers/${personId}/roles/${role.id}`, { method: "DELETE" });
    }
  } catch (e) {
    flip(!give);
    throw e;
  }
  peopleChanged();
}

export async function createRole(body: z.input<typeof createRoleInput>): Promise<RoleSaved> {
  const saved = await api<RoleSaved>("/api/roles", { method: "POST", body });
  peopleChanged();
  return saved;
}

export async function updateRole(id: number, body: Record<string, unknown>): Promise<RoleSaved> {
  const saved = await api<RoleSaved>(`/api/roles/${id}`, { method: "PATCH", body });
  peopleChanged();
  return saved;
}

export async function deleteRole(id: number): Promise<void> {
  await api(`/api/roles/${id}`, { method: "DELETE" });
  peopleChanged();
}

/* ── invitations ────────────────────────────────────────────────────────────── */

const invitesChanged = () => void queryClient.invalidateQueries({ queryKey: ["settings", slugNow(), "invites"] });

export async function createInvite(body: z.input<typeof createInviteInput>): Promise<InviteRow> {
  const created = await api<InviteRow>("/api/invites", { method: "POST", body });
  invitesChanged();
  return created;
}

export async function revokeInvite(id: number): Promise<void> {
  await api(`/api/invites/${id}`, { method: "DELETE" });
  invitesChanged();
}

export const refreshInvites = invitesChanged;

/* ── identity ───────────────────────────────────────────────────────────────── */

export interface LogoFile { uri: string; name: string; type: string }

/** The icon first: if the upload is refused nothing else has changed yet. */
export async function saveLogo(file: LogoFile | null): Promise<string | null> {
  if (!file) return (await api<OrgLogoSaved>("/api/orgs/logo", { method: "DELETE" })).logoUrl;
  const form = new FormData();
  // React Native's FormData takes a file as { uri, name, type }.
  form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  return (await api<OrgLogoSaved>("/api/orgs/logo", { method: "POST", body: form })).logoUrl;
}

export async function saveOrgConfig(body: { instagramHandle?: string; vocabularyOverrides?: VocabOverrides }): Promise<void> {
  await api<OrgConfigSaved>("/api/orgs/config", { method: "PATCH", body });
}

/** Everyone sees the new words and icon: re-read /me (and the chapter switcher's logos). */
export const refreshIdentity = () => queryClient.invalidateQueries({ queryKey: keys.me(slugNow()) });

/* ── workflows + thresholds (Phase 9b) ──────────────────────────────────────── */

export async function saveWorkflows(body: { enabledWorkflows: string[]; disabledFeatures: DisabledFeatures; navOrder?: string[] }): Promise<void> {
  await api<OrgConfigSaved>("/api/orgs/config", { method: "PATCH", body });
  configChanged();
}

export async function saveThresholds(thresholds: Thresholds): Promise<void> {
  await api<OrgConfigSaved>("/api/orgs/config", { method: "PATCH", body: { thresholds } });
  configChanged();
}

/** Pages, widgets, order or cutoffs changed: /me (More's grid, the tab bar, the gates),
 *  then Home and Members, whose standing reads the thresholds. */
async function configChanged() {
  const slug = slugNow();
  await queryClient.invalidateQueries({ queryKey: keys.me(slug) });
  void queryClient.invalidateQueries({ queryKey: ["home", slug] });
  void queryClient.invalidateQueries({ queryKey: ["roster", slug] });
}

/* ── semesters ──────────────────────────────────────────────────────────────── */

export function useSettingsSemesters() {
  const { slug } = useActiveOrg();
  return useQuery({ queryKey: moneyKeys.semesters(slug), queryFn: () => api<SemesterRow[]>("/api/semesters", { org: slug }) });
}

/** The active term moved: Treasury's terms, the dashboard, the Timeline's term, dues. */
function termsChanged(next?: (l: SemesterRow[]) => SemesterRow[]) {
  const slug = slugNow();
  if (next) queryClient.setQueryData<SemesterRow[]>(moneyKeys.semesters(slug), l => (l ? next(l) : l));
  void queryClient.invalidateQueries({ queryKey: moneyKeys.semesters(slug) });
  void queryClient.invalidateQueries({ queryKey: ["home", slug] });
  void queryClient.invalidateQueries({ queryKey: calKeys.events(slug) });
  void queryClient.invalidateQueries({ queryKey: keys.me(slug) });
  void queryClient.invalidateQueries({ queryKey: ["dues-board", slug] });
}

export async function createSemester(body: { label: string; startDate: string; endDate: string }): Promise<SemesterRow> {
  const s = await api<SemesterRow>("/api/semesters", { method: "POST", body });
  termsChanged(l => [s, ...l.map(x => ({ ...x, isActive: false }))]);
  return s;
}

export async function editSemester(id: number, body: { label: string; startDate: string; endDate: string; activate?: boolean }): Promise<SemesterRow> {
  const s = await api<SemesterRow>(`/api/semesters/${id}`, { method: "PATCH", body });
  termsChanged(l => l.map(x => (x.id === s.id ? s : x)));
  return s;
}

export async function activateSemester(id: number): Promise<void> {
  await api<SemesterRow>(`/api/semesters/${id}`, { method: "PATCH" });
  termsChanged(l => l.map(x => ({ ...x, isActive: x.id === id })));
}

/* ── custom metrics ─────────────────────────────────────────────────────────── */

export function useMetricDefinitions(enabled = true) {
  const { slug } = useActiveOrg();
  return useQuery({ queryKey: settingsKeys.metrics(slug), queryFn: () => api<MetricDefinition[]>("/api/metrics/definitions", { org: slug }), enabled });
}

/** Definitions show on the dashboard's KPI cards and member profiles. */
function metricsChanged(next: (l: MetricDefinition[]) => MetricDefinition[]) {
  const slug = slugNow();
  queryClient.setQueryData<MetricDefinition[]>(settingsKeys.metrics(slug), l => (l ? next(l) : l));
  void queryClient.invalidateQueries({ queryKey: settingsKeys.metrics(slug) });
  void queryClient.invalidateQueries({ queryKey: ["home", slug] });
  void queryClient.invalidateQueries({ queryKey: ["memberProfile", slug] });
}

export async function createMetric(body: Record<string, unknown>): Promise<MetricDefinition> {
  const d = await api<MetricDefinition>("/api/metrics/definitions", { method: "POST", body });
  metricsChanged(l => [...l, d]);
  return d;
}

export async function updateMetric(id: number, body: Record<string, unknown>): Promise<MetricDefinition> {
  const d = await api<MetricDefinition>(`/api/metrics/definitions/${id}`, { method: "PATCH", body });
  metricsChanged(l => l.map(x => (x.id === d.id ? d : x)));
  return d;
}

export async function deleteMetric(id: number): Promise<void> {
  await api(`/api/metrics/definitions/${id}`, { method: "DELETE" });
  metricsChanged(l => l.filter(x => x.id !== id));
}

/* ── calendar subscription ──────────────────────────────────────────────────── */

/** The admin view (no ?view=member): the checklist's issues, health and the turn-on state. */
export function useCalendarAdmin(poll: boolean) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: settingsKeys.calendar(slug),
    queryFn: () => api<CalendarSubscriptionView>("/api/calendar/subscription", { org: slug }),
    refetchInterval: poll ? 4000 : false,
  });
}

function feedChanged() {
  const slug = slugNow();
  void queryClient.invalidateQueries({ queryKey: settingsKeys.calendar(slug) });
  void queryClient.invalidateQueries({ queryKey: calKeys.feed(slug) });
  void queryClient.invalidateQueries({ queryKey: calKeys.feedLive(slug) });
}

export type FeedAction =
  | { action: "turnOn"; timeZone?: string } | { action: "timeZone"; timeZone: string }
  | { action: "disable" } | { action: "rotate" } | { action: "link"; source: "service"; id: number };

export async function changeFeed(body: FeedAction): Promise<void> {
  await api<CalendarFeedChanged>("/api/calendar/subscription", { method: "PATCH", body });
  await queryClient.invalidateQueries({ queryKey: settingsKeys.calendar(slugNow()) });
  feedChanged();
}

/** An old deadline entry (deadlines come from tasks now). */
export async function deleteLegacyEntry(id: number): Promise<void> {
  await api(`/api/calendar/${id}`, { method: "DELETE" });
  void queryClient.invalidateQueries({ queryKey: calKeys.events(slugNow()) });
  feedChanged();
}

/** Set a real time on an event whose time was typed as text. */
export async function setEventSchedule(id: number, schedule: unknown): Promise<void> {
  await api(`/api/calendar/${id}`, { method: "PATCH", body: { schedule } });
  void queryClient.invalidateQueries({ queryKey: calKeys.events(slugNow()) });
  feedChanged();
}
