import Link from "next/link";
import { APP_NAME } from "@/lib/domains";

/**
 * Shown when a signed-in user navigates to /<slug> while their join request is
 * still pending.
 *
 * The waiting screen on /join/<token> is the one they normally sit on — it polls
 * and walks them in on approval. This is the same wall for the person who
 * bookmarked the org URL, or typed it in, or followed a link a friend sent. It
 * exists so they get told "you're in the queue" instead of the needs-an-invite
 * page, which would read as though their request had vanished. It is styled to
 * match that screen (the .auth-scope "Dark Editorial" system in globals.css),
 * so arriving by either door looks like the same waiting room.
 *
 * Carries NO org data: not the roster, not the headcount, not the org's name
 * beyond the slug already in their address bar. Nothing has been created for
 * this person in this org yet — no Brother, no Membership — so there is nothing
 * an org-scoped query would even return. That's also why there's no org badge
 * here and no live "pending" spinner: unlike /join we have no token to poll, so
 * an animation would imply a heartbeat this page doesn't have.
 *
 * Server component. Static by design: there is nothing to poll here, because
 * approval makes /<slug> render the real dashboard on the next load, and the
 * link below is how they get there.
 */
export function AwaitingApproval({ slug }: { slug: string }) {
  return (
    <div className="auth-scope">
      <div className="auth-page">
        <div className="auth-topbar">
          <div className="auth-wordmark">
            <div className="auth-glyph">C</div>
            <div className="auth-wm-txt">{APP_NAME}</div>
          </div>
          <div className="auth-meta">Pending review</div>
        </div>

        <div className="auth-main">
          <div className="auth-col">
            <div className="auth-index">Request sent</div>
            <h1 className="auth-h1">
              Waiting on <em>{slug}.</em>
            </h1>
            <p className="auth-lede">
              Your request to join is with their officers. You&rsquo;ll get in as
              soon as one of them approves it — nothing has been shared with you
              yet.
            </p>

            <div className="auth-body auth-stack">
              <div className="auth-notice" role="status">
                Pending review — reload this page once an officer approves you and
                you&rsquo;ll land straight on your dashboard.
              </div>

              <p className="auth-footnote">
                Taking a while? The fastest fix is usually asking whoever sent you
                the invite link.
              </p>

              <Link href="/welcome" className="auth-tile">
                <div className="auth-tile-row">
                  <span className="auth-tile-num">←</span>
                  <div>
                    <div className="auth-tile-title">Go to your account</div>
                    <div className="auth-tile-desc">
                      Head back while you wait — your request stays in their
                      queue.
                    </div>
                  </div>
                  <span className="auth-tile-arrow" aria-hidden>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M5 10h10M11 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
