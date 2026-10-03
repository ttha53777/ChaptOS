"use client";

import { useEffect, useRef, useState } from "react";
import { orgInitials } from "@/lib/org-initials";
import { useChapter } from "../context/ChapterContext";
import { SvgIcon } from "./SvgIcon";
import { PaperIcon } from "./paper/PaperIcon";

const ICON_CHEV_UP_DOWN = "M8 9l4-4 4 4m0 6l-4 4-4-4";
const ICON_CHECK = "M5 13l4 4L19 7";
const ICON_PLUS = "M12 4v16m8-8H4";

function OrgLogo({ name, logoUrl, small }: { name: string; logoUrl: string | null; small?: boolean }) {
  return (
    <span className={`sb-logo${small ? " sm" : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logoUrl ? <img src={logoUrl} alt="" /> : name ? orgInitials(name) : null}
    </span>
  );
}

/**
 * The sidebar's org header, which doubles as the org switcher: a popover listing
 * every org you belong to (logo, your title there), plus "Create a new
 * organization". Replaces the native <select> band that only multi-org people saw.
 *
 * Switching = navigating to the target org's URL (/<slug>). The /[slug] layout
 * guard reconciles the active_org_id cookie to the URL, so we don't POST here.
 *
 * We use a HARD navigation (location.assign), not router.push. Next caches and
 * reuses the [slug] layout across navigations that stay within the same layout
 * file — and /lpe → /other is the SAME layout, just a different param. A soft
 * push risks the guard (and its cookie-sync <ActiveOrgSync>) not re-running, so
 * the new org's data would never load. Org switching is rare; correctness over
 * SPA-smoothness here.
 */
export function OrgSwitcher({ termLabel }: { termLabel: string }) {
  const { currentUser } = useChapter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const orgName = currentUser?.org?.name ?? "";
  const logoUrl = currentUser?.org?.logoUrl ?? null;
  const memberships = currentUser?.memberships ?? [];

  return (
    <div ref={ref} style={{ display: "contents" }}>
      <button
        type="button"
        className="sb-org"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={orgName ? `${orgName}, switch organization` : "Switch organization"}
        data-tip={orgName || undefined}
      >
        <OrgLogo name={orgName} logoUrl={logoUrl} />
        <span className="sb-org-txt">
          <span className="sb-org-name">{orgName || " "}</span>
          <span className="sb-org-term">{termLabel}</span>
        </span>
        <SvgIcon d={ICON_CHEV_UP_DOWN} className="i sb-org-chev lg-only" />
        <PaperIcon name="updown" className="i sb-org-chev pp-only" />
      </button>

      {open && currentUser && (
        <div className="sb-pop sb-pop-org" role="menu" aria-label="Your organizations">
          <div className="sb-cap">Your organizations</div>
          <div className="sb-orgs">
            {memberships.map(m => {
              const active = m.organizationId === currentUser.orgId;
              return (
                <button
                  key={m.organizationId}
                  type="button"
                  role="menuitem"
                  className="sb-row"
                  aria-current={active ? "true" : undefined}
                  onClick={() => {
                    setOpen(false);
                    if (!active) window.location.assign(`/${m.orgSlug}`);
                  }}
                >
                  <OrgLogo name={m.orgName} logoUrl={m.orgLogoUrl} small />
                  <span className="sb-row-txt">
                    <span>{m.orgName}</span>
                    <span className="sb-sub">{m.title}</span>
                  </span>
                  {active && <SvgIcon d={ICON_CHECK} className="i sb-chk" />}
                </button>
              );
            })}
          </div>
          <hr className="sb-hr" />
          {/* The /create flow detects the existing session at its Build step and
              skips the Google button. */}
          <button type="button" role="menuitem" className="sb-row" onClick={() => window.location.assign("/create")}>
            <SvgIcon d={ICON_PLUS} className="i" />
            Create a new organization
          </button>
        </div>
      )}
    </div>
  );
}
