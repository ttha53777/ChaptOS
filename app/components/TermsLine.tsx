/**
 * "By continuing, you agree…" — the line under each sign-in button on the
 * .auth-scope screens (/login, /join/<token>).
 *
 * The person is agreeing for themselves only, so a line beside the button is the
 * right weight; a founder, agreeing for a whole org, gets a checkbox on /create
 * instead. The age line is section 3 of the terms, said out loud. On /join the
 * request it sits above records the acceptance (lib/auth/join-request-submit.ts);
 * on /login an existing member is asked in-app by TermsGate.
 */
import "./terms-line.css";

export function TermsLine() {
  return (
    <p className="auth-footnote auth-terms">
      By continuing, you agree to the{" "}
      <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>{" "}
      and confirm you&rsquo;re 16 or older. See how your data is handled on{" "}
      <a href="/trust" target="_blank" rel="noreferrer">Trust &amp; privacy</a>.
    </p>
  );
}
