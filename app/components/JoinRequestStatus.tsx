"use client";

import { useState } from "react";
import { useJoinPolling, readJoinStatus } from "@/app/hooks/useJoinPolling";

/** Same own-account status channel as /join, without needing the old token. */
export function JoinRequestStatus({ slug }: { slug: string }) {
  const [rejected, setRejected] = useState(false);
  const poll = useJoinPolling(async signal => {
    const data = await readJoinStatus(`/api/auth/join-status?slug=${encodeURIComponent(slug)}`, signal);
    if (signal.aborted) return;
    if (data.state === "already_member") window.location.assign(`/${encodeURIComponent(slug)}?toast=welcome`);
    if (data.state === "rejected") setRejected(true);
  }, !rejected);
  return <div className="auth-notice" role="status" aria-live="polite">
    <p>{rejected ? "Your request wasn't approved. Ask an organizer for a fresh invite link if you think this is a mistake."
      : poll.error ?? "Pending review. This page will open your dashboard when an officer approves you."}</p>
    {!rejected && (poll.sessionExpired
      ? <a className="auth-link vio" href={`/login?next=${encodeURIComponent(`/${slug}`)}`}>Sign in again</a>
      : <button className="auth-link vio" disabled={poll.checking} onClick={poll.retry}>{poll.checking ? "Checking…" : "Check status"}</button>)}
  </div>;
}
