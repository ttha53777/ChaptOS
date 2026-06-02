/**
 * Data-access layer entry point.
 *
 * Call `db(orgId)` with the resolved org from context to get an org-scoped
 * data accessor.
 */
export { db } from "./tenant";
export { prisma } from "@/lib/prisma";
