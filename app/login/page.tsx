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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#07090f]">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-indigo-600/10 blur-[140px]" />
        <div className="absolute right-0 bottom-0 h-[400px] w-[500px] rounded-full bg-purple-700/8 blur-[120px]" />
        <div className="absolute left-0 top-1/3 h-[300px] w-[300px] rounded-full bg-indigo-500/5 blur-[100px]" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative z-10 w-full max-w-[420px] mx-4">
        {/* Glow ring behind card */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-indigo-500/20 via-indigo-500/5 to-transparent blur-sm" />

        <div
          className="relative rounded-2xl border border-white/[0.08] bg-[#10121a]/90 backdrop-blur-xl px-8 py-10 flex flex-col gap-7"
          style={{ boxShadow: "0 4px 6px rgba(0,0,0,0.4), 0 24px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" }}
        >
          {/* Header — platform wordmark */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-indigo-500/30 blur-md" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-[0_2px_12px_rgba(99,102,241,0.5)]">
                <span className="text-[20px] font-bold tracking-tight text-white select-none">C</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <h1 className="text-[22px] font-semibold tracking-tight text-white leading-tight">
                Sign in to {APP_NAME}
              </h1>
              <p className="text-[13px] text-white/40 font-medium">
                Continue with your Google account.
              </p>
            </div>
          </div>

          {showError && (
            <div className="flex items-center gap-2.5 rounded-lg border border-red-500/20 bg-red-500/8 px-3.5 py-2.5">
              <svg className="w-4 h-4 shrink-0 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              <p className="text-[13px] text-red-400">
                {error ?? "Sign-in failed. Please try again."}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-5">
            <GoogleButton loading={signingIn} disabled={signingIn || creating} onClick={handleSignIn} />

            {/* Divider */}
            <div className="h-px w-full bg-white/[0.06]" />

            {/* Create-org card — signs in first, then routes to /welcome/create. */}
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || signingIn}
              className="group relative w-full overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-indigo-400/40 hover:bg-indigo-500/[0.06] disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
                  {creating ? (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  ) : (
                    <svg className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path d="M3 6a2 2 0 012-2h2.5l1 1.5H15a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
                    </svg>
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13.5px] font-semibold text-white">Start a new chapter on {APP_NAME}</span>
                  <span className="text-[12px] text-white/45">
                    {creating ? "Redirecting to Google…" : "Create your organization →"}
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* App name footer */}
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
    <button
      onClick={onClick}
      disabled={disabled}
      className="group relative w-full overflow-hidden rounded-xl px-4 py-3 text-[14px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10121a]"
      style={{
        background: loading
          ? "rgba(99,102,241,0.7)"
          : "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
        boxShadow: loading
          ? "none"
          : "0 1px 2px rgba(0,0,0,0.3), 0 4px 16px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
      }}
    >
      <span className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-500 group-hover:translate-x-[100%]" />
      <span className="relative flex items-center justify-center gap-3 text-white">
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span>Redirecting to Google…</span>
          </>
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
