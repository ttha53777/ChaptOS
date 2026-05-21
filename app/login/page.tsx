"use client";

import { createClient } from "@/lib/supabase/client";
import { useOrgLogo } from "@/app/hooks/useOrgLogo";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { logoUrl } = useOrgLogo();

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthError) {
        setError("Sign-in failed. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#07090f]">

      {/* Ambient background glows */}
      <div className="pointer-events-none absolute inset-0">
        {/* Top-center indigo bloom */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-indigo-600/10 blur-[140px]" />
        {/* Bottom-right purple accent */}
        <div className="absolute right-0 bottom-0 h-[400px] w-[500px] rounded-full bg-purple-700/8 blur-[120px]" />
        {/* Top-left subtle warm */}
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

      {/* Card */}
      <div className="relative z-10 w-full max-w-[400px] mx-4">

        {/* Glow ring behind card */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-indigo-500/20 via-indigo-500/5 to-transparent blur-sm" />

        <div
          className="relative rounded-2xl border border-white/[0.08] bg-[#10121a]/90 backdrop-blur-xl px-8 py-10 flex flex-col gap-8"
          style={{ boxShadow: "0 4px 6px rgba(0,0,0,0.4), 0 24px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" }}
        >
          {/* Header */}
          <div className="flex flex-col items-center gap-4">
            {/* Logo mark — same org icon as Settings → Organization Icon / sidebar */}
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-indigo-500/30 blur-md" />
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Chapter logo"
                  className="relative h-14 w-14 rounded-xl object-cover shadow-[0_2px_12px_rgba(99,102,241,0.5)] ring-1 ring-white/10"
                />
              ) : (
                <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-[0_2px_12px_rgba(99,102,241,0.5)]">
                  <span className="text-[15px] font-bold tracking-tight text-white select-none">ΛΦΕ</span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-1 text-center">
              <h1 className="text-[22px] font-semibold tracking-tight text-white leading-tight">
                Lambda Phi Epsilon
              </h1>
              <p className="text-[13px] text-white/40 font-medium">
                at SUNY Albany
              </p>
            </div>
          </div>

          {/* Divider with label */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[11px] font-medium tracking-widest uppercase text-white/25">Members only</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {/* Sign-in section */}
          <div className="flex flex-col gap-4">
            {(urlError || error) && (
              <div className="flex items-center gap-2.5 rounded-lg border border-red-500/20 bg-red-500/8 px-3.5 py-2.5">
                <svg className="w-4 h-4 shrink-0 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                <p className="text-[13px] text-red-400">
                  {error ?? "Sign-in failed. Please try again."}
                </p>
              </div>
            )}

            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="group relative w-full overflow-hidden rounded-xl px-4 py-3 text-[14px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10121a]"
              style={{
                background: loading
                  ? "rgba(99,102,241,0.7)"
                  : "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                boxShadow: loading
                  ? "none"
                  : "0 1px 2px rgba(0,0,0,0.3), 0 4px 16px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
            >
              {/* Hover shimmer */}
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
                    {/* Google G — proper brand colors on white pill */}
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
          </div>

          {/* Footer */}
          <p className="text-center text-[12px] leading-relaxed text-white/20">
            Restricted to active ΛΦΕ chapter members.<br />Contact your president for access issues.
          </p>

          {/* App name */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <div className="h-px w-8 bg-white/[0.06]" />
            <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/20">ChaptOS</span>
            <div className="h-px w-8 bg-white/[0.06]" />
          </div>
        </div>

        {/* Bottom fade label */}
        <p className="mt-6 text-center text-[11px] tracking-wide text-white/15 font-medium">
          ChaptOS · Lambda Phi Epsilon at SUNY Albany
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
