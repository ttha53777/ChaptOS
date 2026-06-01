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
import { ConflictError, ValidationError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { validateSlugFormat } from "@/lib/slug-rules";
import { getOrgType } from "@/lib/org-types";
import { PERMISSIONS, ALL_PERMISSIONS, type Permission } from "@/lib/permissions";
import type { CreateOrgInput } from "@/lib/validation/org";

export interface ProvisionedOrg {
  organizationId: number;
  slug:           string;
  brotherId:      number;
}

/**
 * Provision a brand-new organization for an authenticated Supabase user who
 * is not yet linked to any Brother row globally.
 *
 *  Steps (all inside one $transaction):
 *   1. Insert Organization row (orgType + createdAt + createdByBrotherId set
 *      in a second update once the founder Brother id is known).
 *   2. Insert OrganizationConfig row from the template.
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

  // Pre-check: the auth user must not already be linked to a Brother anywhere.
  // Same constraint /api/auth/claim enforces — a Google account belongs to one
  // Brother row globally. We check outside the transaction so the error is
  // returned immediately without rolling back any writes.
  const existing = await prisma.brother.findUnique({
    where: { authUserId },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("Your account is already linked to an organization.");
  }

  // The first role in the template (rank 100, all=true) is the founder role.
  const founderRoleSpec = template.roleSeeds.find(r => r.all && r.rank === 100);
  if (!founderRoleSpec) {
    // Caught by tests; signals a misconfigured template.
    throw new Error(`Template ${template.id} is missing a founder role`);
  }

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

      // 2. OrganizationConfig.
      await tx.organizationConfig.create({
        data: {
          organizationId:      org.id,
          enabledWorkflows:    [...template.enabledWorkflows],
          vocabularyOverrides: template.vocabularyOverrides as Prisma.InputJsonValue,
        },
      });

      // 3. Founder Brother. The legacy `role` string is set to the founder
      // role's name so existing UI bits that read it (sidebar header, brother
      // table) show something meaningful. The real authority lives in
      // BrotherRole below.
      const brother = await tx.brother.create({
        data: {
          organizationId: org.id,
          name:           input.founderName,
          role:           founderRoleSpec.name,
          attendance:     0,
          duesOwed:       0,
          gpa:            0,
          serviceHours:   0,
          authUserId,
          email,
        },
        select: { id: true, name: true },
      });

      // 4. Backfill createdByBrotherId now that we have the founder id.
      await tx.organization.update({
        where: { id: org.id },
        data:  { createdByBrotherId: brother.id },
      });

      // 5. Membership with isOrgAdmin=true — founder bypasses every permission
      // check at the guard layer.
      await tx.membership.create({
        data: {
          brotherId:      brother.id,
          organizationId: org.id,
          isOrgAdmin:     true,
        },
      });

      // 6. Seed roles from template + assign the founder role to the founder.
      let founderRoleId: number | null = null;
      for (const spec of template.roleSeeds) {
        const bits = spec.all ? ALL_PERMISSIONS : permissionBits(spec.permissions);
        const role = await tx.role.create({
          data: {
            organizationId: org.id,
            name:           spec.name,
            color:          spec.color,
            rank:           spec.rank,
            permissions:    bits,
            isSystem:       true,
          },
          select: { id: true, name: true },
        });
        if (role.name === founderRoleSpec.name) founderRoleId = role.id;
      }
      if (founderRoleId === null) {
        // Defensive — should be impossible given the find above.
        throw new Error("Founder role missing after seeding");
      }
      await tx.brotherRole.create({
        data: {
          brotherId:      brother.id,
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
          actorId:        brother.id,
          action:         "org.created",
          subjectType:    "Organization",
          subjectId:      org.id,
          metadata: {
            name:        input.name,
            slug:        org.slug,
            orgType:     template.id,
            founderName: brother.name,
          },
        },
      });

      return { organizationId: org.id, slug: org.slug, brotherId: brother.id };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Two unique constraints can produce P2002 here:
      //   * Organization.slug         — slug got taken between slug-check and create.
      //   * Brother.authUserId        — the same Google user fired POST twice
      //                                 (e.g. double-click) and the second one
      //                                 lost the race to insert the Brother.
      // Prisma's meta.target tells us which. Fall back to the slug message if
      // the target shape is ambiguous — the user can still resolve by retrying.
      const target = (e.meta as { target?: string[] | string } | undefined)?.target;
      const fields = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
      if (fields.some(f => f.includes("authUserId"))) {
        throw new ConflictError("Your account is already linked to an organization.");
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
