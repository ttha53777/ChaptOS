import type { Prisma } from "@/app/generated/prisma/client";

/**
 * All admission/capacity mutations take this transaction-scoped lock before
 * reading their predicates. READ COMMITTED then sees the preceding commit.
 * Shared by bootstrap submissions, officer decisions, revoke, and restores.
 * The namespace keeps it distinct from other advisory locks in this database.
 */
export async function lockAdmissions(tx: Prisma.TransactionClient, orgId: number): Promise<void> {
  if (!Number.isSafeInteger(orgId) || orgId <= 0) throw new Error("Invalid admission org");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(734921, ${orgId}::integer)`;
}

export const ADMISSION_TX_OPTIONS = { isolationLevel: "ReadCommitted" as const, maxWait: 10_000, timeout: 15_000 };
