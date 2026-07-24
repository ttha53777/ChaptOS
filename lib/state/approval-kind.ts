// The chapter surface a chat-approved action wrote to. Mirrors ProposalKind in
// lib/ai-tools.ts (each propose_* tool declares its kind in PROPOSAL_META) and
// drives the Approvals record's filter chips + row glyphs. A DB CHECK constraint
// pins the stable set (see the add_chat_approval migration).
export const ApprovalKind = {
  Timeline: "timeline",
  Instagram: "instagram",
  Events: "events",
  Treasury: "treasury",
  Dues: "dues",
  Programming: "programming",
} as const;

export type ApprovalKind = (typeof ApprovalKind)[keyof typeof ApprovalKind];

export const APPROVAL_KINDS: readonly ApprovalKind[] = Object.values(ApprovalKind);

export function isApprovalKind(value: unknown): value is ApprovalKind {
  return typeof value === "string" && (APPROVAL_KINDS as readonly string[]).includes(value);
}
