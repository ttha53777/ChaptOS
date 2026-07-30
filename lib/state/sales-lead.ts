/**
 * Sales leads — the "talk to us" requests billing can't self-serve.
 */

export const SalesLeadKind = {
  /** Org is past the self-serve member ceiling and needs a quote. */
  Quote: "quote",
  /** One person administers several orgs and wants a group plan. */
  MultiOrg: "multi_org",
} as const;

export type SalesLeadKind = (typeof SalesLeadKind)[keyof typeof SalesLeadKind];

export const SALES_LEAD_KINDS: readonly SalesLeadKind[] = Object.values(SalesLeadKind);

export function isSalesLeadKind(value: unknown): value is SalesLeadKind {
  return typeof value === "string" && (SALES_LEAD_KINDS as readonly string[]).includes(value);
}

export const SalesLeadStatus = {
  New: "new",
  Contacted: "contacted",
  Closed: "closed",
} as const;

export type SalesLeadStatus = (typeof SalesLeadStatus)[keyof typeof SalesLeadStatus];

export const SALES_LEAD_STATUSES: readonly SalesLeadStatus[] = Object.values(SalesLeadStatus);

export function isSalesLeadStatus(value: unknown): value is SalesLeadStatus {
  return typeof value === "string" && (SALES_LEAD_STATUSES as readonly string[]).includes(value);
}
