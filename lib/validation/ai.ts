import { z } from "zod";
import { APPROVAL_KINDS } from "@/lib/state";
import { PEEK_TYPES } from "@/lib/services/peek-service";

// The writ card's key/value lines, echoed back from the signed proposal blob.
const displayRow = z.object({
  k: z.string().min(1).max(40),
  v: z.string().min(1).max(200),
  em: z.boolean().optional(),
});

/**
 * POST /api/ai/approvals — record an approved chat proposal. Everything except
 * subjectId is the proposal blob the server signed at draft time; the service
 * re-verifies the signature before trusting any of it, so this schema only
 * bounds shapes/sizes (integrity is the HMAC's job, not zod's).
 */
export const recordApprovalInput = z.object({
  action:   z.string().min(1).max(60),
  endpoint: z.string().min(1).max(120),
  method:   z.enum(["POST", "PATCH"]),
  payload:  z.record(z.string(), z.unknown()),
  display:  z.object({
    kind:  z.enum(APPROVAL_KINDS as readonly [string, ...string[]]),
    title: z.string().min(1).max(80),
    rows:  z.array(displayRow).min(1).max(12),
  }),
  iat: z.number().finite(),
  sig: z.string().min(16).max(200),
  // Best-effort link to the row the approved POST created.
  subjectId: z.number().int().positive().optional(),
});
export type RecordApprovalInput = z.infer<typeof recordApprovalInput>;

/** GET /api/ai/approvals?kind= — filter the record by surface. */
export const listApprovalsQuery = z.object({
  kind: z.enum(APPROVAL_KINDS as readonly [string, ...string[]]).optional(),
});

/** GET /api/ai/peek?type=&id= — the detail behind a tapped answer row. */
export const peekQuery = z.object({
  type: z.enum(PEEK_TYPES as readonly [string, ...string[]]),
  id:   z.coerce.number().int().positive(),
});

/** POST /api/ai/feedback — Helpful? thumbs on an answer. Telemetry only. */
export const assistantFeedbackInput = z.object({
  helpful:    z.boolean(),
  question:   z.string().max(300).default(""),
  answerKind: z.enum(["structured", "text", "fastpath"]).default("text"),
});
export type AssistantFeedbackInput = z.infer<typeof assistantFeedbackInput>;
