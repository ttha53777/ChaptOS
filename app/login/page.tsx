"use client";

import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/domains";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

// The login page — deliberately minimal.
//
// Auth is "sign in first, resolve org after": we DON'T ask which organization
// before signing in. Google tells us who the user is, and /auth/callback routes
// them from their Brother/Membership rows (their dashboard if linked, the claim
// or create flow if not). The org slug is a post-auth TARGET, never a pre-auth
// gate — so returning members reach their dashboard in one click with zero org
// knowledge.
//
// Deep-link preservation: when the proxy bounces a signed-out user off a
// protected route it forwards the original path as ?next= (and any org context
// as ?org=). We thread both into the OAuth round-trip so the callback can send
// the user back where they were headed.

function LoginContent() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const next     = searchParams.get("next");
  const orgHint  = searchParams.get("org");

  const [signingIn, setSigningIn] = useState(false);
  const [creating, setCreating]   = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleSignIn() {
    setSigningIn(true);
    setError(null);
    const err = await signInWithGoogle({ next, org: orgHint });
    if (err) {
      setError(err);
      setSigningIn(false);
    }
  }

  // "Start a new chapter" — a founder. Sign in first (creating an org needs a
  // session), then the callback routes the user to /welcome/create via
  // intent=create.
  async function handleCreate() {
    setCreating(true);
    setError(null);
    const err = await signInWithGoogle({ intent: "create" });
    if (err) {
      setError(err);
      setCreating(false);
    }
  }

  const showError = urlError || error;

  return (
    <div className="auth-scope">
      <div className="auth-page">
        <div className="auth-topbar">
          <div className="auth-wordmark">
            <div className="auth-glyph">C</div>
            <div className="auth-wm-txt">{APP_NAME}</div>
          </div>
          <div className="auth-meta">01 / Sign in</div>
        </div>

        <div className="auth-main">
          <div className="auth-col">
            <div className="auth-index">Sign in</div>
            <h1 className="auth-h1">
              Welcome to <em>{APP_NAME}.</em>
            </h1>
            <p className="auth-lede">
              Continue with your Google account. We&rsquo;ll take you to your chapter — or help you start one.
            </p>

            <div className="auth-body auth-stack-20">
              {showError && (
                <div className="auth-alert" role="alert">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  {error ?? "Sign-in failed. Please try again."}
                </div>
              )}

              <GoogleButton loading={signingIn} disabled={signingIn || creating} onClick={handleSignIn} />

              <div className="auth-divider">or</div>

              {/* Create-org tile — signs in first, then routes to /welcome/create. */}
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || signingIn}
                className="auth-tile"
              >
                <div className="auth-tile-row">
                  {creating ? (
                    <span className="auth-spinner" aria-hidden />
                  ) : (
                    <span className="auth-tile-num">＋</span>
                  )}
                  <div>
                    <div className="auth-tile-title">Start a new chapter on {APP_NAME}</div>
                    <div className="auth-tile-desc">
                      {creating ? "Redirecting to Google…" : "Create your organization →"}
                    </div>
                  </div>
                  {!creating && (
                    <span className="auth-tile-arrow" aria-hidden>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M5 10h10M11 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Kick off Google OAuth. The callback URL carries forward whatever routing
 * hints we have so /auth/callback can land the user in the right place:
 *   - { next, org }      sign-in: original deep-link path + any org context
 *   - { intent: "create" } new founder → /welcome/create after auth
 * All hints are optional; sign-in works with none of them.
 */
async function signInWithGoogle(
  opts: { next?: string | null; org?: string | null } | { intent: "create" },
): Promise<string | null> {
  try {
    const supabase = createClient();
    const params = new URLSearchParams();
    if ("intent" in opts) {
      params.set("intent", opts.intent);
    } else {
      if (opts.org)  params.set("org", opts.org);
      if (opts.next) params.set("next", opts.next);
    }
    const qs = params.toString();
    const callbackUrl = `${window.location.origin}/auth/callback${qs ? `?${qs}` : ""}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    if (error) return "Sign-in failed. Please try again.";
    return null;
  } catch {
    return "Sign-in failed. Please try again.";
  }
}

/** Shared Google sign-in button. */
function GoogleButton({ loading, disabled, onClick }: { loading: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} className="auth-btn" aria-live="polite">
      {loading ? (
        <>
          <span className="auth-spinner" aria-hidden="true" />
          <span>Redirecting to Google…</span>
        </>
      ) : (
        <>
          <span className="auth-btn-g" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" opacity=".9" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" opacity=".75" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="currentColor" opacity=".85" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          </span>
          <span>Continue with Google</span>
        </>
      )}
    </button>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
