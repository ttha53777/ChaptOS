"use client";

import { useState } from "react";
import { Modal } from "./dashboard/primitives";
import { requestJson } from "../lib/api";

// Shared "leave organization" confirmation modal. Used by both the Accounts
// settings section and the top-right profile menu so the disconnect flow has one
// implementation. Mirrors DangerZone's type-the-name-to-confirm pattern, but in a
// neutral amber tone since it's reversible (the user can be re-invited) and only
// affects the caller, not the whole org.
//
// On success it hard-navigates to a remaining org (or /welcome) so the app
// re-resolves the now-gone active org cleanly; the route clears the active_org
// cookie as part of the same response.

export function LeaveOrgModal({
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
  const [typed, setTyped] = useState("");
  const [leaving, setLeaving] = useState(false);

  const armed = typed.trim() === orgName.trim() && orgName.trim().length > 0 && !leaving;

  async function handleLeave() {
    if (!armed) return;
    setLeaving(true);
    try {
      // Slug is the stable confirmation token the server re-checks against the
      // active org. Comes from currentUser.org, so leaving doesn't depend on any
      // list fetch succeeding.
      await requestJson("/api/orgs/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmSlug: orgSlug }),
      });

      // Land somewhere valid now that this membership is gone. Prefer another org
      // the user still belongs to; otherwise the onboarding entry point.
      const remaining = memberships.find(m => m.organizationId !== activeOrgId);
      window.location.assign(remaining ? `/${remaining.orgSlug}` : "/welcome");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      // requestJson surfaces the server's error text in the message, so the 409
      // last-admin guard message is already human-readable.
      onError(
        message.includes("409")
          ? "You're the last admin. Promote another admin before leaving."
          : message.includes("403") || /forbidden|cross-origin/i.test(message)
            ? "You can't leave this organization right now."
            : "Couldn't leave the organization. Try again.",
      );
      setLeaving(false);
      onClose();
    }
  }

  return (
    <Modal title="Leave organization" onClose={leaving ? () => {} : onClose} tone="dusk">
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          You&apos;ll be removed from <span className="font-semibold" style={{ color: "var(--ink)" }}>{orgName}</span> and
          lose access to it. Your roster entry and history stay with the org; an admin can re-invite you later.
        </p>

        <div>
          <label htmlFor="confirm-leave-org-name" className="mb-1 block text-[11px] font-medium" style={{ color: "var(--ink-soft)" }}>
            Type <span className="font-semibold" style={{ color: "var(--ink)" }}>{orgName}</span> to confirm
          </label>
          <input
            id="confirm-leave-org-name"
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
            disabled={leaving}
            className="rounded-lg px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-50"
            style={{ border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-soft)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleLeave}
            disabled={!armed}
            className="rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{ border: "1px solid rgba(221,179,106,.4)", background: "var(--gold-bg)", color: "var(--gold)" }}
          >
            {leaving ? "Leaving…" : "Leave organization"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
