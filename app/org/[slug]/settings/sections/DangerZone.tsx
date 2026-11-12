"use client";

import { useEffect, useState } from "react";
import { Modal } from "../../../../components/dashboard/primitives";
import { useChapter } from "../../../../context/ChapterContext";
import { requestJson } from "../../../../lib/api";
import { orgHref } from "@/lib/org-paths";

// Danger Zone — permanently delete the current organization. Rendered as the
// rose card at the foot of Settings → Identity (styles in identity.css).
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

export function DangerZone({ onError, memberCount }: { onError: (msg: string) => void; memberCount: number }) {
  const { currentUser } = useChapter();

  // Admin of the active org? Platform admins also qualify.
  const isActiveOrgAdmin =
    currentUser?.isAdmin === true ||
    (currentUser?.memberships.find(m => m.organizationId === currentUser.orgId)?.isOrgAdmin ?? false);

  const [open, setOpen] = useState(false);

  if (!currentUser || !isActiveOrgAdmin) return null;

  return (
    <>
      <section className="id-danger" aria-labelledby="id-dz">
        <div className="ic">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.44c-.8.08-1.57.18-2.34.32a.75.75 0 0 0 .27 1.48l.15-.03.84 10.06A2.75 2.75 0 0 0 7.66 18.5h4.68a2.75 2.75 0 0 0 2.74-2.48l.84-10.06.15.03a.75.75 0 0 0 .27-1.48c-.77-.14-1.55-.24-2.34-.32v-.44A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.67.02 2.5.07v-.32c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.32C8.33 4.02 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg>
        </div>
        <div className="tx">
          <h3 id="id-dz">Delete this chapter</h3>
          <p>
            {/* One string: vendored Next drops the space after a {expr}. */}
            {`Removes the chapter and everything in it — roster, money, meetings, docs — for ${memberCount === 1 ? "the 1 person" : `all ${memberCount} people`} in it. This can't be undone.`}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="id-btn rose solid">
          Delete chapter…
        </button>
      </section>

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
      window.location.assign(remaining ? orgHref(remaining.orgSlug) : "/welcome");
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
    <Modal title="Delete organization" onClose={deleting ? () => {} : onClose} tone="dusk">
      <div className="space-y-4" style={{ color: "var(--ink-soft)" }}>
        <p className="text-[13px] leading-relaxed">
          This permanently deletes <span className="font-semibold" style={{ color: "var(--ink)" }}>{orgName}</span> and
          all of its data. <span style={{ color: "var(--rose)" }}>This action cannot be undone.</span>
        </p>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--faint)" }}>
          Members who belong only to this org are removed. Anyone who also belongs to another
          organization keeps their account.
        </p>

        {summary && (
          <div className="grid grid-cols-3 gap-2">
            {stats.map(([label, n]) => (
              <div key={label} className="rounded-lg px-2 py-2 text-center" style={{ background: "var(--card-2)" }}>
                <p className="text-[16px] font-bold tabular-nums" style={{ color: "var(--ink)" }}>{n}</p>
                <p className="text-[10px]" style={{ color: "var(--faint)" }}>{label}</p>
              </div>
            ))}
          </div>
        )}
        {loadFailed && (
          <p className="text-[11px]" style={{ color: "var(--gold)" }}>
            Couldn&rsquo;t load a summary of what will be removed — you can still delete below.
          </p>
        )}

        <div>
          <label htmlFor="confirm-org-name" className="mb-1 block text-[11px] font-medium" style={{ color: "var(--ink-soft)" }}>
            Type <span className="font-semibold" style={{ color: "var(--ink)" }}>{orgName}</span> to confirm
          </label>
          <input
            id="confirm-org-name"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={orgName}
            className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none"
            style={{ border: "1px solid var(--line)", background: "var(--paper-2)", color: "var(--ink)" }}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-50"
            style={{ border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-soft)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!armed}
            className="rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{ border: "1px solid rgba(217,139,163,.3)", background: "var(--rose-bg)", color: "var(--rose)" }}
          >
            {deleting ? "Deleting…" : "Delete forever"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
