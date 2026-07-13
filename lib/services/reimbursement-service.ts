import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import type { CreateReimbursementInput, UpdateReimbursementInput } from "@/lib/validation/reimbursement";

// The include shape used everywhere we return a reimbursement to the client.
// The org-scoped delegate's create/update/findMany signatures aren't generic
// over `include` (see lib/db/tenant.ts), so the payload type needs a manual cast.
const REIMBURSEMENT_INCLUDE = {
  brother: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.ReimbursementInclude;

type ReimbursementRow = Prisma.ReimbursementGetPayload<{ include: typeof REIMBURSEMENT_INCLUDE }>;

// Reimbursement rows carry an `amountCents` BigInt for finance-grade precision
// (mirrors Transaction). BigInt is not JSON-serializable — Response.json() throws
// on it — so strip it before returning, exactly like transaction-service's mapTx.
function mapReimbursement<T extends { amountCents: bigint | null }>(raw: T): Omit<T, "amountCents"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { amountCents, ...rest } = raw;
  return rest;
}

// Org-local display name (Membership.name), same fallback rule as the roster.
// Without this, a member who renamed themselves in this org would still show
// their stale name on reimbursement requests.
async function withResolvedBrother(ctx: RequestContext, rows: ReimbursementRow[]): Promise<ReimbursementRow[]> {
  const brothers = rows.map(r => r.brother).filter((b): b is NonNullable<ReimbursementRow["brother"]> => b != null);
  if (brothers.length === 0) return rows;
  const nameByBrotherId = await ctx.db.membership.resolveNames(brothers);
  return rows.map(r => r.brother
    ? { ...r, brother: { ...r.brother, name: nameByBrotherId.get(r.brother.id) ?? r.brother.name } }
    : r);
}

export async function listReimbursements(ctx: RequestContext) {
  const rows = await ctx.db.reimbursement.findMany({
    orderBy: { createdAt: "desc" },
    include: REIMBURSEMENT_INCLUDE,
  }) as ReimbursementRow[];
  const resolved = await withResolvedBrother(ctx, rows);
  return resolved.map(mapReimbursement);
}

export async function createReimbursement(ctx: RequestContext, input: CreateReimbursementInput) {
  // A reimbursement is a self-service request: any member may file for themselves.
  // Filing on another member's behalf requires treasury authority.
  const canManage = ctx.isPlatformAdmin || ctx.isOrgAdmin || hasPermission(ctx.permissions, "MANAGE_TREASURY");
  const isSelf    = input.brotherId === ctx.actorId;
  if (!isSelf && !canManage) throw new ForbiddenError("Cannot file a reimbursement for another member");

  // Guard against a cross-tenant brotherId: the tenant wrapper scopes by org, so a
  // brother from another org resolves to null here.
  const brother = await ctx.db.brother.findUnique({ where: { id: input.brotherId } });
  if (!brother) throw new NotFoundError("Brother");

  const r = await ctx.db.reimbursement.create({
    data: {
      brotherId:   input.brotherId,
      amount:      input.amount,
      amountCents: BigInt(Math.round(input.amount * 100)),
      date:        input.date,
      description: input.description,
    },
    include: REIMBURSEMENT_INCLUDE,
  }) as ReimbursementRow;
  await emit(ctx, "reimbursement.created", { type: "Reimbursement", id: r.id }, {
    brotherId:   r.brotherId,
    amount:      r.amount,
    description: r.description,
  });
  const [resolved] = await withResolvedBrother(ctx, [r]);
  return mapReimbursement(resolved);
}

export async function updateReimbursement(ctx: RequestContext, id: number, input: UpdateReimbursementInput) {
  const existing = await ctx.db.reimbursement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Reimbursement");

  const r = await ctx.db.reimbursement.update({
    where: { id },
    data: {
      ...(input.status        !== undefined ? { status:        input.status        } : {}),
      ...(input.rejectionNote !== undefined ? { rejectionNote: input.rejectionNote } : {}),
    },
    include: REIMBURSEMENT_INCLUDE,
  }) as ReimbursementRow;
  await emit(ctx, "reimbursement.updated", { type: "Reimbursement", id: r.id }, {
    status:    r.status,
    brotherId: r.brotherId,
  });
  const [resolved] = await withResolvedBrother(ctx, [r]);
  return mapReimbursement(resolved);
}
