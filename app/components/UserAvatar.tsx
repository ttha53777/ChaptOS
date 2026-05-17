"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "../hooks/useCurrentUser";

export function UserAvatar() {
  const { user, loading } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on click outside
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

  // Close on Escape
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

  const initial = user?.name?.charAt(0).toUpperCase() ?? "?";

  // Loading skeleton
  if (loading) {
    return (
      <div className="h-8 w-8 rounded-full bg-white/[0.07] animate-pulse shrink-0" />
    );
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-white/[0.08] transition-all hover:ring-indigo-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        aria-label="Open profile menu"
        aria-expanded={open}
      >
        {user?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="h-8 w-8 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-[12px] font-bold text-white shadow-[0_2px_8px_rgba(99,102,241,0.4)]">
            {initial}
          </div>
        )}
      </button>

      {/* Dropdown popover */}
      {open && (
        <div
          className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141925] shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
          role="menu"
        >
          {/* Profile section */}
          <div className="flex items-center gap-3 px-4 py-4">
            {user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={user?.name}
                className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/[0.08]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-[14px] font-bold text-white shadow-[0_2px_8px_rgba(99,102,241,0.4)]">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white">{user?.name}</p>
              {user?.role && (
                <p className="truncate text-[11px] text-slate-500 leading-tight mt-0.5">{user.role}</p>
              )}
              <p className="truncate text-[11px] text-slate-600 mt-0.5">{user?.email}</p>
            </div>
          </div>

          <div className="h-px bg-white/[0.06]" />

          {/* Sign out */}
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
