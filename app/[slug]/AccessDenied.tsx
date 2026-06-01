import Link from "next/link";

/**
 * Shown when a signed-in user lands on /<slug> for an org that exists but they
 * are not a member of. Offers the claim flow (request access) and a way back to
 * their own org. Server component — pure links, no interactivity.
 *
 * Note: reaching this page confirms the slug names a real org. That's an
 * acceptable disclosure — it leaks no org data (name, roster, anything), only
 * that the typed string is a registered slug. Nonexistent slugs never reach
 * here; the layout redirects them away before render.
 */
export function AccessDenied({
  slug,
  homeSlug,
}: {
  slug: string;
  homeSlug: string | null;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07090f] px-4">
      {/* Ambient background — matches /login and /welcome. */}
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
          className="relative flex flex-col gap-8 rounded-2xl border border-white/[0.08] bg-[#10121a]/90 px-8 py-10 backdrop-blur-xl"
          style={{
            boxShadow:
              "0 4px 6px rgba(0,0,0,0.4), 0 24px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <header className="flex flex-col items-center gap-2 text-center">
            <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-white">
              You don&rsquo;t have access
            </h1>
            <p className="text-[13px] leading-relaxed text-white/40">
              You&rsquo;re signed in, but you&rsquo;re not a member of{" "}
              <span className="font-medium text-white/70">{slug}</span>. If this is
              your chapter, you can request access by linking your account.
            </p>
          </header>

          <div className="flex flex-col gap-3">
            <Link
              href={`/pending-access?org=${encodeURIComponent(slug)}`}
              className="group relative overflow-hidden rounded-xl border border-indigo-400/30 bg-gradient-to-br from-indigo-500/15 to-indigo-600/5 px-5 py-4 text-left transition-all hover:border-indigo-400/50 hover:from-indigo-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <span className="block text-[14px] font-semibold text-white">
                Request access to {slug}
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-white/50">
                Match your name to a roster entry to join this chapter.
              </span>
            </Link>

            {homeSlug ? (
              <Link
                href={`/${homeSlug}`}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-center text-[13px] font-medium text-white/70 transition-all hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
              >
                Back to your organization
              </Link>
            ) : (
              <Link
                href="/welcome"
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-center text-[13px] font-medium text-white/70 transition-all hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
              >
                Go to your account
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
