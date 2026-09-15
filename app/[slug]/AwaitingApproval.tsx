import Link from "next/link";
import { APP_NAME } from "@/lib/domains";
import { JoinRequestStatus } from "@/app/components/JoinRequestStatus";

/** Waiting at the org URL uses the same own-account status poll as /join. */
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
              <JoinRequestStatus slug={slug} />

              <p className="auth-footnote">
                Taking a while? The fastest fix is usually asking whoever sent you
                the invite link.
              </p>

              <Link href="/welcome?requests=1" className="auth-tile">
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
