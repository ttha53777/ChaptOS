"use client";

import { createClient } from "@/lib/supabase/client";
import { extractSlug } from "@/lib/slug-extract";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";

// The org-first login page.
//
// Instead of being branded to a single chapter, this page asks "which
// organization?" first, then hands off to Google OAuth with the slug threaded
// through ?org= so /auth/callback can route the user to the right place.
//
// Two visual states:
//   A — Returning user: we remembered their last org in localStorage. Show it
//       as a card with an immediate "Continue with Google" button. No re-entry.
//   B — First visit / "different org": slug input with live lookup. The Google
//       button stays disabled until a real org is confirmed.
//
// A ?org= query param (e.g. a link a friend shared) seeds State B with the slug
// pre-filled and pre-validated, so shared links still work end to end.

const LAST_ORG_KEY = "chaptos_last_org";

type RememberedOrg = { slug: string; name: string };

function readLastOrg(): RememberedOrg | null {
  try {
    const raw = localStorage.getItem(LAST_ORG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedOrg>;
    if (typeof parsed?.slug === "string" && typeof parsed?.name === "string") {
      return { slug: parsed.slug, name: parsed.name };
    }
  } catch {
    // Corrupt / unavailable storage — fall through to State B.
  }
  return null;
}

function LoginContent() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const orgHint  = searchParams.get("org");

  // null = not yet resolved on the client (avoids a flash before localStorage
  // is read). Once resolved it's either a RememberedOrg (State A) or false
  // (State B).
  const [remembered, setRemembered] = useState<RememberedOrg | null | false>(null);

  // On mount, decide State A vs B. A ?org= hint always forces State B with the
  // slug pre-filled so shared links don't get hijacked by a stale localStorage
  // entry for a different org.
  //
  // For a remembered org we REVALIDATE against /api/orgs/lookup before showing
  // the one-click card: the org may have been renamed or deleted since we cached
  // it, and trusting a stale slug would OAuth the user into a dead
  // /pending-access. While the check is in flight `remembered` stays null (the
  // placeholder shows). On a network error we trust the cache rather than lock
  // the user out over a blip.
  useEffect(() => {
    let cancelled = false;
    if (orgHint) {
      setRemembered(false);
      return;
    }
    const cached = readLastOrg();
    if (!cached) {
      setRemembered(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/orgs/lookup?slug=${encodeURIComponent(cached.slug)}`);
        if (cancelled) return;
        if (res.ok) {
          // Refresh the name in case it changed; re-persist for next time.
          const data = (await res.json()) as RememberedOrg;
          try { localStorage.setItem(LAST_ORG_KEY, JSON.stringify(data)); } catch { /* ignore */ }
          setRemembered(data);
        } else if (res.status === 404 || res.status === 400) {
          // Org gone or slug no longer valid — drop the stale entry, show picker.
          try { localStorage.removeItem(LAST_ORG_KEY); } catch { /* ignore */ }
          setRemembered(false);
        } else {
          // Server hiccup (5xx/429) — fall back to the cached value.
          setRemembered(cached);
        }
      } catch {
        if (!cancelled) setRemembered(cached); // network error — trust the cache
      }
    })();
    return () => { cancelled = true; };
  }, [orgHint]);

  // Still resolving localStorage — render nothing visible to avoid a flash of
  // the wrong state. The ambient background still shows.
  const showStateA = remembered !== null && remembered !== false;

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
          {/* Header — platform wordmark, not org-specific */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-indigo-500/30 blur-md" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-[0_2px_12px_rgba(99,102,241,0.5)]">
                <span className="text-[20px] font-bold tracking-tight text-white select-none">C</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <h1 className="text-[22px] font-semibold tracking-tight text-white leading-tight">
                {showStateA ? "Welcome back" : "Sign in to your chapter"}
              </h1>
              <p className="text-[13px] text-white/40 font-medium">
                {showStateA
                  ? "Pick up where you left off."
                  : "Enter your organization to continue."}
              </p>
            </div>
          </div>

          {(urlError) && (
            <div className="flex items-center gap-2.5 rounded-lg border border-red-500/20 bg-red-500/8 px-3.5 py-2.5">
              <svg className="w-4 h-4 shrink-0 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              <p className="text-[13px] text-red-400">Sign-in failed. Please try again.</p>
            </div>
          )}

          {remembered === null ? (
            // Resolving localStorage — placeholder keeps layout from jumping.
            <div className="h-[120px]" aria-hidden />
          ) : showStateA ? (
            <ReturningOrg
              org={remembered as RememberedOrg}
              onSwitch={() => setRemembered(false)}
            />
          ) : (
            <OrgPicker initialSlug={orgHint ?? ""} />
          )}

          {/* App name footer */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <div className="h-px w-8 bg-white/[0.06]" />
            <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/20">ChaptOS</span>
            <div className="h-px w-8 bg-white/[0.06]" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Kick off Google OAuth, threading the org slug through the round-trip. */
async function signInWithGoogle(slug: string): Promise<string | null> {
  try {
    const supabase = createClient();
    const callbackUrl = `${window.location.origin}/auth/callback?org=${encodeURIComponent(slug)}`;
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

/** State A — a remembered org, one click from sign-in. */
function ReturningOrg({ org, onSwitch }: { org: RememberedOrg; onSwitch: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handle() {
    setLoading(true);
    setError(null);
    const err = await signInWithGoogle(org.slug);
    if (err) {
      setError(err);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Org card */}
      <div className="rounded-xl border border-indigo-400/25 bg-gradient-to-br from-indigo-500/10 to-indigo-600/[0.03] px-4 py-3.5">
        <p className="text-[14px] font-semibold text-white leading-tight">{org.name}</p>
        <p className="text-[12px] text-white/40 mt-0.5">{org.slug}.chaptos.io</p>
      </div>

      {error && <p className="text-[12px] text-red-400">{error}</p>}

      <GoogleButton loading={loading} disabled={false} onClick={handle} />

      <button
        onClick={onSwitch}
        className="text-center text-[12px] text-white/40 hover:text-white/70 transition-colors"
      >
        Not your org? Sign in to a different one →
      </button>
    </div>
  );
}

/** State B — slug input with live lookup, then sign-in + a create-org card. */
function OrgPicker({ initialSlug }: { initialSlug: string }) {
  const [input, setInput]     = useState(initialSlug);
  const [found, setFound]     = useState<RememberedOrg | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading]   = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef    = useRef(0);

  // Debounced lookup. Runs whenever the input changes; the latest request wins
  // (reqId guard) so out-of-order responses can't clobber a newer result.
  useEffect(() => {
    setFound(null);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const slug = extractSlug(input);
    if (!slug) {
      setChecking(false);
      return;
    }

    setChecking(true);
    const myReqId = ++reqIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orgs/lookup?slug=${encodeURIComponent(slug)}`);
        if (myReqId !== reqIdRef.current) return; // a newer keystroke superseded us
        if (res.status === 404) {
          setError("No organization found with that URL.");
        } else if (res.status === 400) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Invalid organization URL.");
        } else if (!res.ok) {
          setError("Lookup failed. Try again.");
        } else {
          const data = (await res.json()) as RememberedOrg;
          setFound(data);
        }
      } catch {
        if (myReqId === reqIdRef.current) setError("Couldn't reach the server.");
      } finally {
        if (myReqId === reqIdRef.current) setChecking(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input]);

  async function handleContinue() {
    if (!found) return;
    setLoading(true);
    setError(null);
    const err = await signInWithGoogle(found.slug);
    if (err) {
      setError(err);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <label htmlFor="org-slug" className="text-[12px] font-medium text-white/60">
          Your organization&rsquo;s URL
        </label>
        <div className="flex items-stretch rounded-lg border border-white/[0.08] bg-zinc-900/80 focus-within:border-indigo-500 overflow-hidden">
          <input
            id="org-slug"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="your-chapter"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-white text-[14px] placeholder-white/30 focus:outline-none"
          />
          <span className="flex items-center px-3 text-[13px] text-white/30 border-l border-white/[0.06] select-none">
            .chaptos.io
          </span>
        </div>

        {/* Status line — checking / found / error */}
        <div className="min-h-[18px]">
          {checking && (
            <p className="text-[12px] text-white/40">Checking…</p>
          )}
          {!checking && found && (
            <p className="flex items-center gap-1.5 text-[12px] text-emerald-400">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4L9 11.6l6.3-6.3a1 1 0 011.4 0z" clipRule="evenodd" />
              </svg>
              <span className="text-white/80">{found.name}</span>
            </p>
          )}
          {!checking && error && (
            <p className="text-[12px] text-red-400">{error}</p>
          )}
        </div>

        <GoogleButton
          loading={loading}
          disabled={!found || loading}
          onClick={handleContinue}
        />
      </div>

      {/* Divider */}
      <div className="h-px w-full bg-white/[0.06]" />

      {/* Create-org card — prominent, equal weight to sign-in. */}
      <Link
        href="/welcome/create"
        className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5 transition-all hover:border-indigo-400/40 hover:bg-indigo-500/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
            <svg className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M3 6a2 2 0 012-2h2.5l1 1.5H15a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
            </svg>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[13.5px] font-semibold text-white">Start a new chapter on ChaptOS</span>
            <span className="text-[12px] text-white/45">Create your organization →</span>
          </div>
        </div>
      </Link>
    </div>
  );
}

/** Shared Google sign-in button — same styling as before. */
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
