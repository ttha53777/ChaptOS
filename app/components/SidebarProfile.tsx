"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avatarDisplayUrl } from "@/lib/avatar";
import type { AppThemePref } from "@/lib/theme";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useChapter } from "../context/ChapterContext";
import { useOrgPath } from "../hooks/useOrgPath";
import { useAppTheme } from "../hooks/useAppTheme";
import { leaveOrg } from "../lib/leave-org";
import { SvgIcon } from "./SvgIcon";

const ICONS = {
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  moon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z",
  sun: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
  system: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  userPlus: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z",
  camera: "M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z",
  signOut: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  check: "M5 13l4 4L19 7",
};

const THEME_OPTIONS: { value: AppThemePref; label: string; icon: string }[] = [
  { value: "dusk", label: "Dark", icon: ICONS.moon },
  { value: "ivory", label: "Light", icon: ICONS.sun },
  { value: "system", label: "System", icon: ICONS.system },
];

async function syncAvatarSession() {
  const supabase = createClient();
  await supabase.auth.refreshSession();
}

function initialsOf(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "")).toUpperCase();
}

/**
 * Profile row pinned to the sidebar footer. Opens an upward menu: name + email
 * (hover the avatar to change the photo), Invite people (MANAGE_SETTINGS),
 * Settings, Appearance, Sign out, and a quiet "Leave <org>" link that confirms
 * inline before it acts.
 *
 * `title` is the viewer's office in the active org. `onNavigate` closes the
 * mobile drawer when a link is followed.
 */
export function SidebarProfile({ title, onNavigate }: { title: string; onNavigate?: () => void }) {
  const { user, loading, avatarRevision, setAvatarUrl } = useCurrentUser();
  const { currentUser, can } = useChapter();
  const orgPath = useOrgPath();
  const router = useRouter();
  const { pref: themePref, setPref: setThemePref } = useAppTheme();

  const [open, setOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (!open) { setThemeOpen(false); setConfirmLeave(false); setError(null); }
    setOpen(v => !v);
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch { /* network failure — still redirect */ }
    // Clear the remembered org so the next /login visit starts at the org picker
    // rather than offering one-click re-entry into the org they left.
    try {
      localStorage.removeItem("chaptos_last_org");
    } catch { /* storage unavailable — nothing to clear */ }
    router.push("/login");
  }

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file (PNG, JPG, WebP, etc.)."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Image must be under 2 MB."); return; }

    setError(null);
    setPhotoBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/auth/avatar", { method: "POST", body });
      const data = await res.json().catch(() => ({})) as { avatarUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await syncAvatarSession();
      setAvatarUrl(data.avatarUrl ?? null, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile photo");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleRemovePhoto() {
    setError(null);
    setPhotoBusy(true);
    try {
      const res = await fetch("/api/auth/avatar", { method: "DELETE" });
      const data = await res.json().catch(() => ({})) as { avatarUrl?: string | null; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Remove failed");
      await syncAvatarSession();
      setAvatarUrl(data.avatarUrl ?? null, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove profile photo");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleLeave() {
    if (!currentUser?.org) return;
    setLeaving(true);
    setError(null);
    const msg = await leaveOrg({
      orgSlug: currentUser.org.slug,
      memberships: currentUser.memberships,
      activeOrgId: currentUser.orgId,
    });
    setError(msg);
    setLeaving(false);
    setConfirmLeave(false);
  }

  if (loading) {
    return (
      <div className="sb-me" aria-hidden="true">
        <span className="sb-av" />
        <span className="sb-me-txt"><span className="sb-skel" style={{ display: "block" }} /></span>
      </div>
    );
  }

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? user?.name ?? "";
  const avatarSrc = avatarDisplayUrl(user?.avatarUrl ?? null, avatarRevision);
  const initials = initialsOf(user?.name);
  const orgName = currentUser?.org?.name;
  const dark = themePref !== "ivory";
  const themeLabel = THEME_OPTIONS.find(o => o.value === themePref)?.label ?? "Dark";

  return (
    <div ref={ref} className="sb-me-wrap" style={{ display: "contents" }}>
      <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={handlePhotoFile} />

      <button
        type="button"
        className="sb-me"
        onClick={toggle}
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        data-tip={`${firstName}${title ? ` · ${title}` : ""}`}
      >
        <span className="sb-av">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {avatarSrc ? <img key={avatarSrc} src={avatarSrc} alt="" referrerPolicy="no-referrer" /> : initials}
        </span>
        <span className="sb-me-txt">
          <span className="sb-me-nm">{firstName}</span>
          {title && <span className="sb-me-rl">{title}</span>}
        </span>
      </button>

      {open && (
        <div className="sb-pop sb-pop-me" role="menu" aria-label="Account">
          <div className="sb-pm-id">
            <button
              type="button"
              className="sb-pm-av"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoBusy}
              aria-busy={photoBusy}
              aria-label="Change photo"
              title="Change photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatarSrc ? <img key={avatarSrc} src={avatarSrc} alt="" referrerPolicy="no-referrer" /> : initials}
              <span className="cam"><SvgIcon d={ICONS.camera} className="i" /></span>
            </button>
            <div className="sb-pm-who">
              <div className="sb-pm-nm">{user?.name}</div>
              <div className="sb-pm-em">{user?.email}</div>
              {user?.hasCustomAvatar && (
                <button type="button" className="sb-pm-link" onClick={handleRemovePhoto} disabled={photoBusy}>
                  Remove photo
                </button>
              )}
            </div>
          </div>
          {error && <p className="sb-pm-err" role="alert">{error}</p>}

          <div className="sb-pm-sec">
            {can("MANAGE_SETTINGS") && (
              <Link
                href={orgPath("/settings?section=invitations")}
                role="menuitem"
                className="sb-row"
                onClick={() => { setOpen(false); onNavigate?.(); }}
              >
                <SvgIcon d={ICONS.userPlus} className="i" />Invite people
              </Link>
            )}
            <Link
              href={orgPath("/settings")}
              role="menuitem"
              className="sb-row"
              onClick={() => { setOpen(false); onNavigate?.(); }}
            >
              <SvgIcon d={ICONS.settings} className="i" />Settings
            </Link>
            {themeOpen ? (
              <div role="radiogroup" aria-label="Appearance">
                {THEME_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={themePref === o.value}
                    className="sb-row"
                    onClick={() => { setThemePref(o.value); setThemeOpen(false); }}
                  >
                    <SvgIcon d={o.icon} className="i" />{o.label}
                    {themePref === o.value && <SvgIcon d={ICONS.check} className="i sb-chk" />}
                  </button>
                ))}
              </div>
            ) : (
              <button type="button" role="menuitem" className="sb-row" aria-expanded={false} onClick={() => setThemeOpen(true)}>
                <SvgIcon d={dark ? ICONS.moon : ICONS.sun} className="i" />Appearance
                <span className="sb-val">{themeLabel}</span>
              </button>
            )}
          </div>

          <div className="sb-pm-sec">
            <button type="button" role="menuitem" className="sb-row" onClick={handleSignOut} disabled={signingOut}>
              <SvgIcon d={ICONS.signOut} className="i" />{signingOut ? "Signing out…" : "Sign out"}
            </button>
            {orgName && (confirmLeave ? (
              <div className="sb-pm-confirm" role="alertdialog" aria-label="Leave organization">
                <p>Leave <b>{orgName}</b>? You&apos;ll need a new invite and an officer&apos;s approval to come back.</p>
                <div className="sb-pm-acts">
                  <button type="button" className="cancel" onClick={() => setConfirmLeave(false)} disabled={leaving}>Cancel</button>
                  <button type="button" className="go" onClick={handleLeave} disabled={leaving}>{leaving ? "Leaving…" : "Leave"}</button>
                </div>
              </div>
            ) : (
              <button type="button" className="sb-pm-leave" onClick={() => { setError(null); setConfirmLeave(true); }}>
                Leave {orgName}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
