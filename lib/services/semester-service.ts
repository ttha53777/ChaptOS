import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import type { CreateSemesterInput } from "@/lib/validation/semester";

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
