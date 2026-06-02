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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#07090f] px-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-indigo-600/10 blur-[140px]" />
        <div className="absolute right-0 bottom-0 h-[400px] w-[500px] rounded-full bg-purple-700/8 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-indigo-500/20 via-indigo-500/5 to-transparent blur-sm" />
        <div
          className="relative rounded-2xl border border-white/[0.08] bg-[#10121a]/90 backdrop-blur-xl px-8 py-10 flex flex-col gap-7"
          style={{ boxShadow: "0 4px 6px rgba(0,0,0,0.4), 0 24px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" }}
        >
          {!valid ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="text-[20px] font-semibold text-white">Invite unavailable</h1>
              <p className="text-[13px] text-white/45">
                This invite link is invalid, has expired, or was revoked. Ask an
                organizer for a fresh link.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-[22px] font-semibold tracking-tight text-white leading-tight">
                  Join {orgName}
                </h1>
                <p className="text-[13px] text-white/40">
                  {signedIn
                    ? mode === "open"
                      ? "Tell us your name to finish joining."
                      : "Continue to link your roster profile."
                    : `Sign in with Google to join on ${APP_NAME}.`}
                </p>
              </div>

              {error && <p className="text-[12px] text-red-400 text-center">{error}</p>}

              {signedIn === null ? (
                <div className="h-[44px]" aria-hidden />
              ) : !signedIn ? (
                <GoogleButton loading={busy} onClick={signIn} />
              ) : (
                <div className="flex flex-col gap-3">
                  {mode === "open" && (
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                      autoFocus
                      className="w-full px-3 py-2.5 rounded-lg bg-zinc-900/80 border border-white/[0.08] text-white text-[14px] placeholder-white/30 focus:outline-none focus:border-indigo-500"
                    />
                  )}
                  <button
                    onClick={redeem}
                    disabled={busy || (mode === "open" && !name.trim())}
                    className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-medium transition-colors"
                  >
                    {busy ? "Joining…" : mode === "open" ? `Join ${orgName}` : "Continue"}
                  </button>
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-center gap-2 pt-1">
            <div className="h-px w-8 bg-white/[0.06]" />
            <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/20">{APP_NAME}</span>
            <div className="h-px w-8 bg-white/[0.06]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="group relative w-full overflow-hidden rounded-xl px-4 py-3 text-[14px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      style={{
        background: loading ? "rgba(99,102,241,0.7)" : "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
        boxShadow: loading ? "none" : "0 1px 2px rgba(0,0,0,0.3), 0 4px 16px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
      }}
    >
      <span className="relative flex items-center justify-center gap-3 text-white">
        {loading ? (
          <span>Redirecting to Google…</span>
        ) : (
          <>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white">
              <svg className="h-3 w-3" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </span>
            <span>Continue with Google</span>
          </>
        )}
      </span>
    </button>
  );
}
