"use client";

import Link from "next/link";
import { useEffect } from "react";
import { APP_NAME } from "@/lib/domains";

// The /welcome route — now a thin fallback.
//
// The Join-an-org flow used to live here, but the org-first login page (/login)
// absorbs it: a user picks their org there, signs in, and /auth/callback routes
// them straight to /pending-access. So this page is only reached in the residual
// case where someone completes OAuth with NO org hint (an old bookmark, a stale
// link, or a direct visit). For them the only sensible action is to create a new
// organization — or sign out and start over from /login.

export default function WelcomePage() {
  // The proxy gates authentication (unauthenticated users are bounced to /login
  // before reaching here), so we only handle the already-onboarded case: a
  // signed-in user who ALREADY has an org and hit /welcome directly gets sent to
  // their dashboard. A signed-in founder with no org yet stays. /api/auth/me
  // returns 401 for that founder (session but no Brother row) — we leave them
  // here, NOT redirect.
  //
  // EXCEPTION: ?new=1 means an already-onboarded user deliberately came here to
  // found ANOTHER org. Skip the redirect-home guard so they stay and can click
  // through to the create form (which carries the same intent forward).
  useEffect(() => {
    const wantsNew = new URLSearchParams(window.location.search).get("new") === "1";
    if (wantsNew) return; // founding another org on purpose — don't redirect home
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data?.org?.slug) window.location.assign(`/${data.org.slug}`);
        }
      } catch {
        // Network failure — leave the user on /welcome.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
              You&rsquo;re signed in, but not part of an organization yet. Start one below — or head back to join an existing chapter.
            </p>

            <div className="auth-body auth-stack-22">
              <Link href="/welcome/create?new=1" className="auth-tile feature">
                <div className="auth-tile-row">
                  <span className="auth-tile-num">＋</span>
                  <div>
                    <div className="auth-tile-title">Create a new organization</div>
                    <div className="auth-tile-desc">
                      Name your org, pick a type, and become its first admin.
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
                Joining an existing chapter? Head back to{" "}
                <Link href="/login" className="auth-link vio">
                  sign in
                </Link>
                .
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
