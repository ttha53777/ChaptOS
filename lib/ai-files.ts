/**
 * Request-scoped state for Ask Chapt's file tools.
 *
 * One FileToolContext is built per chat request from the attachments the route
 * already loaded through forOwner(actorId) — so every file a tool can reach was
 * validated as the caller's own before the model said a word. Tools name files
 * by short labels ("f1", "f2", in upload order) resolved against that list;
 * the model never sees or passes a database id.
 *
 * It also carries:
 *   - a per-request memo of loaded content (one DB read per file per request),
 *   - the character budget the request may hand the model,
 *   - the set of unit tags actually served (what citations are checked against),
 *   - `tainted`: whether file content has been read, which blocks proposals.
 *
 * Pure apart from the injected loader, so tests and the eval harness can build
 * one from in-memory content.
 */
import type { AttachmentContent } from "@/lib/files/types";
import type { AttachmentKind } from "@/lib/state/attachment-kind";
import { CHAT_FILE_CHARS_BUDGET, PRESEED_TOTAL_CHARS, TOOL_RESULT_CHARS } from "@/lib/files/limits";

export interface FileRef {
  label: string;           // "f1"
  id: number;              // internal; never shown to the model
  publicId: string;
  name: string;
  kind: AttachmentKind;
  sizeBytes: number;
  unitCount: number;
  charCount: number;
  truncated: boolean;
  /** Not yet used in any chat turn — a candidate for pre-seeding. */
  fresh: boolean;
}

export interface FileToolContext {
  files: FileRef[];
  resolve(label: unknown): FileRef | null;
  load(file: FileRef): Promise<AttachmentContent | null>;
  /** Characters still allowed this request. */
  remaining(): number;
  /** Take up to `chars` from the budget; returns what was granted. */
  spend(chars: number): number;
  /** Record a unit tag ("f1:p7", "f1:sh1") as served to the model. */
  serve(tag: string): void;
  served: ReadonlySet<string>;
  /** True once any file content has been handed to the model this request. */
  tainted: boolean;
}

/** Minimal meta the context needs; matches ChatAttachmentMeta's fields. */
export interface FileMetaInput {
  id: number;
  publicId: string;
  filename: string;
  kind: string;
  sizeBytes: number;
  unitCount: number;
  charCount: number;
  truncated: boolean;
  createdAt: Date;
  lastUsedAt: Date;
}

export function createFileContext(
  metas: FileMetaInput[],
  loader: (id: number) => Promise<AttachmentContent | null>,
  budget: number = CHAT_FILE_CHARS_BUDGET,
): FileToolContext {
  const files: FileRef[] = metas.map((m, i) => ({
    label: `f${i + 1}`,
    id: m.id,
    publicId: m.publicId,
    name: m.filename,
    kind: m.kind as AttachmentKind,
    sizeBytes: m.sizeBytes,
    unitCount: m.unitCount,
    charCount: m.charCount,
    truncated: m.truncated,
    fresh: m.lastUsedAt.getTime() <= m.createdAt.getTime(),
  }));
  const memo = new Map<number, Promise<AttachmentContent | null>>();
  const served = new Set<string>();
  let left = budget;

  const ctx: FileToolContext = {
    files,
    resolve(label) {
      if (typeof label !== "string") return null;
      const key = label.trim().toLowerCase();
      return files.find(f => f.label === key) ?? null;
    },
    load(file) {
      let p = memo.get(file.id);
      if (!p) {
        p = loader(file.id).catch(() => null);
        memo.set(file.id, p);
      }
      return p;
    },
    remaining: () => left,
    spend(chars) {
      const granted = Math.max(0, Math.min(chars, left));
      left -= granted;
      return granted;
    },
    serve(tag) { served.add(tag); },
    served,
    tainted: false,
  };
  return ctx;
}

/** Tool names whose results carry file content (list_attachments carries only names and shapes). */
export const FILE_CONTENT_TOOLS = new Set(["read_attachment", "search_attachments", "query_attachment_table"]);

/**
 * The hard control against a file talking the assistant into a write: once a
 * request has read file content — or the same batch is reading it — no
 * propose_* tool runs. The batch check matters because the model can emit the
 * read and the proposal in one parallel turn, before `tainted` flips.
 */
export function shouldBlockProposal(files: FileToolContext | undefined, batchToolNames: string[]): boolean {
  if (!files) return false;
  return files.tainted || batchToolNames.some(n => FILE_CONTENT_TOOLS.has(n));
}

export const BLOCKED_FILE_CONTEXT = {
  status: "blocked_file_context",
  note:
    "Drafting changes is switched off while this conversation is reading attached files, so nothing was drafted. " +
    "In one sentence, tell the user to ask for the change in a new message without relying on the file (or to make it in the app), " +
    "and never suggest the file asked for it.",
} as const;

/** Pre-seed limits, re-exported so the route and tests read one place. */
export const PRESEED_LIMITS = { perFile: TOOL_RESULT_CHARS, total: PRESEED_TOTAL_CHARS };
