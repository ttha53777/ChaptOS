"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ProfileAvatar } from "./ProfileAvatar";
import { useCurrentUser } from "../hooks/useCurrentUser";

async function syncAvatarSession() {
  const supabase = createClient();
  await supabase.auth.refreshSession();
}

export function UserAvatar() {
  const { user, loading, avatarRevision, setAvatarUrl } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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

  if (loading) {
    return (
      <div className="h-8 w-8 shrink-0 rounded-full bg-white/[0.07] animate-pulse" />
    );
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handlePhotoFile}
      />

      <button
        onClick={() => setOpen(v => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-white/[0.08] transition-all hover:ring-indigo-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        aria-label="Open profile menu"
        aria-expanded={open}
      >
        <ProfileAvatar
          name={user?.name}
          avatarUrl={user?.avatarUrl}
          revision={avatarRevision}
          size="sm"
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 z-[60] w-64 overflow-hidden rounded-xl border border-white/[0.08] bg-[#10121a] shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
          role="menu"
        >
          <div className="flex items-center gap-3 px-4 py-4">
            <ProfileAvatar
              name={user?.name}
              avatarUrl={user?.avatarUrl}
              revision={avatarRevision}
              size="md"
              ringClassName="ring-2 ring-white/[0.08]"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[13px] font-semibold text-white">{user?.name}</p>
                {user?.isAdmin && (
                  <span
                    className="shrink-0 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-300 ring-1 ring-inset ring-indigo-500/30"
                    title="You have admin permissions"
                  >
                    Admin
                  </span>
                )}
              </div>
              {user?.role && (
                <p className="truncate text-[11px] text-slate-500 leading-tight mt-0.5">{user.role}</p>
              )}
              <p className="truncate text-[11px] text-slate-600 mt-0.5">{user?.email}</p>
            </div>
          </div>

          <div className="h-px bg-white/[0.06]" />

          <div className="p-2 space-y-0.5">
            <button
              type="button"
              disabled={photoBusy}
              role="menuitem"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-400 transition-all hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
            >
              <svg className="h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
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
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-400 transition-all hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
              >
                <svg className="h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                {removing ? "Removing…" : "Remove photo"}
              </button>
            )}

            {photoError && (
              <p className="px-3 py-1 text-[11px] text-red-400">{photoError}</p>
            )}
          </div>

          <div className="h-px bg-white/[0.06]" />

          <div className="p-2">
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-400 transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
            >
              <svg className="h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
