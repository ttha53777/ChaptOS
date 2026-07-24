import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC signing for chat proposals.
 *
 * Proposals are ephemeral (never persisted at draft time), but approving one
 * writes a durable ChatApproval audit row built from the proposal's contents.
 * Signing the blob server-side at draft time lets the approvals endpoint trust
 * those contents when the client echoes them back on confirm — without a
 * proposals table. A tampered blob (edited amount, forged permission label)
 * fails verification and no record is written.
 *
 * Key: PROPOSAL_SIGNING_SECRET when set; otherwise derived from OPENAI_API_KEY
 * (always present when proposals can exist at all — no key, no chat). The
 * derivation keeps the API key itself out of HMAC-key duty; rotating either
 * secret only invalidates unconfirmed drafts, which simply re-draft.
 */

const KEY_CONTEXT = "chaptos-proposal-sig-v1";

/** Accept a confirm up to a day after drafting; allow small client clock skew. */
export const PROPOSAL_SIG_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function signingKey(): Buffer | null {
  const base = process.env.PROPOSAL_SIGNING_SECRET || process.env.OPENAI_API_KEY;
  if (!base) return null;
  return createHmac("sha256", KEY_CONTEXT).update(base).digest();
}

/**
 * Deterministic serialization: object keys sorted recursively, undefined
 * properties dropped — so a blob that round-trips through the client's
 * JSON.parse/stringify (which may reorder keys) still verifies.
 */
export function stableStringify(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Sign a proposal blob. Returns null when no key is configured (sig-less proposals still render; they just can't be recorded as approvals). */
export function signProposalBlob(blob: Record<string, unknown>): string | null {
  const key = signingKey();
  if (!key) return null;
  return createHmac("sha256", key).update(stableStringify(blob)).digest("hex");
}

/**
 * Verify a blob + sig pair. The blob must carry a numeric `iat` (ms epoch) that
 * is neither older than PROPOSAL_SIG_MAX_AGE_MS nor meaningfully in the future.
 * Never throws.
 */
export function verifyProposalBlob(blob: Record<string, unknown>, sig: unknown, now: number = Date.now()): boolean {
  if (typeof sig !== "string" || sig.length === 0) return false;
  const expected = signProposalBlob(blob);
  if (!expected) return false;
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const iat = blob.iat;
  if (typeof iat !== "number" || !Number.isFinite(iat)) return false;
  if (now - iat > PROPOSAL_SIG_MAX_AGE_MS) return false;
  if (iat - now > MAX_FUTURE_SKEW_MS) return false;
  return true;
}
