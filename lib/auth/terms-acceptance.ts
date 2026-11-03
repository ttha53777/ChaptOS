/**
 * Recording and reading Terms of Service acceptance.
 *
 * TermsAcceptance is global and has RLS on with no policy (see its migration),
 * so everything here runs on prismaPrivileged — a figurints_app read would come
 * back empty rather than erroring, and "never accepted" is exactly the wrong
 * thing to conclude from that. Keyed by the Google account id because a join
 * request agrees before any Brother exists.
 *
 * The two bootstrap writes (provisionOrg, submitJoinRequest) pass their own
 * transaction so the acceptance commits with the thing it was given for: no org
 * without its founder's agreement, no filed request without the asker's.
 */

import type { Prisma } from "@/app/generated/prisma/client";
import { prismaPrivileged } from "@/lib/prisma-privileged";
import { TERMS_ACCEPT_BY, TERMS_VERSION, type TermsVersion } from "@/lib/terms";
import type { TermsAcceptanceContext } from "@/lib/state";
import type { TermsStatus } from "@/lib/api-types";

type Client = Prisma.TransactionClient | typeof prismaPrivileged;

export interface TermsAcceptanceInput {
  authUserId: string;
  version: TermsVersion;
  context: TermsAcceptanceContext;
  /** Only for `create`: the org the founder agreed on behalf of. */
  organizationId?: number | null;
}

/** Append an acceptance. Never updates an older row — the history is the point. */
export async function recordTermsAcceptance(input: TermsAcceptanceInput, client: Client = prismaPrivileged): Promise<void> {
  await client.termsAcceptance.create({
    data: {
      authUserId:     input.authUserId,
      version:        input.version,
      context:        input.context,
      organizationId: input.organizationId ?? null,
    },
  });
}

/** The most recent version this account agreed to, or null if none. */
export async function latestAcceptedTermsVersion(authUserId: string): Promise<string | null> {
  const row = await prismaPrivileged.termsAcceptance.findFirst({
    where:   { authUserId },
    orderBy: { acceptedAt: "desc" },
    select:  { version: true },
  });
  return row?.version ?? null;
}

/** What /api/auth/me tells the client, so TermsGate can decide whether to ask. */
export function termsStatus(acceptedVersion: string | null): TermsStatus {
  return { version: TERMS_VERSION, acceptedVersion, acceptBy: TERMS_ACCEPT_BY };
}
