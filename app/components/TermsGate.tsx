"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Modal } from "./dashboard/primitives";
import { useChapter } from "../context/ChapterContext";
import { isDashboardRoute } from "../lib/routes";
import { requestJson } from "../lib/api";
import { todayISO } from "@/lib/dates";
import { TERMS_CHANGES, TERMS_EFFECTIVE_LABEL } from "@/lib/terms";
import type { TermsStatus } from "@/lib/api-types";
// Same body styles as SemesterGate (.sg-*): it mounts at the root too, so it
// brings the ledger stylesheet and wraps its body in a .dash container.
import "./dashboard/dashboard-ledger.css";
import "./semester-gate.css";
import "./terms-gate.css";

/**
 * TermsGate — asks a signed-in member to agree to the current Terms of Service.
 *
 * Shown when /api/auth/me reports `terms.acceptedVersion !== terms.version`: an
 * existing member from before the terms were published, or anyone after a new
 * version ships. People who joined through /create or /join already agreed there
 * (lib/auth/terms-acceptance.ts), so they never see it for the version they
 * accepted.
 *
 * Until `terms.acceptBy` it can be put off with "Not now" (for this browser
 * session only). From that day on it's a hard wall like SemesterGate: section
 * 24 of the terms promises 30 days' notice, then waits for "I agree".
 *
 * Mounted once at the root (app/layout.tsx) after SemesterGate, so it sits on
 * top when both apply. Same two gates as SemesterGate: a resolved user AND a
 * /[slug]/… route, so it never lands on /terms itself or an auth screen.
 */

const LATER_KEY = "chaptos:terms-later";

const SUMMARY: readonly { section: string; text: string }[] = [
  { section: "§6", text: "Your organization is responsible for what it enters. ChaptOS doesn't verify GPA, service hours or attendance." },
  { section: "§9–10", text: "We keep records. We don't run events or hold money — your organization does." },
  { section: "§11", text: "Ask Chapt can be wrong, and nothing it suggests happens until a person approves it." },
  { section: "§22", text: "Disputes go to individual arbitration. You can opt out by email within 30 days." },
];

function readLater(version: string): boolean {
  try { return window.sessionStorage.getItem(LATER_KEY) === version; } catch { return false; }
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function TermsGate() {
  const { currentUser } = useChapter();
  const pathname = usePathname();
  // Local, so "I agree" closes the gate without refetching /api/auth/me.
  const [status, setStatus] = useState<TermsStatus | null>(null);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverStatus = currentUser?.terms ?? null;
  useEffect(() => { setStatus(serverStatus); }, [serverStatus]);
  useEffect(() => { if (status) setLater(readLater(status.version)); }, [status]);

  if (!currentUser || !status || !isDashboardRoute(pathname)) return null;
  if (status.acceptedVersion === status.version) return null;

  const blocking = todayISO() >= status.acceptBy;
  if (later && !blocking) return null;

  const isUpdate = status.acceptedVersion !== null && TERMS_CHANGES.length > 0;
  const rows = isUpdate ? TERMS_CHANGES : SUMMARY;

  async function agree() {
    if (!status || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await requestJson<TermsStatus>("/api/auth/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: status.version }),
      });
      setStatus(next);
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function putOff() {
    if (!status) return;
    try { window.sessionStorage.setItem(LATER_KEY, status.version); } catch { /* closes for this render either way */ }
    setLater(true);
  }

  const title = isUpdate
    ? <>Our terms are <em>changing</em>.</>
    : <>We&rsquo;ve published our <em>Terms of Service</em>.</>;
  const ariaLabel = isUpdate ? "Our terms are changing" : "We've published our Terms of Service";

  return (
    <Modal tone="dusk" maxWidthClass="max-w-lg" dismissable={!blocking} hideHeader ariaLabel={ariaLabel} onClose={putOff} accent="peach">
      <div className="dash" data-dashboard-theme="dusk">
        <div className="sg tg">
          <div className="sg-head">
            <div className="sg-seal" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" />
              </svg>
            </div>
            <p className="sg-kicker">Terms of service</p>
            <h2 className="sg-title">{title}</h2>
            <p className="sg-lede">
              {isUpdate
                ? "Here's what changes. Everything else stays the same."
                : "They're the rules for using ChaptOS, for your organization and for you. The short version:"}
            </p>
          </div>

          <ul className="tg-list">
            {rows.map(r => (
              <li key={r.section}><b>{r.section}</b><span>{r.text}</span></li>
            ))}
          </ul>

          <p className="tg-meta">
            Effective {TERMS_EFFECTIVE_LABEL} ·{" "}
            <a href="/terms" target="_blank" rel="noreferrer">Read the full terms</a>
          </p>

          {error && <div className="sg-error" role="alert">{error}</div>}

          <button type="button" className="sg-submit" onClick={() => void agree()} disabled={busy}>
            {busy ? "Saving…" : "I agree"}
          </button>
          {blocking ? (
            <p className="sg-note">ChaptOS needs your agreement to continue.</p>
          ) : (
            <button type="button" className="tg-later" onClick={putOff}>
              Not now · you can keep using ChaptOS until {shortDate(status.acceptBy)}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
