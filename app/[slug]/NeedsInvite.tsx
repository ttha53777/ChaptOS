import Link from "next/link";
import { APP_NAME } from "@/lib/domains";

/**
 * Shown when a signed-in user lands on /<slug> and has no business there yet.
 *
 * This replaces AccessDenied, which offered a "Request access to <slug>" button
 * that requested nothing: it linked to /pending-access, a name-match form that
 * let anyone matching an officer-typed roster row straight in with no review.
 * Both that form and the rows it matched against are gone, so the honest answer
 * is now the only one — you need a link, and a person has to give it to you.
 *
 * Reaching this page does NOT confirm the slug names a real org: a real org the
 * viewer isn't in and a slug that doesn't exist render exactly the same thing,
 * which is the non-enumerability property the old page documented and kept.
 * That is also why there's no org badge or name here the way /join has one — we
 * hold nothing but the slug already in the viewer's address bar, so it's set as
 * a mono token rather than dressed up as an identity we can't vouch for.
 *
 * Styled in the pre-auth "Dark Editorial" scope (app/globals.css .auth-scope),
 * the same one /login, /welcome and /join/<token> use — this is the tail of that
 * flow, and it used to be the one screen in it wearing a different skin.
 *
 * Server component — pure links, no interactivity.
 */
export function NeedsInvite({
  slug,
  homeSlug,
}: {
  slug: string;
  homeSlug: string | null;
}) {
  return (
    <div className="auth-scope">
      <div className="auth-page">
        <div className="auth-topbar">
          <div className="auth-wordmark">
            <div className="auth-glyph">C</div>
            <div className="auth-wm-txt">{APP_NAME}</div>
          </div>
          <div className="auth-meta">Invite required</div>
        </div>

        <div className="auth-main">
          <div className="auth-col">
            <div className="auth-index">No access</div>
            <h1 className="auth-h1">
              You need an <em>invite.</em>
            </h1>
            <p className="auth-lede">
              You&rsquo;re signed in, but you&rsquo;re not a member of{" "}
              <span className="auth-slug">{slug}</span>. Joining starts with an
              invite link from one of their officers — ask whoever runs the group
              to send you one.
            </p>

            <div className="auth-body auth-stack">
              <p className="auth-footnote">
                Already opened a link? Open it again to pick up where you left
                off — asking to join is a request an officer reviews, not
                something this page can do for you.
              </p>

              {homeSlug ? (
                <Link href={`/${homeSlug}`} className="auth-tile">
                  <div className="auth-tile-row">
                    <span className="auth-tile-num">←</span>
                    <div>
                      <div className="auth-tile-title">
                        Back to your organization
                      </div>
                      <div className="auth-tile-desc">
                        Return to <span className="auth-slug">{homeSlug}</span>,
                        where you&rsquo;re already a member.
                      </div>
                    </div>
                    <span className="auth-tile-arrow" aria-hidden>
                      <Arrow />
                    </span>
                  </div>
                </Link>
              ) : (
                <Link href="/welcome" className="auth-tile">
                  <div className="auth-tile-row">
                    <span className="auth-tile-num">←</span>
                    <div>
                      <div className="auth-tile-title">Go to your account</div>
                      <div className="auth-tile-desc">
                        Start an organization of your own, or sign in as someone
                        else.
                      </div>
                    </div>
                    <span className="auth-tile-arrow" aria-hidden>
                      <Arrow />
                    </span>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 10h10M11 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
