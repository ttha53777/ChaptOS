import { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { AGENDA_FIELDS, MAX_AGENDA_TEMPLATES_PER_ORG, unknownAgendaFields } from "@/lib/agenda-template";
import type { CreateAgendaTemplateInput, UpdateAgendaTemplateInput } from "@/lib/validation/agenda-template";

export interface AgendaTemplateDTO {
  id: number;
  name: string;
  description: string;
  category: string;
  body: string;
  isDefault: boolean;
  /** Meetings started from it. Derived from CalendarEvent.agendaTemplateId, never stored. */
  uses: number;
  createdAt: string;
  /** Last content edit. Toggling the default doesn't count, so the editor's
   *  `expectedUpdatedAt` only trips on a real conflicting save. */
  updatedAt: string;
  updatedBy: { id: number; name: string } | null;
}

/**
 * Whoever schedules meetings owns their agendas: MANAGE_EVENTS is what Add
 * meeting and the shared notes already require, and nobody without it has a
 * use for the drawer. The routes gate on it too; this keeps a direct service
 * caller honest.
 */
function requireEvents(ctx: RequestContext) {
  if (!can(ctx, "MANAGE_EVENTS")) throw new ForbiddenError("Only officers who schedule meetings can manage agenda templates");
}

function assertFillable(body: string) {
  const bad = unknownAgendaFields(body);
  if (bad.length) {
    throw new ValidationError(
      `${bad.map(f => `{{${f}}}`).join(", ")} ${bad.length === 1 ? "isn't a blank" : "aren't blanks"} the meeting form can fill. ` +
      `Use ${Object.keys(AGENDA_FIELDS).map(f => `{{${f}}}`).join(", ")}.`,
    );
  }
}

const DEFAULT_INDEX = "AgendaTemplate_one_default_per_org";
const DEFAULT_RACE = "Someone else just changed the default agenda. Reload and try again.";

function isDefaultRace(e: unknown): boolean {
  return e instanceof Error && e.message.includes(DEFAULT_INDEX);
}

/**
 * Make `id` the org's one default, or clear it (null). Raw SQL on purpose:
 * Prisma's @updatedAt would stamp every row this touches, and a default flip
 * isn't an edit — it would make an open editor on another template report a
 * conflict that isn't there. Clear first, then set: the partial unique index is
 * checked row by row, so a single SET "isDefault" = (id = X) can trip on order.
 */
async function setDefaultTx(tx: Prisma.TransactionClient, orgId: number, id: number | null) {
  await tx.$executeRaw`UPDATE "AgendaTemplate" SET "isDefault" = false WHERE "organizationId" = ${orgId} AND "isDefault" AND id IS DISTINCT FROM ${id}`;
  if (id != null) {
    await tx.$executeRaw`UPDATE "AgendaTemplate" SET "isDefault" = true WHERE "organizationId" = ${orgId} AND id = ${id} AND "archivedAt" IS NULL`;
  }
}

const dtoSelect = {
  id: true, name: true, description: true, category: true, body: true, isDefault: true,
  createdAt: true, updatedAt: true, updatedById: true, archivedAt: true,
  _count: { select: { meetings: true } },
} satisfies Prisma.AgendaTemplateSelect;

type Row = Prisma.AgendaTemplateGetPayload<{ select: typeof dtoSelect }>;

/** Editors' org-local names. Someone who has since left the org shows no name. */
async function editorNames(ctx: RequestContext, rows: Row[]): Promise<Map<number, string>> {
  const ids = [...new Set(rows.map(r => r.updatedById).filter((id): id is number => id != null))];
  if (!ids.length) return new Map();
  const members = await ctx.db.member.findMany({
    where:  { brotherId: { in: ids } },
    select: { brotherId: true, name: true, brother: { select: { name: true } } },
  });
  return new Map(members.map(m => [m.brotherId, m.name ?? m.brother.name]));
}

function toDTO(row: Row, names: Map<number, string>): AgendaTemplateDTO {
  const editor = row.updatedById != null ? names.get(row.updatedById) : undefined;
  return {
    id:          row.id,
    name:        row.name,
    description: row.description,
    category:    row.category,
    body:        row.body,
    isDefault:   row.isDefault,
    uses:        row._count.meetings,
    createdAt:   row.createdAt.toISOString(),
    updatedAt:   row.updatedAt.toISOString(),
    updatedBy:   editor && row.updatedById != null ? { id: row.updatedById, name: editor } : null,
  };
}

async function readOne(ctx: RequestContext, id: number): Promise<AgendaTemplateDTO> {
  const row = await ctx.db.agendaTemplate.findFirst({ where: { id }, select: dtoSelect });
  if (!row) throw new NotFoundError("Template");
  return toDTO(row, await editorNames(ctx, [row]));
}

async function assertNameFree(ctx: RequestContext, name: string, exceptId?: number) {
  const clash = await ctx.db.agendaTemplate.findFirst({
    where:  { archivedAt: null, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ValidationError(`There's already a template called "${name}"`);
}

/** The drawer: live templates, the default first, then most recently edited. */
export async function listAgendaTemplates(ctx: RequestContext): Promise<AgendaTemplateDTO[]> {
  requireEvents(ctx);
  const rows = await ctx.db.agendaTemplate.findMany({
    where:   { archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    select:  dtoSelect,
  });
  const names = await editorNames(ctx, rows);
  return rows.map(r => toDTO(r, names));
}

export async function createAgendaTemplate(ctx: RequestContext, input: CreateAgendaTemplateInput): Promise<AgendaTemplateDTO> {
  requireEvents(ctx);
  assertFillable(input.body);
  const live = await ctx.db.agendaTemplate.count({ where: { archivedAt: null } });
  if (live >= MAX_AGENDA_TEMPLATES_PER_ORG) {
    throw new ValidationError(`The drawer holds up to ${MAX_AGENDA_TEMPLATES_PER_ORG} templates. Delete one you don't use first.`);
  }
  await assertNameFree(ctx, input.name);

  let id: number;
  try {
    id = await ctx.db.$transaction(async tx => {
      const row = await tx.agendaTemplate.create({
        data: {
          organizationId: ctx.orgId,
          name:           input.name,
          description:    input.description ?? "",
          category:       input.category,
          body:           input.body,
          createdById:    ctx.actorId,
          updatedById:    ctx.actorId,
        },
        select: { id: true },
      });
      if (input.isDefault) await setDefaultTx(tx, ctx.orgId, row.id);
      return row.id;
    });
  } catch (e) {
    if (isDefaultRace(e)) throw new ConflictError(DEFAULT_RACE);
    throw e;
  }

  await emit(ctx, "agenda_template.created", { type: "AgendaTemplate", id }, { name: input.name, category: input.category });
  if (input.isDefault) await emit(ctx, "agenda_template.default_changed", { type: "AgendaTemplate", id }, { name: input.name }, { activity: false });
  return readOne(ctx, id);
}

/**
 * Edit, restore (`archived: false`, the Undo of a delete), and/or flip the
 * default, in one transaction. A restored template comes back as it was minus
 * the default flag, which the archive cleared — Undo passes `isDefault: true`
 * to put it back.
 */
export async function updateAgendaTemplate(ctx: RequestContext, id: number, input: UpdateAgendaTemplateInput): Promise<AgendaTemplateDTO> {
  requireEvents(ctx);
  const existing = await ctx.db.agendaTemplate.findFirst({ where: { id } });
  // An archived template only answers to its Undo.
  if (!existing || (existing.archivedAt && input.archived !== false)) throw new NotFoundError("Template");

  const restoring = input.archived === false && existing.archivedAt != null;
  if (input.expectedUpdatedAt && new Date(input.expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
    throw new ConflictError("Someone else saved this template while you were editing. Reload to see their changes; yours haven't been saved.");
  }
  if (input.body !== undefined) assertFillable(input.body);
  if (input.name !== undefined && input.name.toLowerCase() !== existing.name.toLowerCase()) await assertNameFree(ctx, input.name, id);
  else if (restoring) await assertNameFree(ctx, input.name ?? existing.name, id);
  if (restoring) {
    const live = await ctx.db.agendaTemplate.count({ where: { archivedAt: null } });
    if (live >= MAX_AGENDA_TEMPLATES_PER_ORG) throw new ValidationError(`The drawer holds up to ${MAX_AGENDA_TEMPLATES_PER_ORG} templates.`);
  }

  const data: Prisma.AgendaTemplateUpdateManyMutationInput = {};
  const changedFields: string[] = [];
  for (const f of ["name", "description", "category", "body"] as const) {
    if (input[f] !== undefined && input[f] !== existing[f]) {
      data[f] = input[f];
      changedFields.push(f);
    }
  }
  if (changedFields.length) data.updatedById = ctx.actorId;
  if (restoring) data.archivedAt = null;
  const defaultChange = input.isDefault !== undefined && (restoring || input.isDefault !== existing.isDefault);

  try {
    await ctx.db.$transaction(async tx => {
      if (changedFields.length || restoring) {
        // The updatedAt match makes the conflict check atomic with the write:
        // a save that lands between our read and here leaves zero rows matched.
        const { count } = await tx.agendaTemplate.updateMany({
          where: { id, organizationId: ctx.orgId, updatedAt: existing.updatedAt },
          data,
        });
        if (count === 0) throw new ConflictError("Someone else saved this template while you were editing. Reload to see their changes; yours haven't been saved.");
      }
      if (defaultChange) {
        if (input.isDefault) await setDefaultTx(tx, ctx.orgId, id);
        else await tx.$executeRaw`UPDATE "AgendaTemplate" SET "isDefault" = false WHERE "organizationId" = ${ctx.orgId} AND id = ${id}`;
      }
    });
  } catch (e) {
    if (isDefaultRace(e)) throw new ConflictError(DEFAULT_RACE);
    throw e;
  }

  const name = (data.name as string | undefined) ?? existing.name;
  const subject = { type: "AgendaTemplate" as const, id };
  if (restoring) await emit(ctx, "agenda_template.restored", subject, { name });
  if (changedFields.length) await emit(ctx, "agenda_template.updated", subject, { name, changedFields });
  if (defaultChange) await emit(ctx, "agenda_template.default_changed", subject, { name: input.isDefault ? name : null });
  return readOne(ctx, id);
}

/**
 * Delete = archive. Meetings that used it keep their notes (they're a copy) and
 * keep pointing at the row, so an Undo restores its meeting count too. A
 * deleted default leaves new meetings starting blank; `wasDefault` lets the
 * client say so.
 */
export async function archiveAgendaTemplate(ctx: RequestContext, id: number): Promise<{ id: number; wasDefault: boolean }> {
  requireEvents(ctx);
  const existing = await ctx.db.agendaTemplate.findFirst({ where: { id, archivedAt: null } });
  if (!existing) throw new NotFoundError("Template");

  await ctx.db.agendaTemplate.update({ where: { id }, data: { archivedAt: new Date(), isDefault: false } });
  await emit(ctx, "agenda_template.archived", { type: "AgendaTemplate", id }, { name: existing.name });
  return { id, wasDefault: existing.isDefault };
}
