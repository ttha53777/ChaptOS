"use client";

import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/domains";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InviteDeadReason } from "@/lib/auth/invite-lookup";

type JoinState = "guest" | "ready" | "pending" | "rejected" | "already_member";

interface Account { email: string | null; name: string | null; avatarUrl: string | null }

/** How often the waiting screen re-asks whether an officer has decided. */
const POLL_MS = 10_000;

// Drives the invite flow once the server has resolved the token.
//
// The screen is a function of ONE value — `state`, decided server-side by
// GET /api/auth/invite-status — rather than a client-side "is there a session?"
// boolean. That boolean couldn't tell an invited stranger from the wrong Google
// account from someone who already belonged, so all of them got the same form,
// and most of them got a bad outcome from submitting it.
//
//   guest          → Continue with Google (OAuth returns here via ?next=)
//   ready          → confirm the account, name yourself, ask to join
//   pending        → the locked waiting screen; polls until an officer decides
//   rejected       → declined; needs a fresh link from an officer to ask again
//   already_member → you're in; here's the door (no form, no rename)
//
// Holding this link is not access. Submitting files a request that an officer
// approves or rejects — nothing is created in the org until they do.
export function JoinClient({
  token, valid, reason, orgName, orgLogoUrl, memberCount,
}: {
  token: string;
  valid: boolean;
  reason: InviteDeadReason | null;
  orgName: string | null;
  orgLogoUrl: string | null;
  memberCount: number | null;
}) {
  // null = still checking the session on mount; avoids a flash of the wrong CTA.
  const [state, setState]     = useState<JoinState | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [name, setName]       = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  // Starts from the server's verdict and can be overruled by invite-status —
  // see the note in page.tsx. A dead link must not hide a live decision.
  const [dead, setDead]       = useState<{ reason: InviteDeadReason | null } | null>(
    valid ? null : { reason },
  );

  /**
   * Ask the server where this viewer stands. Returns true when the answer was
   * conclusive, so the poll below knows whether to keep going.
   *
   * Runs even when the server called the link dead: someone waiting on an
   * officer, or already declined, still gets their real state back.
   */
  const refresh = useCallback(async (): Promise<JoinState | null> => {
    try {
      const res  = await fetch(`/api/auth/invite-status?token=${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => null);
      if (data?.valid) {
        setDead(null);
        setState(data.state as JoinState);
        setAccount(data.account ?? null);
        setOrgSlug(data.org?.slug ?? null);
        if (data.account?.name) setName(n => n || data.account.name);
        return data.state as JoinState;
      }
      if (data && data.valid === false) {
        setDead({ reason: (data.reason ?? null) as InviteDeadReason | null });
        return null;
      }
    } catch {
      // Fall through to the session-only path below.
    }
    // Pre-flight unavailable (offline, 500). Degrade to what we can still
    // determine locally rather than blocking a legitimate request: a session
    // means "ready", none means "guest". The submit call re-checks everything
    // server-side anyway, so the worst case is a form we'd have skipped.
    const { data: userData } = await createClient().auth.getUser();
    const fallback: JoinState = userData.user ? "ready" : "guest";
    setState(fallback);
    return fallback;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await refresh();
      if (cancelled) return;
      void s;
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  // ── The waiting screen's heartbeat ────────────────────────────────────────
  // While `pending`, re-ask every POLL_MS until an officer decides. Approval
  // flips the state to already_member (the Membership now exists), which is what
  // turns this screen into the dashboard without the person touching anything.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (state !== "pending") return;
    pollRef.current = setInterval(() => { void refresh(); }, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state, refresh]);

  // Approved while waiting → walk them in. ?toast=welcome greets them on arrival
  // instead of dropping them onto a cold dashboard.
  const wasPending = useRef(false);
  useEffect(() => {
    if (state === "pending") wasPending.current = true;
    if (state === "already_member" && wasPending.current && orgSlug) {
      window.location.assign(`/${orgSlug}?toast=welcome`);
    }
  }, [state, orgSlug]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Return through the callback so the PKCE code is exchanged, then back to
      // THIS page (token in the path). Pass only next= — never org=.
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

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A 403 here means this person was declined — that's a state, not an
        // error to retry, so render the dead-end screen rather than a red bar.
        if (data?.state === "rejected") { setState("rejected"); setBusy(false); return; }
        setError(messageFor(res.status, data?.error));
        setBusy(false);
        return;
      }
      if (data?.orgSlug) setOrgSlug(data.orgSlug);
      if (data?.state === "already_member") {
        window.location.assign(`/${data.orgSlug}?toast=welcome`);
        return;
      }
      setState("pending");
      setBusy(false);
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      setBusy(false);
    }
  }

  if (dead) {
    return (
      <Shell>
        <DeadLink reason={dead.reason} orgName={orgName} />
      </Shell>
    );
  }

  if (state === "rejected") {
    return (
      <Shell>
        <Declined orgName={orgName} />
      </Shell>
    );
  }

  if (state === "pending") {
    return (
      <Shell>
        <AwaitingReview
          orgName={orgName}
          orgLogoUrl={orgLogoUrl}
          submittedName={name.trim() || account?.name || null}
          account={account}
          onSwitch={switchAccount}
          busy={busy}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <OrgMark name={orgName} logoUrl={orgLogoUrl} />
      <div className="auth-index">
        {state === "already_member" ? "Already a member" : "You’re invited"}
      </div>
      <h1 className="auth-h1">
        {state === "already_member"
          ? <>You&rsquo;re in <em>{orgName}.</em></>
          : <>Join <em>{orgName}.</em></>}
      </h1>
      <p className="auth-lede">{lede(state, orgName)}</p>
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
              <p className="auth-footnote" style={{ marginTop: 8 }}>
                This is the name {orgName ?? "this organization"} will see on their roster.
              </p>
            </div>

            <button
              onClick={submit}
              disabled={busy || !name.trim()}
              className="auth-btn-vio"
            >
              {busy ? "Sending…" : "Ask to join"}
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}

/** The page chrome every state shares. */
function Shell({ children }: { children: React.ReactNode }) {
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
          <div className="auth-col">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Copy under the headline, per state. */
function lede(state: JoinState | null, orgName: string | null): string {
  if (state === "already_member") return `You already have access to ${orgName ?? "this org"}.`;
  if (state === "ready") return "Tell us your name and we’ll send your request to their officers.";
  return `Sign in with Google to ask to join on ${APP_NAME}.`;
}

/**
 * The locked waiting screen.
 *
 * Deliberately contains NO org data — not the roster, not the headcount, not a
 * single link inward. Nothing about this org has been created for this person
 * yet: no Brother, no Membership, nothing an org-scoped query would return. The
 * screen says who they asked, as whom, and that it's someone else's move.
 *
 * It polls in the background (see the effect above), so approval walks them in
 * without a refresh. The only control is a way back out of the wrong account.
 */
function AwaitingReview({
  orgName, orgLogoUrl, submittedName, account, onSwitch, busy,
}: {
  orgName: string | null;
  orgLogoUrl: string | null;
  submittedName: string | null;
  account: Account | null;
  onSwitch: () => void;
  busy: boolean;
}) {
  return (
    <>
      <OrgMark name={orgName} logoUrl={orgLogoUrl} />
      <div className="auth-index">Request sent</div>
      <h1 className="auth-h1">
        Waiting on <em>{orgName}.</em>
      </h1>
      <p className="auth-lede">
        An officer needs to approve you before you can get in. You&rsquo;ll land on
        your dashboard the moment they do — you can leave this page open, or come
        back to this link later.
      </p>

      <div className="auth-body auth-stack">
        <div className="auth-notice" role="status" aria-live="polite">
          <span className="auth-spinner" aria-hidden="true" style={{ marginRight: 8 }} />
          Pending review{submittedName ? <> — you asked to join as <b>{submittedName}</b>.</> : "."}
        </div>

        {account && <AccountRow account={account} onSwitch={onSwitch} busy={busy} />}

        <p className="auth-footnote">
          Nothing has been shared with you yet. If this is taking a while, the
          fastest fix is usually asking whoever sent you the link.
        </p>
      </div>
    </>
  );
}

/**
 * Declined.
 *
 * Says so plainly, and names the one thing that actually unblocks them: a new
 * link. Re-opening THIS one will keep landing here — the rejection is recorded
 * against this person and this link, which is what stops a reload from putting
 * them back in the officer's queue.
 */
function Declined({ orgName }: { orgName: string | null }) {
  const org = orgName ?? "This organization";
  return (
    <div className="auth-body" style={{ marginTop: 0 }}>
      <div className="auth-badmark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
        </svg>
      </div>
      <h1 className="auth-h1" style={{ textAlign: "center", fontSize: 24, marginTop: 20 }}>
        Your request wasn&rsquo;t approved
      </h1>
      <p className="auth-lede" style={{ textAlign: "center", margin: "12px auto 0" }}>
        {org} didn&rsquo;t accept this request. This link won&rsquo;t work for you
        again — if you think that&rsquo;s a mistake, ask an organizer to send you a
        fresh one.
      </p>
    </div>
  );
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

/** Which Google account is asking, and a one-click way out of the wrong one. */
function AccountRow({ account, onSwitch, busy }: { account: Account; onSwitch: () => void; busy: boolean }) {
  const label = account.email ?? account.name ?? "your Google account";
  return (
    <div className="auth-account">
      {account.avatarUrl
        ? <img src={account.avatarUrl} alt="" />
        : <span className="avatar-fallback" aria-hidden>{label.charAt(0).toUpperCase()}</span>}
      <span className="who">
        <span className="k">Signed in as</span>
        <span className="v" title={label}>{label}</span>
      </span>
      <button onClick={onSwitch} disabled={busy} className="auth-link vio" style={{ flex: "0 0 auto" }}>
        Switch
      </button>
    </div>
  );
}

/**
 * Map a submit failure to copy the invitee can act on. The server's strings are
 * already user-safe and stay as the fallback, but the common cases get phrasing
 * written for this screen rather than for an API consumer.
 */
function messageFor(status: number, serverError?: string): string {
  if (status === 410) return serverError ?? "This invite link is no longer active.";
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (status === 401) return "Your sign-in expired. Refresh the page and try again.";
  if (status >= 500)  return "Something went wrong on our end. Try again in a moment.";
  return serverError ?? "Couldn’t send your request. Please try again.";
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
