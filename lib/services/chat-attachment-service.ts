/**
 * Ask Chapt file attachments: upload (extract, then discard the bytes), list,
 * remove, read one unit back for a citation, and the loads the chat route
 * needs.
 *
 * Every query goes through ctx.db.chatAttachment.forOwner(ctx.actorId), so a
 * member only ever reaches their own files in the active org; a file that isn't
 * theirs answers 404, never 403. The original bytes live only in this request:
 * nothing here writes to disk or Storage.
 *
 * Logging rule: ids, kinds, sizes and error codes only — never a filename, file
 * text or a parser's own exception (which can quote the document).
 */
import { createHash, randomUUID } from "node:crypto";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { logTiming } from "@/lib/observability";
import { DomainError, NotFoundError } from "@/lib/errors";
import { extractFile, displayName, FileRejected, FILE_ERROR_MESSAGES, type AttachmentContent, type FileErrorCode, type SheetData } from "@/lib/files";
import { parseRange, formatRange } from "@/lib/files/cells";
import {
  FILE_MAX_BYTES, FILES_PER_THREAD, UPLOADS_PER_DAY, ORG_ACTIVE_CHARS_MAX,
  RETENTION_IDLE_MS, RETENTION_MAX_MS, expiryFor,
} from "@/lib/files/limits";
import type { ChatAttachmentMeta } from "@/lib/db/tenant";
import type { AttachmentKind } from "@/lib/state";
import type { AttachmentUnit, ChatAttachmentInfo } from "@/lib/api-types";

export type { ChatAttachmentMeta };

/** Rows a citation's range read may return, so one excerpt can't be a whole workbook. */
const UNIT_GRID_MAX_ROWS = 200;

/** A file the member can't upload, as the 400 the chip reads (details.code). */
function rejected(code: FileErrorCode): DomainError {
  const status = code === "QUOTA" ? 429 : 400;
  return new DomainError(status === 429 ? "RATE_LIMITED" : "VALIDATION", FILE_ERROR_MESSAGES[code], status, { code });
}

const UNIT_NOUN: Record<AttachmentKind, ChatAttachmentInfo["unitNoun"]> = {
  pdf: "page", docx: "section", xlsx: "sheet", csv: "sheet", txt: "block",
};

export function toAttachmentInfo(m: ChatAttachmentMeta): ChatAttachmentInfo {
  const kind = m.kind as AttachmentKind;
  return {
    id: m.publicId,
    name: m.filename,
    kind,
    sizeBytes: m.sizeBytes,
    unitCount: m.unitCount,
    unitNoun: UNIT_NOUN[kind] ?? "block",
    truncated: m.truncated,
    createdAt: m.createdAt.toISOString(),
    expiresAt: m.expiresAt.toISOString(),
  };
}

/**
 * Validate, extract and store one file. Order: size (before reading a byte) →
 * extract → one transaction that serializes this member's uploads and checks
 * dedupe, the thread cap, the daily quota and the org ceiling before inserting.
 */
export async function uploadAttachment(ctx: RequestContext, file: File, threadId: string): Promise<ChatAttachmentInfo> {
  if (file.size === 0) throw rejected("EMPTY");
  if (file.size > FILE_MAX_BYTES) throw rejected("FILE_TOO_LARGE");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > FILE_MAX_BYTES) throw rejected("FILE_TOO_LARGE");

  const name = displayName(file.name ?? "");
  const started = performance.now();
  let extracted: Awaited<ReturnType<typeof extractFile>>;
  try {
    extracted = await extractFile(bytes, name);
  } catch (e) {
    throw rejected(e instanceof FileRejected ? e.code : "MALFORMED");
  }
  const extractMs = Math.round(performance.now() - started);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const row = await ctx.db.$transaction(async (tx) => {
    const mine = ctx.db.chatAttachment.onTx(tx).forOwner(ctx.actorId);
    await mine.lock();
    // The same bytes again in the same thread: hand back the file already there.
    const existing = await mine.findBySha(threadId, sha256);
    if (existing) return { meta: existing, created: false };
    if (await mine.countActiveInThread(threadId) >= FILES_PER_THREAD) throw rejected("TOO_MANY_FILES");
    if (await mine.countCreatedSince(new Date(Date.now() - 24 * 60 * 60 * 1000)) >= UPLOADS_PER_DAY) throw rejected("QUOTA");
    if (await ctx.db.chatAttachment.onTx(tx).orgActiveChars() + extracted.charCount > ORG_ACTIVE_CHARS_MAX) throw rejected("QUOTA");
    const now = new Date();
    const meta = await mine.create({
      publicId: randomUUID(),
      threadId,
      filename: name,
      kind: extracted.kind,
      sizeBytes: bytes.length,
      sha256,
      unitCount: extracted.unitCount,
      charCount: extracted.charCount,
      truncated: extracted.truncated,
      content: extracted.content as object,
      expiresAt: expiryFor(now, now),
    });
    return { meta, created: true };
  });

  if (row.created) {
    // Opportunistic cleanup: expired rows are already unreadable; this reclaims the space.
    await ctx.db.chatAttachment.purgeExpired().catch(() => {});
    await emit(ctx, "chat_attachment.uploaded", { type: "ChatAttachment", id: row.meta.id },
      { kind: extracted.kind, sizeBytes: bytes.length, charCount: extracted.charCount }, { activity: false });
    logTiming({
      route: "/api/ai/attachments", method: "POST", userId: ctx.actorId, message: "chat-attachment-upload",
      extra: { orgId: ctx.orgId, id: row.meta.publicId, kind: extracted.kind, sizeBytes: bytes.length, charCount: extracted.charCount, units: extracted.unitCount, truncated: extracted.truncated, extractMs },
    });
  }
  return toAttachmentInfo(row.meta);
}

export async function listAttachments(ctx: RequestContext, threadId: string): Promise<ChatAttachmentInfo[]> {
  const rows = await ctx.db.chatAttachment.forOwner(ctx.actorId).listMeta(threadId);
  return rows.map(toAttachmentInfo);
}

export async function removeAttachment(ctx: RequestContext, publicId: string): Promise<{ ok: true }> {
  const count = await ctx.db.chatAttachment.forOwner(ctx.actorId).remove(publicId);
  if (count === 0) throw new NotFoundError("Attachment");
  await emit(ctx, "chat_attachment.removed", { type: "ChatAttachment", id: 0 }, { count }, { activity: false });
  return { ok: true };
}

export async function removeThreadAttachments(ctx: RequestContext, threadId: string): Promise<{ ok: true; removed: number }> {
  const removed = await ctx.db.chatAttachment.forOwner(ctx.actorId).removeThread(threadId);
  if (removed > 0) await emit(ctx, "chat_attachment.removed", { type: "ChatAttachment", id: 0 }, { count: removed }, { activity: false });
  return { ok: true, removed };
}

/** The member's live files among `publicIds`, in upload order. Unknown, removed, expired or someone else's ids just don't come back. */
export async function listActiveByPublicIds(ctx: RequestContext, publicIds: string[]): Promise<ChatAttachmentMeta[]> {
  if (publicIds.length === 0) return [];
  return ctx.db.chatAttachment.forOwner(ctx.actorId).metaByPublicIds([...new Set(publicIds)]);
}

/** One file's extracted content, by the internal id of a meta row already loaded through forOwner. */
export async function loadAttachmentContent(ctx: RequestContext, id: number): Promise<AttachmentContent | null> {
  return (await ctx.db.chatAttachment.forOwner(ctx.actorId).content(id)) as AttachmentContent | null;
}

/** Push these files' expiry out: they were just used in a chat turn. */
export async function touchAttachments(ctx: RequestContext, ids: number[]): Promise<void> {
  await ctx.db.chatAttachment.forOwner(ctx.actorId).touch(ids, RETENTION_IDLE_MS, RETENTION_MAX_MS);
}

function sheetGrid(sheet: SheetData, rangeA1: string | undefined): (string | number | boolean | null)[][] | null {
  if (!rangeA1) return sheet.rows.slice(0, UNIT_GRID_MAX_ROWS);
  const r = parseRange(rangeA1);
  if (!r) return null;
  const header = sheet.headerRow !== null ? sheet.rows[sheet.headerRow] : null;
  const rows = sheet.rows.slice(r.r0, Math.min(r.r1 + 1, r.r0 + UNIT_GRID_MAX_ROWS)).map(row => row.slice(r.c0, r.c1 + 1));
  // Lead with the header when the range starts below it, so the excerpt reads on its own.
  if (header && sheet.headerRow! < r.r0) return [header.slice(r.c0, r.c1 + 1), ...rows];
  return rows;
}

/** GET …/units/[ref]: the text (or grid) a citation points at. */
export async function getAttachmentUnit(ctx: RequestContext, publicId: string, ref: string): Promise<AttachmentUnit> {
  const row = await ctx.db.chatAttachment.forOwner(ctx.actorId).withContent(publicId);
  const content = row?.content as AttachmentContent | null | undefined;
  if (!row || !content) throw new NotFoundError("Attachment");

  if (content.type === "text") {
    const unit = content.units.find(u => u.ref === ref);
    if (!unit) throw new NotFoundError("Passage");
    return { label: unit.label, text: unit.text, grid: null };
  }
  const [sheetRef, range] = ref.split("!");
  const sheet = content.sheets.find(s => s.ref === sheetRef);
  if (!sheet) throw new NotFoundError("Sheet");
  const grid = sheetGrid(sheet, range);
  if (!grid) throw new NotFoundError("Range");
  const r = range ? parseRange(range) : null;
  return { label: r ? `${sheet.name}!${formatRange(r)}` : sheet.name, text: null, grid };
}
