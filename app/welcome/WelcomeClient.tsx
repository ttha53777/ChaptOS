"use client";

import Link from "next/link";
import { APP_NAME } from "@/lib/domains";
import { OwnJoinRequests } from "@/app/components/OwnJoinRequests";

// This page is already authenticated; signing in again with the same account
// cannot create membership. Show the verified email and the invitation path.
export default function WelcomeClient({ email }: { email: string | null }) {
  return (
    <div className="auth-scope">
      <div className="auth-page">
        <div className="auth-topbar">
          <div className="auth-wordmark">
            <div className="auth-glyph">C</div>
            <div className="auth-wm-txt">{APP_NAME}</div>
          </div>
          <div className="auth-meta">Welcome</div>
        </div>

        <div className="auth-main">
          <div className="auth-col">
            <div className="auth-index">Almost there</div>
            <h1 className="auth-h1">
              Welcome to <em>{APP_NAME}.</em>
            </h1>
            <p className="auth-lede">
              You&rsquo;re signed in{email ? <> as <strong>{email}</strong></> : null}.
              Joining an existing organization? Ask an officer for an invite link,
              open it with this account, and wait for approval.
            </p>

            <div className="auth-body auth-stack-22">
              <OwnJoinRequests />
              <Link href="/create" className="auth-tile feature">
                <div className="auth-tile-row">
                  <span className="auth-tile-num">＋</span>
                  <div>
                    <div className="auth-tile-title">Create a new organization</div>
                    <div className="auth-tile-desc">
                      A quick interview builds your blueprint — you review every line before it&rsquo;s created.
                    </div>
                  </div>
                  <span className="auth-tile-arrow" aria-hidden>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M5 10h10M11 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
              </Link>

              <p className="auth-footnote">
                Already a member? Check that the email above matches the Google account
                you joined with. If it doesn&rsquo;t, sign out and choose that account.
              </p>

              <SignOutLink />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignOutLink() {
  async function handle() {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // network failure — still navigate
    }
    // Clear the remembered org so the next /login visit starts clean.
    try {
      localStorage.removeItem("chaptos_last_org");
    } catch {
      // storage unavailable — nothing to clear
    }
    window.location.assign("/login");
  }
  return (
    <button onClick={handle} className="auth-link bare" style={{ alignSelf: "flex-start" }}>
      Sign out
    </button>
  );
}
