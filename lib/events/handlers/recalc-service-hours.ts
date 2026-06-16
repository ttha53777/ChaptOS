/**
 * Recompute Brother.serviceHours when service participation changes.
 *
 * Mirrors recalc-attendance.ts: the side effect that keeps the derived
 * aggregate in sync runs as an event subscriber, not inline in the service.
 * Failures are isolated by dispatchHandlers and do not roll back the write —
 * the next participation change reconciles the affected members.
 */

import { on } from "../dispatch";
import {
  recalcBrothersServiceHours,
  recalcBrotherServiceHours,
  recalcAllBrothersServiceHours,
} from "@/lib/service-hours";

on("service_participation.logged", async (ctx, { metadata }) => {
  await recalcBrothersServiceHours(metadata.brotherIds, ctx.orgId);
});

on("service_participation.removed", async (ctx, { metadata }) => {
  await recalcBrotherServiceHours(metadata.brotherId, ctx.orgId);
});

// Deleting a service event cascade-removes its participation rows, which can
// drop any number of members' totals — recompute the whole org.
on("service_event.deleted", async (ctx) => {
  await recalcAllBrothersServiceHours(ctx.orgId);
});
