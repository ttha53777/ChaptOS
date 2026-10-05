"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "../dashboard/primitives";
import { btnDuskActionCls, btnDuskGhostCls } from "../dashboard/styles";
import { PaperIcon } from "../paper/PaperIcon";
import { requestJson, apiErrorMessage } from "../../lib/api";

/** The fields of GET /api/invites this sheet reads. Declared structurally rather
 *  than importing InviteDto, which lives in a service module that pulls Prisma
 *  into the client bundle. */
type InviteSummary = {
  id: number; token: string; label: string | null; status: string;
  expiresAt: string | null; redemptionCount: number; availableUses: number | null;
};

export function joinUrl(token: string): string {
  if (typeof window === "undefined") return `/join/${token}`;
  return `${window.location.origin}/join/${token}`;
}

/**
 * The org's usable invite links, newest first. Listing (and creating) requires
 * MANAGE_SETTINGS, so callers pass that bit as `enabled` and get an empty list
 * otherwise. `create` mints a 7-day link — only ever on an explicit press: a link
 * is a credential, and opening a sheet must not quietly make one.
 */
export function useActiveInvites(enabled: boolean) {
  const [links, setLinks] = useState<InviteSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) { setLinks([]); setLoaded(true); return; }
    try {
      const rows = await requestJson<InviteSummary[]>("/api/invites");
      setLinks(rows.filter(r => r.status === "active"));
      setError(null);
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't load invite links."));
    } finally {
      setLoaded(true);
    }
  }, [enabled]);

  useEffect(() => { void load(); }, [load]);

  const create = useCallback(async () => {
    const made = await requestJson<InviteSummary>("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiry: "7d" }),
    });
    setLinks(prev => [made, ...prev]);
    return made;
  }, []);

  return { links, loaded, error, create, reload: load };
}

function expiryNote(l: InviteSummary): string {
  const parts: string[] = [];
  if (l.expiresAt) parts.push(`expires ${new Date(l.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
  else parts.push("never expires");
  if (l.availableUses != null) parts.push(`${l.availableUses} use${l.availableUses === 1 ? "" : "s"} left`);
  return parts.join(" · ");
}

/** One link as a copyable chip — shared by the sheet and the day-one card. */
export function InviteLinkChip({ link, onCopied, onError }: {
  link: InviteSummary; onCopied: () => void; onError: (m: string) => void;
}) {
  const url = joinUrl(link.token);
  return (
    <div className="bh-linkchip flex min-w-0 items-center gap-2 rounded-lg border border-[rgba(var(--ink-rgb),0.12)] bg-[color:var(--paper)] py-1.5 pl-3 pr-1.5">
      <code title={url} className="min-w-0 flex-1 truncate font-mono text-[12px] text-[color:var(--ink-soft)]">{url.replace(/^https?:\/\//, "")}</code>
      <button
        type="button"
        className={`bh-btn sm ${btnDuskGhostCls}`}
        onClick={() => navigator.clipboard.writeText(url).then(onCopied, () => onError("Couldn't copy to clipboard"))}
      >
        <PaperIcon name="link" className="pp-only" />Copy
      </button>
    </div>
  );
}

/**
 * "Invite brothers" from the roster: hand over a link without leaving the page.
 * Shows the org's usable links to copy; with none, offers to make one. Labels,
 * expiry choices, use limits and revoking stay in Settings → Invitations.
 */
export function InviteLinkSheet({ memberWord, seatsLeft, onClose, onCopied, onOpenSettings }: {
  /** Plural, lower-case vocab word ("brothers"). */
  memberWord: string;
  /** Seats left on the plan — admins only; null hides the line. */
  seatsLeft: number | null;
  onClose: () => void;
  onCopied: () => void;
  onOpenSettings: () => void;
}) {
  const { links, loaded, error, create } = useActiveInvites(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function makeLink() {
    setBusy(true); setErr(null);
    try { await create(); } catch (e) { setErr(apiErrorMessage(e, "Couldn't create a link.")); } finally { setBusy(false); }
  }

  const shown = links.slice(0, 3);

  return (
    <Modal title={`Invite ${memberWord}`} tone="dusk" icon="envelope" accent="sky" onClose={onClose}>
      <div className="space-y-4 bh-invite">
        {(error || err) && <div role="alert" className="jr-error">{err ?? error}</div>}
        {!loaded ? (
          <p className="jr-note" role="status">Loading links…</p>
        ) : shown.length > 0 ? (
          <div className="bh-invite-links space-y-3">
            {shown.map(l => (
              <div key={l.id}>
                <InviteLinkChip link={l} onCopied={onCopied} onError={setErr} />
                <p className="bh-invite-meta mt-1.5 text-[12px] text-[color:var(--muted)]">{l.label ? <b>{l.label}</b> : "Unlabelled link"} · {expiryNote(l)}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="bh-invite-none space-y-3">
            <p className="text-[13px] text-[color:var(--ink-soft)]">There&rsquo;s no working invite link right now.</p>
            <button type="button" className={btnDuskActionCls} disabled={busy} onClick={makeLink}>
              {busy ? "Creating…" : "Create a link (expires in 7 days)"}
            </button>
          </div>
        )}

        <p className="text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
          Anyone who opens it signs in with Google and asks to join. Each request waits at the top of
          this page until an officer approves it &mdash; the link alone never gets anyone in.
        </p>
        {seatsLeft != null && (
          <p className="text-[12px] text-[color:var(--muted)]">
            {seatsLeft > 0
              ? `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left on your plan.`
              : "Your plan is full."}{" "}
            Requests still queue when you&rsquo;re full.
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" className="bh-settings-link text-[12px] text-[color:var(--muted)] underline-offset-2 hover:text-[color:var(--ink)] hover:underline" onClick={onOpenSettings}>
            Labels, expiry &amp; limits &rarr; Settings
          </button>
          <button type="button" className={btnDuskGhostCls} onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
