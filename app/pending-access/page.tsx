"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function PendingAccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const url = orgSlug
      ? `/api/auth/claim?org=${encodeURIComponent(orgSlug)}`
      : "/api/auth/claim";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });

    if (res.ok) {
      // Hard navigation so ChapterProvider remounts and reloads data with the
      // now-linked session. A soft router.push keeps the stale provider mounted,
      // so chapter data wouldn't load until a manual full refresh.
      // Go straight into the org they just claimed into when we know its slug;
      // otherwise let the root redirect resolve their active org.
      window.location.assign(orgSlug ? `/${orgSlug}` : "/");
    } else {
      const data = await res.json();
      setError(data.error ?? "Something went wrong. Try again.");
      setLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // Network failure — still redirect
    }
    router.push(orgSlug ? `/login?org=${encodeURIComponent(orgSlug)}` : "/login");
  }

  return (
    <div className="auth-scope">
      <div className="auth-page">
        <div className="auth-topbar">
          <div className="auth-wordmark">
            <div className="auth-glyph">C</div>
            <div className="auth-wm-txt">ChaptOS</div>
          </div>
          <div className="auth-meta">Link account</div>
        </div>

        <div className="auth-main">
          <div className="auth-col">
            <div className="auth-index">One last step</div>
            <h1 className="auth-h1">
              Link your <em>account.</em>
            </h1>
            <p className="auth-lede">
              Enter your full name exactly as it appears in the chapter roster, and we&rsquo;ll connect you to your record.
            </p>

            <form onSubmit={handleClaim} className="auth-body auth-stack">
              <div>
                <label className="auth-label" htmlFor="full-name">Full name</label>
                <input
                  id="full-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Jordan Lee"
                  required
                  className="auth-input"
                />
              </div>

              {error && (
                <div className="auth-alert" role="alert">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !name.trim()} className="auth-btn-vio">
                {loading ? "Linking…" : "Link account"}
              </button>
            </form>

            <p className="auth-footnote" style={{ marginTop: 22 }}>
              If your name doesn&rsquo;t match or you share a name with another member, contact an officer to be linked manually.
            </p>

            <button onClick={handleSignOut} className="auth-link bare" style={{ marginTop: 14, alignSelf: "flex-start" }}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PendingAccessPage() {
  return (
    <Suspense>
      <PendingAccessContent />
    </Suspense>
  );
}
