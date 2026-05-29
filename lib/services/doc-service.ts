import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { scrapeMetadata } from "@/lib/og-metadata";
import type { CreateDocInput, UpdateDocInput } from "@/lib/validation/doc";

export async function listDocs(ctx: RequestContext) {
  try {
    return await ctx.db.doc.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  } catch {
    // Pre-migration safety mirroring the previous behavior.
    return [];
  }
}

export async function createDoc(ctx: RequestContext, input: CreateDocInput) {
  // 5s budget for inline metadata scrape; failure is non-fatal.
  const meta = await scrapeMetadata(input.url).catch(() => null);
  const doc = await ctx.db.doc.create({
    data: {
      title:       input.title,
      url:         input.url,
      description: input.description ?? null,
      ogImage:     meta?.ogImage    ?? null,
      ogTitle:     meta?.ogTitle    ?? null,
      faviconUrl:  meta?.faviconUrl ?? null,
      embedOk:     meta?.embedOk    ?? null,
      createdById: ctx.actorId,
    },
  });
  await emit(ctx, "doc.created", { type: "Doc", id: doc.id }, { title: doc.title, url: doc.url });
  return doc;
}

export async function updateDoc(ctx: RequestContext, id: number, input: UpdateDocInput) {
  const data: Prisma.DocUpdateInput = {};
  const changedFields: string[] = [];
  if (input.title !== undefined)       { data.title = input.title; changedFields.push("title"); }
  if (input.description !== undefined) { data.description = input.description; changedFields.push("description"); }
  if (input.url !== undefined) {
    data.url = input.url; changedFields.push("url");
    const meta = await scrapeMetadata(input.url).catch(() => null);
    data.ogImage    = meta?.ogImage    ?? null;
    data.ogTitle    = meta?.ogTitle    ?? null;
    data.faviconUrl = meta?.faviconUrl ?? null;
    data.embedOk    = meta?.embedOk    ?? null;
  }
  if (changedFields.length === 0) {
    throw new ValidationError("No valid fields provided");
  }
  const doc = await ctx.db.doc.update({ where: { id }, data });
  await emit(ctx, "doc.updated", { type: "Doc", id: doc.id }, { title: doc.title, changedFields });
  return doc;
}

export async function deleteDoc(ctx: RequestContext, id: number) {
  const target = await ctx.db.doc.findUnique({ where: { id }, select: { title: true } });
  if (!target) throw new NotFoundError("Doc");
  await ctx.db.doc.delete({ where: { id } });
  await emit(ctx, "doc.deleted", { type: "Doc", id }, { title: target.title });
}

export async function refreshDocMetadata(ctx: RequestContext, id: number) {
  const existing = await ctx.db.doc.findUnique({ where: { id }, select: { url: true } });
  if (!existing) throw new NotFoundError("Doc");
  const meta = await scrapeMetadata(existing.url).catch(() => null);
  return ctx.db.doc.update({
    where: { id },
    data: {
      ogImage:    meta?.ogImage    ?? null,
      ogTitle:    meta?.ogTitle    ?? null,
      faviconUrl: meta?.faviconUrl ?? null,
      embedOk:    meta?.embedOk    ?? null,
    },
  });
}
