"use client";

import { useEffect, useState } from "react";
import { Modal } from "./dashboard/primitives";
import { requestJson } from "../lib/api";
import { DELETE_ACCOUNT_CONFIRMATION } from "@/lib/validation/account";
import type { AccountDeletionPreview } from "@/lib/api-types";

// Self-serve account deletion. Asks the server what deletion would touch first
// (GET /api/auth/account), so a last admin learns why they can't before typing
// anything, then requires the confirmation word. Rose, unlike LeaveOrgModal's
// amber: this one is irreversible and reaches every org the person is in.
//
// On success the session is already gone server-side; hard-navigate to the
// landing page so nothing tries to render with it.

export function DeleteAccountModal({ onClose, onError }: {
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    requestJson<AccountDeletionPreview>("/api/auth/account")
      .then(setPreview)
      .catch(() => { onError("Couldn't check your account. Try again."); onClose(); });
    // Once per open. The callbacks are inline arrows from the parent, so listing
    // them would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const armed = preview?.canDelete === true && typed.trim() === DELETE_ACCOUNT_CONFIRMATION && !deleting;

  async function handleDelete() {
    if (!armed) return;
    setDeleting(true);
    try {
      await requestJson("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      window.location.assign("/");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      onError(message.includes("409")
        ? "Something changed — reopen this to see what's stopping the deletion."
        : "Couldn't delete your account. Try again.");
      setDeleting(false);
      onClose();
    }
  }

  const blocked = preview && !preview.canDelete;
  const lastAdminOrgs = preview?.orgs.filter(o => o.blocker === "last_admin") ?? [];

  return (
    <Modal title="Delete account" onClose={deleting ? () => {} : onClose} tone="dusk">
      {!preview ? (
        <p className="text-[13px]" style={{ color: "var(--ink-soft)" }}>Checking your account…</p>
      ) : (
        <div className="space-y-4">
          {blocked ? (
            <div className="space-y-2 text-[13px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              <p className="font-semibold" style={{ color: "var(--rose)" }}>Your account can&apos;t be deleted yet.</p>
              {preview.isPlatformAdmin && (
                <p>It holds platform staff access. Contact support to have that removed first.</p>
              )}
              {lastAdminOrgs.map(o => (
                <p key={o.slug}>
                  You&apos;re the last admin of <span className="font-semibold" style={{ color: "var(--ink)" }}>{o.name}</span>.{" "}
                  {o.soleMember
                    ? "You're its only member, so delete the organization from its settings first."
                    : "Make someone else an admin there, or delete the organization."}
                </p>
              ))}
            </div>
          ) : (
            <div className="space-y-2 text-[13px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              <p>
                This permanently deletes your login and your profile photo
                {preview.orgs.length > 0 && (
                  <>
                    , and removes you from{" "}
                    <span className="font-semibold" style={{ color: "var(--ink)" }}>
                      {preview.orgs.map(o => o.name).join(", ")}
                    </span>
                  </>
                )}
                . Your attendance, dues, votes, tasks and service hours are erased.
              </p>
              <p>
                Money you paid stays on each org&apos;s books, and past activity stays in their logs, but
                neither will show your name. This can&apos;t be undone.
              </p>
            </div>
          )}

          {!blocked && (
            <div>
              <label htmlFor="confirm-delete-account" className="mb-1 block text-[11px] font-medium" style={{ color: "var(--ink-soft)" }}>
                Type <span className="font-semibold" style={{ color: "var(--ink)" }}>{DELETE_ACCOUNT_CONFIRMATION}</span> to confirm
              </label>
              <input
                id="confirm-delete-account"
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={DELETE_ACCOUNT_CONFIRMATION}
                className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none"
                style={{ border: "1px solid var(--line)", background: "var(--paper-2)", color: "var(--ink)" }}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={deleting}
              className="rounded-lg px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-50"
              style={{ border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-soft)" }}
            >
              {blocked ? "Close" : "Cancel"}
            </button>
            {!blocked && (
              <button
                onClick={handleDelete}
                disabled={!armed}
                className="rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ border: "1px solid var(--rose-bg)", background: "var(--rose-bg)", color: "var(--rose)" }}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
