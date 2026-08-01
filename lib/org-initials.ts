/**
 * Initials for the no-logo gradient fallback badge shown wherever an org's mark
 * is rendered (sidebar header, settings General section).
 *
 * Up to two words, uppercased. Falls back to "Org" rather than an empty badge
 * for the window before /api/auth/me resolves the org name.
 */
export function orgInitials(name: string | undefined | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Org";
  return words.slice(0, 2).map(w => w[0]!.toUpperCase()).join("");
}
