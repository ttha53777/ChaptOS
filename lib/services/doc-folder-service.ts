import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import type { CreateFolderInput, RenameFolderInput } from "@/lib/validation/doc";

export async function listFolders(ctx: RequestContext) {
  try {
    return await ctx.db.docFolder.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] });
  } catch {
    // Pre-migration safety mirroring listDocs.
    return [];
  }
}

export async function createFolder(ctx: RequestContext, input: CreateFolderInput) {
  const folder = await ctx.db.docFolder.create({
    data: { name: input.name, createdById: ctx.actorId },
  });
  await emit(ctx, "docFolder.created", { type: "DocFolder", id: folder.id }, { name: folder.name });
  return folder;
}

export async function renameFolder(ctx: RequestContext, id: number, input: RenameFolderInput) {
  const folder = await ctx.db.docFolder.update({ where: { id }, data: { name: input.name } });
  await emit(ctx, "docFolder.renamed", { type: "DocFolder", id: folder.id }, { name: folder.name, changedFields: ["name"] });
  return folder;
}

export async function deleteFolder(ctx: RequestContext, id: number) {
  const target = await ctx.db.docFolder.findUnique({ where: { id }, select: { name: true } });
  if (!target) throw new NotFoundError("DocFolder");
  // Release the folder's docs back to the library root, then delete the folder.
  const { count } = await ctx.db.doc.updateMany({ where: { folderId: id }, data: { folderId: null } });
  await ctx.db.docFolder.delete({ where: { id } });
  await emit(ctx, "docFolder.deleted", { type: "DocFolder", id }, { name: target.name, releasedDocs: count });
}

export async function setFolderPinned(ctx: RequestContext, id: number, pinned: boolean) {
  const target = await ctx.db.docFolder.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new NotFoundError("DocFolder");
  const folder = await ctx.db.docFolder.update({
    where: { id },
    data: { pinnedAt: pinned ? new Date() : null },
  });
  await emit(ctx, "docFolder.pinned", { type: "DocFolder", id: folder.id }, { name: folder.name, pinned });
  return folder;
}

export async function moveDoc(ctx: RequestContext, docId: number, folderId: number | null) {
  // A non-null target must be a folder in this org; ctx.db scoping makes a
  // cross-org id invisible here.
  if (folderId !== null) {
    const folder = await ctx.db.docFolder.findUnique({ where: { id: folderId }, select: { id: true } });
    if (!folder) throw new NotFoundError("DocFolder");
  }
  const doc = await ctx.db.doc.update({ where: { id: docId }, data: { folderId } });
  await emit(ctx, "doc.moved", { type: "Doc", id: doc.id }, { title: doc.title, folderId });
  return doc;
}
