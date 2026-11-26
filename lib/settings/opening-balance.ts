/**
 * Settings → Opening balance: the rules and every sentence, shared by the web
 * section (sections/OpeningBalanceSection.tsx) and the app
 * (mobile/src/settings/OpeningBalance.tsx). Pure: no React, Node or Prisma.
 *
 * The same number Treasury's day one asks for, editable afterwards
 * (PATCH /api/treasury/settings { openingBalance }).
 */

export const toBalanceDraft = (v: number | null) => (v == null ? "" : String(v));

/** null = blank; NaN = not a number; otherwise rounded to cents. */
export function parseBalance(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (cleaned === "") return null;
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
}

export function balanceDirty(parsed: number | null, persisted: number | null, loading: boolean): boolean {
  return !loading && parsed !== persisted && !(parsed === null && persisted === null);
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatUsd = (n: number) => usd.format(n);

export const OPENING_BALANCE_COPY = {
  lede: "What was in the account when you started keeping books here. Every balance, chart and report counts forward from this number, so changing it shifts all of them by the difference. Negative is allowed if you started in the hole.",
  key: "Starting balance",
  notSet: "Not set",
  unit: "$",
  placeholder: "0.00",
  loadingPlaceholder: "…",
  aria: "Opening balance",
  invalid: "Enter what was in the account when you started — $0 is fine.",
  saving: "Saving…",
  set: "Set opening balance",
  save: "Save opening balance",
  undo: "Undo",
  unsaved: "Unsaved",
  saved: (n: number) => `Opening balance set to ${formatUsd(n)}.`,
  loadFailed: "Couldn't load the opening balance.",
  saveFailed: "Couldn't save the opening balance. Try again.",
} as const;
