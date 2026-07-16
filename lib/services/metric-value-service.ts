import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { getMetricStatus, computeHeadline, type CustomMetricDefinition, type MetricSnapshot } from "@/lib/metrics";
import type { UpdateBrotherMetricsInput } from "@/lib/validation/metrics";

export interface BrotherMetricRow {
  definitionId: number;
  slug:         string;
  name:         string;
  unit:         string | null;
  goal:         number;
  atRiskBelow:  number;
  watchBelow:   number | null;
  aggregation:  string;
  value:        number | null;  // null when no value recorded yet
  status:       "on_track" | "watch" | "at_risk" | null;
}

function toDefDTO(row: {
  id: number; organizationId: number; slug: string; name: string; unit: string | null;
  goal: number; atRiskBelow: number; watchBelow: number | null; aggregation: string;
  displayOrder: number; deletedAt: Date | null; createdAt: Date; updatedAt: Date;
}): CustomMetricDefinition {
  return {
    id:             row.id,
    organizationId: row.organizationId,
    slug:           row.slug,
    name:           row.name,
    unit:           row.unit,
    goal:           row.goal,
    atRiskBelow:    row.atRiskBelow,
    watchBelow:     row.watchBelow,
    aggregation:    row.aggregation as CustomMetricDefinition["aggregation"],
    displayOrder:   row.displayOrder,
    deletedAt:      row.deletedAt?.toISOString() ?? null,
    createdAt:      row.createdAt.toISOString(),
    updatedAt:      row.updatedAt.toISOString(),
  };
}

/** Return all active metric definitions with the given brother's current values. */
export async function getBrotherMetrics(
  ctx: RequestContext,
  brotherId: number,
): Promise<BrotherMetricRow[]> {
  const defs = await ctx.db.orgMetricDefinition.findMany({
    where:   { deletedAt: null },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  if (defs.length === 0) return [];

  const values = await ctx.db.brotherMetricValue.findMany({
    where: { brotherId, metricDefinitionId: { in: defs.map(d => d.id) } },
  });
  const valueMap = new Map(values.map(v => [v.metricDefinitionId, v.value]));

  return defs.map(def => {
    const value = valueMap.get(def.id) ?? null;
    return {
      definitionId: def.id,
      slug:         def.slug,
      name:         def.name,
      unit:         def.unit,
      goal:         def.goal,
      atRiskBelow:  def.atRiskBelow,
      watchBelow:   def.watchBelow,
      aggregation:  def.aggregation,
      value,
      status: value !== null ? getMetricStatus(value, def) : null,
    };
  });
}

/**
 * Upsert metric values for a brother.
 * Validates org membership of each definition id before writing.
 * Input: Record<metricDefinitionId (string), number>
 */
export async function upsertBrotherMetrics(
  ctx: RequestContext,
  brotherId: number,
  input: UpdateBrotherMetricsInput,
): Promise<BrotherMetricRow[]> {
  const canManage = hasPermission(ctx.permissions, "MANAGE_BROTHERS") || ctx.isPlatformAdmin || ctx.isOrgAdmin;
  const isSelf    = ctx.actorId === brotherId;
  if (!canManage && !isSelf) {
    throw new ForbiddenError("Only officers or the member themselves can update metric values");
  }

  // Validate all supplied definition ids belong to this org
  const requestedIds = Object.keys(input.values).map(k => parseInt(k, 10));
  if (requestedIds.some(isNaN)) {
    throw new ValidationError("Metric definition ids must be integers");
  }

  // Both guard reads are independent — fetch together. Check `activeDefs` first so
  // the defs-not-found error still wins over member-not-found (unchanged precedence).
  const [activeDefs, brother] = await Promise.all([
    ctx.db.orgMetricDefinition.findMany({
      where: { id: { in: requestedIds }, deletedAt: null },
    }),
    ctx.db.brother.findFirst({ where: { id: brotherId } }),
  ]);
  if (activeDefs.length !== requestedIds.length) {
    throw new NotFoundError("One or more metric definitions not found or have been removed");
  }
  // Brother must belong to this org
  if (!brother) throw new NotFoundError("Member not found");

  // Upsert each value
  const updatedSlugs: string[] = [];
  for (const def of activeDefs) {
    const value = input.values[String(def.id)];
    await ctx.db.brotherMetricValue.upsert({
      where:  { brotherId_metricDefinitionId: { brotherId, metricDefinitionId: def.id } },
      update: { value, organizationId: ctx.orgId },
      create: { brotherId, metricDefinitionId: def.id, organizationId: ctx.orgId, value },
    });
    updatedSlugs.push(def.slug);
  }

  const nameByBrotherId = await ctx.db.membership.resolveNames([{ id: brother.id, name: brother.name }]);
  await emit(ctx, "metric_value.updated", { type: "BrotherMetricValue", id: brotherId }, {
    brotherId,
    brotherName: nameByBrotherId.get(brother.id) ?? brother.name,
    updatedSlugs,
  });

  return getBrotherMetrics(ctx, brotherId);
}

/** Bulk snapshot for the dashboard KPI cards. */
export async function getMetricSnapshot(ctx: RequestContext): Promise<MetricSnapshot[]> {
  const defs = await ctx.db.orgMetricDefinition.findMany({
    where:   { deletedAt: null },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  if (defs.length === 0) return [];

  const defDTOs = defs.map(toDefDTO);
  const defIds  = defs.map(d => d.id);

  // Both derive only from `defs` — run together. One batched groupBy for avg + sum
  // + total count per definition; and a per-definition count of members meeting goal.
  const [aggMap, onTrackMap] = await Promise.all([
    ctx.db.brotherMetricValue.aggregateByDefinition(defIds),
    ctx.db.brotherMetricValue.countOnTrack(defs.map(d => ({ id: d.id, goal: d.goal }))),
  ]);

  return defDTOs.map(def => {
    const agg        = aggMap.get(def.id);
    const totalCount = agg?.count       ?? 0;
    const avg        = agg?.avg         ?? null;
    const sum        = agg?.sum         ?? 0;
    const onTrack    = onTrackMap.get(def.id) ?? 0;

    // Compute watch + at-risk counts from the value distribution
    // We don't fetch every row here — derive approximate watch/atRisk from totals
    // A precise breakdown requires fetching all values; at dashboard granularity
    // total/onTrack is sufficient. watchCount + atRiskCount deferred to per-metric drawer.
    const atRisk = totalCount > 0
      ? (agg ? Math.max(0, totalCount - onTrack) : 0)
      : 0;

    const headline = computeHeadline(def.aggregation, { avg, sum, onTrackCount: onTrack });

    return {
      definitionId: def.id,
      slug:         def.slug,
      name:         def.name,
      unit:         def.unit,
      aggregation:  def.aggregation,
      headline,
      trend:        null,
      sparkData:    [],
      onTrackCount: onTrack,
      watchCount:   0,     // deferred — needs full value scan
      atRiskCount:  atRisk,
      totalCount,
      goal:         def.goal,
      atRiskBelow:  def.atRiskBelow,
      watchBelow:   def.watchBelow,
    };
  });
}
