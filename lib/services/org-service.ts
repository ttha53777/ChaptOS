/**
 * Self-serve organization provisioning.
 *
 * Architectural note: every other service in this directory takes a
 * RequestContext. This one does not — at the moment of org creation the user
 * has a Supabase session but no Brother row yet, so there is no ctx to build.
 * Same situation as /api/auth/claim, which also uses raw `prisma` directly.
 *
 * Everything inside provisionOrg happens in a single $transaction so a
 * partial failure cannot leave half-provisioned orphans (an Org with no
 * Membership, a Brother with no Organization, etc.). The OperationalEvent
 * for org.created is written inside the same transaction so it cannot be
 * skipped — at the cost of losing the dispatcher hook, which we don't need
 * for org creation today (no handlers subscribe to org.created yet).
 */

import { randomUUID } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
// Provisioning runs before the org exists, so there is no ctx.db yet.
// Same architectural exception as /api/auth/claim.
//
// We use the PRIVILEGED client (DIRECT_URL / postgres role) rather than the
// normal `prisma` here. The figurints_app role cannot INSERT into
// Organization on Supabase even with permissive WITH CHECK policies — root
// cause is a Supabase-specific RLS behavior we couldn't pin down via the
// standard Postgres model. Routing one bootstrap path through the postgres
// role is the same posture as /api/auth/claim and preserves the app role's
// RLS enforcement everywhere else.
import { prismaPrivileged as prisma } from "@/lib/prisma-privileged"; // lint-direct-prisma:ignore (pre-org provisioning, BYPASSRLS by design)
import { AlreadyLinkedError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { emit } from "@/lib/events";
import { validateSlugFormat } from "@/lib/slug-rules";
import { getOrgType, normalizeWorkflows, type RoleSeed } from "@/lib/org-types";
import { normalizeDisabledFeatures, type DisabledFeatures } from "@/lib/workflow-features";
import { sanitizeVocabOverrides } from "@/lib/vocab";
import { PERMISSIONS, ALL_PERMISSIONS, type Permission } from "@/lib/permissions";
import { uploadOrgLogoObject, removeOrgLogoObject } from "@/lib/supabase/org-logo";
import type { CreateOrgInput } from "@/lib/validation/org";
import type { RequestContext } from "@/lib/context";

export interface ProvisionedOrg {
  organizationId: number;
  slug:           string;
  brotherId:      number;
}

/** The founder role always outranks every other role and holds every bit. */
const FOUNDER_RANK = 100;

/** A role to seed at provisioning, with whether it's a protected system role. */
interface SeededRole {
  seed:     RoleSeed;
  isSystem: boolean;
}

/** A custom per-member metric to seed, slug already generated + de-duped. */
interface SeededMetric {
  slug: string;
  name: string;
  unit: string | null;
}

/**
 * Built-in metric toggle → the operations KPI widget it shows. An un-tracked
 * built-in hides its widget via OrganizationConfig.disabledFeatures (opt-out
 * map). kpi-treasury deliberately absent: it follows the finance workflow,
 * not a per-member metric.
 */
const BUILTIN_METRIC_KPI = {
  attendance:   "kpi-attendance",
  gpa:          "kpi-gpa",
  duesOwed:     "kpi-dues",
  serviceHours: "kpi-service",
} as const;

/**
 * Kebab-slug a metric name the same shape lib/validation/metrics.ts SLUG_RE
 * accepts, de-duped against slugs already taken in this org's seed batch.
 */
function metricSlug(name: string, used: Set<string>): string {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 46).replace(/-+$/, "") ||
    "metric";
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}

/**
 * Resolve the interview's per-member metrics answer: which built-in KPI widgets
 * to hide, and which custom OrgMetricDefinition rows to seed. Pure — no DB.
 * An absent metrics block means "track everything, define nothing", i.e. the
 * pre-redesign behavior for minimal clients and the skip path.
 */
function resolveMetrics(metrics: NonNullable<CreateOrgInput["blueprint"]>["metrics"]): {
  disabledFeatures: DisabledFeatures;
  customMetrics: SeededMetric[];
} {
  if (!metrics) return { disabledFeatures: {}, customMetrics: [] };

  const hidden = (Object.keys(BUILTIN_METRIC_KPI) as (keyof typeof BUILTIN_METRIC_KPI)[])
    .filter(id => !metrics.builtins[id])
    .map(id => BUILTIN_METRIC_KPI[id]);
  const disabledFeatures = normalizeDisabledFeatures(hidden.length ? { operations: hidden } : {});

  const used = new Set<string>();
  const customMetrics = metrics.custom.map(m => ({
    slug: metricSlug(m.name, used),
    name: m.name,
    unit: m.unit ?? null,
  }));

  return { disabledFeatures, customMetrics };
}

/**
 * Resolve the effective OrganizationConfig + role set for a new org from the
 * founder's blueprint, falling back to the org-type template for any field the
 * blueprint omits. Pure — no DB — so it's unit-testable and callable inside the
 * provisioning transaction.
 *
 * Roles:
 *   - Template path: every RoleSeed is seeded as-is with isSystem=true (the
 *     Settings → Roles UI protects these from rename/delete).
 *   - Blueprint path: the founder role (the seed with all:true, or a synthesized
 *     one if the blueprint omits it) is forced to rank 100 + full bitfield so the
 *     founder can never end up locked out. Every OTHER blueprint role is seeded as
 *     a NORMAL role (isSystem=false) so the founder can rename/delete it later —
 *     matching what applyRoleSet did post-creation, only now atomic at creation.
 */
function resolveBlueprint(
  template: NonNullable<ReturnType<typeof getOrgType>>,
  founderRoleSpec: RoleSeed,
  blueprint: CreateOrgInput["blueprint"],
): { enabledWorkflows: string[]; vocabularyOverrides: Record<string, string>; roles: SeededRole[] } {
  const enabledWorkflows = blueprint?.enabledWorkflows
    ? normalizeWorkflows(blueprint.enabledWorkflows)
    : [...template.enabledWorkflows];

  // Sparse overrides layer ON TOP of the template's defaults (e.g. a fraternity
  // keeps Member→Brother unless the founder retyped it), matching the mock.
  const vocabularyOverrides: Record<string, string> = {
    ...template.vocabularyOverrides,
    ...(blueprint?.vocabularyOverrides ? sanitizeVocabOverrides(blueprint.vocabularyOverrides) : {}),
  };

  let roles: SeededRole[];
  if (blueprint?.roleSeeds && blueprint.roleSeeds.length > 0) {
    const founderInput = blueprint.roleSeeds.find(r => r.all);
    // The founder role: keep the founder's chosen NAME/COLOR if they marked one
    // `all`, but force rank 100 + full bitfield. If no seed was flagged `all`,
    // synthesize one from the template's founder spec so there is always exactly
    // one all-permission role and the founder is never locked out.
    const founderSeed: RoleSeed = {
      name:        founderInput?.name ?? founderRoleSpec.name,
      color:       founderInput?.color ?? founderRoleSpec.color,
      rank:        FOUNDER_RANK,
      permissions: [],
      all:         true,
    };
    const others: SeededRole[] = blueprint.roleSeeds
      .filter(r => r !== founderInput)
      .map(r => ({
        seed: {
          name:        r.name,
          color:       r.color ?? "#64748B",
          // Clamp strictly below the founder so nothing ties/outranks it.
          rank:        Math.max(0, Math.min(FOUNDER_RANK - 1, Math.round(r.rank))),
          permissions: (r.permissions ?? []) as Permission[],
        },
        isSystem: false,
      }));
    roles = [{ seed: founderSeed, isSystem: false }, ...others];
  } else {
    roles = template.roleSeeds.map(seed => ({ seed, isSystem: true }));
  }

  return { enabledWorkflows, vocabularyOverrides, roles };
}

/**
 * Provision a brand-new organization for an authenticated Supabase user who
 * is not yet linked to any Brother row globally.
 *
 *  Steps (all inside one $transaction):
 *   1. Insert Organization row (orgType + createdAt + createdByBrotherId set
 *      in a second update once the founder Brother id is known).
 *   2. Insert OrganizationConfig row from the template.
 *      2b. Insert the first ACTIVE Semester when the blueprint carries a term.
 *      2c. Seed custom OrgMetricDefinition rows from the metrics answer.
 *   3. Insert Brother for the founder with authUserId set.
 *   4. Backfill Organization.createdByBrotherId now that we have the id.
 *   5. Insert Membership(isOrgAdmin=true).
 *   6. Seed roles from the template; assign the first ("founder") role to the
 *      founder.
 *   7. Insert the org.created OperationalEvent.
 *
 *  Outside the transaction:
 *   - Dual-write an ActivityLog row (best-effort).
 *
 * Throws:
 *   - ValidationError if the slug fails format/reserved-list rules.
 *   - ConflictError if the slug is already taken OR the auth user is already
 *     linked to a Brother somewhere.
 */
export async function provisionOrg(
  input: CreateOrgInput,
  authUserId: string,
  email: string | null,
): Promise<ProvisionedOrg> {
  // Validate slug format + reserved-list against the SAME rules the live
  // slug-check endpoint uses. Keeps the two surfaces in lockstep.
  const check = validateSlugFormat(input.slug);
  if (!check.ok) throw new ValidationError(check.message ?? "Invalid slug");

  const template = getOrgType(input.orgType);
  if (!template) throw new ValidationError("Unknown organization type");

  // A Google account maps to exactly one Brother row globally (authUserId is
  // @unique). Founding an ADDITIONAL org therefore reuses that existing Brother
  // rather than creating a second one (which would collide on the unique
  // constraint anyway). We capture it here, outside the transaction, and below
  // attach a new admin Membership + founder role to it for the new org. The
  // Brother's home org (Brother.organizationId) stays their first org — a
  // multi-org founder is an admin operator of the new org, not a roster member
  // of it (the roster scopes by Brother.organizationId).
  const existing = await prisma.brother.findUnique({
    where: { authUserId },
    select: { id: true, name: true },
  });

  // The first role in the template (rank 100, all=true) is the founder role.
  const founderRoleSpec = template.roleSeeds.find(r => r.all && r.rank === 100);
  if (!founderRoleSpec) {
    // Caught by tests; signals a misconfigured template.
    throw new Error(`Template ${template.id} is missing a founder role`);
  }

  // Resolve the effective config + role set from the founder's blueprint (or the
  // template when no blueprint was sent). The founder role is guaranteed to be
  // present with rank 100 + full bitfield; we grab it here so step 3 (the legacy
  // Brother.role string) and step 6 (the BrotherRole link) agree on its name even
  // when the founder renamed it in the blueprint.
  const resolved = resolveBlueprint(template, founderRoleSpec, input.blueprint);
  const metrics = resolveMetrics(input.blueprint?.metrics);
  const founderRole = resolved.roles.find(r => r.seed.all);
  if (!founderRole) {
    // Impossible: resolveBlueprint always emits exactly one all-perms role.
    throw new Error("resolveBlueprint produced no founder role");
  }
  const founderRoleName = founderRole.seed.name;

  // Inputs are already trimmed by Zod's z.string().trim() in createOrgInput.
  let result: ProvisionedOrg;
  try {
    result = await prisma.$transaction(async (tx) => {
      // 1. Organization.
      const org = await tx.organization.create({
        data: {
          name:    input.name,
          slug:    input.slug,
          orgType: template.id,
        },
        select: { id: true, slug: true },
      });

      // 2. OrganizationConfig — from the resolved blueprint (template fallback).
      // onboardingCompletedAt is stamped NOW: setup happens pre-creation in the
      // interview/blueprint flow, so the founder should land straight in the
      // workspace and never be bounced into the (retired) post-create wizard.
      // disabledFeatures hides the KPI widgets for built-in metrics the founder
      // said they don't track (opt-out map, same shape the config PATCH writes).
      await tx.organizationConfig.create({
        data: {
          organizationId:      org.id,
          enabledWorkflows:    resolved.enabledWorkflows,
          vocabularyOverrides: resolved.vocabularyOverrides as Prisma.InputJsonValue,
          ...(Object.keys(metrics.disabledFeatures).length > 0
            ? { disabledFeatures: metrics.disabledFeatures as Prisma.InputJsonValue }
            : {}),
          onboardingCompletedAt: new Date(),
        },
      });

      // 2b. The first term. Created ACTIVE (it's the only semester in a fresh
      // org, so no deactivate pass is needed — mirrors createSemester's active
      // semantics) so requireActiveSemester passes on day one. An absent term
      // (skip path, minimal client) keeps today's behavior: no semester until
      // the founder makes one in Settings.
      if (input.blueprint?.term) {
        await tx.semester.create({
          data: {
            organizationId: org.id,
            label:          input.blueprint.term.label,
            startDate:      input.blueprint.term.startDate,
            endDate:        input.blueprint.term.endDate,
            isActive:       true,
          },
        });
      }

      // 2c. Custom per-member metrics from the interview ("chapter points").
      // Goal/threshold defaults are deliberately bland — the interview only
      // collects name + unit; the founder tunes goals in Settings → Metrics
      // (atRiskBelow: 0 <= goal keeps validateThresholds' invariant).
      for (const [i, m] of metrics.customMetrics.entries()) {
        await tx.orgMetricDefinition.create({
          data: {
            organizationId: org.id,
            slug:           m.slug,
            name:           m.name,
            unit:           m.unit,
            goal:           10,
            atRiskBelow:    0,
            watchBelow:     null,
            aggregation:    "sum",
            displayOrder:   i,
          },
        });
      }

      // 3. Founder Brother. For a brand-new account we create the Brother row;
      // for an already-linked account founding an additional org we REUSE their
      // existing Brother (authUserId is globally unique, and a multi-org founder
      // is one identity). The legacy `role` string on a new Brother is set to
      // the founder role's name so existing UI bits that read it (sidebar
      // header, brother table) show something meaningful. The real authority
      // lives in BrotherRole below. `input.founderName` only applies to a new
      // Brother — a reused one keeps the name from their first org.
      let brotherId: number;
      let brotherName: string;
      if (existing) {
        brotherId   = existing.id;
        brotherName = existing.name;
      } else {
        const brother = await tx.brother.create({
          data: {
            organizationId: org.id,
            name:           input.founderName,
            role:           founderRoleName,
            attendance:     0,
            duesOwed:       0,
            gpa:            0,
            serviceHours:   0,
            authUserId,
            email,
          },
          select: { id: true, name: true },
        });
        brotherId   = brother.id;
        brotherName = brother.name;
      }

      // 4. Backfill createdByBrotherId now that we have the founder id.
      await tx.organization.update({
        where: { id: org.id },
        data:  { createdByBrotherId: brotherId },
      });

      // 5. Membership with isOrgAdmin=true — founder bypasses every permission
      // check at the guard layer. For a reused Brother this is their second
      // (or later) Membership, granting admin access to the new org.
      await tx.membership.create({
        data: {
          brotherId,
          organizationId: org.id,
          isOrgAdmin:     true,
        },
      });

      // 6. Seed the resolved roles + assign the founder role to the founder.
      // The founder role (seed.all) is created isSystem=false too — the founder
      // owns it — but always carries the full bitfield and rank 100. Template
      // (no-blueprint) roles are isSystem=true; blueprint roles are isSystem=false
      // so they stay editable in Settings later.
      let founderRoleId: number | null = null;
      for (const { seed, isSystem } of resolved.roles) {
        const bits = seed.all ? ALL_PERMISSIONS : permissionBits(seed.permissions);
        const role = await tx.role.create({
          data: {
            organizationId: org.id,
            name:           seed.name,
            color:          seed.color,
            rank:           seed.rank,
            permissions:    bits,
            isSystem,
          },
          select: { id: true },
        });
        if (seed.all) founderRoleId = role.id;
      }
      if (founderRoleId === null) {
        // Defensive — resolveBlueprint guarantees exactly one all-perms role.
        throw new Error("Founder role missing after seeding");
      }
      await tx.brotherRole.create({
        data: {
          brotherId,
          roleId:         founderRoleId,
          organizationId: org.id,
        },
      });

      // 7. OperationalEvent for the structured audit log. Inside the tx so it
      // cannot be skipped on a successful provision. Mirrors what the claim
      // route does for brother.claimed.
      await tx.operationalEvent.create({
        data: {
          organizationId: org.id,
          requestId:      randomUUID(),
          actorId:        brotherId,
          action:         "org.created",
          subjectType:    "Organization",
          subjectId:      org.id,
          metadata: {
            name:        input.name,
            slug:        org.slug,
            orgType:     template.id,
            founderName: brotherName,
            // Whether the founder customized setup pre-creation vs took the
            // template defaults — useful when auditing the new atomic flow.
            blueprint:   !!input.blueprint,
            termSeeded:    !!input.blueprint?.term,
            customMetrics: metrics.customMetrics.length,
          },
        },
      });

      return { organizationId: org.id, slug: org.slug, brotherId };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Two unique constraints can produce P2002 here:
      //   * Organization.slug         — slug got taken between slug-check and create.
      //   * Brother.authUserId        — narrow race only: a BRAND-NEW account
      //                                 fired POST twice concurrently, both saw
      //                                 `existing` null in the pre-check, and the
      //                                 second lost the insert race. (A
      //                                 previously-linked account reuses its
      //                                 Brother above and never inserts here.)
      // Prisma's meta.target tells us which. Fall back to the slug message if
      // the target shape is ambiguous — the user can still resolve by retrying.
      const target = (e.meta as { target?: string[] | string } | undefined)?.target;
      const fields = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
      if (fields.some(f => f.includes("authUserId"))) {
        throw new AlreadyLinkedError("Your account is already linked to an organization.");
      }
      throw new ConflictError("That slug is already taken. Try another.");
    }
    // Any other Prisma error (P2021 missing table, P2003 FK, raw query failure)
    // becomes an opaque 500 at the route. Log the Prisma code first so the
    // server log gives the next person debugging this enough to act on.
    logError(e, {
      route: "lib/services/org-service",
      method: "provisionOrg",
      extra: {
        slug:    input.slug,
        orgType: input.orgType,
        prismaCode: e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined,
      },
    });
    throw e;
  }

  // Dual-write ActivityLog so the new org's dashboard feed shows its
  // creation event on first load. Best-effort: if this fails, the
  // OperationalEvent above is still the canonical record.
  //
  // Uses the privileged client (same reason as the transaction above): the
  // figurints_app role can't INSERT into ActivityLog right now because
  // app.org_id isn't set on this connection.
  try {
    await prisma.activityLog.create({
      data: {
        organizationId: result.organizationId,
        actorId:        result.brotherId,
        type:           "success",
        message:        `${input.founderName} created the ${input.name} organization`,
      },
    });
  } catch (err) {
    logError(err, {
      route: "lib/services/org-service",
      method: "provisionOrg.activityLog",
      userId: result.brotherId,
      extra: { orgId: result.organizationId },
    });
  }

  return result;
}

function permissionBits(names: readonly Permission[]): number {
  let bits = 0;
  for (const n of names) bits |= PERMISSIONS[n];
  return bits;
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

/**
 * Set (or replace) the active org's profile picture.
 *
 * Authorization: org admins only (platform admins pass too). Setting the org's
 * public identity is an org-owner action, same posture as setWorkflows() — we
 * gate on isOrgAdmin rather than a delegated permission bit. The route ALSO
 * requires MANAGE_SETTINGS as a coarse first gate; this re-check is the
 * authoritative one so the service can't be driven by a permission-bit-only
 * caller.
 *
 * Storage: the image is uploaded to the org-logos bucket under the actor's own
 * auth.uid() folder (so the existing per-user RLS authorizes it); the resulting
 * public URL becomes Organization.logoUrl. We replace the previous object's
 * URL in the column, and best-effort delete the OLD object so a re-upload with a
 * different extension doesn't leave the prior file orphaned.
 *
 * ctx.db.organization is a raw pass-through (not auto-scoped), so we select by
 * id: ctx.orgId explicitly — the same pattern deleteOrg/summarize use. ctx.orgId
 * is server-resolved, never client-supplied, so this can't touch another tenant.
 */
export async function setOrgLogo(ctx: RequestContext, file: File): Promise<{ logoUrl: string }> {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can change the organization logo");
  }

  const existing = await ctx.db.organization.findUnique({
    where: { id: ctx.orgId },
    select: { logoUrl: true },
  });
  if (!existing) throw new NotFoundError("Organization");

  const logoUrl = await uploadOrgLogoObject(ctx.authUserId, ctx.orgId, file);

  await ctx.db.organization.update({
    where: { id: ctx.orgId },
    data:  { logoUrl },
  });

  // Drop the previous object if it pointed at a DIFFERENT path (a re-upload with
  // the same extension uses upsert and overwrites in place, so the old URL would
  // equal the new one bar the ?v= cache-buster — removing it then would delete
  // the file we just wrote). Best-effort; the column is the source of truth.
  if (existing.logoUrl && stripCacheBuster(existing.logoUrl) !== stripCacheBuster(logoUrl)) {
    await removeOrgLogoObject(existing.logoUrl);
  }

  await emit(ctx, "org.logo.updated", { type: "Organization", id: ctx.orgId }, { cleared: false });

  return { logoUrl };
}

/**
 * Remove the active org's profile picture: best-effort delete the storage
 * object, then null the column. Org-admin only, same posture as setOrgLogo.
 */
export async function clearOrgLogo(ctx: RequestContext): Promise<void> {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can change the organization logo");
  }

  const existing = await ctx.db.organization.findUnique({
    where: { id: ctx.orgId },
    select: { logoUrl: true },
  });
  if (!existing) throw new NotFoundError("Organization");

  await removeOrgLogoObject(existing.logoUrl);

  await ctx.db.organization.update({
    where: { id: ctx.orgId },
    data:  { logoUrl: null },
  });

  await emit(ctx, "org.logo.updated", { type: "Organization", id: ctx.orgId }, { cleared: true });
}

/** Drop a `?v=...` cache-buster so two URLs for the same object compare equal. */
function stripCacheBuster(url: string): string {
  return url.split("?")[0];
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

export interface OrgDeletionSummary {
  organizationId: number;
  name:    string;
  slug:    string;
  /** Brothers whose HOME org is this one (Brother.organizationId == orgId).
   *  Those without another membership are deleted; the rest are re-homed. */
  members:      number;
  events:       number;
  transactions: number;
  docs:         number;
  parties:      number;
}

/**
 * Count what a deletion would remove, for the confirmation UI. Read-only.
 * Scoped through ctx.db so it can only ever summarize the caller's active org.
 *
 * Admin-gated to match deleteOrg: this is the delete-confirmation surface, so a
 * regular member has no reason to read it, and gating it keeps the two endpoints
 * consistent (no "summary readable but delete forbidden" split).
 */
export async function summarizeOrgForDeletion(ctx: RequestContext): Promise<OrgDeletionSummary> {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can view deletion details");
  }

  const org = await ctx.db.organization.findUnique({
    where: { id: ctx.orgId },
    select: { id: true, name: true, slug: true },
  });
  if (!org) throw new NotFoundError("Organization");

  // Exclude ghosts from the member count — they're roster placeholders the admin
  // never sees elsewhere, so counting them would inflate the "what gets deleted"
  // figure. Multi-org members are still counted here (they're real members of
  // this org); deleteOrg re-homes rather than deletes them, which the UI copy
  // calls out so the number isn't read as "accounts destroyed".
  const [members, events, transactions, docs, parties] = await Promise.all([
    ctx.db.brother.count({ where: { isGhost: false } }),
    ctx.db.calendarEvent.count(),
    ctx.db.transaction.count(),
    ctx.db.doc.count(),
    ctx.db.partyEvent.count(),
  ]);

  return {
    organizationId: org.id,
    name: org.name,
    slug: org.slug,
    members, events, transactions, docs, parties,
  };
}

/**
 * Permanently delete an organization and everything under it.
 *
 * Authorization: org admins only (platform admins also pass). This is the most
 * destructive action in the app — gating on isOrgAdmin (not a delegated
 * permission bit) keeps it an org-owner action, same posture as setWorkflows.
 *
 * The caller MUST pass the org's current slug as a confirmation token; if it
 * doesn't match ctx's active org slug we refuse. The route also enforces a
 * typed-name match client-side, but re-checking here means the service can't be
 * driven to delete the wrong org by a malformed request.
 *
 * Why the privileged client + a hand-ordered cascade:
 *   - The figurints_app role has only SELECT on Organization (no DELETE grant),
 *     and Supabase RLS blocks the delete for non-postgres roles — same reason
 *     provisionOrg() uses prismaPrivileged.
 *   - Only OrganizationConfig / Membership / OrgInvite declare onDelete: Cascade
 *     from Organization. The other ~14 child tables (Brother, Role, Semester,
 *     CalendarEvent, Transaction, …) have plain FKs, so a bare
 *     organization.delete() fails with a foreign-key violation. We delete leaf
 *     tables first, inside ONE transaction, so a partial failure rolls back.
 *
 * Member handling: a Brother whose HOME org is this one is deleted UNLESS they
 * belong to another org, in which case we re-home them (repoint organizationId
 * to another membership) and keep the Brother — a multi-org founder shouldn't
 * lose their account because one of their orgs was removed. Their Membership in
 * THIS org is removed either way.
 */
export async function deleteOrg(ctx: RequestContext, confirmSlug: string): Promise<{ organizationId: number; slug: string }> {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can delete the organization");
  }

  const org = await ctx.db.organization.findUnique({
    where: { id: ctx.orgId },
    select: { id: true, slug: true, name: true, logoUrl: true },
  });
  if (!org) throw new NotFoundError("Organization");

  if (confirmSlug !== org.slug) {
    throw new ValidationError("Confirmation does not match the organization slug");
  }

  const orgId = org.id;

  await prisma.$transaction(async (tx) => {
    // Brother ids that call this org home — needed for the re-home/delete pass
    // and to scope the no-org-column join tables (attendance) by brother too.
    const homeBrothers = await tx.brother.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    const homeBrotherIds = homeBrothers.map(b => b.id);

    // Calendar/Budget/Invite ids: parents of the join tables that carry no
    // organizationId column, so we delete their children by these ids.
    const [calendarEvents, budgets, invites] = await Promise.all([
      tx.calendarEvent.findMany({ where: { organizationId: orgId }, select: { id: true } }),
      tx.budget.findMany({ where: { organizationId: orgId }, select: { id: true } }),
      tx.orgInvite.findMany({ where: { organizationId: orgId }, select: { id: true } }),
    ]);
    const calendarEventIds = calendarEvents.map(c => c.id);
    const budgetIds        = budgets.map(b => b.id);
    const inviteIds        = invites.map(i => i.id);

    // ── 1. Audit / feed (reference the org + actor) ──────────────────────────
    await tx.operationalEvent.deleteMany({ where: { organizationId: orgId } });
    await tx.activityLog.deleteMany({ where: { organizationId: orgId } });

    // ── 2. Join tables with no organizationId column ─────────────────────────
    // Reached via their parents' ids (scoped above to THIS org), so this can't
    // touch another tenant's rows.
    if (calendarEventIds.length > 0) {
      await tx.attendanceRecord.deleteMany({ where: { calendarEventId: { in: calendarEventIds } } });
      await tx.attendanceExcuse.deleteMany({ where: { calendarEventId: { in: calendarEventIds } } });
    }
    if (budgetIds.length > 0) {
      await tx.budgetAllocation.deleteMany({ where: { budgetId: { in: budgetIds } } });
    }
    if (inviteIds.length > 0) {
      await tx.inviteRedemption.deleteMany({ where: { inviteId: { in: inviteIds } } });
    }

    // ── 3. Finance ───────────────────────────────────────────────────────────
    await tx.transaction.deleteMany({ where: { organizationId: orgId } });
    await tx.budget.deleteMany({ where: { organizationId: orgId } });

    // ── 4. Events / content ────────────────────────────────────────────────────
    // ServiceEvent before CalendarEvent (ServiceEvent.calendarEventId → CalendarEvent).
    await tx.serviceEvent.deleteMany({ where: { organizationId: orgId } });
    await tx.calendarEvent.deleteMany({ where: { organizationId: orgId } });
    await tx.partyEvent.deleteMany({ where: { organizationId: orgId } });
    // TaskAssignment before Task (FK: TaskAssignment.taskId → Task.id).
    await tx.taskAssignment.deleteMany({ where: { organizationId: orgId } });
    await tx.task.deleteMany({ where: { organizationId: orgId } });
    await tx.instagramTask.deleteMany({ where: { organizationId: orgId } });
    await tx.doc.deleteMany({ where: { organizationId: orgId } });
    await tx.chapterAnnouncement.deleteMany({ where: { organizationId: orgId } });

    // ── 5. Semester (referenced by attendance/transactions, now gone) ──────────
    await tx.semester.deleteMany({ where: { organizationId: orgId } });

    // ── 6. Roles & assignments ─────────────────────────────────────────────────
    await tx.brotherRole.deleteMany({ where: { organizationId: orgId } });
    await tx.role.deleteMany({ where: { organizationId: orgId } });

    // ── 7. Invites, config, memberships ────────────────────────────────────────
    await tx.orgInvite.deleteMany({ where: { organizationId: orgId } });
    await tx.organizationConfig.deleteMany({ where: { organizationId: orgId } });
    await tx.membership.deleteMany({ where: { organizationId: orgId } });

    // ── 8. Brothers (re-home multi-org members, delete home-only ones) ─────────
    // Null out the back-reference first so deleting/repointing brothers can't
    // trip Organization.createdByBrotherId (no FK constraint, but keep it clean).
    await tx.organization.update({ where: { id: orgId }, data: { createdByBrotherId: null } });

    if (homeBrotherIds.length > 0) {
      // Split home brothers into those who still belong to ANOTHER org (re-home,
      // keep the account) and those for whom this was their only org (delete).
      // Memberships for THIS org were already deleted in step 7, so any surviving
      // membership is necessarily in a different org.
      const survivingMemberships = await tx.membership.findMany({
        where: { brotherId: { in: homeBrotherIds } },
        select: { brotherId: true, organizationId: true },
      });
      // First surviving membership per brother → their new home org.
      const newHomeByBrother = new Map<number, number>();
      for (const m of survivingMemberships) {
        if (!newHomeByBrother.has(m.brotherId)) newHomeByBrother.set(m.brotherId, m.organizationId);
      }
      const toDelete = homeBrotherIds.filter(id => !newHomeByBrother.has(id));

      // Re-home survivors. Grouped by target org so each org needs one updateMany
      // (a multi-org member set is tiny — usually a single founder), rather than
      // one round-trip per brother.
      const brothersByNewHome = new Map<number, number[]>();
      for (const [brotherId, newOrg] of newHomeByBrother) {
        const list = brothersByNewHome.get(newOrg) ?? [];
        list.push(brotherId);
        brothersByNewHome.set(newOrg, list);
      }
      for (const [newOrg, ids] of brothersByNewHome) {
        await tx.brother.updateMany({ where: { id: { in: ids } }, data: { organizationId: newOrg } });
      }

      // Delete home-only brothers. Their PlatformAdmin row (FK is NO ACTION, so it
      // would otherwise block the delete) must go first; BrotherRole / Membership /
      // InviteRedemption referencing them already cascaded or were deleted above,
      // and attendance/invites only ever reference a brother's OWN home org (data
      // is created org-scoped), which we deleted in steps 2 & 7. Batched into two
      // deleteManys so a large roster is two round-trips, not 2N.
      if (toDelete.length > 0) {
        await tx.platformAdmin.deleteMany({ where: { brotherId: { in: toDelete } } });
        await tx.brother.deleteMany({ where: { id: { in: toDelete } } });
      }
    }

    // ── 9. The org itself ──────────────────────────────────────────────────────
    await tx.organization.delete({ where: { id: orgId } });
  }, { timeout: 30_000, maxWait: 10_000 });

  // Best-effort: delete the org's logo object now the org is gone. We remove the
  // SPECIFIC object the logoUrl named (not the founder's whole uid folder, which
  // may hold logos for other orgs they created). Never throws — storage is not
  // the source of truth and the org row is already gone.
  await removeOrgLogoObject(org.logoUrl);

  // No emit() here: emit writes an OperationalEvent FK'd to the org, which no
  // longer exists. The org's whole audit trail was just deleted with it. Record
  // the deletion as a structured app-level log line instead (the only durable
  // record once the tenant is gone) — same one-JSON-object-per-line shape the
  // observability helper uses, so log tooling parses it the same way.
  console.log(JSON.stringify({
    level: "info",
    ts: new Date().toISOString(),
    event: "org.deleted",
    requestId: ctx.requestId,
    userId: ctx.actorId,
    organizationId: orgId,
    slug: org.slug,
    name: org.name,
  }));

  return { organizationId: orgId, slug: org.slug };
}
