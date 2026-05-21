/**
 * Coerce a JSON-body value to string for a Prisma update.
 * Returns `undefined` for `null`/`undefined` so the caller skips the key
 * (prevents `String(null) === "null"` from corrupting rows).
 */
export function coerceString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

/**
 * Coerce a JSON-body value to a finite number.
 * Returns `undefined` for `null`/`undefined` (skip the key) and `null`
 * for values that can't be a valid number — caller decides whether to 400.
 */
export function coerceNumber(value: unknown): number | undefined | null {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
