import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Dev-only impersonation bypass for headless-browser screenshotting.
 *
 * Lets a local tool (scripts/screenshot.ts) act as a given Brother without a real
 * Supabase session, so authenticated /[slug]/* pages can be rendered and captured.
 *
 * SAFETY — this is inert unless BOTH locks are open:
 *   1. process.env.NODE_ENV !== "production"  (dead code in a prod build)
 *   2. process.env.DEV_AUTH_BYPASS === "1"     (explicit local opt-in)
 * and even then only a cookie whose value carries a valid HMAC (keyed on
 * DEV_AUTH_BYPASS_SECRET) is honored, so a stray/forged cookie can't impersonate.
 */

export { DEV_IMPERSONATE_COOKIE } from "./dev-bypass-client";

/** True only when both env locks are open. Cheap; no I/O. */
export function devBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";
}

function secret(): string {
  const s = process.env.DEV_AUTH_BYPASS_SECRET;
  if (!s) throw new Error("DEV_AUTH_BYPASS_SECRET is required when DEV_AUTH_BYPASS=1");
  return s;
}

/** Sign a brotherId into a cookie value of the form "<brotherId>.<hex-hmac>". */
export function signImpersonation(brotherId: number): string {
  const payload = String(brotherId);
  const mac = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

/**
 * Verify a cookie value and return the brotherId, or null if absent/malformed/
 * tampered. Never throws on bad input — callers fall through to the normal
 * Supabase auth path when this returns null.
 */
export function verifyImpersonation(cookieValue: string | undefined): number | null {
  if (!cookieValue) return null;
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = cookieValue.slice(0, dot);
  const provided = cookieValue.slice(dot + 1);
  const brotherId = Number(payload);
  if (!Number.isInteger(brotherId) || brotherId <= 0) return null;

  let expected: string;
  try {
    expected = createHmac("sha256", secret()).update(payload).digest("hex");
  } catch {
    return null; // secret missing — treat as no bypass
  }
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return brotherId;
}
