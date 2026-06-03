"use client";

import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/domains";
import { useEffect, useState } from "react";

type Mode = "open" | "claim";

// Drives the invite flow once the server has resolved the token:
//   signed-out → "Continue with Google" (OAuth returns here via /auth/callback?next=)
//   signed-in  → POST /api/auth/redeem-invite (open mode prompts for a name first),
//                then route to the org (open) or the name-claim form (claim).
export function JoinClient({
  token, valid, orgName, mode,
}: { token: string; valid: boolean; orgName: string | null; mode: Mode }) {
  // null = still checking the session on mount; avoids a flash of the wrong CTA.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [name, setName]         = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient().auth.getUser().then(({ data }) => {
      if (!cancelled) setSignedIn(!!data.user);
    });
    return () => { cancelled = true; };
  }, []);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      // Return through the callback so the PKCE code is exchanged, then back to
      // THIS page (token in the path). Pass only next= — never org= (that would
      // divert an unlinked user to /pending-access).
      const next = `/join/${encodeURIComponent(token)}`;
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl },
      });
      if (error) { setError("Sign-in failed. Please try again."); setBusy(false); }
    } catch {
      setError("Sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  async function redeem() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/redeem-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't join. Please try again.");
        setBusy(false);
        return;
      }
      // claim mode → hand off to the existing name-match claim form.
      if (data?.mode === "claim") {
        window.location.assign(`/pending-access?org=${encodeURIComponent(data.orgSlug)}`);
        return;
      }
      // open mode → land in the org (server set the active_org cookie).
      window.location.assign(`/${data.orgSlug}`);
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-scope">
      <div className="auth-page">
        <div className="auth-topbar">
          <div className="auth-wordmark">
            <div className="auth-glyph">C</div>
            <div className="auth-wm-txt">{APP_NAME}</div>
          </div>
          <div className="auth-meta">02 / Invite</div>
        </div>

        <div className="auth-main">
          <div className="auth-col">
            {!valid ? (
              <div className="auth-body" style={{ marginTop: 0 }}>
                <div className="auth-badmark" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                </div>
                <h1 className="auth-h1" style={{ textAlign: "center", fontSize: 24, marginTop: 20 }}>
                  Invite unavailable
                </h1>
                <p className="auth-lede" style={{ textAlign: "center", margin: "12px auto 0" }}>
                  This invite link is invalid, has expired, or was revoked. Ask an organizer for a fresh link.
                </p>
              </div>
            ) : (
              <>
                <div className="auth-index">You&rsquo;re invited</div>
                <h1 className="auth-h1">
                  Join <em>{orgName}.</em>
                </h1>
                <p className="auth-lede">
                  {signedIn
                    ? mode === "open"
                      ? "Tell us your name to finish joining."
                      : "Continue to link your roster profile."
                    : `Sign in with Google to join on ${APP_NAME}.`}
                </p>

                <div className="auth-body auth-stack">
                  {error && (
                    <div className="auth-alert" role="alert">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                      </svg>
                      {error}
                    </div>
                  )}

                  {signedIn === null ? (
                    <div style={{ height: 50 }} aria-hidden />
                  ) : !signedIn ? (
                    <GoogleButton loading={busy} onClick={signIn} />
                  ) : (
                    <>
                      {mode === "open" && (
                        <div>
                          <label className="auth-label" htmlFor="join-name">Your full name</label>
                          <input
                            id="join-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Jordan Lee"
                            autoFocus
                            className="auth-input"
                          />
                        </div>
                      )}
                      <button
                        onClick={redeem}
                        disabled={busy || (mode === "open" && !name.trim())}
                        className="auth-btn-vio"
                      >
                        {busy ? "Joining…" : mode === "open" ? `Join ${orgName}` : "Continue"}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={loading} className="auth-btn" aria-live="polite">
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
