import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { CreateMetricDefinitionInput, UpdateMetricDefinitionInput } from "@/lib/validation/metrics";
import type { CustomMetricDefinition } from "@/lib/metrics";

const MAX_METRICS_PER_ORG = 20;

function requireAdmin(ctx: RequestContext) {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) {
    throw new ForbiddenError("Only an org admin can manage custom metrics");
  }
}

function toDTO(row: {
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

function validateThresholds(goal: number, atRiskBelow: number, watchBelow?: number | null) {
  if (atRiskBelow > goal) {
    throw new ValidationError("atRiskBelow must be less than or equal to goal");
  }
  if (watchBelow != null) {
    if (watchBelow < atRiskBelow) {
      throw new ValidationError("watchBelow must be greater than or equal to atRiskBelow");
    }
    if (watchBelow > goal) {
      throw new ValidationError("watchBelow must be less than or equal to goal");
    }
  }
}

export async function listMetricDefinitions(ctx: RequestContext): Promise<CustomMetricDefinition[]> {
  const rows = await ctx.db.orgMetricDefinition.findMany({
    where:   { deletedAt: null },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toDTO);
}

export async function createMetricDefinition(
  ctx: RequestContext,
  input: CreateMetricDefinitionInput,
): Promise<CustomMetricDefinition> {
  requireAdmin(ctx);

  // Max 20 active definitions per org
  const activeCount = await ctx.db.orgMetricDefinition.count({ where: { deletedAt: null } });
  if (activeCount >= MAX_METRICS_PER_ORG) {
    throw new ValidationError(`Org has reached the limit of ${MAX_METRICS_PER_ORG} custom metrics`);
  }

  validateThresholds(input.goal, input.atRiskBelow, input.watchBelow);

  const row = await ctx.db.orgMetricDefinition.create({
    data: {
      slug:         input.slug,
      name:         input.name,
      unit:         input.unit ?? null,
      goal:         input.goal,
      atRiskBelow:  input.atRiskBelow,
      watchBelow:   input.watchBelow ?? null,
      aggregation:  input.aggregation,
      displayOrder: input.displayOrder ?? activeCount,
    },
  });

  await emit(ctx, "metric_definition.created", { type: "OrgMetricDefinition", id: row.id }, {
    slug: row.slug,
    name: row.name,
  });

  return toDTO(row);
}

export async function updateMetricDefinition(
  ctx: RequestContext,
  id: number,
  input: UpdateMetricDefinitionInput,
): Promise<CustomMetricDefinition> {
  requireAdmin(ctx);

  const existing = await ctx.db.orgMetricDefinition.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Metric definition not found");

  // Merge partial input with current values before validating cross-field invariants
  const merged = {
    goal:        input.goal        ?? existing.goal,
    atRiskBelow: input.atRiskBelow ?? existing.atRiskBelow,
    watchBelow:  "watchBelow" in input ? (input.watchBelow ?? null) : existing.watchBelow,
  };
  validateThresholds(merged.goal, merged.atRiskBelow, merged.watchBelow);

  const changedFields: string[] = [];
  const data: Record<string, unknown> = {};
  const fields = ["name", "unit", "goal", "atRiskBelow", "watchBelow", "aggregation", "displayOrder"] as const;
  for (const f of fields) {
    if (f in input && input[f] !== undefined) {
      data[f] = input[f] ?? null;
      changedFields.push(f);
    }
  }

  const row = await ctx.db.orgMetricDefinition.update({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where: { id }, data: data as any,
  });

  await emit(ctx, "metric_definition.updated", { type: "OrgMetricDefinition", id: row.id }, {
    slug: row.slug,
    name: row.name,
    changedFields,
  });

  return toDTO(row);
}

export async function softDeleteMetricDefinition(
  ctx: RequestContext,
  id: number,
): Promise<void> {
  requireAdmin(ctx);

  const existing = await ctx.db.orgMetricDefinition.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Metric definition not found");

  await ctx.db.orgMetricDefinition.update({
    where: { id },
    data:  { deletedAt: new Date() },
  });

  await emit(ctx, "metric_definition.deleted", { type: "OrgMetricDefinition", id }, {
    slug: existing.slug,
    name: existing.name,
  });
}
