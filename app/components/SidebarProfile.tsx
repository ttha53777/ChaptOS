"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ProfileAvatar } from "./ProfileAvatar";
import { LeaveOrgModal } from "./LeaveOrgModal";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useChapter } from "../context/ChapterContext";
import { useOrgPath } from "../hooks/useOrgPath";

async function syncAvatarSession() {
  const supabase = createClient();
  await supabase.auth.refreshSession();
}

/**
 * Profile block pinned to the bottom of the sidebar. Renders an avatar + name row
 * that, when clicked, opens an UPWARD popover with everything the old top-right
 * UserAvatar menu did (change/remove photo, leave org, sign out) PLUS a Settings
 * link — Settings used to be its own sidebar nav item. Styled to the sidebar's
 * warm dusk palette rather than the slate/indigo UserAvatar palette so the shell
 * reads as one surface.
 *
 * `onNavigate` lets the parent close the mobile sidebar drawer when the user
 * follows the Settings link (mirrors the `onClose` every nav item already calls).
 */
export function SidebarProfile({ onNavigate }: { onNavigate?: () => void }) {
  const { user, loading, avatarRevision, setAvatarUrl } = useCurrentUser();
  // Org + memberships for the "Leave organization" action live on the full
  // ChapterContext user, not the slimmed useCurrentUser projection.
  const { currentUser } = useChapter();
  const orgPath = useOrgPath();
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active-state for the Settings entry — same slug-agnostic check the sidebar
  // nav uses, so the row highlights when you're on /[slug]/settings.
  const settingsActive = (() => {
    if (!pathname) return false;
    const rest = pathname.replace(/^\/[^/]+/, "");
    return rest.startsWith("/settings");
  })();

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch { /* network failure — still redirect */ }
    // Clear the remembered org so the next /login visit starts at the org picker
    // (State B) rather than offering one-click re-entry into the org they left.
    try {
      localStorage.removeItem("chaptos_last_org");
    } catch { /* storage unavailable — nothing to clear */ }
    router.push("/login");
  }

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file (PNG, JPG, WebP, etc.).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Image must be under 2 MB.");
      return;
    }

    setPhotoError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/auth/avatar", { method: "POST", body });
      const data = await res.json().catch(() => ({})) as { avatarUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await syncAvatarSession();
      setAvatarUrl(data.avatarUrl ?? null, true);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not update profile photo");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemovePhoto() {
    setPhotoError(null);
    setRemoving(true);
    try {
      const res = await fetch("/api/auth/avatar", { method: "DELETE" });
      const data = await res.json().catch(() => ({})) as { avatarUrl?: string | null; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Remove failed");
      await syncAvatarSession();
      setAvatarUrl(data.avatarUrl ?? null, false);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not remove profile photo");
    } finally {
      setRemoving(false);
    }
  }

  const photoBusy = uploading || removing;

  // The pinned sidebar row shows just the first name; the popover header keeps
  // the full name + email.
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? user?.name;

  if (loading) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2">
        <div className="h-8 w-8 shrink-0 rounded-full bg-[rgba(236,231,221,0.07)] animate-pulse" />
        <div className="h-3 w-24 rounded bg-[rgba(236,231,221,0.07)] animate-pulse" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handlePhotoFile}
      />

      {/* ── Profile row — pinned trigger ─────────────────────────────────── */}
      <button
        onClick={() => {
          // Clear a stale leave error when opening so a past failure doesn't
          // linger in the menu on an unrelated open.
          if (!open) setLeaveError(null);
          setOpen(v => !v);
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[rgba(236,231,221,0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/40"
        aria-label="Open profile menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <ProfileAvatar
          name={user?.name}
          avatarUrl={user?.avatarUrl}
          revision={avatarRevision}
          size="sm"
          ringClassName="ring-1 ring-[rgba(236,231,221,0.12)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold leading-tight text-[#ece7dd]">{firstName}</p>
            {user?.isAdmin && (
              <span
                className="shrink-0 rounded-full bg-[#a78bfa]/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#c4b5fd] ring-1 ring-inset ring-[#a78bfa]/30"
                title="You have admin permissions"
              >
                Admin
              </span>
            )}
          </div>
          {user?.role && (
            <p className="truncate text-[10.5px] leading-tight text-[#6b6354] mt-0.5">{user.role}</p>
          )}
        </div>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-[#6b6354] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Upward popover ───────────────────────────────────────────────── */}
      {open && (
        <div
          className="absolute bottom-full left-0 right-0 z-[60] mb-2 overflow-hidden rounded-xl border border-[rgba(236,231,221,0.1)] bg-[#1b1813] shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
          role="menu"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <ProfileAvatar
              name={user?.name}
              avatarUrl={user?.avatarUrl}
              revision={avatarRevision}
              size="md"
              ringClassName="ring-2 ring-[rgba(236,231,221,0.1)]"
            />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[#ece7dd]">{user?.name}</p>
              {user?.role && (
                <p className="truncate text-[11px] leading-tight text-[#958d7c] mt-0.5">{user.role}</p>
              )}
              <p className="truncate text-[11px] text-[#6b6354] mt-0.5">{user?.email}</p>
            </div>
          </div>

          <div className="h-px bg-[rgba(236,231,221,0.06)]" />

          <div className="p-2 space-y-0.5">
            <Link
              href={orgPath("/settings")}
              role="menuitem"
              aria-current={settingsActive ? "page" : undefined}
              onClick={() => { setOpen(false); onNavigate?.(); }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
                settingsActive
                  ? "bg-[#14120e] text-[#ece7dd]"
                  : "text-[#958d7c] hover:bg-[rgba(236,231,221,0.05)] hover:text-[#ece7dd]"
              }`}
            >
              <svg className="h-4 w-4 shrink-0 opacity-75" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Link>

            <button
              type="button"
              disabled={photoBusy}
              role="menuitem"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#958d7c] transition-all hover:bg-[rgba(236,231,221,0.05)] hover:text-[#ece7dd] disabled:opacity-50"
            >
              <svg className="h-4 w-4 shrink-0 opacity-75" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a41.763 41.763 0 00-1.134-.175 2.31 2.31 0 01-1.227-1.054 2.31 2.31 0 00-2.31-1.227H8.084a2.31 2.31 0 00-2.31 1.227 2.31 2.31 0 01-1.227 1.054z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {uploading ? "Uploading…" : "Change photo"}
            </button>

            {user?.hasCustomAvatar && (
              <button
                type="button"
                disabled={photoBusy}
                role="menuitem"
                onClick={handleRemovePhoto}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#958d7c] transition-all hover:bg-[rgba(236,231,221,0.05)] hover:text-[#ece7dd] disabled:opacity-50"
              >
                <svg className="h-4 w-4 shrink-0 opacity-75" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                {removing ? "Removing…" : "Remove photo"}
              </button>
            )}

            {photoError && (
              <p className="px-3 py-1 text-[11px] text-red-400">{photoError}</p>
            )}
          </div>

          {currentUser?.org && (
            <>
              <div className="h-px bg-[rgba(236,231,221,0.06)]" />
              <div className="p-2 space-y-0.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setLeaveError(null); setOpen(false); setLeaveOpen(true); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#958d7c] transition-all hover:bg-amber-500/10 hover:text-amber-400"
                >
                  <svg className="h-4 w-4 shrink-0 opacity-75" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                  </svg>
                  Leave organization
                </button>
                {leaveError && (
                  <p className="px-3 py-1 text-[11px] text-red-400">{leaveError}</p>
                )}
              </div>
            </>
          )}

          <div className="h-px bg-[rgba(236,231,221,0.06)]" />

          <div className="p-2">
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#958d7c] transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
            >
              <svg className="h-4 w-4 shrink-0 opacity-75" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}

      {leaveOpen && currentUser?.org && (
        <LeaveOrgModal
          orgName={currentUser.org.name}
          orgSlug={currentUser.org.slug}
          memberships={currentUser.memberships}
          activeOrgId={currentUser.orgId}
          onClose={() => setLeaveOpen(false)}
          // On failure the modal closes itself; re-open the dropdown so the inline
          // error (e.g. the last-admin guard) is actually visible to the user.
          onError={(msg) => { setLeaveError(msg); setOpen(true); }}
        />
      )}
    </div>
  );
}
