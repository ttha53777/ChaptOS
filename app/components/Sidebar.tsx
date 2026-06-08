"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { WorkflowId } from "@/lib/org-types";
import { useOrgPath } from "../hooks/useOrgPath";
import { useChapter } from "../context/ChapterContext";
import { useVocab } from "../hooks/useVocab";
import { OrgSwitcher } from "./OrgSwitcher";

// ─── Icon paths ───────────────────────────────────────────────────────────────

export const NAV_ICONS: Record<string, string> = {
  Dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  Brotherhood: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  Brothers:    "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  Deadlines: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  Instagram: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  Treasury:  "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  Service:   "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  Events:    "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3",
  Parties:   "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3",
  Timeline:  "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z M9 17h6M9 13h6",
  Chapter:   "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  Docs:      "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  Settings:  "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

// Main nav — Settings is pinned at the bottom of the sidebar
export const NAV = ["Dashboard", "Timeline", "Brotherhood", "Chapter", "Docs", "Instagram", "Treasury", "Service", "Events"];
export const SETTINGS_NAV = "Settings";

const NAV_GROUPS: Array<{ label: string; items: string[] }> = [
  { label: "Overview", items: ["Dashboard", "Timeline"] },
  { label: "Members", items: ["Brotherhood", "Chapter"] },
  { label: "Operations", items: ["Docs", "Instagram", "Service", "Events", "Treasury"] },
];

// Which workflow each nav surface belongs to. A label maps to `null` when it is
// ALWAYS shown regardless of the org's enabled workflows:
//   - Dashboard / Timeline: every org's home + planning surfaces (product rule).
//   - Chapter: backed by the always-on "operations" workflow.
// All other labels are hidden when their workflow isn't in the org's
// enabledWorkflows. The onboarding page picker imports this map so the toggles
// it shows are exactly the surfaces this filter can hide — one source of truth.
export const NAV_WORKFLOW_MAP: Record<string, WorkflowId | null> = {
  Dashboard:   null,
  Timeline:    null,
  Chapter:     null, // "operations" — always on
  Brotherhood: "members",
  Docs:        "docs",
  Instagram:   "communications",
  Treasury:    "finance",
  Service:     "service",
  Events:      "parties",
};

// One-line description of each hideable surface, keyed by nav label. Shown next
// to the toggle in both the post-creation page picker (/[slug]/onboarding) and
// the Workflows settings section, so the two surfaces describe a page the same
// way. Only labels whose workflow is non-null in NAV_WORKFLOW_MAP need an entry;
// the always-on surfaces (Dashboard/Timeline/Chapter) are never toggled.
export const NAV_DESCRIPTIONS: Record<string, string> = {
  Brotherhood: "Member roster, profiles, attendance, and dues.",
  Treasury:    "Budget, transactions, and the running balance.",
  Events:      "Parties and social events with door revenue tracking.",
  Service:     "Service events and per-member service-hour totals.",
  Instagram:   "Plan and track social posts and announcements.",
  Docs:        "Pinned links and shared documents.",
};

/** Returns true when a nav label should render for an org with these workflows.
 *  Always-on labels (map value null) are visible unconditionally. */
export function isNavVisible(label: string, enabledWorkflows: readonly string[]): boolean {
  const wf = NAV_WORKFLOW_MAP[label];
  if (wf == null) return true;
  return enabledWorkflows.includes(wf);
}

// ─── SvgIcon ──────────────────────────────────────────────────────────────────

export function SvgIcon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function navItemClass(isActive: boolean) {
  return `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
    isActive
      ? "bg-gradient-to-r from-indigo-500/15 to-indigo-500/[0.04] text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-inset ring-indigo-500/15"
      : "text-white/45 hover:bg-white/[0.04] hover:text-white/80"
  }`;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ open, onClose, activeSection, onNavClick }: {
  open: boolean;
  onClose: () => void;
  activeSection: string;
  onNavClick: (label: string) => void;
}) {
  const pathname = usePathname();
  const router   = useRouter();
  const orgPath  = useOrgPath();
  const { currentUser } = useChapter();
  const v = useVocab();
  const orgName = currentUser?.org?.name ?? "Operations";
  const logoUrl = currentUser?.org?.logoUrl ?? null;

  // Display labels for vocab-driven nav items. Routing keys (NAV_WORKFLOW_MAP,
  // NAV_ICONS, isStandalone checks) remain the original string — only the
  // rendered text changes.
  const NAV_DISPLAY: Record<string, string> = {
    Brotherhood: v("Member", true),
    Chapter:     v("Meetings"),
    Treasury:    v("Treasury"),
    Service:     v("Service"),
    // Instagram and Events intentionally omitted — they fall back (via
    // NAV_DISPLAY[label] ?? label) to their default nav labels "Instagram" and
    // "Events" rather than the generic "Communications"/"Social".
  };

  // Path *within* the org, i.e. pathname with the leading "/[slug]" segment
  // removed. "/lpe" → "/", "/lpe/treasury" → "/treasury". Active-state checks
  // below compare against this so they're slug-agnostic. We strip by segment
  // (not by the context slug) so it's correct even before /api/auth/me resolves
  // — these links only ever render inside /[slug]/*, so segment 1 is the org.
  const subPath = (() => {
    if (!pathname || pathname === "/") return "/";
    const rest = pathname.replace(/^\/[^/]+/, ""); // drop "/<slug>"
    return rest === "" ? "/" : rest;
  })();

  const semesterLabel = (() => {
    const m = new Date().getMonth(); // 0-based
    const y = new Date().getFullYear();
    return `${m >= 7 ? "Fall" : "Spring"} ${y}`;
  })();

  function goToDashboardSection(label: string) {
    if (subPath !== "/") {
      router.push(orgPath("/"));
      sessionStorage.setItem("scrollTo", label);
    } else {
      onNavClick(label);
    }
    onClose();
  }

  const settingsActive = subPath.startsWith("/settings");

  // Filter nav surfaces by the org's enabled workflows. Until /api/auth/me
  // resolves (currentUser null) we render the FULL nav so there's no flash of a
  // half-empty sidebar; once the org loads we hide the surfaces it disabled.
  // Always-on labels (Dashboard/Timeline/Chapter) survive the filter via
  // isNavVisible's null-workflow rule.
  const enabledWorkflows = currentUser?.org?.enabledWorkflows;
  const visibleNav = enabledWorkflows
    ? NAV.filter(label => isNavVisible(label, enabledWorkflows))
    : NAV;
  const visibleNavSet = new Set(visibleNav);

  function renderNavItem(label: string) {
    const isTimeline    = label === "Timeline";
    const isTreasury    = label === "Treasury";
    const isEvents      = label === "Events";
    const isBrotherhood = label === "Brotherhood";
    const isChapter     = label === "Chapter";
    const isDocs        = label === "Docs";
    const isInstagram   = label === "Instagram";
    const isService     = label === "Service";
    const isStandalone  = isTimeline || isTreasury || isEvents || isBrotherhood || isChapter || isDocs || isInstagram || isService;
    const standaloneSub = isTimeline ? "/timeline" : isTreasury ? "/treasury" : isEvents ? "/parties" : isChapter ? "/chapter" : isDocs ? "/docs" : isInstagram ? "/instagram" : isService ? "/service" : "/brothers";
    const isActive = isTimeline
      ? subPath === "/timeline"
      : isTreasury
        ? subPath.startsWith("/treasury")
        : isEvents
          ? subPath.startsWith("/parties")
          : isBrotherhood
            ? subPath.startsWith("/brothers")
            : isChapter
              ? subPath.startsWith("/chapter")
              : isDocs
                ? subPath.startsWith("/docs")
                : isInstagram
                  ? subPath.startsWith("/instagram")
                  : isService
                    ? subPath.startsWith("/service")
                    : subPath === "/" && activeSection === label;

    const displayLabel = NAV_DISPLAY[label] ?? label;

    if (isStandalone) {
      return (
        <Link
          key={label}
          href={orgPath(standaloneSub)}
          onClick={onClose}
          aria-current={isActive ? "page" : undefined}
          className={navItemClass(isActive)}
        >
          <SvgIcon d={NAV_ICONS[label] ?? ""} className="h-4 w-4 shrink-0 opacity-75" />
          {displayLabel}
          {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" aria-hidden="true" />}
        </Link>
      );
    }

    return (
      <button
        key={label}
        onClick={() => goToDashboardSection(label)}
        aria-current={isActive ? "page" : undefined}
        className={navItemClass(isActive)}
      >
        <SvgIcon d={NAV_ICONS[label] ?? ""} className="h-4 w-4 shrink-0 opacity-75" />
        {displayLabel}
        {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-white/[0.04] bg-[#070a10] transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <Link
          href={orgPath("/")}
          onClick={onClose}
          className="flex h-14 items-center gap-3 border-b border-white/[0.05] px-4 transition-colors hover:bg-white/[0.03]"
          aria-label="Go to dashboard home"
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Org logo" className="h-8 w-8 shrink-0 rounded-lg object-cover shadow-[0_2px_8px_rgba(0,0,0,0.4)]" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-[11px] font-bold text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]">ΛΦΕ</div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold leading-tight text-white">{orgName}</p>
            <p className="text-[10px] leading-tight text-white/35">{semesterLabel}</p>
          </div>
        </Link>
        {currentUser && currentUser.memberships.length > 1 && (
          <div className="border-b border-white/[0.05] px-4 py-2">
            <OrgSwitcher />
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main navigation">
          <div className="space-y-5">
            {NAV_GROUPS.map(group => {
              const items = group.items.filter(label => visibleNavSet.has(label));
              if (items.length === 0) return null;
              const headingId = `sidebar-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;
              return (
                <section key={group.label} aria-labelledby={headingId}>
                  <p id={headingId} className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {items.map(renderNavItem)}
                  </div>
                </section>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-white/[0.05] px-2 py-2">
          <nav aria-label="Settings">
            <Link
              href={orgPath("/settings")}
              onClick={onClose}
              aria-current={settingsActive ? "page" : undefined}
              className={navItemClass(settingsActive)}
            >
              <SvgIcon d={NAV_ICONS[SETTINGS_NAV] ?? ""} className="h-4 w-4 shrink-0 opacity-75" />
              {SETTINGS_NAV}
              {settingsActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" aria-hidden="true" />}
            </Link>
          </nav>
          <button
            onClick={async () => {
              try {
                await fetch("/api/auth/signout", { method: "POST" });
              } catch {
                // Network failure — still redirect so the user isn't stuck
              }
              router.push("/login");
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-white/35 hover:bg-white/[0.04] hover:text-white/60 transition-all duration-150"
          >
            <svg className="h-4 w-4 shrink-0 opacity-75" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
          <p className="px-3 pb-1 pt-2 text-[10px] tracking-wide text-white/25">ChaptOS · v1.0</p>
        </div>
      </aside>
    </>
  );
}
