"use client";

import { useEffect, useState } from "react";
import { Modal } from "../../../components/dashboard/primitives";
import { useChapter } from "../../../context/ChapterContext";
import { requestJson } from "../../../lib/api";

// Danger Zone — permanently delete the current organization.
//
// Org-admin only: renders nothing for anyone who isn't an admin of the ACTIVE
// org (or a platform admin). This mirrors exactly what the server enforces, so
// a non-admin never sees a control that would 403. The actual gate is on the
// server (deleteOrg checks ctx.isOrgAdmin); this is just to avoid showing a dead
// button.
//
// Flow: button → modal that fetches a summary of what will be deleted and makes
// the admin type the org's exact NAME to arm the Delete button. On success we
// hard-navigate away (to a remaining org, or /welcome when none remain) so the
// app re-resolves the now-deleted active org cleanly.

interface DeletionSummary {
  organizationId: number;
  name: string;
  slug: string;
  members: number;
  events: number;
  transactions: number;
  docs: number;
  parties: number;
}

export function DangerZone({ onError }: { onError: (msg: string) => void }) {
  const { currentUser } = useChapter();

  // Admin of the active org? Platform admins also qualify.
  const isActiveOrgAdmin =
    currentUser?.isAdmin === true ||
    (currentUser?.memberships.find(m => m.organizationId === currentUser.orgId)?.isOrgAdmin ?? false);

  const [open, setOpen] = useState(false);

  if (!currentUser || !isActiveOrgAdmin) return null;

  return (
    <>
      <div className="rounded-xl border border-red-500/25 bg-red-500/[0.04] p-4">
        <h3 className="mb-1 text-[12px] font-semibold text-red-300">Danger Zone</h3>
        <p className="mb-3 text-[11px] text-slate-400">
          Permanently delete this organization and everything in it — members, events,
          transactions, documents, and history. This cannot be undone.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] font-semibold text-red-300 transition-colors hover:bg-red-500/20"
        >
          <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete this organization
        </button>
      </div>

      {open && currentUser.org && (
        <DeleteOrgModal
          orgName={currentUser.org.name}
          orgSlug={currentUser.org.slug}
          memberships={currentUser.memberships}
          activeOrgId={currentUser.orgId}
          onClose={() => setOpen(false)}
          onError={onError}
        />
      )}
    </>
  );
}

function DeleteOrgModal({
  orgName,
  orgSlug,
  memberships,
  activeOrgId,
  onClose,
  onError,
}: {
  orgName: string;
  orgSlug: string;
  memberships: { organizationId: number; orgSlug: string }[];
  activeOrgId: number;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [summary, setSummary] = useState<DeletionSummary | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Fetch the deletion summary on open. Read-only; if it fails we let the admin
  // proceed anyway (the typed-name guard still protects them) but show no counts.
  useEffect(() => {
    let cancelled = false;
    requestJson<DeletionSummary>("/api/orgs/manage")
      .then(s => { if (!cancelled) setSummary(s); })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const armed = typed.trim() === orgName.trim() && orgName.trim().length > 0 && !deleting;

  async function handleDelete() {
    if (!armed) return;
    setDeleting(true);
    try {
      await requestJson("/api/orgs/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        // Slug is the stable confirmation token the server re-checks against the
        // active org. Comes from currentUser.org, so deletion never depends on
        // the (best-effort) summary fetch succeeding.
        body: JSON.stringify({ confirmSlug: orgSlug }),
      });

      // Land somewhere valid now that the active org is gone. Prefer another org
      // the user still belongs to; otherwise the onboarding entry point.
      const remaining = memberships.find(m => m.organizationId !== activeOrgId);
      window.location.assign(remaining ? `/${remaining.orgSlug}` : "/welcome");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      onError(
        message.includes("403") || /forbidden/i.test(message)
          ? "Only an org admin can delete this organization."
          : "Couldn't delete the organization. Try again.",
      );
      setDeleting(false);
      onClose();
    }
  }

  const stats: [string, number][] = summary
    ? [
        ["Members", summary.members],
        ["Events", summary.events],
        ["Transactions", summary.transactions],
        ["Parties", summary.parties],
        ["Documents", summary.docs],
      ]
    : [];

  return (
    <Modal title="Delete organization" onClose={deleting ? () => {} : onClose}>
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-slate-300">
          This permanently deletes <span className="font-semibold text-white">{orgName}</span> and
          all of its data. <span className="text-red-300">This action cannot be undone.</span>
        </p>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Members who belong only to this org are removed. Anyone who also belongs to another
          organization keeps their account.
        </p>

        {summary && (
          <div className="grid grid-cols-3 gap-2">
            {stats.map(([label, n]) => (
              <div key={label} className="rounded-lg bg-white/[0.04] px-2 py-2 text-center">
                <p className="text-[16px] font-bold tabular-nums text-white">{n}</p>
                <p className="text-[10px] text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        )}
        {loadFailed && (
          <p className="text-[11px] text-amber-400">
            Couldn&rsquo;t load a summary of what will be removed — you can still delete below.
          </p>
        )}

        <div>
          <label htmlFor="confirm-org-name" className="mb-1 block text-[11px] font-medium text-slate-300">
            Type <span className="font-semibold text-white">{orgName}</span> to confirm
          </label>
          <input
            id="confirm-org-name"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={orgName}
            className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-red-500/50 focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-300 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!armed}
            className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-[12px] font-semibold text-red-300 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete forever"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
