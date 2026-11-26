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
 * Phase 9c:
 *   PATCH  /api/orgs/config                   OrgConfigSaved      (Member fields: customMemberFields, the whole list)
 *   GET    /api/calendar/event-types          CalEventType[]      (shared with the Timeline's calKeys.types)
 *   POST   /api/calendar/event-types          CalEventType        (MANAGE_SETTINGS)   PATCH/DELETE [id]
 *   GET    /api/events/fields                 EventFieldRow[]     (shared with Programming's progKeys.fields)
 *   PATCH  /api/events/fields/[id]            EventFieldRow       (MANAGE_EVENTS)   DELETE [id]; POST adds
 *   GET    /api/treasury/categories           TransactionCategory[] (shared with Treasury's moneyKeys.categories)
 *   POST   /api/treasury/categories           TransactionCategory (MANAGE_TREASURY)   PATCH/DELETE [id]
 *   GET    /api/treasury                      TreasuryData        (the opening balance)   PATCH /api/treasury/settings
 *   GET    /api/activity/full[?type=]         ActivityLogRow[]    (platform admins; 403 otherwise)
 *   GET    /api/orgs/manage                   OrgDeletionSummary  DELETE /api/orgs/manage { confirmSlug }
 *
 * Role and roster changes show up on the roster, member cards, task pickers and /me
 * (your own roles decide what you can touch), so each write refreshes those too.
 */
import type {
  ActivityLogRow, CalEventType, CalendarFeedChanged, CalendarSubscriptionView, EventFieldRow, MetricDefinition, OrgDeleted, OrgDeletionSummary,
  SemesterRow, TransactionCategory, TreasurySettings,
} from "@/lib/api-types";
import type { CustomMemberFieldDef } from "@/lib/custom-member-fields";
import type { createEventTypeInput, updateEventTypeInput } from "@/lib/validation/event-types";
import type { createTransactionCategoryInput, updateTransactionCategoryInput } from "@/lib/validation/transaction-categories";
import type { updateEventFieldInput } from "@/lib/validation/event-fields";
import { ApiError } from "~/api/errors";
import { progKeys } from "./programming";
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
  activity: (slug: string | null, filter: string) => ["settings", slug, "activity", filter] as const,
  deletion: (slug: string | null) => ["settings", slug, "deletion"] as const,
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

/* ── member fields ──────────────────────────────────────────────────────────── */

/** The whole list replaces the org's (OrganizationConfig.customMemberFields). */
export async function saveMemberFields(customMemberFields: CustomMemberFieldDef[]): Promise<void> {
  await api<OrgConfigSaved>("/api/orgs/config", { method: "PATCH", body: { customMemberFields } });
  const slug = slugNow();
  await queryClient.invalidateQueries({ queryKey: keys.me(slug) });
  void queryClient.invalidateQueries({ queryKey: ["roster", slug] });
  void queryClient.invalidateQueries({ queryKey: ["memberProfile", slug] });
}

/* ── event types ────────────────────────────────────────────────────────────── */

type NewTypeBody = z.input<typeof createEventTypeInput>;
type TypePatch = z.input<typeof updateEventTypeInput>;

/** The Timeline's picker, legend and dots read the same list. */
function typesChanged() {
  const slug = slugNow();
  void queryClient.invalidateQueries({ queryKey: calKeys.types(slug) });
  void queryClient.invalidateQueries({ queryKey: calKeys.events(slug) });
  void queryClient.invalidateQueries({ queryKey: ["home", slug] });
}
const putTypes = (fn: (l: CalEventType[]) => CalEventType[]) =>
  queryClient.setQueryData<CalEventType[]>(calKeys.types(slugNow()), l => (l ? fn(l) : l));

export async function createEventType(body: NewTypeBody): Promise<CalEventType> {
  const t = await api<CalEventType>("/api/calendar/event-types", { method: "POST", body });
  putTypes(l => [...l, t]);
  typesChanged();
  return t;
}
export async function updateEventType(id: number, body: TypePatch): Promise<CalEventType> {
  const t = await api<CalEventType>(`/api/calendar/event-types/${id}`, { method: "PATCH", body });
  putTypes(l => l.map(x => (x.id === id ? t : x)));
  typesChanged();
  return t;
}
export async function deleteEventType(id: number): Promise<void> {
  await api(`/api/calendar/event-types/${id}`, { method: "DELETE" });
  putTypes(l => l.filter(x => x.id !== id));
  typesChanged();
}

/* ── event fields ───────────────────────────────────────────────────────────── */

type FieldPatch = z.input<typeof updateEventFieldInput>;

/** Every write re-reads the list (as the web does): order swaps touch two rows. */
const fieldsChanged = () => queryClient.invalidateQueries({ queryKey: progKeys.fields(slugNow()) });

export async function patchEventField(id: number, body: FieldPatch): Promise<void> {
  await api<EventFieldRow>(`/api/events/fields/${id}`, { method: "PATCH", body });
}
export async function deleteEventField(id: number): Promise<void> {
  await api(`/api/events/fields/${id}`, { method: "DELETE" });
}
export async function addEventField(label: string, kind: EventFieldRow["kind"]): Promise<void> {
  await api<EventFieldRow>("/api/events/fields", { method: "POST", body: { label, kind } });
}
export { fieldsChanged as refreshEventFields };

/* ── money categories ───────────────────────────────────────────────────────── */

type NewCategoryBody = z.input<typeof createTransactionCategoryInput>;
type CategoryPatch = z.input<typeof updateTransactionCategoryInput>;

const putCategories = (fn: (l: TransactionCategory[]) => TransactionCategory[]) =>
  queryClient.setQueryData<TransactionCategory[]>(moneyKeys.categories(slugNow()), l => (l ? fn(l) : l));

export async function createCategory(body: NewCategoryBody): Promise<TransactionCategory> {
  const c = await api<TransactionCategory>("/api/treasury/categories", { method: "POST", body });
  putCategories(l => [...l, c]);
  return c;
}
export async function updateCategory(id: number, body: CategoryPatch): Promise<TransactionCategory> {
  const c = await api<TransactionCategory>(`/api/treasury/categories/${id}`, { method: "PATCH", body });
  putCategories(l => l.map(x => (x.id === id ? c : x)));
  return c;
}
export async function deleteCategory(id: number): Promise<void> {
  await api(`/api/treasury/categories/${id}`, { method: "DELETE" });
  putCategories(l => l.filter(x => x.id !== id));
}

/* ── opening balance ────────────────────────────────────────────────────────── */

/** Balance and trend are folded server-side, so Treasury and Home re-read. */
export async function setOpeningBalance(openingBalance: number): Promise<number> {
  const r = await api<TreasurySettings>("/api/treasury/settings", { method: "PATCH", body: { openingBalance } });
  const slug = slugNow();
  await queryClient.invalidateQueries({ queryKey: moneyKeys.treasury(slug) });
  void queryClient.invalidateQueries({ queryKey: ["home", slug] });
  return r.openingBalance ?? openingBalance;
}

/* ── activity log ───────────────────────────────────────────────────────────── */

/** null rows = forbidden (the officer-access card). */
export function useActivityLog(filter: "all" | "info" | "success" | "warning") {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: settingsKeys.activity(slug, filter),
    queryFn: async (): Promise<ActivityLogRow[] | null> => {
      try {
        return await api<ActivityLogRow[]>("/api/activity/full", { org: slug, query: filter === "all" ? undefined : { type: filter } });
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) return null;
        throw e;
      }
    },
    retry: false,
  });
}

/* ── danger zone ────────────────────────────────────────────────────────────── */

export function useDeletionSummary(enabled: boolean) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: settingsKeys.deletion(slug),
    queryFn: () => api<OrgDeletionSummary>("/api/orgs/manage", { org: slug }),
    enabled, retry: false, staleTime: 0, gcTime: 0,
  });
}

/** Deletes the active org for good. The caller moves the app to another org. */
export function deleteOrg(confirmSlug: string): Promise<OrgDeleted> {
  return api<OrgDeleted>("/api/orgs/manage", { method: "DELETE", body: { confirmSlug } });
}

