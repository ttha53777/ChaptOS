export const InviteMode = {
  /** Redeeming creates a brand-new Brother + Membership in the org. */
  Open:  "open",
  /** Redeeming routes the user into the existing name-match claim flow. */
  Claim: "claim",
} as const;

export type InviteMode = (typeof InviteMode)[keyof typeof InviteMode];

export const INVITE_MODES: readonly InviteMode[] = Object.values(InviteMode);

export function isInviteMode(value: unknown): value is InviteMode {
  return typeof value === "string" && (INVITE_MODES as readonly string[]).includes(value);
}
