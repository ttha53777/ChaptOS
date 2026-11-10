/**
 * Every bound on Ask Chapt file attachments, in one place.
 *
 * Server-only constants plus the feature flag. Nothing here imports the DB, so
 * the extractors (lib/files/*), the service and the chat route can all share it.
 * See ASK_CHAPT_FILE_INTELLIGENCE_PLAN.md §5 for why each number is what it is.
 */

/** Same ceiling as receipts: under the ~4.5 MB request-body limit of serverless hosts. */
export const FILE_MAX_BYTES = 4 * 1024 * 1024;

/** Files one conversation can hold at once. */
export const FILES_PER_THREAD = 5;

/** Extracted characters kept per file; past this the file is stored truncated. */
export const FILE_MAX_CHARS = 200_000;

/** PDF pages read before stopping. */
export const PDF_MAX_PAGES = 300;

/** Workbook bounds. */
export const SHEETS_MAX = 20;
export const CELLS_MAX = 100_000;

/** Zip preflight bounds, enforced on actual inflated output, never declared sizes. */
export const ZIP_MAX_ENTRIES = 2_000;
export const ZIP_MAX_TOTAL_BYTES = 60 * 1024 * 1024;
export const ZIP_MAX_ENTRY_BYTES = 30 * 1024 * 1024;

/** Uploads per member: a per-instance burst guard and a durable daily count. */
export const UPLOADS_PER_MINUTE = 10;
export const UPLOADS_PER_DAY = 30;

/** Extracted characters an org may hold across all live attachments. */
export const ORG_ACTIVE_CHARS_MAX = 25_000_000;

/** File characters one chat request may hand the model, across all tool calls. */
export const CHAT_FILE_CHARS_BUDGET = 120_000;

/** Characters in one file tool result. */
export const TOOL_RESULT_CHARS = 24_000;

/**
 * Rows a file answer may show. Ordinary answers keep 6; "every deadline in the
 * report" needs room, or the list a whole-file scan found gets cut at six.
 */
export const FILE_ANSWER_MAX_ROWS = 12;

/** Characters pre-seeded into the first turn after upload, across all files. */
export const PRESEED_TOTAL_CHARS = 48_000;

/** Retention: a sliding window from last use, capped by a hard limit from upload. */
export const RETENTION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const RETENTION_MAX_MS = 30 * 24 * 60 * 60 * 1000;

/** Display-name bound for the filename (it is display text only). */
export const FILENAME_MAX_CHARS = 120;

/** Extensions the composer offers in its file picker; identification is by bytes, not these. */
export const FILE_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".csv", ".txt", ".md"];

/**
 * expiresAt for a file used at `lastUse` and uploaded at `createdAt`:
 * min(createdAt + 30 days, lastUse + 7 days).
 */
export function expiryFor(createdAt: Date, lastUse: Date): Date {
  return new Date(Math.min(createdAt.getTime() + RETENTION_MAX_MS, lastUse.getTime() + RETENTION_IDLE_MS));
}

/** The rollback lever. Read per call so a test can flip it. */
export function filesEnabled(): boolean {
  return process.env.ASK_CHAPT_FILES === "1";
}
