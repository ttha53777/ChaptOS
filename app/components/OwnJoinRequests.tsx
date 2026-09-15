"use client";
import Link from "next/link";
import { useState } from "react";
import { useJoinPolling, readJoinStatus } from "@/app/hooks/useJoinPolling";

type RequestNotice = { id: number; submittedName: string; status: string; org: { name: string; slug: string } };

export function OwnJoinRequests() {
  const [requests, setRequests] = useState<RequestNotice[] | null>(null);
  const poll = useJoinPolling(async signal => {
    const rows = await readJoinStatus("/api/auth/join-requests", signal);
    if (!Array.isArray(rows)) throw new Error("Invalid request list");
    if (!signal.aborted) setRequests(rows);
  }, requests === null || requests.some(r => r.status === "pending"));
  if (!requests && !poll.error) return <p className="auth-footnote" role="status">Checking your join requests…</p>;
  if (requests?.length === 0) return null;
  return <section aria-label="Your join requests" className="auth-stack">
    <h2 className="auth-label">Your join requests</h2>
    {poll.error && <div className="auth-notice" role="status">{poll.error} <button className="auth-link vio" onClick={poll.retry} disabled={poll.checking}>Retry</button></div>}
    {requests?.map(r => <div key={r.id} className="auth-notice">
      <b>{r.org.name}</b>
      <p>{r.status === "pending" ? `Waiting for review — you asked as ${r.submittedName}.`
        : r.status === "approved" ? "Your request was approved."
        : "Your request wasn't approved. Ask an organizer for a fresh link if you think this is a mistake."}</p>
      {r.status !== "rejected" && <Link className="auth-link vio" href={`/${encodeURIComponent(r.org.slug)}`}>{r.status === "approved" ? "Open organization" : "Check status"}</Link>}
    </div>)}
  </section>;
}
