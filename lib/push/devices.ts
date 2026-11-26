/**
 * PushDevice access, all of it. The table is global (keyed by the Google
 * account) with RLS on and no policy, so the app role can't see it; everything
 * here runs as prismaPrivileged. Tenancy is enforced by these call shapes:
 *
 *   register / unregister   only ever the caller's own verified authUserId
 *   forAccounts             only accounts behind an org-scoped recipient list
 *                           (lib/push/sender.ts resolves them from PushMessage)
 *   prune                   tokens Expo itself reported dead
 *   deleteForAccount        account deletion and member erasure
 */
import { prismaPrivileged } from "@/lib/prisma-privileged"; // lint-direct-prisma:ignore global PushDevice table / cross-org outbox drain, see the file header
import type { PushPlatform } from "@/lib/state/push";

/**
 * Register or refresh a device. Idempotent on the token: a repeat call bumps
 * lastSeenAt, and a token that moved to another account (a shared phone, a
 * different sign-in) is re-pointed rather than duplicated.
 */
export async function registerDevice(authUserId: string, input: { token: string; platform: PushPlatform; appVersion: string | null }) {
  const now = new Date();
  return prismaPrivileged.pushDevice.upsert({
    where:  { token: input.token },
    create: { authUserId, token: input.token, platform: input.platform, appVersion: input.appVersion, lastSeenAt: now },
    update: { authUserId, platform: input.platform, appVersion: input.appVersion, lastSeenAt: now },
    select: { id: true },
  });
}

/** Sign-out: forget this token, but only if it's the caller's. */
export async function unregisterDevice(authUserId: string, token: string): Promise<number> {
  return (await prismaPrivileged.pushDevice.deleteMany({ where: { authUserId, token } })).count;
}

export async function forAccounts(authUserIds: string[]) {
  if (authUserIds.length === 0) return [];
  return prismaPrivileged.pushDevice.findMany({
    where:  { authUserId: { in: authUserIds } },
    select: { authUserId: true, token: true },
  });
}

export async function prune(tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  return (await prismaPrivileged.pushDevice.deleteMany({ where: { token: { in: tokens } } })).count;
}

export async function deleteForAccount(authUserId: string | null | undefined): Promise<number> {
  if (!authUserId) return 0;
  return (await prismaPrivileged.pushDevice.deleteMany({ where: { authUserId } })).count;
}
