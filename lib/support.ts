/**
 * Where a human reads.
 *
 * Single source of truth for the public contact address, so /contact, the help
 * centre's escalation card and the marketing footer can never drift apart — and
 * so moving off a personal inbox onto a real support alias is a one-line change
 * plus an env var, not a grep.
 *
 * Override with NEXT_PUBLIC_SUPPORT_EMAIL. It's NEXT_PUBLIC_ because the contact
 * page's client-side reason picker builds mailto: links in the browser from the
 * same constant the server renders.
 *
 * Deliberately NOT in lib/domains.ts: that module is about host resolution, and
 * an inbox is not a host.
 */
export const SUPPORT_EMAIL =
  (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim() || "thalhat.011@gmail.com";

/**
 * Build a mailto: URL with a pre-filled subject and body.
 *
 * Both parts are encodeURIComponent'd — a subject containing "&" or "#" would
 * otherwise truncate the link, and the bodies here are multi-line templates.
 * Newlines survive as %0A, which every mail client expands.
 */
export function mailto(subject: string, body?: string): string {
  const params = [`subject=${encodeURIComponent(subject)}`];
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${SUPPORT_EMAIL}?${params.join("&")}`;
}
