import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { resolvePermissions } from "@/lib/auth/require-permission";
import { parseAvatarFromMetadata } from "@/lib/avatar";
import { db } from "@/lib/db"; // lint-modules:ignore (auth bootstrap; runs before buildContext is viable)
import { ALL_WORKFLOWS } from "@/lib/org-types";
import { resolveThresholds } from "@/lib/thresholds";
import { sanitizeFieldDefs, type CustomMemberFieldDef } from "@/lib/custom-member-fields";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [brother, org, perms, metricDefinitionCount] = await Promise.all([
      db(user.orgId).brother.findUnique({
        where: { id: user.id },
        select: { name: true, email: true, avatarUrl: true },
      }),
      db(user.orgId).organization.findUnique({
        where: { id: user.orgId },
        select: {
          name: true,
          slug: true,
          // The org-type registry key (lib/org-types.ts) chosen at creation. The
          // onboarding AI interview uses it as a starting prior so its questions
          // and proposal begin from that template instead of cold.
          orgType: true,
          // Org profile picture for the sidebar/login badge — null falls back to
          // the gradient initials badge. Pulled in the same round-trip as name.
          logoUrl: true,
          // The sidebar and onboarding picker filter surfaces by the org's
          // enabled workflows. Pull it in the same round-trip as the org name.
          config: { select: { enabledWorkflows: true, vocabularyOverrides: true, thresholds: true, disabledFeatures: true, customMemberFields: true, onboardingCompletedAt: true } },
        },
      }),
      resolvePermissions(user),
      db(user.orgId).orgMetricDefinition.count({ where: { deletedAt: null } }),
    ]);

    // requireUser() already verified the session with Supabase and surfaced the
    // auth user's metadata — no second auth.getUser() network round-trip needed.
    const meta = parseAvatarFromMetadata(user.userMetadata);

    // Elevate permissions for the elevated tiers so the CLIENT permission
    // snapshot matches what buildContext() actually enforces server-side. An
    // org admin (Membership.isOrgAdmin for the active org) holds every
    // permission within that org even without an all-bits role; without this,
    // resolvePermissions() would report only their explicit role bits and the
    // UI would hide controls for actions the server permits. Platform admins are
    // already elevated inside resolvePermissions().
    const isOrgAdmin =
      user.memberships.find(m => m.organizationId === user.orgId)?.isOrgAdmin ?? false;
    const elevated = user.isPlatformAdmin || isOrgAdmin;
    const effectivePermissions = elevated ? (~0 >>> 0) : perms.permissions;
    const effectiveMaxRank = elevated ? Number.POSITIVE_INFINITY : perms.maxRank;

    // The persisted Brother.avatarUrl is the source of truth — it's written on
    // every upload/remove via syncBrotherAvatar and survives Supabase re-syncing
    // Google's OAuth claims into user_metadata on token refresh/re-login (which
    // would otherwise clobber a custom avatar_url and make the photo "disappear").
    // Fall back to metadata only when the column is null (e.g. pre-backfill rows).
    const avatarUrl = brother?.avatarUrl ?? meta.avatarUrl;
    const hasCustomAvatar = meta.hasCustomAvatar;

    // Backfill: brothers linked before the email column existed have a null email.
    // First time they hit /me after this ships, persist the session email so it
    // shows up in Settings without forcing a relink.
    if (brother && !brother.email && user.email) {
      db(user.orgId).brother.update({
        where: { id: user.id },
        data: { email: user.email },
      }).catch(e => logError(e, { route: "/api/auth/me", method: "GET", userId: user.id, extra: { stage: "email_backfill" } }));
    }

    return Response.json({
      id: user.id,
      name: brother?.name ?? user.email ?? "Unknown",
      role: user.role,
      isAdmin: user.isAdmin,
      email: user.email ?? "",
      avatarUrl,
      hasCustomAvatar,
      org: org
        ? {
            name: org.name,
            slug: org.slug,
            orgType: org.orgType ?? null,
            logoUrl: org.logoUrl ?? null,
            // Fall back to the full set when a config row is somehow absent (the
            // Milestone-1 migration backfills every org, so this is belt-and-
            // suspenders) — showing all pages is the safe default, hiding them is not.
            enabledWorkflows: org.config?.enabledWorkflows ?? [...ALL_WORKFLOWS],
            vocabularyOverrides: (org.config?.vocabularyOverrides ?? {}) as Record<string, string>,
            // Always emit a complete, in-range object so the client never has to
            // merge against defaults — resolveThresholds fills any missing key.
            thresholds: resolveThresholds(org.config?.thresholds),
            // OPT-OUT map of hidden page sections. Empty {} (or a missing config
            // row) means every feature is on — the safe default, same as workflows.
            disabledFeatures: (org.config?.disabledFeatures ?? {}) as Record<string, string[]>,
            // Org-defined extra fields. Empty [] means no custom fields — roster
            // and drawer render identically to today. Sanitized through the same
            // helper used by the service so the client always gets a clean list.
            customMemberFields: sanitizeFieldDefs(
              Array.isArray(org.config?.customMemberFields) ? org.config.customMemberFields as unknown as CustomMemberFieldDef[] : [],
            ),
            // Count of active metric definitions — used by BrotherDrawer to decide
            // whether to show the "metrics" tab (avoids a separate API call).
            metricDefinitionCount,
            // Whether the founder has finished the setup wizard. Drives the
            // dashboard "finish setting up" checklist (shown only once setup is
            // complete) and is the same signal the server onboarding guard gates
            // on. A missing config row reads as not-yet-complete.
            onboardingComplete: org.config?.onboardingCompletedAt != null,
          }
        : null,
      orgId: user.orgId,
      memberships: user.memberships,
      permissions: effectivePermissions,
      maxRank: Number.isFinite(effectiveMaxRank) ? effectiveMaxRank : null,
      roles: perms.roles,
    });
  } catch (e) {
    logError(e, { route: "/api/auth/me", method: "GET", userId: user?.id });
    return toResponse(e);
  }
}
