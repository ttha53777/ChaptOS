import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError, ValidationError } from "@/lib/errors";
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

// Reorder the docs within one section (folderId scopes it; null = root/Unfiled).
// orderedIds must be exactly the section's live doc ids, so a stale drag (a doc
// moved/deleted since load) is rejected rather than writing a half order. Writes
// dense 0..n-1 positions.
export async function reorderDocs(ctx: RequestContext, folderId: number | null, orderedIds: number[]) {
  const live = await ctx.db.doc.findMany({
    where: { folderId, pinnedAt: null },
    select: { id: true, position: true },
  });
  assertSameSet(live.map(d => d.id), orderedIds, "doc");
  if (orderedIds.length === 0) return { count: 0 }; // nothing to reorder / emit
  const written = await writeDensePositions(
    orderedIds,
    new Map(live.map(d => [d.id, d.position])),
    (id, pos) => ctx.db.doc.updateMany({ where: { id }, data: { position: pos } }),
  );
  await emit(ctx, "doc.reordered", { type: "Doc", id: orderedIds[0] ?? 0 }, { folderId, count: written });
  return { count: written };
}

// Reorder the unpinned folder sections. orderedIds must be exactly the org's
// unpinned folder ids (pinned folders float ahead and carry no manual order).
export async function reorderFolders(ctx: RequestContext, orderedIds: number[]) {
  const live = await ctx.db.docFolder.findMany({
    where: { pinnedAt: null },
    select: { id: true, position: true },
  });
  assertSameSet(live.map(f => f.id), orderedIds, "folder");
  if (orderedIds.length === 0) return { count: 0 };
  const written = await writeDensePositions(
    orderedIds,
    new Map(live.map(f => [f.id, f.position])),
    (id, pos) => ctx.db.docFolder.updateMany({ where: { id }, data: { position: pos } }),
  );
  await emit(ctx, "docFolder.reordered", { type: "DocFolder", id: orderedIds[0] ?? 0 }, { count: written });
  return { count: written };
}

// Assign dense 0..n-1 positions from `orderedIds`, writing only the rows whose
// position actually changes. Sequential on purpose: ctx.db has no transaction
// primitive, and with RLS_SET_ORG_ID=1 each call opens its own BEGIN/SET LOCAL/
// COMMIT — firing them with Promise.all would open up to orderedIds.length
// concurrent transactions against a 10-connection pool and stall. The set is
// pre-validated and each write is idempotent, so a mid-way failure just leaves a
// re-draggable partial order. Returns the number of rows actually written.
async function writeDensePositions(
  orderedIds: number[],
  currentById: Map<number, number | null>,
  writeOne: (id: number, pos: number) => Promise<unknown>,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (currentById.get(id) === i) continue; // already at this position — skip
    await writeOne(id, i);
    written++;
  }
  return written;
}

// The submitted order must be a permutation of the section's live membership —
// same ids, no more, no fewer, no dupes. Guards against a client sending a stale
// or partial list that would leave the section half-ordered.
function assertSameSet(live: number[], submitted: number[], kind: "doc" | "folder") {
  const liveSet = new Set(live);
  const submittedSet = new Set(submitted);
  const ok = submitted.length === live.length
    && submittedSet.size === submitted.length
    && submitted.every(id => liveSet.has(id));
  if (!ok) {
    throw new ValidationError(
      `The ${kind} list is out of date — refresh and try again.`,
    );
  }
}
