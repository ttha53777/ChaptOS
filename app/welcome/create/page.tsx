"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ORG_TYPES } from "@/lib/org-types";
import { suggestSlug } from "@/lib/slug-rules";
import { APP_NAME } from "@/lib/domains";

// /welcome/create — self-serve org creation.
//
// Form fields (decided in the Milestone-3 plan):
//   1. Organization name
//   2. Slug — auto-suggested from name, live-validated against /api/orgs/slug-check
//   3. Org type — radio cards driven by lib/org-types registry
//   4. Your name — sets the founder's Brother.name (separate from Google name
//      so they're not stuck with a legal name they don't use day-to-day)
//
// On submit: POST /api/orgs. The server sets the active_org cookie and returns
// the org's slug (201 created, or 200 when the account was already linked from a
// prior attempt whose response was lost). We hard-navigate to that server-
// returned slug — or to / as a fallback, which server-resolves the active org
// from the cookie — so ChapterContext remounts under the new org.

type SlugState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "bad"; message: string }
  | { kind: "taken"; suggestions: string[] };

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
          setSlugState({ kind: "taken", suggestions: Array.isArray(data.suggestions) ? data.suggestions : [] });
        } else {
          setSlugState({ kind: "bad", message: data.message ?? "Invalid slug." });
        }
      } catch {
        setSlugState({ kind: "idle" });
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [slug]);

  // The proxy gates authentication for this route (unauthenticated users are
  // bounced to /login before they ever reach here), so we only need to handle
  // the already-onboarded case: a signed-in user who ALREADY has an org and hit
  // /welcome/create directly (bookmark, stale link) gets sent to their dashboard.
  // A signed-in founder with no org yet — the intended audience — stays. Note
  // /api/auth/me returns 401 for that founder (session but no Brother row); we
  // simply leave them on the page in that case, NOT redirect.
  //
  // EXCEPTION: ?new=1 means an ALREADY-LINKED user deliberately came to found an
  // ADDITIONAL org (via "Start a new chapter" → OAuth → callback). They have an
  // org, so the guard below would bounce them home — skip it for them. Read from
  // window.location (client-only effect) to avoid a Suspense boundary for
  // useSearchParams.
  useEffect(() => {
    const wantsNew = new URLSearchParams(window.location.search).get("new") === "1";
    if (wantsNew) return; // founding another org on purpose — don't redirect home
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data?.org?.slug) window.location.assign(`/${data.org.slug}`);
        }
      } catch {
        // Network error — leave them on the page; submit will surface any issue.
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
      const data = await res.json().catch(() => ({}));

      // 201 = created. 200 = already-linked recovery (a prior POST committed but
      // lost its response): the server resolved the org we already have and set
      // the active_org cookie, so we route the same way either case.
      if (res.status === 201 || (res.status === 200 && data?.ok)) {
        // Navigate to the SERVER's slug (authoritative — it may have normalized
        // what we sent, and on recovery it's the org we already had, not this
        // form's input). Fall back to root, which server-resolves the active org
        // from the freshly-set cookie.
        const dest = typeof data?.slug === "string" && data.slug ? `/${data.slug}` : "/";
        window.location.assign(dest);
        return;
      }
      setServerError(data?.error ?? "Couldn't create the organization. Try again.");
    } catch {
      setServerError("Couldn't reach the server. Check your connection.");
    } finally {
      setSubmitting(false);
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
          <div className="auth-meta">Create</div>
        </div>

        <div className="auth-main">
          <div className="auth-col wide">
            <div className="auth-index">New organization</div>
            <h1 className="auth-h1">
              Set up your <em>workspace.</em>
            </h1>
            <p className="auth-lede">
              We&rsquo;ll make you the first admin. You can change everything later in Settings.
            </p>

            <form onSubmit={handleSubmit} className="auth-body auth-stack-28">
              {/* Organization name */}
              <Field
                htmlFor="org-name"
                label="Organization name"
                hint="The full name shown in the sidebar and on shared pages."
                input={
                  <input
                    id="org-name"
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g. Lambda Phi Epsilon"
                    className="auth-input"
                  />
                }
              />

              {/* Slug */}
              <Field
                htmlFor="org-slug"
                label="Slug"
                hint="Used in URLs. Lowercase letters, numbers, and single hyphens."
                input={
                  <>
                    <input
                      id="org-slug"
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
                      className="auth-input mono"
                    />
                    <SlugStatus
                      state={slugState}
                      onPickSuggestion={(s) => {
                        // Treat picking a suggestion as a deliberate user choice:
                        // mark slugTouched so the auto-suggest-from-name effect
                        // doesn't immediately overwrite it.
                        setSlugTouched(true);
                        setSlug(s);
                      }}
                    />
                  </>
                }
              />

              {/* Org type */}
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="auth-label" style={{ padding: 0 }}>Organization type</legend>
                <p className="auth-hint">Pick the closest match — it sets which workflows and roles get enabled.</p>
                <div className="auth-radios">
                  {ORG_TYPES.map((t) => (
                    <label key={t.id} className={`auth-radio${t.id === orgType ? " on" : ""}`}>
                      <input
                        type="radio"
                        name="orgType"
                        value={t.id}
                        checked={t.id === orgType}
                        onChange={() => setOrgType(t.id)}
                        className="sr-only"
                      />
                      <span className="auth-dot" aria-hidden />
                      <div>
                        <div className="t">{t.label}</div>
                        <div className="d">{t.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Your name */}
              <Field
                htmlFor="your-name"
                label="Your name"
                hint="Shown to other members. We don't use your Google account name for this."
                input={
                  <input
                    id="your-name"
                    type="text"
                    value={yourName}
                    onChange={(e) => setYourName(e.target.value)}
                    placeholder="e.g. Jordan Lee"
                    className="auth-input"
                  />
                }
              />

              {serverError && (
                <div className="auth-alert" role="alert">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  {serverError}
                </div>
              )}

              <div className="auth-stack">
                <button type="submit" disabled={!canSubmit} className="auth-btn-vio">
                  {submitting ? "Creating…" : `Create ${selectedType.label.toLowerCase()}`}
                </button>
                <Link href="/welcome" className="auth-link bare" style={{ alignSelf: "flex-start" }}>
                  ← Back
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  htmlFor,
  label,
  hint,
  input,
}: {
  htmlFor: string;
  label: string;
  hint: string;
  input: React.ReactNode;
}) {
  return (
    <div>
      <label className="auth-label" htmlFor={htmlFor}>{label}</label>
      <p className="auth-hint">{hint}</p>
      {input}
    </div>
  );
}

function SlugStatus({
  state,
  onPickSuggestion,
}: {
  state: SlugState;
  onPickSuggestion: (slug: string) => void;
}) {
  if (state.kind === "idle") return null;
  if (state.kind === "checking") {
    return <p className="auth-status muted">Checking availability…</p>;
  }
  if (state.kind === "ok") {
    return <p className="auth-status ok">Available ✓</p>;
  }
  if (state.kind === "taken") {
    return (
      <div className="auth-suggest">
        <span className="auth-status err" role="alert" style={{ marginTop: 0, minHeight: "auto" }}>
          Already taken
        </span>
        {state.suggestions.length > 0 && (
          <>
            <span className="auth-footnote">·&nbsp;Try:</span>
            {state.suggestions.map((s) => (
              <button key={s} type="button" onClick={() => onPickSuggestion(s)} className="auth-chip">
                {s}
              </button>
            ))}
          </>
        )}
      </div>
    );
  }
  // "bad"
  return <p className="auth-status err" role="alert">{state.message}</p>;
}
