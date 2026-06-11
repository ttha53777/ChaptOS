import { z } from "zod";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createMetricDefinitionInput = z.object({
  name:         z.string().trim().min(1).max(40),
  slug:         z.string().trim().min(1).max(50).regex(SLUG_RE, "Slug must be lowercase kebab-case (e.g. practice-reps)"),
  unit:         z.string().trim().max(10).nullable().optional(),
  goal:         z.number().finite().min(0).max(1_000_000),
  atRiskBelow:  z.number().finite().min(0).max(1_000_000),
  watchBelow:   z.number().finite().min(0).max(1_000_000).nullable().optional(),
  aggregation:  z.enum(["avg", "sum", "count_on_track"]),
  displayOrder: z.number().int().min(0).optional(),
});

export type CreateMetricDefinitionInput = z.infer<typeof createMetricDefinitionInput>;

// slug is intentionally excluded — immutable after creation
export const updateMetricDefinitionInput = createMetricDefinitionInput
  .omit({ slug: true })
  .partial();

export type UpdateMetricDefinitionInput = z.infer<typeof updateMetricDefinitionInput>;

export const updateBrotherMetricsInput = z.object({
  // keys are metricDefinitionId as string; server validates org ownership
  values: z.record(z.string(), z.number().finite().min(0).max(1_000_000)).refine(
    v => Object.keys(v).length <= 20,
    "Cannot update more than 20 metric values at once",
  ),
});

export type UpdateBrotherMetricsInput = z.infer<typeof updateBrotherMetricsInput>;
