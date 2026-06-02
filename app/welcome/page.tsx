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
  useEffect(() => {
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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#07090f] px-4">
      {/* Ambient background — matches /login. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-indigo-600/10 blur-[140px]" />
        <div className="absolute right-0 bottom-0 h-[400px] w-[500px] rounded-full bg-purple-700/8 blur-[120px]" />
        <div className="absolute left-0 top-1/3 h-[300px] w-[300px] rounded-full bg-indigo-500/5 blur-[100px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative z-10 w-full max-w-[440px]">
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-indigo-500/20 via-indigo-500/5 to-transparent blur-sm" />
        <div
          className="relative rounded-2xl border border-white/[0.08] bg-[#10121a]/90 backdrop-blur-xl px-8 py-10 flex flex-col gap-8"
          style={{
            boxShadow:
              "0 4px 6px rgba(0,0,0,0.4), 0 24px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <header className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-[22px] font-semibold tracking-tight text-white leading-tight">
              Welcome to {APP_NAME}
            </h1>
            <p className="text-[13px] text-white/40">
              You&rsquo;re signed in but not part of an organization yet.
            </p>
          </header>

          <div className="flex flex-col gap-3">
            <Link
              href="/welcome/create"
              className="group relative overflow-hidden rounded-xl border border-indigo-400/30 bg-gradient-to-br from-indigo-500/15 to-indigo-600/5 px-5 py-4 text-left transition-all hover:border-indigo-400/50 hover:from-indigo-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                  </svg>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[14px] font-semibold text-white">
                    Create a new organization
                  </span>
                  <span className="text-[12px] text-white/50 leading-relaxed">
                    Start fresh — name your org, pick a type, and become its first admin.
                  </span>
                </div>
              </div>
            </Link>

            <p className="text-[12px] text-white/40 leading-relaxed">
              Joining an existing chapter? Head back to{" "}
              <Link href="/login" className="text-indigo-300 hover:text-indigo-200 underline underline-offset-2">
                sign in with your org&rsquo;s URL
              </Link>
              .
            </p>

            <SignOutLink />
          </div>

          <footer className="flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-white/[0.06]" />
            <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/20">{APP_NAME}</span>
            <div className="h-px w-8 bg-white/[0.06]" />
          </footer>
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
    <button
      onClick={handle}
      className="mt-1 text-[12px] text-white/30 hover:text-white/60 transition-colors text-left"
    >
      Sign out
    </button>
  );
}
