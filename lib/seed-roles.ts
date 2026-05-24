import type { PrismaClient } from "@/app/generated/prisma/client";
import { PERMISSIONS, ALL_PERMISSIONS, type Permission } from "@/lib/permissions";

/**
 * Idempotent system-role setup. Safe to run on any DB state — uses upsert by
 * unique `name`, never overwrites custom permissions a chapter has tuned.
 *
 * Called from prisma/seed.ts for fresh dev DBs and from scripts/seed-roles.ts
 * (a one-shot) after a production `prisma migrate deploy` to backfill the
 * system roles. Brothers are assigned roles by tokenizing their `role` string
 * on " · " and matching case-insensitively against the role name (or alias).
 */

interface SystemRoleSpec {
  name: string;
  color: string;
  rank: number;
  /** Permission names (resolved to bits at runtime to avoid hard-coding bit values). */
  permissions: Permission[];
  /** All permissions — set true for President, false otherwise. */
  all?: boolean;
  /** Strings in a brother's `role` title that should map to this role. */
  aliases: string[];
}

const SYSTEM_ROLES: SystemRoleSpec[] = [
  {
    name: "President",
    color: "#F59E0B",
    rank: 100,
    permissions: [],
    all: true,
    aliases: ["president"],
  },
  {
    name: "Treasurer",
    color: "#10B981",
    rank: 50,
    permissions: ["MANAGE_TREASURY"],
    aliases: ["treasurer"],
  },
  {
    name: "Social",
    color: "#EC4899",
    rank: 50,
    permissions: ["MANAGE_EVENTS", "MANAGE_PARTIES"],
    aliases: ["social"],
  },
  {
    name: "PR",
    color: "#3B82F6",
    rank: 50,
    permissions: ["MANAGE_INSTAGRAM"],
    aliases: ["pr", "public relations"],
  },
];

function bitsFor(spec: SystemRoleSpec): number {
  if (spec.all) return ALL_PERMISSIONS;
  return spec.permissions.reduce((acc, p) => acc | PERMISSIONS[p], 0);
}

export async function seedSystemRoles(prisma: PrismaClient): Promise<Map<string, number>> {
  const idByName = new Map<string, number>();
  for (const spec of SYSTEM_ROLES) {
    const bits = bitsFor(spec);
    const row = await prisma.role.upsert({
      where: { name: spec.name },
      // Only refresh permission bits on system roles whose spec changed; never
      // wipe a chapter's customizations to `color` or `rank` once they've been
      // edited via the UI.
      update: { permissions: bits, isSystem: true },
      create: {
        name: spec.name,
        color: spec.color,
        rank: spec.rank,
        permissions: bits,
        isSystem: true,
      },
      select: { id: true, name: true },
    });
    idByName.set(row.name, row.id);
  }
  return idByName;
}

/**
 * Walk every brother's `role` title, tokenize on " · ", and assign matching
 * system roles. Idempotent: BrotherRole has a composite PK so re-runs no-op.
 * Brothers with `isAdmin = true` are skipped — they already bypass everything
 * via super-admin and shouldn't be auto-rolled.
 */
export async function assignSystemRolesByTitle(
  prisma: PrismaClient,
  roleIdByName: Map<string, number>,
): Promise<{ assigned: number; brothersTouched: number }> {
  const brothers = await prisma.brother.findMany({
    where: { isAdmin: false, isGhost: false },
    select: { id: true, role: true },
  });

  let assigned = 0;
  let brothersTouched = 0;

  for (const b of brothers) {
    const tokens = b.role
      .split("·")
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);
    if (tokens.length === 0) continue;

    const matchedRoleIds = new Set<number>();
    for (const spec of SYSTEM_ROLES) {
      const hit = spec.aliases.some(alias =>
        tokens.some(tok => tok === alias || tok.includes(alias)),
      );
      if (hit) {
        const id = roleIdByName.get(spec.name);
        if (id) matchedRoleIds.add(id);
      }
    }
    if (matchedRoleIds.size === 0) continue;

    brothersTouched++;
    for (const roleId of matchedRoleIds) {
      try {
        await prisma.brotherRole.create({
          data: { brotherId: b.id, roleId },
        });
        assigned++;
      } catch {
        // P2002 unique-constraint = already assigned. Idempotent re-run, skip.
      }
    }
  }

  return { assigned, brothersTouched };
}
