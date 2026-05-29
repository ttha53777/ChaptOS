/**
 * Data-access layer entry point.
 *
 * Phase 0 compat shim: `defaultDb` is pre-scoped to org 1 so existing route
 * handlers can migrate incrementally in Phase 1 without all needing to change
 * at once. New code should call `db(orgId)` with the resolved org from context.
 */
export { db } from "./tenant";
export { prisma } from "@/lib/prisma";

import { db } from "./tenant";

/** Pre-scoped to org 1. Use only while migrating Phase 0 → Phase 1. */
export const defaultDb = db(1);
