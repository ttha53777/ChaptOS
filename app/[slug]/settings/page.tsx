"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Sidebar } from "../../components/Sidebar";
import { useOrgPath } from "../../hooks/useOrgPath";
import { GeneralSection } from "./sections/GeneralSection";
import { ThresholdsSection } from "./sections/ThresholdsSection";
import { SemestersSection } from "./sections/SemestersSection";
import { AccountsSection } from "./sections/AccountsSection";
import { RolesSection } from "./sections/RolesSection";
import { ActivityLogSection } from "./sections/ActivityLogSection";
import { InvitationsSection } from "./sections/InvitationsSection";
import { WorkflowsSection } from "./sections/WorkflowsSection";
import { VocabSection } from "./sections/VocabSection";
import { MemberFieldsSection } from "./sections/MemberFieldsSection";
import { CustomMetricsSection } from "./sections/CustomMetricsSection";
import { useChapter } from "../../context/ChapterContext";
import "../../components/dashboard/dashboard-ledger.css";
import "./settings-ledger.css";

// ─── Nav config ───────────────────────────────────────────────────────────────
// "Index" is the landing hub; every other id maps to a section component. Items
// are grouped by INTENT (Identity / Membership / Operations / System) — the same
// grouping powers the nav and the index landing.

type SectionId =
  | "index"
  | "general" | "vocabulary"
  | "accounts" | "invitations" | "roles" | "member-fields"
  | "thresholds" | "semesters" | "custom-metrics" | "workflows"
  | "activity-log";

type Intent = "Identity" | "Membership" | "Operations" | "System";

// Icon tint hint for the index ledger rows (matches the dusk accent palette).
type Tint = "" | "t-gold" | "t-rose" | "t-sage";

interface NavItem {
  id: Exclude<SectionId, "index">;
  label: string;
  blurb: string;        // one-line index description
  lede: string;         // italic detail-header lede
  group: Intent;
  tint: Tint;
  icon: string;         // heroicons-style path data
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "general", label: "General", group: "Identity", tint: "",
    blurb: "Chapter name, icon, data controls & quick actions.",
    lede: "Your chapter's identity and the controls you reach for most. Changes save to the database — refresh to sync the local view.",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    id: "vocabulary", label: "Vocabulary", group: "Identity", tint: "",
    blurb: "Rename canonical terms to match your org's language.",
    lede: "Swap the platform's default words for the ones your org actually uses. Changes ripple across every page.",
    icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  },
  {
    id: "accounts", label: "Accounts", group: "Membership", tint: "",
    blurb: "Manage brother Google account links.",
    lede: "Link or unlink the Google accounts that let brothers sign in to this org.",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    id: "invitations", label: "Invitations", group: "Membership", tint: "",
    blurb: "Generate and manage org invite links.",
    lede: "Create shareable invite links so new brothers can join this org, and revoke them when you're done.",
    icon: "M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 115.656 5.656l-1.5 1.5",
  },
  {
    id: "roles", label: "Roles", group: "Membership", tint: "",
    blurb: "Permission roles and per-brother assignments.",
    lede: "Define what each role can do, then assign roles to brothers to control access across the app.",
    icon: "M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z",
  },
  {
    id: "member-fields", label: "Member fields", group: "Membership", tint: "",
    blurb: "Define custom per-member data fields.",
    lede: "Add your own fields to every member record — majors, pledge classes, anything your chapter tracks.",
    icon: "M4 6h16M4 10h16M4 14h10",
  },
  {
    id: "thresholds", label: "Thresholds", group: "Operations", tint: "t-gold",
    blurb: "Attendance, GPA and service-hour cutoffs.",
    lede: "The cutoffs that flag a brother as needing attention on the dashboard. Set them once; everything downstream uses these numbers.",
    icon: "M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z",
  },
  {
    id: "semesters", label: "Semesters", group: "Operations", tint: "t-sage",
    blurb: "Create semesters and set the active one.",
    lede: "Manage your reporting periods. The active semester drives the dashboard and every period-scoped metric.",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    id: "custom-metrics", label: "Custom metrics", group: "Operations", tint: "t-sage",
    blurb: "Track org-specific metrics beyond the built-ins.",
    lede: "Define your own tracked numbers when the built-in metrics don't cover what your chapter measures.",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  },
  {
    id: "workflows", label: "Workflows", group: "Operations", tint: "t-gold",
    blurb: "Choose which pages this org shows.",
    lede: "Turn product surfaces on or off for this org. Dashboard, Timeline and Chapter are always available and can't be hidden.",
    icon: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z",
  },
  {
    id: "activity-log", label: "Activity log", group: "System", tint: "",
    blurb: "Audit trail of every change across the app.",
    lede: "A chronological record of every mutation across the app — who did what, and when.",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
];

const INTENT_ORDER: Intent[] = ["Identity", "Membership", "Operations", "System"];
const BY_ID = Object.fromEntries(NAV_ITEMS.map(n => [n.id, n])) as Record<NavItem["id"], NavItem>;

// A "destination" is either the index hub or one of the four intent groups. Each
// group page stacks every (visible) section in that intent on a single scroll.
type Destination = "index" | Intent;

// Heroicon path for each group's sidebar entry.
const GROUP_ICON: Record<Intent, string> = {
  Identity: "M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z",
  Membership: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  Operations: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  System: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
};

// Page-level header for each group page (title + lede). The per-section ledes
// already live on each NAV_ITEM and become the per-block subheads.
const GROUP_TITLE: Record<Intent, string> = {
  Identity: "Identity",
  Membership: "Membership",
  Operations: "Operations",
  System: "System",
};
const GROUP_LEDE: Record<Intent, string> = {
  Identity: "Your chapter's name, language and the controls you reach for most.",
  Membership: "Who belongs to this org — accounts, invites, roles and the data you keep on members.",
  Operations: "The numbers and surfaces that run your chapter — thresholds, periods, metrics and which pages show.",
  System: "The record of everything that's changed across the app.",
};

// Shared icon + chevron primitives ──────────────────────────────────────────────
function PathIcon({ d }: { d: string }) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
function Chevron() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function orgInitials(name: string | undefined | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Org";
  return words.slice(0, 2).map(w => w[0]!.toUpperCase()).join("");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { can, currentUser, brotherList, taskList, partyList } = useChapter();
  const orgPath = useOrgPath();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Settings section nav (.set-nav) drawer — static column at lg+, slide-in drawer
  // on mobile (mirrors the main app Sidebar's open/close behaviour).
  const [navOpen, setNavOpen] = useState(false);
  const [dest, setDest] = useState<Destination>("index");
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  // Permission-gated tabs are hidden from callers who can't use them.
  const canManageRoles    = can("MANAGE_ROLES");
  const canManageSettings = can("MANAGE_SETTINGS");
  const isVisible = useMemo(() => (id: NavItem["id"]) => {
    if (id === "roles")          return canManageRoles;
    if (id === "invitations")    return canManageSettings;
    if (id === "workflows")      return canManageSettings;
    if (id === "vocabulary")     return canManageSettings;
    if (id === "thresholds")     return canManageSettings;
    if (id === "member-fields")  return canManageSettings;
    if (id === "custom-metrics") return canManageSettings;
    return true;
  }, [canManageRoles, canManageSettings]);

  const visibleNavItems = useMemo(() => NAV_ITEMS.filter(n => isVisible(n.id)), [isVisible]);

  // The intent groups that still have at least one visible section for this user.
  const visibleGroups = useMemo(
    () => INTENT_ORDER.filter(g => visibleNavItems.some(n => n.group === g)),
    [visibleNavItems],
  );

  // Defensive: if a permission was lost mid-session, snap a now-empty group back
  // to the index landing.
  useEffect(() => {
    if (dest !== "index" && !visibleGroups.includes(dest)) setDest("index");
  }, [dest, visibleGroups]);

  useEffect(() => {
    if (!statusMsg) return;
    const t = setTimeout(() => setStatusMsg(null), 4000);
    return () => clearTimeout(t);
  }, [statusMsg]);

  useEffect(() => {
    if (!pageError) return;
    const t = setTimeout(() => setPageError(null), 6000);
    return () => clearTimeout(t);
  }, [pageError]);

  function selectDest(d: Destination) {
    setDest(d);
    setSidebarOpen(false);
    setNavOpen(false);
    setFilter("");
  }

  // From the "find a setting" results: open the section's group page, then scroll
  // to that section's anchor once the group page has rendered.
  function selectSection(id: NavItem["id"]) {
    const item = BY_ID[id];
    setDest(item.group);
    setPendingAnchor(`set-${id}`);
    setSidebarOpen(false);
    setNavOpen(false);
    setFilter("");
  }

  // After a group page renders, scroll any pending anchor into view.
  useEffect(() => {
    if (!pendingAnchor) return;
    const el = document.getElementById(pendingAnchor);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingAnchor(null);
  }, [pendingAnchor, dest]);

  // Deep-link support: a ?section=<id> param (e.g. from the dashboard setup
  // checklist) opens that section's group page and scrolls to its anchor on
  // mount, then strips the param so a refresh doesn't re-trigger it. Unknown or
  // not-visible ids are ignored. Read via window.location to avoid wrapping the
  // page in a Suspense boundary for useSearchParams (mirrors the dashboard's
  // welcome-toast param handling).
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("section");
    deepLinkHandledRef.current = true;
    // Match against the real id list (not `id in BY_ID`, which would also accept
    // inherited Object keys like "toString" and set dest to undefined).
    const known = NAV_ITEMS.some(n => n.id === id);
    if (id && known && isVisible(id as NavItem["id"])) {
      selectSection(id as NavItem["id"]);
    }
    if (id) {
      params.delete("section");
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
    // selectSection/isVisible are stable enough for a once-on-mount effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeGroup = dest === "index" ? null : dest;

  // Nav filter — substring match on label or blurb. When the filter is active the
  // rail shows matching *sections* (each jumps to its group page + anchor); when
  // empty the rail shows the four intent *groups*.
  const f = filter.trim().toLowerCase();
  const filterMatches = useMemo(() => {
    if (!f) return [] as NavItem[];
    return visibleNavItems.filter(
      n => n.label.toLowerCase().includes(f) || n.blurb.toLowerCase().includes(f),
    );
  }, [visibleNavItems, f]);

  const logoUrl = currentUser?.org?.logoUrl ?? null;
  const orgName = currentUser?.org?.name ?? "ChaptOS";

  function renderSection(id: NavItem["id"]) {
    const props = { onStatus: setStatusMsg, onError: setPageError };
    switch (id) {
      case "general":        return <GeneralSection {...props} />;
      case "thresholds":     return <ThresholdsSection {...props} />;
      case "semesters":      return <SemestersSection {...props} />;
      case "accounts":       return <AccountsSection {...props} />;
      case "invitations":    return <InvitationsSection {...props} />;
      case "workflows":      return <WorkflowsSection {...props} />;
      case "vocabulary":     return <VocabSection {...props} />;
      case "member-fields":  return <MemberFieldsSection {...props} />;
      case "custom-metrics": return <CustomMetricsSection {...props} />;
      case "roles":          return <RolesSection {...props} />;
      case "activity-log":   return <ActivityLogSection {...props} />;
    }
  }

  return (
    <div className="set-page flex h-screen overflow-hidden bg-[#0f0d0a]">
      {/* Main app (workflow) sidebar. On Settings the page has its own nav column,
          so we hide the main sidebar's static desktop presence (lg:hidden wrapper)
          — it stays available below lg as the hamburger-triggered mobile drawer. */}
      <div className="lg:hidden">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeSection="Settings"
          onNavClick={() => {}}
        />
      </div>

      <div className="flex min-w-0 flex-1 overflow-hidden">

        {/* ── Settings nav: static column at lg+, slide-in drawer below lg ──────
            The drawer mirrors the main app Sidebar — a tap-to-close backdrop and a
            translate-x slide, opened from the toolbar's "Settings" breadcrumb. */}
        {navOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
        )}
        <nav
          aria-label="Settings navigation"
          className={`set-nav set-nav-drawer ${navOpen ? "is-open" : ""}`}
        >
          <div className="set-nav-head">
            <Link href={orgPath("/")} className="set-back-app">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to app
            </Link>
            <div className="kicker">{orgName}</div>
            <h1>Settings</h1>
          </div>
          <label className="set-navfilter">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="FIND A SETTING…"
              aria-label="Filter settings"
            />
          </label>
          <div className="set-navscroll">
            {f ? (
              /* Filter active — flat list of matching sections; each jumps to its
                 group page and scrolls to the section. */
              <div>
                <p className="set-nav-label">Matches</p>
                {filterMatches.length === 0 ? (
                  <p className="set-nav-empty">No settings match “{filter}”.</p>
                ) : (
                  filterMatches.map(item => (
                    <button
                      key={item.id}
                      className="set-nav-item"
                      onClick={() => selectSection(item.id)}
                    >
                      <PathIcon d={item.icon} />
                      {item.label}
                      <span className="dot" />
                    </button>
                  ))
                )}
              </div>
            ) : (
              <>
                <button
                  className={`set-nav-item${dest === "index" ? " active" : ""}`}
                  onClick={() => selectDest("index")}
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  Index
                  <span className="dot" />
                </button>
                <p className="set-nav-label">Sections</p>
                {visibleGroups.map(group => (
                  <button
                    key={group}
                    className={`set-nav-item${dest === group ? " active" : ""}`}
                    onClick={() => selectDest(group)}
                  >
                    <PathIcon d={GROUP_ICON[group]} />
                    {group}
                    <span className="dot" />
                  </button>
                ))}
              </>
            )}
          </div>
        </nav>

        {/* ── Content column ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

          {/* Toolbar: breadcrumb + mobile hamburger. dash-toolbar themes it warm at md+. */}
          <header className="toolbar-frosted dash-toolbar set-toolbar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-[#958d7c] hover:bg-white/[0.07] lg:hidden"
              aria-label="Open menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Open the settings section nav (drawer below lg). */}
            <button
              onClick={() => setNavOpen(true)}
              className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-[#958d7c] hover:bg-white/[0.07] lg:hidden"
              aria-label="Open settings sections"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>

            <nav aria-label="Breadcrumb" className="set-crumb flex min-w-0 items-center gap-2">
              {activeGroup ? (
                <>
                  <button
                    onClick={() => selectDest("index")}
                    className="set-crumb-link font-mono text-[10px] uppercase tracking-[0.14em]"
                  >
                    Settings
                  </button>
                  <svg className="h-3 w-3 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="set-crumb-cur truncate font-serif text-[15px]">{GROUP_TITLE[activeGroup]}</span>
                </>
              ) : (
                <span className="set-crumb-cur font-serif text-[15px]">Index</span>
              )}
            </nav>
          </header>

          {/* Scrollable content — dusk ledger pane */}
          <main className="page-ambient flex-1 overflow-y-auto">
            <div className="dash dash-settings" data-dashboard-theme="dusk">

              {/* Toast */}
              {(pageError || statusMsg) && (
                <div className={`set-toast ${pageError ? "err" : "ok"}`} role="status">
                  {pageError ?? statusMsg}
                </div>
              )}

              {/* ── Index landing ── */}
              {dest === "index" && (
                <>
                  <section className="set-briefing" aria-label="Settings index">
                    <div>
                      <p className="kicker">Configuration</p>
                      <h1>Everything, <em>arranged</em>.</h1>
                      <p className="sub">
                        Your chapter&apos;s identity, membership, operations and system controls —
                        grouped by what you&apos;re trying to do, not where the data lives.
                      </p>
                    </div>
                    <div className="org-strip">
                      {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoUrl} alt="" className="org-mark" />
                      ) : (
                        <div className="org-mark">{orgInitials(orgName)}</div>
                      )}
                      <div>
                        <div className="nm">{orgName}</div>
                        <div className="mt">{brotherList.length} Brothers · {taskList.length} Tasks · {partyList.length} Parties</div>
                      </div>
                    </div>
                  </section>

                  {visibleGroups.map(group => {
                    const items = visibleNavItems.filter(n => n.group === group);
                    return (
                      <React.Fragment key={group}>
                        <button className="grp-label grp-label-btn" onClick={() => selectDest(group)}>
                          {group}
                        </button>
                        <div className="ix-ledger">
                          {items.map(item => (
                            <button key={item.id} className={`ix-row ${item.tint}`} onClick={() => selectSection(item.id)}>
                              <span className="ic"><PathIcon d={item.icon} /></span>
                              <span className="ic-txt">
                                <span className="t">{item.label}</span>
                                <span className="h">{item.blurb}</span>
                              </span>
                              <span className="go"><Chevron /></span>
                            </button>
                          ))}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </>
              )}

              {/* ── Group page — every visible section in this intent, stacked ── */}
              {activeGroup && (
                <div className="set-group-page">
                  <button className="set-back" onClick={() => selectDest("index")}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Index
                  </button>
                  <div className="set-detail-head">
                    <div className="kicker">Settings</div>
                    <h2>{GROUP_TITLE[activeGroup]}</h2>
                    <p className="lede">{GROUP_LEDE[activeGroup]}</p>
                  </div>
                  {visibleNavItems
                    .filter(n => n.group === activeGroup)
                    .map(item => (
                      <section key={item.id} id={`set-${item.id}`} className="set-block">
                        <header className="set-block-head">
                          <span className={`set-block-ic ${item.tint}`}><PathIcon d={item.icon} /></span>
                          <div className="set-block-copy">
                            <h3 className="set-block-title">{item.label}</h3>
                            <p className="set-block-lede">{item.lede}</p>
                          </div>
                        </header>
                        <div className="set-section">
                          {renderSection(item.id)}
                        </div>
                      </section>
                    ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
