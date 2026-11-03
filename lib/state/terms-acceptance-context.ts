/**
 * Where someone agreed to the Terms of Service. CHECK-constrained in the DB
 * (terms_acceptance_context, 20261103000001_terms_acceptance).
 *
 *   create — the founder's checkbox on /create, agreeing for the new org too
 *   join   — filing a join request ("By continuing, you agree…")
 *   prompt — the in-app TermsGate, for existing members and new versions
 */
export const TermsAcceptanceContext = {
  Create: "create",
  Join:   "join",
  Prompt: "prompt",
} as const;

export type TermsAcceptanceContext = (typeof TermsAcceptanceContext)[keyof typeof TermsAcceptanceContext];

export const TERMS_ACCEPTANCE_CONTEXTS: readonly TermsAcceptanceContext[] = Object.values(TermsAcceptanceContext);

export function isTermsAcceptanceContext(value: unknown): value is TermsAcceptanceContext {
  return typeof value === "string" && (TERMS_ACCEPTANCE_CONTEXTS as readonly string[]).includes(value);
}
