import { z } from "zod";
import { isKnownTermsVersion, type TermsVersion } from "@/lib/terms";

/**
 * The Terms of Service version a client says the person agreed to. Any version
 * that was ever live passes (a page loaded before a new one shipped sends what
 * it showed); anything else is refused, so a request can't claim agreement to
 * terms that never existed. See lib/terms.ts.
 */
export const termsVersionInput = z
  .string({ error: "Agree to the Terms of Service to continue" })
  .refine(isKnownTermsVersion, { message: "Agree to the current Terms of Service to continue" })
  .transform(v => v as TermsVersion);

/** POST /api/auth/terms — the in-app prompt's "I agree". */
export const acceptTermsInput = z.object({ version: termsVersionInput });
export type AcceptTermsInput = z.infer<typeof acceptTermsInput>;

/** The part of POST /api/orgs that isn't the org itself: the founder's checkbox. */
export const createOrgTermsInput = z.object({ termsVersion: termsVersionInput });
