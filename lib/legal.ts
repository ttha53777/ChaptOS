/**
 * Who operates ChaptOS, in the words the legal pages print. One place, so /terms
 * and /trust can never name a different operator, address or governing law.
 *
 * Pure and client-safe. The contact address is lib/support.ts's SUPPORT_EMAIL:
 * the one inbox a human reads, shared with /contact and /help.
 */

/** The legal person behind the service — a sole proprietor for now. */
export const LEGAL_NAME = "Thalha Thabish";

/** How the operator is named in a contract. Becomes a company name if one is formed. */
export const LEGAL_ENTITY = `${LEGAL_NAME}, doing business as ChaptOS`;

/** Where legal notices, arbitration opt-outs and copyright notices go by mail. */
export const POSTAL_ADDRESS = "421 Hudson Ave, Albany, NY 12203";

/** Governing law (terms section 23). */
export const GOVERNING_STATE = "New York";

/** Where a claim that isn't arbitrated is heard (terms section 23). */
export const VENUE = "Albany County, New York";
