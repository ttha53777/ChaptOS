"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { extractSlug } from "@/lib/slug-extract";

// The /welcome route. Reached after Google sign-in when the authenticated user
// has no linked Brother (i.e. they came in cold, with no ?org= hint that the
// callback could use to send them straight to /pending-access).
//
// Two paths:
//   - JOIN an existing org → user types a slug, we look it up, route to
//     /pending-access?org=<slug> for the existing name-match claim flow.
//   - CREATE a new org     → stubbed in Milestone 2; activates in Milestone 3.
//
// The page does not need to be wrapped in Suspense — it does not read search
// params synchronously like /login does.

export default function WelcomePage() {
  const [mode, setMode] = useState<"choice" | "join">("choice");

  // If the user reaches /welcome but is already linked to an org (e.g. they
  // bookmarked the route or hit it directly while signed in), send them home.
  // /api/auth/me returns 401 when there's no Supabase session — leave those
  // users on /welcome silently; the page is harmless without a session and
  // the Join/Create actions will fail informatively when they try to use them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data?.org) window.location.assign("/");
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
              {mode === "choice" ? "Welcome to ChaptOS" : "Join an organization"}
            </h1>
            <p className="text-[13px] text-white/40">
              {mode === "choice"
                ? "Are you joining an existing organization, or starting a new one?"
                : "Enter the slug or URL your organization shared with you."}
            </p>
          </header>

          {mode === "choice" ? (
            <ChoiceCards onJoin={() => setMode("join")} />
          ) : (
            <JoinForm onCancel={() => setMode("choice")} />
          )}

          <footer className="flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-white/[0.06]" />
            <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/20">ChaptOS</span>
            <div className="h-px w-8 bg-white/[0.06]" />
          </footer>
        </div>
      </div>
    </div>
  );
}

function ChoiceCards({ onJoin }: { onJoin: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={onJoin}
        className="group relative overflow-hidden rounded-xl border border-indigo-400/30 bg-gradient-to-br from-indigo-500/15 to-indigo-600/5 px-5 py-4 text-left transition-all hover:border-indigo-400/50 hover:from-indigo-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold text-white">Join an organization</span>
            <span className="text-[12px] text-white/50 leading-relaxed">
              You're already a member — link your account using your org's slug.
            </span>
          </div>
        </div>
      </button>

      <Link
        href="/welcome/create"
        className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-left transition-all hover:border-white/[0.16] hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70">
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

      <SignOutLink />
    </div>
  );
}

function JoinForm({ onCancel }: { onCancel: () => void }) {
  const [input, setInput]   = useState("");
  const [error, setError]   = useState<string | null>(null);
  const [busy, setBusy]     = useState(false);
  const [found, setFound]   = useState<{ name: string; slug: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    setFound(null);

    const slug = extractSlug(input);
    if (!slug) {
      setError("Enter a slug or URL.");
      setBusy(false);
      return;
    }

    try {
      const res = await fetch(`/api/orgs/lookup?slug=${encodeURIComponent(slug)}`);
      if (res.status === 404) {
        setError("No organization found with that slug. Double-check spelling.");
      } else if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Invalid slug.");
      } else if (!res.ok) {
        setError("Lookup failed. Try again.");
      } else {
        const data = (await res.json()) as { name: string; slug: string };
        setFound(data);
      }
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  function handleContinue() {
    if (!found) return;
    // Hard navigation so any subsequent provider remounts pick up the org hint.
    window.location.assign(`/pending-access?org=${encodeURIComponent(found.slug)}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="slug" className="text-[12px] font-medium text-white/60">
          Organization slug or URL
        </label>
        <input
          id="slug"
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setFound(null);
            setError(null);
          }}
          placeholder="e.g. lpe"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full px-3 py-2.5 rounded-lg bg-zinc-900/80 border border-white/[0.08] text-white text-[14px] placeholder-white/30 focus:outline-none focus:border-indigo-500"
        />

        {error && <p className="text-[12px] text-red-400">{error}</p>}

        {found && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0 text-emerald-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4L9 11.6l6.3-6.3a1 1 0 011.4 0z" clipRule="evenodd" />
            </svg>
            <span className="text-[13px] text-white">
              Found: <span className="font-semibold">{found.name}</span>
            </span>
          </div>
        )}

        {!found ? (
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-medium transition-colors"
          >
            {busy ? "Looking up…" : "Find organization"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleContinue}
            className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[14px] font-medium transition-colors"
          >
            Continue
          </button>
        )}
      </form>

      <div className="flex items-center justify-between">
        <button
          onClick={onCancel}
          className="text-[12px] text-white/40 hover:text-white/70 transition-colors"
        >
          ← Back
        </button>
        <SignOutLink compact />
      </div>
    </div>
  );
}

function SignOutLink({ compact = false }: { compact?: boolean }) {
  async function handle() {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // network failure — still navigate
    }
    window.location.assign("/login");
  }
  return (
    <button
      onClick={handle}
      className={
        compact
          ? "text-[12px] text-white/40 hover:text-white/70 transition-colors"
          : "mt-2 text-[12px] text-white/30 hover:text-white/60 transition-colors text-left"
      }
    >
      Sign out
    </button>
  );
}
