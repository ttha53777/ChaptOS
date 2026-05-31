"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ORG_TYPES } from "@/lib/org-types";
import { suggestSlug } from "@/lib/slug-rules";

// /welcome/create — self-serve org creation.
//
// Form fields (decided in the Milestone-3 plan):
//   1. Organization name
//   2. Slug — auto-suggested from name, live-validated against /api/orgs/slug-check
//   3. Org type — radio cards driven by lib/org-types registry
//   4. Your name — sets the founder's Brother.name (separate from Google name
//      so they're not stuck with a legal name they don't use day-to-day)
//
// On submit: POST /api/orgs. On 201 the server sets the active_org cookie;
// we hard-navigate to / so ChapterContext picks up the new org.

type SlugState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "bad"; message: string }
  | { kind: "taken" };

export default function CreateOrgPage() {
  const [orgName, setOrgName]   = useState("");
  const [slug, setSlug]         = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [orgType, setOrgType]   = useState<string>(ORG_TYPES[0]!.id);
  const [yourName, setYourName] = useState("");

  const [slugState, setSlugState] = useState<SlugState>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Auto-suggest slug from name until the user types in the slug field directly.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(suggestSlug(orgName));
  }, [orgName, slugTouched]);

  // Debounced live slug check.
  useEffect(() => {
    if (!slug) {
      setSlugState({ kind: "idle" });
      return;
    }
    setSlugState({ kind: "checking" });
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orgs/slug-check?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          // 429 or 500 — surface a soft "try again" but don't block the form.
          setSlugState({ kind: "idle" });
          return;
        }
        const data = await res.json();
        if (data.ok) {
          setSlugState({ kind: "ok" });
        } else if (data.reason === "taken") {
          setSlugState({ kind: "taken" });
        } else {
          setSlugState({ kind: "bad", message: data.message ?? "Invalid slug." });
        }
      } catch {
        setSlugState({ kind: "idle" });
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [slug]);

  // If the user already has an org, bounce them home — same guard as /welcome.
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
        // Leave them on the page.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedType = useMemo(
    () => ORG_TYPES.find(t => t.id === orgType) ?? ORG_TYPES[0]!,
    [orgType],
  );

  const canSubmit =
    orgName.trim().length > 0 &&
    yourName.trim().length > 0 &&
    slugState.kind === "ok" &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError(null);

    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        orgName.trim(),
          slug:        slug.trim(),
          orgType,
          founderName: yourName.trim(),
        }),
      });
      if (res.status === 201) {
        // Hard navigation so ChapterContext remounts under the new org cookie.
        window.location.assign("/");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setServerError(data?.error ?? "Couldn't create the organization. Try again.");
    } catch {
      setServerError("Couldn't reach the server. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#07090f] px-4 py-10">
      {/* Ambient — matches /welcome and /login. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-indigo-600/10 blur-[140px]" />
        <div className="absolute right-0 bottom-0 h-[400px] w-[500px] rounded-full bg-purple-700/8 blur-[120px]" />
        <div className="absolute left-0 top-1/3 h-[300px] w-[300px] rounded-full bg-indigo-500/5 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-[520px]">
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-indigo-500/20 via-indigo-500/5 to-transparent blur-sm" />
        <div
          className="relative rounded-2xl border border-white/[0.08] bg-[#10121a]/90 backdrop-blur-xl px-8 py-10 flex flex-col gap-7"
          style={{
            boxShadow:
              "0 4px 6px rgba(0,0,0,0.4), 0 24px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <header className="flex flex-col gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight text-white">Create your organization</h1>
            <p className="text-[13px] text-white/40">
              We'll set up the workspace and make you the first admin. You can change everything later in Settings.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Organization name */}
            <Field
              label="Organization name"
              hint="The full name shown in the sidebar and on shared pages."
              input={
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Lambda Phi Epsilon"
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-900/80 border border-white/[0.08] text-white text-[14px] placeholder-white/30 focus:outline-none focus:border-indigo-500"
                />
              }
            />

            {/* Slug */}
            <Field
              label="Slug"
              hint="Used in URLs. Lowercase letters, numbers, and single hyphens."
              input={
                <>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(e.target.value);
                    }}
                    placeholder="e.g. lpe"
                    autoCapitalize="off"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full px-3 py-2.5 rounded-lg bg-zinc-900/80 border border-white/[0.08] text-white text-[14px] placeholder-white/30 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <SlugStatus state={slugState} />
                </>
              }
            />

            {/* Org type */}
            <Field
              label="Organization type"
              hint="Pick the closest match — it sets which workflows and roles get enabled."
              input={
                <div className="flex flex-col gap-2">
                  {ORG_TYPES.map((t) => (
                    <label
                      key={t.id}
                      className={[
                        "flex items-start gap-3 cursor-pointer rounded-xl border px-4 py-3 transition-all",
                        t.id === orgType
                          ? "border-indigo-400/40 bg-indigo-500/10"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="orgType"
                        value={t.id}
                        checked={t.id === orgType}
                        onChange={() => setOrgType(t.id)}
                        className="mt-1 accent-indigo-500"
                      />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-semibold text-white">{t.label}</span>
                        <span className="text-[12px] text-white/50 leading-snug">{t.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              }
            />

            {/* Your name */}
            <Field
              label="Your name"
              hint="Shown to other members. We don't use your Google account name for this."
              input={
                <input
                  type="text"
                  value={yourName}
                  onChange={(e) => setYourName(e.target.value)}
                  placeholder="e.g. Jordan Lee"
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-900/80 border border-white/[0.08] text-white text-[14px] placeholder-white/30 focus:outline-none focus:border-indigo-500"
                />
              }
            />

            {serverError && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-[12px] text-red-400">
                {serverError}
              </p>
            )}

            <div className="flex flex-col gap-3 mt-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-medium transition-colors"
              >
                {submitting ? "Creating…" : `Create ${selectedType.label.toLowerCase()}`}
              </button>
              <Link
                href="/welcome"
                className="self-start text-[12px] text-white/40 hover:text-white/70 transition-colors"
              >
                ← Back
              </Link>
            </div>
          </form>

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

function Field({
  label,
  hint,
  input,
}: {
  label: string;
  hint: string;
  input: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-white/70">{label}</span>
      <span className="text-[11px] text-white/40 -mt-0.5">{hint}</span>
      <div className="mt-1.5 flex flex-col gap-1.5">{input}</div>
    </div>
  );
}

function SlugStatus({ state }: { state: SlugState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "checking") {
    return <span className="text-[11px] text-white/40">Checking availability…</span>;
  }
  if (state.kind === "ok") {
    return <span className="text-[11px] text-emerald-400">Available ✓</span>;
  }
  if (state.kind === "taken") {
    return <span className="text-[11px] text-red-400">Already taken</span>;
  }
  // "bad"
  return <span className="text-[11px] text-red-400">{state.message}</span>;
}
