import Link from "next/link";

/**
 * Shown when a signed-in user navigates to /<slug> while their join request is
 * still pending.
 *
 * The waiting screen on /join/<token> is the one they normally sit on — it polls
 * and walks them in on approval. This is the same wall for the person who
 * bookmarked the org URL, or typed it in, or followed a link a friend sent. It
 * exists so they get told "you're in the queue" instead of the needs-an-invite
 * page, which would read as though their request had vanished.
 *
 * Carries NO org data: not the roster, not the headcount, not the org's name
 * beyond the slug already in their address bar. Nothing has been created for
 * this person in this org yet — no Brother, no Membership — so there is nothing
 * an org-scoped query would even return.
 *
 * Server component. Static by design: there is nothing to poll here, because
 * approval makes /<slug> render the real dashboard on the next load, and the
 * link below is how they get there.
 */
export function AwaitingApproval({ slug }: { slug: string }) {
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
            <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .3.18.57.46.69l3 1.25a.75.75 0 10.58-1.38l-2.54-1.06V5z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-white">
              Waiting for approval
            </h1>
            <p className="text-[13px] leading-relaxed text-white/40">
              Your request to join{" "}
              <span className="font-medium text-white/70">{slug}</span> is with
              their officers. You&rsquo;ll get in as soon as one of them approves
              it — nothing has been shared with you yet.
            </p>
          </header>

          <div className="flex flex-col gap-3">
            <p className="text-center text-[12px] leading-relaxed text-white/30">
              Taking a while? The fastest fix is usually asking whoever sent you
              the invite link.
            </p>
            <Link
              href="/welcome"
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-center text-[13px] font-medium text-white/70 transition-all hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
            >
              Go to your account
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
