import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { CreateSemesterInput, UpdateSemesterInput } from "@/lib/validation/semester";

export async function listSemesters(ctx: RequestContext) {
  return ctx.db.semester.findMany({ orderBy: { id: "desc" } });
}

export async function createSemester(ctx: RequestContext, input: CreateSemesterInput) {
  // Deactivate all existing, create new as active. One active per org.
  await ctx.db.semester.updateMany({ data: { isActive: false } });
  const s = await ctx.db.semester.create({
    data: {
      label:     input.label,
      startDate: input.startDate,
      endDate:   input.endDate,
      isActive:  true,
    },
  });
  await emit(ctx, "semester.created", { type: "Semester", id: s.id }, { label: s.label });
  return s;
}

/**
 * Update an existing semester (label / dates) and make it the active one. Used by
 * the no-active-semester gate's "extend current" action — typically to push the
 * end date out so the org has a live reporting period again.
 *
 * Resolves the resulting date pair (existing row overlaid with the patch) and
 * rejects endDate < startDate (lexicographic on YYYY-MM-DD). Reactivates exactly
 * like createSemester/activateSemester: deactivate all, then flag this one active.
 */
export async function updateSemester(ctx: RequestContext, id: number, input: UpdateSemesterInput) {
  // findUnique is org-scoped (ctx.db) — a foreign id resolves to null here.
  const existing = await ctx.db.semester.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Semester");

  const startDate = input.startDate ?? existing.startDate;
  const endDate   = input.endDate ?? existing.endDate;
  if (endDate < startDate) {
    throw new ValidationError("End date must be on or after the start date.", { code: "INVALID_DATE_RANGE" });
  }

  await ctx.db.semester.updateMany({ data: { isActive: false } });
  const s = await ctx.db.semester.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      startDate,
      endDate,
      isActive: true,
    },
  });
  await emit(ctx, "semester.activated", { type: "Semester", id: s.id }, { label: s.label });
  return s;
}

export async function activateSemester(ctx: RequestContext, id: number) {
  await ctx.db.semester.updateMany({ data: { isActive: false } });
  const s = await ctx.db.semester.update({ where: { id }, data: { isActive: true } }).catch(e => {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025") {
      throw new NotFoundError("Semester");
    }
    throw e;
  });
  await emit(ctx, "semester.activated", { type: "Semester", id: s.id }, { label: s.label });
  return s;
}
