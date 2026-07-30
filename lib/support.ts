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
 * ── Why there are four of these ──────────────────────────────────────────────
 *
 * `mailto:` is the obvious one and the unreliable one: if the browser has no
 * registered mail handler — the normal state for anyone who reads mail in a
 * Gmail tab, and the default on a fresh machine — clicking it does *nothing*.
 * No error, no navigation, no way for the page to find out. A contact page whose
 * only affordance is a mailto: is a contact page with a dead button.
 *
 * So the webmail composers are first-class here, not fallbacks. They're ordinary
 * https navigations: they always visibly do something, even if that something is
 * a sign-in screen. Every account on this platform is a Google account, which
 * makes Gmail the safe default rather than a guess.
 *
 * All of them encodeURIComponent every part — a subject containing "&" or "#"
 * would otherwise truncate the link, and these bodies are multi-line templates.
 * Newlines survive as %0A, which all four expand.
 *
 * One caveat worth knowing before you lengthen a template: mail *clients* cap
 * mailto: length (Windows has historically truncated past ~2000 characters).
 * The webmail URLs tolerate far more, and copying can't truncate at all — which
 * is why the UI nudges toward those two for a long message.
 */

/**
 * Query builder for all four. Uses encodeURIComponent rather than
 * URLSearchParams *on purpose*: URLSearchParams serialises a space as `+`, which
 * only decodes back to a space in a consumer that does application/x-www-form-
 * urlencoded decoding. Gmail does; `mailto:` (RFC 6068) does not — a `+` there
 * can reach the compose window as a literal plus sign — and Outlook's deeplink
 * behaviour isn't specified anywhere we can rely on. `%20` is unambiguously a
 * space to every one of them, so encode once, the strict way, and stop thinking
 * about it.
 */
function query(parts: Record<string, string>): string {
  return Object.entries(parts)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

/** The unreliable one. Kept because on a configured desktop it's the nicest. */
export function mailto(subject: string, body?: string): string {
  return `mailto:${SUPPORT_EMAIL}?${query(body ? { subject, body } : { subject })}`;
}

/**
 * Gmail's compose deep link. `view=cm` is compose, `fs=1` full-screen, and the
 * subject parameter is `su` (not `subject` — that silently drops).
 *
 * No /u/<n> account index, so Google resolves the default signed-in account
 * rather than us guessing wrong for someone with three of them.
 */
export function gmailCompose(subject: string, body: string): string {
  return `https://mail.google.com/mail/?${query({
    view: "cm",
    fs: "1",
    to: SUPPORT_EMAIL,
    su: subject,
    body,
  })}`;
}

/**
 * Outlook on the web. Microsoft splits personal from work/school across two
 * hosts with different path shapes, and there's no way to detect which the
 * visitor has — so both are offered and labelled.
 *
 * `school` is outlook.office.com (Microsoft 365, which is what a university
 * issues); the default is outlook.live.com (a personal @outlook/@hotmail).
 */
export function outlookCompose(
  subject: string,
  body: string,
  variant: "personal" | "school" = "personal",
): string {
  const q = query({ to: SUPPORT_EMAIL, subject, body });
  return variant === "school"
    ? `https://outlook.office.com/mail/deeplink/compose?${q}`
    : `https://outlook.live.com/mail/0/deeplink/compose?${q}`;
}

/**
 * The whole email as pasteable plain text, for the copy path — the one channel
 * that cannot silently fail, be truncated, or need an account.
 *
 * Includes the To: and Subject: lines because the useful thing to paste is a
 * complete email, not an orphaned body.
 */
export function emailAsText(subject: string, body: string): string {
  return `To: ${SUPPORT_EMAIL}\nSubject: ${subject}\n\n${body}`;
}
