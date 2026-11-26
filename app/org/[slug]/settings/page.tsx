"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sidebar, isNavVisible } from "../../../components/Sidebar";
import { useIsOrgAdmin } from "../../../hooks/useIsOrgAdmin";
import { useOrgPath } from "../../../hooks/useOrgPath";
import { orgInitials } from "@/lib/org-initials";
import { IdentitySection } from "./sections/IdentitySection";
import { ThresholdsSection } from "./sections/ThresholdsSection";
import { SemestersSection } from "./sections/SemestersSection";
import { AccountsSection } from "./sections/AccountsSection";
import { RolesSection } from "./sections/RolesSection";
import { ActivityLogSection } from "./sections/ActivityLogSection";
import { InvitationsSection } from "./sections/InvitationsSection";
import { WorkflowsSection } from "./sections/WorkflowsSection";
import { MemberFieldsSection } from "./sections/MemberFieldsSection";
import { CustomMetricsSection } from "./sections/CustomMetricsSection";
import { EventTypesSection } from "./sections/EventTypesSection";
import { EventFieldsSection } from "./sections/EventFieldsSection";
import { TransactionCategoriesSection } from "./sections/TransactionCategoriesSection";
import { OpeningBalanceSection } from "./sections/OpeningBalanceSection";
import { CalendarSubscription } from "../../../components/timeline/CalendarSubscription";
import { useChapter } from "../../../context/ChapterContext";
import { ConfirmDialog } from "../../../components/dashboard/primitives";
import { SettingsDirtyProvider, useSettingsDirty } from "./SettingsDirtyContext";
import {
  BY_ID, DISCARD_COPY, GROUP_LEDE, GROUP_TITLE, INDEX_COPY, INTENT_ORDER, NAV_ITEMS, sectionFromParam, sectionVisible,
  type Intent, type NavItem,
} from "@/lib/settings/nav";
import "../../../components/dashboard/dashboard-ledger.css";
import "./settings-ledger.css";

// ─── Nav config ───────────────────────────────────────────────────────────────
// "Index" is the landing hub; every other id maps to a section component. Items
// are grouped by INTENT (Identity / Membership / Operations / System) — the same
// grouping powers the nav and the index landing. The items, groups, words and
// gates live in lib/settings/nav (shared with the native app).

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

/** One status/error band. Errors interrupt (`alert`); confirmations don't. */
function StatusBand({
  tone, message, onDismiss,
}: {
  tone: "ok" | "err";
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className={`set-toast ${tone}`} role={tone === "err" ? "alert" : "status"}>
      <span className="msg">{message}</span>
      {/* The band auto-clears, but a message you're mid-way through reading
          shouldn't be the only copy of what went wrong — let it be closed on
          purpose rather than only on a timer. */}
      <button type="button" className="x" onClick={onDismiss} aria-label="Dismiss message">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// The page body reads the dirty-tracking context, so the provider has to sit
// above it.
export default function SettingsPage() {
  return (
    <SettingsDirtyProvider>
      <SettingsPageBody />
    </SettingsDirtyProvider>
  );
}

function SettingsPageBody() {
  const { can, currentUser, brotherList, taskList, partyList } = useChapter();
  const orgPath = useOrgPath();
  const router = useRouter();
  const isOrgAdmin = useIsOrgAdmin();
  const dirtyState = useSettingsDirty();
  const anyDirty = dirtyState?.anyDirty ?? false;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Settings section nav (.set-nav) drawer — static column at lg+, slide-in drawer
  // on mobile (mirrors the main app Sidebar's open/close behaviour).
  const [navOpen, setNavOpen] = useState(false);
  // Navigation held back by an unsaved draft, replayed if the user confirms.
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const [dest, setDest] = useState<Destination>("index");
  // A single section opened from the index, the filter or a ?section= link.
  // While set, the group page shows only that section; null shows the whole group.
  const [focusId, setFocusId] = useState<NavItem["id"] | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  // Permission-gated tabs are hidden from callers who can't use them.
  const canManageRoles    = can("MANAGE_ROLES");
  const canManageSettings = can("MANAGE_SETTINGS");
  const canManageTreasury = can("MANAGE_TREASURY");
  const canManageEvents = can("MANAGE_EVENTS");
  // Categories only mean something to an org that keeps books here.
  const hasTreasury = isNavVisible("Treasury", currentUser?.org?.enabledWorkflows ?? []);
  const isVisible = useMemo(() => {
    const gates = { isOrgAdmin, canManageRoles, canManageSettings, canManageTreasury, canManageEvents, hasTreasury };
    return (id: NavItem["id"]) => sectionVisible(id, gates);
  }, [canManageRoles, canManageSettings, canManageTreasury, canManageEvents, hasTreasury, isOrgAdmin]);

  const visibleNavItems = useMemo(() => NAV_ITEMS.filter(n => isVisible(n.id)), [isVisible]);

  // Billing trouble, for the index dot. Server-computed and null for anyone who
  // isn't an org/platform admin — see /api/auth/me.
  const billingAlert = currentUser?.org?.billingAlert ?? null;

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
    if (focusId && !visibleNavItems.some(n => n.id === focusId)) setFocusId(null);
  }, [focusId, visibleNavItems]);

  // ── Settings nav: drawer semantics below lg ────────────────────────────────
  // The same <nav> is a static column at lg+ and a slide-in drawer below it. A
  // closed drawer is only translated off-screen, so without this it stayed in
  // the tab order and in the a11y tree — keyboard users tabbed into an invisible
  // menu. The desktop column must NOT get those attributes, and CSS can't tell
  // us which mode we're in, so we track the breakpoint. Defaulting to `true`
  // means the first paint never hides a nav that turns out to be the column.
  const navRef = useRef<HTMLElement>(null);
  const navTriggerRef = useRef<HTMLButtonElement>(null);
  const [isDesktopNav, setIsDesktopNav] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktopNav(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const navDismissed = !isDesktopNav && !navOpen;

  // Open drawer: Escape closes it, focus moves in, and focus returns to the
  // toolbar trigger on close — matching what the Modal primitive already does.
  useEffect(() => {
    if (!navOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setNavOpen(false);
    }
    document.addEventListener("keydown", onKey);
    navRef.current?.querySelector<HTMLElement>("a, button, input")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      const trigger = navTriggerRef.current;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [navOpen]);

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

  // Every in-page navigation runs through this. When a section is holding an
  // unsaved draft we park the action and raise a confirm instead of silently
  // discarding it; `beforeunload` in SettingsDirtyContext covers leaving the tab.
  function guard(run: () => void) {
    if (anyDirty) {
      // Stored in a state setter, so wrap it — React would otherwise call a bare
      // function argument as a reducer.
      setPendingNav(() => run);
      return;
    }
    run();
  }

  function doSelectDest(d: Destination) {
    setDest(d);
    setFocusId(null);
    setSidebarOpen(false);
    setNavOpen(false);
    setFilter("");
  }
  function selectDest(d: Destination) {
    guard(() => doSelectDest(d));
  }

  // From the index rows, the "find a setting" results or a deep link: open that
  // one section on its own — the rest of its group isn't rendered.
  //
  // An item carrying an href leaves Settings entirely instead — there is no
  // in-page section to scroll to.
  function doSelectSection(id: NavItem["id"]) {
    const item = BY_ID[id];
    if (item.href) {
      router.push(orgPath(item.href));
      return;
    }
    setDest(item.group);
    setFocusId(id);
    setSidebarOpen(false);
    setNavOpen(false);
    setFilter("");
  }
  function selectSection(id: NavItem["id"]) {
    guard(() => doSelectSection(id));
  }

  // Each destination starts at the top of the pane rather than inheriting the
  // previous page's scroll position.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [dest, focusId]);

  // Deep-link support: a ?section=<id> param (e.g. from the dashboard setup
  // checklist) opens that section on its own on mount, then strips the param so a refresh doesn't re-trigger it. Unknown or
  // not-visible ids are ignored. Read via window.location to avoid wrapping the
  // page in a Suspense boundary for useSearchParams (mirrors the dashboard's
  // welcome-toast param handling).
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("section");
    if (!raw) { deepLinkHandledRef.current = true; return; }
    // General and Vocabulary merged into Identity; old links still land there.
    const id = sectionFromParam(raw);

    // Wait for ChapterContext before deciding. Permission bits ride in with
    // currentUser, and until they land `isVisible` reports false for every
    // permission-gated section — so running this on mount silently dropped the
    // deep link for exactly the sections that use it (the dashboard setup
    // checklist's "Invite your members" and the roster's Invite button both
    // point at ?section=invitations, which is MANAGE_SETTINGS-gated).
    if (!currentUser) return;
    deepLinkHandledRef.current = true;

    // sectionFromParam matches the real id list (not `id in BY_ID`, which would
    // also accept inherited Object keys like "toString" and set dest to undefined).
    if (id && isVisible(id)) {
      selectSection(id);
    }
    params.delete("section");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    // selectSection/isVisible are stable enough; currentUser is the readiness gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const activeGroup = dest === "index" ? null : dest;
  // Identity is one section with its own badge and steps, so it gets a page of
  // its own rather than a sheet inside the group/focus layouts.
  const identityPage = activeGroup === "Identity";
  const focusItem = activeGroup && !identityPage && focusId ? BY_ID[focusId] : null;

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
      case "identity":       return <IdentitySection {...props} />;
      case "thresholds":     return <ThresholdsSection {...props} />;
      case "semesters":      return <SemestersSection {...props} />;
      case "accounts":       return <AccountsSection {...props} />;
      case "invitations":    return <InvitationsSection {...props} />;
      case "workflows":      return <WorkflowsSection {...props} />;
      case "member-fields":  return <MemberFieldsSection {...props} />;
      case "custom-metrics": return <CustomMetricsSection {...props} />;
      case "event-types":    return <EventTypesSection {...props} />;
      case "event-fields":   return <EventFieldsSection {...props} />;
      case "calendar":       return <CalendarSubscription settings />;
      case "money-categories": return <TransactionCategoriesSection {...props} />;
      case "opening-balance":  return <OpeningBalanceSection {...props} />;
      case "roles":          return <RolesSection {...props} />;
      case "activity-log":   return <ActivityLogSection {...props} />;
    }
  }

  return (
    <div className="set-page flex h-screen overflow-hidden bg-[color:var(--paper)]">
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
            className="fixed inset-0 z-40 bg-[color:var(--scrim)] lg:hidden"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
        )}
        <nav
          ref={navRef}
          aria-label="Settings navigation"
          aria-hidden={navDismissed || undefined}
          inert={navDismissed || undefined}
          className={`set-nav set-nav-drawer ${navOpen ? "is-open" : ""}`}
        >
          <div className="set-nav-head">
            {/* A button rather than a Link: leaving Settings has to run through
                the unsaved-changes guard, and a client-side Link fires neither
                that nor `beforeunload`. */}
            <button
              type="button"
              onClick={() => guard(() => router.push(orgPath("/")))}
              className="set-back-app"
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to app
            </button>
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
                  aria-current={dest === "index" ? "page" : undefined}
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
                    data-group={group.toLowerCase()}
                    className={`set-nav-item${dest === group ? " active" : ""}`}
                    aria-current={dest === group ? "page" : undefined}
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
          <header className="toolbar-frosted dash-toolbar set-toolbar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(var(--ink-rgb),0.05)] px-4 sm:px-6 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted)] hover:bg-[rgba(var(--ink-rgb),0.07)] lg:hidden"
              aria-label="Open menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Open the settings section nav (drawer below lg). Focus returns
                here when the drawer closes. */}
            <button
              ref={navTriggerRef}
              onClick={() => setNavOpen(true)}
              aria-expanded={navOpen}
              className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted)] hover:bg-[rgba(var(--ink-rgb),0.07)] lg:hidden"
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
                  {focusItem ? (
                    <>
                      <button
                        onClick={() => selectDest(activeGroup)}
                        className="set-crumb-link font-mono text-[10px] uppercase tracking-[0.14em]"
                      >
                        {GROUP_TITLE[activeGroup]}
                      </button>
                      <svg className="h-3 w-3 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="set-crumb-cur truncate font-serif text-[15px]">{focusItem.label}</span>
                    </>
                  ) : (
                    <span className="set-crumb-cur truncate font-serif text-[15px]">{GROUP_TITLE[activeGroup]}</span>
                  )}
                </>
              ) : (
                <span className="set-crumb-cur font-serif text-[15px]">Index</span>
              )}
            </nav>
          </header>

          {/* Scrollable content — dusk ledger pane */}
          <main ref={mainRef} className="page-ambient flex-1 overflow-y-auto">
            <div className="dash dash-settings" data-dashboard-theme="dusk">

              {/* Status band. Sticky (see settings-ledger.css) so a save made
                  three screens down a group page is still confirmed in view, and
                  rendered as two independent slots so a success from one section
                  can't quietly replace a pending error from another. */}
              {pageError && (
                <StatusBand tone="err" message={pageError} onDismiss={() => setPageError(null)} />
              )}
              {statusMsg && (
                <StatusBand tone="ok" message={statusMsg} onDismiss={() => setStatusMsg(null)} />
              )}

              {/* ── Index landing ── */}
              {dest === "index" && (
                <>
                  <section className="set-briefing" aria-label="Settings index">
                    <div>
                      <p className="kicker">{INDEX_COPY.kicker}</p>
                      <h1>{INDEX_COPY.lead}<em>{INDEX_COPY.mark}</em>{INDEX_COPY.tail}</h1>
                      <p className="sub">{INDEX_COPY.sub}</p>
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
                      // The wrapper is inert in Ledger; Paper lays the four out as
                      // tabbed binder dividers (paper-settings.css).
                      <div key={group} className="set-ix-grp" data-group={group.toLowerCase()}>
                        <button className="grp-label grp-label-btn" onClick={() => selectDest(group)}>
                          {group}
                        </button>
                        <div className="ix-ledger">
                          <p className="set-ix-lede">{GROUP_LEDE[group]}</p>
                          {items.map(item => (
                            <button key={item.id} className={`ix-row ${item.tint}`} onClick={() => selectSection(item.id)}>
                              <span className="ic"><PathIcon d={item.icon} /></span>
                              <span className="ic-txt">
                                <span className="t">
                                  {item.label}
                                  {/* Billing is the one section that can be in a
                                      state needing action while nothing on this
                                      page says so. The dot is what makes the
                                      dashboard banner findable from here. */}
                                  {item.id === "billing" && billingAlert && (
                                    <span
                                      className="ix-dot"
                                      role="img"
                                      aria-label="Needs attention"
                                      title="Billing needs attention"
                                    />
                                  )}
                                </span>
                                <span className="h">{item.blurb}</span>
                              </span>
                              <span className="go"><Chevron /></span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* ── Single section — opened from the index, filter or a deep link ── */}
              {focusItem && (
                <section id={`set-${focusItem.id}`} className="set-group-page set-focus-page" data-group={focusItem.group.toLowerCase()}>
                  <button className="set-back" onClick={() => selectDest(focusItem.group)}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    {GROUP_TITLE[focusItem.group]}
                  </button>
                  <div className="set-detail-head">
                    <h2>{focusItem.label}</h2>
                    <p className="lede">{focusItem.lede}</p>
                  </div>
                  <div className="set-section">
                    {focusItem.href
                      ? <Link className="set-linkout" href={orgPath(focusItem.href)}>
                          Open {focusItem.label.toLowerCase()}
                          <Chevron />
                        </Link>
                      : renderSection(focusItem.id)}
                  </div>
                </section>
              )}

              {/* ── Identity — how the chapter looks & talks ── */}
              {identityPage && (
                <div className="set-group-page" data-group="identity">
                  <button className="set-back" onClick={() => selectDest("index")}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Index
                  </button>
                  <div className="set-detail-head">
                    <div className="kicker">Settings</div>
                    <h2>How your chapter looks &amp; talks</h2>
                    <p className="lede">{GROUP_LEDE.Identity}</p>
                  </div>
                  <IdentitySection onStatus={setStatusMsg} onError={setPageError} />
                </div>
              )}

              {/* ── Group page — every visible section in this intent, stacked ── */}
              {activeGroup && !identityPage && !focusItem && (
                <div className="set-group-page" data-group={activeGroup.toLowerCase()}>
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
                          {/* Link-out items (Billing) have no section component —
                              they get a way through instead of an inline panel. */}
                          {item.href
                            ? <Link className="set-linkout" href={orgPath(item.href)}>
                                Open {item.label.toLowerCase()}
                                <Chevron />
                              </Link>
                            : renderSection(item.id)}
                        </div>
                      </section>
                    ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Unsaved draft in the way of a navigation. */}
      {pendingNav && (
        <ConfirmDialog
          title={DISCARD_COPY.title}
          message={DISCARD_COPY.message}
          confirmLabel={DISCARD_COPY.confirmLabel}
          tone="dusk"
          onConfirm={() => {
            const run = pendingNav;
            setPendingNav(null);
            run();
          }}
          onCancel={() => setPendingNav(null)}
        />
      )}
    </div>
  );
}
