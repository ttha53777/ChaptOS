"use client";

import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/domains";
import { useCallback, useEffect, useState } from "react";
import type { InviteDeadReason } from "@/lib/auth/invite-lookup";

type Mode = "open" | "claim";
type JoinState = "guest" | "ready" | "already_member" | "existing_account";

interface Account { email: string | null; name: string | null; avatarUrl: string | null }

// Drives the invite flow once the server has resolved the token.
//
// The screen is a function of ONE value — `state`, decided server-side by
// GET /api/auth/invite-status — rather than the old "is there a session?"
// boolean. That boolean couldn't tell an invited stranger from the wrong Google
// account from someone who already belonged to the org, so all three got the
// same "Join <Org>" form, and two of them got a bad outcome from submitting it.
//
//   guest            → Continue with Google (OAuth returns here via ?next=)
//   ready            → confirm the account, name yourself, join
//   already_member   → you're in already; here's the door (no form, no rename)
//   existing_account → claim link + an account that can't be claim-linked;
//                      join by membership instead of dead-ending at 409
export function JoinClient({
  token, valid, reason, orgName, orgLogoUrl, memberCount, mode,
}: {
  token: string;
  valid: boolean;
  reason: InviteDeadReason | null;
  orgName: string | null;
  orgLogoUrl: string | null;
  memberCount: number | null;
  mode: Mode;
}) {
  // null = still checking the session on mount; avoids a flash of the wrong CTA.
  const [state, setState]     = useState<JoinState | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [name, setName]       = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch(`/api/auth/invite-status?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data?.valid) {
          setState(data.state as JoinState);
          setAccount(data.account ?? null);
          setOrgSlug(data.org?.slug ?? null);
          if (data.account?.name) setName(n => n || data.account.name);
          return;
        }
      } catch {
        // Fall through to the session-only path below.
      }
      if (cancelled) return;
      // Pre-flight unavailable (offline, 500). Degrade to what we can still
      // determine locally rather than blocking a legitimate join: a session
      // means "ready", none means "guest". The redeem call re-checks everything
      // server-side anyway, so the worst case is a form we'd have skipped.
      const { data: userData } = await createClient().auth.getUser();
      if (!cancelled) setState(userData.user ? "ready" : "guest");
    })();
    return () => { cancelled = true; };
  }, [token, valid]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Return through the callback so the PKCE code is exchanged, then back to
      // THIS page (token in the path). Pass only next= — never org= (that would
      // divert an unlinked user to /pending-access).
      const next = `/join/${encodeURIComponent(token)}`;
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl },
      });
      if (error) { setError("Sign-in failed. Please try again."); setBusy(false); }
    } catch {
      setError("Sign-in failed. Please try again.");
      setBusy(false);
    }
  }, [token]);

  /** Sign out and come straight back, so the wrong-account case is one click. */
  const switchAccount = useCallback(async () => {
    setBusy(true);
    try { await fetch("/api/auth/signout", { method: "POST" }); }
    catch { /* network failure — reload anyway; the page re-checks on mount */ }
    window.location.assign(`/join/${encodeURIComponent(token)}`);
  }, [token]);

  async function redeem() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/redeem-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(messageFor(res.status, data?.error));
        setBusy(false);
        return;
      }
      // claim mode → hand off to the existing name-match claim form. Only new
      // accounts get here; the server routes existing ones through membership.
      if (data?.mode === "claim") {
        window.location.assign(`/pending-access?org=${encodeURIComponent(data.orgSlug)}`);
        return;
      }
      // Joined. The server set the active_org cookie; ?toast=welcome greets them
      // on arrival instead of dropping them onto a cold dashboard.
      window.location.assign(`/${data.orgSlug}?toast=welcome`);
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      setBusy(false);
    }
  }

  const isClaimHandoff = mode === "claim" && state === "ready";

  return (
    <div className="auth-scope">
      <div className="auth-page">
        <div className="auth-topbar">
          <div className="auth-wordmark">
            <div className="auth-glyph">C</div>
            <div className="auth-wm-txt">{APP_NAME}</div>
          </div>
          <div className="auth-meta">02 / Invite</div>
        </div>

        <div className="auth-main">
          <div className="auth-col">
            {!valid ? (
              <DeadLink reason={reason} orgName={orgName} />
            ) : (
              <>
                <OrgMark name={orgName} logoUrl={orgLogoUrl} />
                <div className="auth-index">
                  {state === "already_member" ? "Already a member" : "You’re invited"}
                </div>
                <h1 className="auth-h1">
                  {state === "already_member"
                    ? <>You&rsquo;re in <em>{orgName}.</em></>
                    : <>Join <em>{orgName}.</em></>}
                </h1>
                <p className="auth-lede">{lede(state, mode, orgName)}</p>
                {memberCount != null && memberCount > 0 && state !== "already_member" && (
                  <p className="auth-orgmeta">
                    {memberCount} {memberCount === 1 ? "member" : "members"} already here
                  </p>
                )}

                <div className="auth-body auth-stack">
                  {error && (
                    <div className="auth-alert" role="alert">
                      <AlertIcon />
                      {error}
                    </div>
                  )}

                  {state === null ? (
                    <div className="auth-btn-skel" aria-hidden />
                  ) : state === "guest" ? (
                    <GoogleButton loading={busy} onClick={signIn} />
                  ) : state === "already_member" ? (
                    <button
                      onClick={() => window.location.assign(`/${orgSlug ?? ""}`)}
                      disabled={!orgSlug}
                      className="auth-btn-vio"
                    >
                      Go to {orgName}
                    </button>
                  ) : (
                    <>
                      {account && <AccountRow account={account} onSwitch={switchAccount} busy={busy} />}

                      {state === "existing_account" && (
                        <div className="auth-notice">
                          You already have a {APP_NAME} account, so we&rsquo;ll add you to{" "}
                          {orgName} directly. If you&rsquo;re on their roster under a different
                          name, an officer can link that entry to your account.
                        </div>
                      )}

                      {!isClaimHandoff && (
                        <div>
                          <label className="auth-label" htmlFor="join-name">Your full name</label>
                          <input
                            id="join-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Jordan Lee"
                            autoFocus
                            className="auth-input"
                          />
                        </div>
                      )}

                      <button
                        onClick={redeem}
                        disabled={busy || (!isClaimHandoff && !name.trim())}
                        className="auth-btn-vio"
                      >
                        {busy ? "Joining…" : isClaimHandoff ? "Continue" : `Join ${orgName}`}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Copy under the headline, per state. */
function lede(state: JoinState | null, mode: Mode, orgName: string | null): string {
  if (state === "already_member") return `You already have access to ${orgName ?? "this org"}.`;
  if (state === "existing_account") return "One step to finish joining.";
  if (state === "ready") {
    return mode === "open"
      ? "Tell us your name to finish joining."
      : "Continue to link your roster profile.";
  }
  return `Sign in with Google to join on ${APP_NAME}.`;
}

/**
 * Dead-link screen. Each reason gets its own copy and its own implied next step
 * — "expired" wants a fresh link, "revoked" means someone decided, "not found"
 * usually means a mangled paste. The flow used to answer all three with one
 * sentence that told the invitee nothing they could act on.
 */
function DeadLink({ reason, orgName }: { reason: InviteDeadReason | null; orgName: string | null }) {
  const org = orgName ? `to ${orgName} ` : "";
  const COPY: Record<InviteDeadReason, { title: string; body: string }> = {
    expired: {
      title: "This invite has expired",
      body: `The link ${org}is past its expiry date. Ask an organizer to send you a fresh one — it only takes them a moment.`,
    },
    revoked: {
      title: "This invite was turned off",
      body: `An organizer switched off this link ${org}. If you think that’s a mistake, ask them for a new one.`,
    },
    exhausted: {
      title: "This invite is full",
      body: `The link ${org}has reached the number of people it was set to admit. Ask an organizer to send you your own.`,
    },
    not_found: {
      title: "This link doesn’t work",
      body: "We couldn’t find an invite for this address. Check that you copied the whole link — they’re long and easy to cut short.",
    },
  };
  const { title, body } = COPY[reason ?? "not_found"];

  return (
    <div className="auth-body" style={{ marginTop: 0 }}>
      <div className="auth-badmark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
        </svg>
      </div>
      <h1 className="auth-h1" style={{ textAlign: "center", fontSize: 24, marginTop: 20 }}>
        {title}
      </h1>
      <p className="auth-lede" style={{ textAlign: "center", margin: "12px auto 0" }}>
        {body}
      </p>
    </div>
  );
}

/** The org's badge, or its initial when it has no logo. */
function OrgMark({ name, logoUrl }: { name: string | null; logoUrl: string | null }) {
  return (
    <div className="auth-orgmark" aria-hidden="true">
      {logoUrl
        ? <img src={logoUrl} alt="" />
        : <span className="mono">{(name ?? "?").trim().charAt(0).toUpperCase()}</span>}
    </div>
  );
}

/** Which Google account is about to join, and a one-click way out of the wrong one. */
function AccountRow({ account, onSwitch, busy }: { account: Account; onSwitch: () => void; busy: boolean }) {
  const label = account.email ?? account.name ?? "your Google account";
  return (
    <div className="auth-account">
      {account.avatarUrl
        ? <img src={account.avatarUrl} alt="" />
        : <span className="avatar-fallback" aria-hidden>{label.charAt(0).toUpperCase()}</span>}
      <span className="who">
        <span className="k">Joining as</span>
        <span className="v" title={label}>{label}</span>
      </span>
      <button onClick={onSwitch} disabled={busy} className="auth-link vio" style={{ flex: "0 0 auto" }}>
        Switch
      </button>
    </div>
  );
}

/**
 * Map a redeem failure to copy the invitee can act on. The server's strings are
 * already user-safe and stay as the fallback, but the common cases get phrasing
 * written for this screen rather than for an API consumer.
 */
function messageFor(status: number, serverError?: string): string {
  if (status === 410) return serverError ?? "This invite link is no longer active.";
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (status === 401) return "Your sign-in expired. Refresh the page and try again.";
  if (status >= 500)  return "Something went wrong on our end. Try again in a moment.";
  return serverError ?? "Couldn’t join. Please try again.";
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
    </svg>
  );
}

function GoogleButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={loading} className="auth-btn" aria-live="polite">
      {loading ? (
        <>
          <span className="auth-spinner" aria-hidden="true" />
          <span>Redirecting to Google&hellip;</span>
        </>
      ) : (
        <>
          <span className="auth-btn-g" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" opacity=".9" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" opacity=".75" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="currentColor" opacity=".85" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          </span>
          <span>Continue with Google</span>
        </>
      )}
    </button>
  );
}
