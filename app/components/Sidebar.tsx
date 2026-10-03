"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { WorkflowId } from "@/lib/org-types";
import { NAV_GROUPS, NAV_LABELS, applyNavOrder } from "@/lib/nav-order";
import { useOrgPath } from "../hooks/useOrgPath";
import { orgFetch, requestJson } from "../lib/api";
import { useChapter } from "../context/ChapterContext";
import { useVocab } from "../hooks/useVocab";
import { useNeedsOpen, useSidebarRail } from "../hooks/useSidebarPrefs";
import { OrgSwitcher } from "./OrgSwitcher";
import { SidebarProfile } from "./SidebarProfile";
import { SvgIcon } from "./SvgIcon";
import { PaperIcon, type PaperIconName } from "./paper/PaperIcon";
import { useSemesters } from "../hooks/useActiveSemester";
import { useWrapUpsDue } from "../hooks/useWrapUpsDue";
import "./sidebar.css";

// ─── Icon paths ───────────────────────────────────────────────────────────────

export const NAV_ICONS: Record<string, string> = {
  Dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  Brotherhood: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  Brothers:    "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  Deadlines: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  Tasks:     "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  Instagram: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  Treasury:  "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  Service:   "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  Parties:   "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3",
  Programming: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  Timeline:  "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z M9 17h6M9 13h6",
  Chapter:   "M3 4h18M4 4v10a1 1 0 001 1h14a1 1 0 001-1V4M12 15v4m0 0l-3 2m3-2l3 2M9 9l2 2 4-4",
  Docs:      "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  Settings:  "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

// Main nav — Settings is pinned at the bottom of the sidebar. The flat list and
// the groups now live in lib/nav-order.ts (server-safe) so the org-config
// service and the reorder editor share one source of truth; re-exported here so
// existing importers (onboarding picker, Workflows section) keep working.
export const NAV = NAV_LABELS;
export const SETTINGS_NAV = "Settings";

// Which workflow each nav surface belongs to. A label maps to `null` when it is
// ALWAYS shown regardless of the org's enabled workflows:
//   - Dashboard / Timeline: every org's home + planning surfaces (product rule).
// All other labels are hidden when their workflow isn't in the org's
// enabledWorkflows. Chapter is now the toggleable "meetings" workflow, so an org
// that doesn't hold formal meetings can hide it. The onboarding page picker
// imports this map so the toggles it shows are exactly the surfaces this filter
// can hide — one source of truth.
export const NAV_WORKFLOW_MAP: Record<string, WorkflowId | null> = {
  Dashboard:   null,
  Timeline:    null,
  Chapter:     "meetings",
  Tasks:       "tasks",
  Brotherhood: "members",
  Docs:        "docs",
  Instagram:   "communications",
  Treasury:    "finance",
  Service:     "service",
  Programming: "events",
  Parties:     "parties",
};

// One-line description of each hideable surface, keyed by nav label. Shown next
// to the toggle in both the post-creation page picker (/[slug]/onboarding) and
// the Workflows settings section, so the two surfaces describe a page the same
// way. Only labels whose workflow is non-null in NAV_WORKFLOW_MAP need an entry;
// the always-on surfaces (Dashboard/Timeline) are never toggled.
export const NAV_DESCRIPTIONS: Record<string, string> = {
  Chapter:     "Meeting minutes, agenda, and chapter-wide records.",
  Tasks:       "Hand out tasks and deadlines to members or roles, and track what's done.",
  Brotherhood: "Member roster, profiles, attendance, and dues.",
  Treasury:    "Budget, transactions, and the running balance.",
  Parties:     "Social events with door revenue and wrap-up tracking.",
  Service:     "Service events and per-member service-hour totals.",
  Programming: "Plan programs, socials, fundraisers, and community service.",
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

// Lives in its own module so OrgSwitcher/SidebarProfile can use it without a
// circular import; re-exported because pages import it from here.
export { SvgIcon };

const ICON_INBOX = "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4";
const ICON_COLLAPSE = "M11 19l-7-7 7-7m8 14l-7-7 7-7";

// The Paper aesthetic draws the nav in the mock's doodle glyphs. Both icon sets
// render; app/paper-aesthetic.css shows whichever matches html[data-aesthetic].
const PAPER_NAV_ICONS: Record<string, PaperIconName> = {
  Dashboard: "home", Timeline: "timeline", Brotherhood: "people", Brothers: "people",
  Chapter: "gavel", Tasks: "box", Docs: "folder", Instagram: "camera",
  Programming: "board", Service: "heart", Parties: "note", Treasury: "wallet", Settings: "gear",
};

// Where each standalone nav label routes, within the org. Dashboard is absent:
// it's the in-page section on "/" (scrolled to via onNavClick).
const NAV_ROUTES: Record<string, string> = {
  Timeline:    "/timeline",
  Tasks:       "/tasks",
  Treasury:    "/treasury",
  Parties:     "/parties",
  Programming: "/events",
  Brotherhood: "/brothers",
  Chapter:     "/chapter",
  Docs:        "/docs",
  Instagram:   "/instagram",
  Service:     "/service",
};

type Tone = "vio" | "warn" | "rose";
interface Queue { key: string; n: number; text: string; page: string; href: string; tone: Tone }

/** "Fall 2026 · Wk 6" while today is inside a term-sized period, else just the
 *  label — a year-long period (or one extended past its season) would read
 *  "Wk 40", which tells nobody anything. */
function termLabel(sem: { label: string; startDate: string; endDate: string } | null): string {
  if (!sem) return "";
  const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  const start = day(sem.startDate), end = day(sem.endDate);
  const now = Date.now();
  const WEEK = 7 * 86_400_000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || now < start || now > end + 86_400_000) return sem.label;
  if ((end - start) / WEEK > 26) return sem.label;
  return `${sem.label} · Wk ${Math.floor((now - start) / WEEK) + 1}`;
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
  const { currentUser, reimbursementList, loadedSections, can, setNavOrderLocal } = useChapter();
  const v = useVocab();
  const { rail, setRail } = useSidebarRail();
  const { open: needsOpen, setOpen: setNeedsOpen } = useNeedsOpen();
  const asideRef = useRef<HTMLElement>(null);

  // ── Review queues ("Needs you") ───────────────────────────────────────────
  // Each one is gated on the permission its review endpoint enforces, so the
  // list never advertises work the viewer would get a 403 for.

  // Pending reimbursement tickets. /api/auth/me carries the count so every page
  // doesn't have to fetch the whole list. Where the list IS loaded (the treasury
  // page), derive from it: that page mutates tickets optimistically without a
  // refetch, and the /me count would lag behind.
  const pendingReimbursements = !can("MANAGE_TREASURY") ? 0
    : loadedSections.has("reimbursements")
      ? reimbursementList.filter(r => r.status === "pending").length
      : currentUser?.org?.pendingReimbursementCount ?? 0;

  // People waiting on an officer to let them in. The server already zeroes it
  // for anyone without MANAGE_BROTHERS.
  const pendingJoinRequests = currentUser?.org?.pendingJoinRequestCount ?? 0;

  // Pending excuses. Only MANAGE_ATTENDANCE holders can read the endpoint, so
  // gate the fetch on the perm and treat any failure as zero. Refetch on
  // navigation so the count reflects decisions made on the review queues.
  const canManageAttendance = can("MANAGE_ATTENDANCE");
  const [pendingExcuses, setPendingExcuses] = useState(0);
  useEffect(() => {
    if (!canManageAttendance) { setPendingExcuses(0); return; }
    let cancelled = false;
    orgFetch("/api/excuses/pending-counts")
      .then(r => (r.ok ? r.json() : {}))
      .then((counts: Record<string, number>) => {
        if (cancelled) return;
        setPendingExcuses(Object.values(counts).reduce((a, b) => a + b, 0));
      })
      .catch(() => { if (!cancelled) setPendingExcuses(0); });
    return () => { cancelled = true; };
  }, [canManageAttendance, pathname]);

  // Confirmed events that have already happened and still need a wrap-up.
  // Empty for anyone without MANAGE_EVENTS (gated in the hook and on /me).
  const wrapUps = useWrapUpsDue();

  const { active: activeSemester, loaded: semestersLoaded } = useSemesters(!!currentUser?.org?.slug);
  const term = activeSemester ? termLabel(activeSemester) : semestersLoaded ? "" : " ";

  // Display labels for vocab-driven nav items. Routing keys (NAV_WORKFLOW_MAP,
  // NAV_ICONS, NAV_ROUTES) remain the original string — only the rendered text
  // changes. Instagram and Parties intentionally fall back to their own labels
  // rather than the generic "Communications"/"Social".
  const NAV_DISPLAY: Record<string, string> = {
    Brotherhood: v("Member", true),
    Chapter:     v("Meetings"),
    Treasury:    v("Treasury"),
    Service:     v("Service"),
  };
  const display = (label: string) => NAV_DISPLAY[label] ?? label;

  // Path *within* the org: "/lpe" → "/", "/lpe/treasury" → "/treasury". Strip by
  // segment (not by the context slug) so it's right before /api/auth/me resolves.
  const subPath = (() => {
    if (!pathname || pathname === "/") return "/";
    const rest = pathname.replace(/^\/[^/]+/, "");
    return rest === "" ? "/" : rest;
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

  // Filter nav surfaces by the org's enabled workflows. Until /api/auth/me
  // resolves we render the FULL nav so there's no flash of a half-empty sidebar.
  const enabledWorkflows = currentUser?.org?.enabledWorkflows;
  const visibleNav = enabledWorkflows
    ? NAV.filter(label => isNavVisible(label, enabledWorkflows))
    : NAV;
  const visibleNavSet = new Set(visibleNav);

  // Only queues whose page this org shows — a dot on a hidden page helps nobody.
  const queues: Queue[] = ([
    { key: "join",  n: pendingJoinRequests,   text: pendingJoinRequests === 1 ? "join request" : "join requests", page: "Brotherhood", href: "/brothers#join-requests",       tone: "vio" },
    { key: "excuse", n: pendingExcuses,       text: pendingExcuses === 1 ? "excuse" : "excuses",                  page: "Timeline",    href: "/timeline",                     tone: "warn" },
    // One event: straight into its wrap-up. Several: the board, where each
    // carries its own dot.
    { key: "wrap",  n: wrapUps.length,        text: wrapUps.length === 1 ? "event to wrap up" : "events to wrap up", page: "Programming", href: wrapUps.length === 1 ? `/events?open=${wrapUps[0].id}&wrap=1` : "/events", tone: "rose" },
    { key: "reimb", n: pendingReimbursements, text: pendingReimbursements === 1 ? "reimbursement" : "reimbursements", page: "Treasury", href: "/treasury?tab=Reimbursements", tone: "rose" },
  ] satisfies Queue[]).filter(q => q.n > 0 && visibleNavSet.has(q.page));
  const queueTotal = queues.reduce((a, q) => a + q.n, 0);
  const queuePages = new Set(queues.map(q => q.page));
  const [needsPopTop, setNeedsPopTop] = useState<number | null>(null);
  const showNeedsPop = needsPopTop !== null && rail && queues.length > 0;

  // Admin-chosen sidebar order, applied per-group so reordering stays within
  // each heading. Empty/absent → default order.
  const navOrder = currentUser?.org?.navOrder ?? [];

  // Reordering is an org-wide layout change — gated on org admin (platform admin
  // OR Membership.isOrgAdmin for the active org), the same posture the
  // org-config service enforces server-side.
  const activeMembership = currentUser?.memberships.find(m => m.organizationId === currentUser.orgId);
  const isOrgAdmin = !!currentUser && (currentUser.isAdmin || (activeMembership?.isOrgAdmin ?? false));
  const myTitle = activeMembership?.title ?? currentUser?.role ?? "";

  // ── Drag-to-reorder (org admin only) ──────────────────────────────────────
  // Native HTML5 DnD scoped to one group. On drop we splice the dragged label in
  // front of the target, recompute the FULL flattened order across every group,
  // optimistically patch local state, and PATCH it to persist.
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dragOverLabel, setDragOverLabel] = useState<string | null>(null);
  // Guards against a stale PATCH clobbering a newer one if drops happen quickly.
  const navOrderSaveId = useRef(0);

  function persistNavOrder(nextFullOrder: string[]) {
    setNavOrderLocal(nextFullOrder);
    const myId = ++navOrderSaveId.current;
    requestJson("/api/orgs/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ navOrder: nextFullOrder }),
    }).catch(() => {
      if (navOrderSaveId.current === myId) {
        setNavOrderLocal(currentUser?.org?.navOrder ?? []);
      }
    });
  }

  function handleNavDrop(groupLabel: string, target: string) {
    const from = dragLabel;
    setDragLabel(null);
    setDragOverLabel(null);
    if (!from || from === target) return;
    const fullOrder = NAV_GROUPS.flatMap(g => {
      const ordered = applyNavOrder(g.items, navOrder);
      if (g.label !== groupLabel) return ordered;
      if (!ordered.includes(from) || !ordered.includes(target)) return ordered;
      const next = ordered.filter(l => l !== from);
      next.splice(next.indexOf(target), 0, from);
      return next;
    });
    persistNavOrder(fullOrder);
  }

  // ── Rail: `[` toggles it (desktop only), tooltips name the icons ──────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      setRail(document.documentElement.dataset.sb !== "rail");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setRail]);

  const [tip, setTip] = useState<{ text: string; kbd?: string; x: number; y: number } | null>(null);
  useEffect(() => { if (!rail) setTip(null); }, [rail]);
  function onTipOver(e: React.MouseEvent) {
    if (!rail || !window.matchMedia("(min-width: 1024px)").matches) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
    if (!el || asideRef.current?.querySelector(".sb-pop")) { setTip(null); return; }
    const r = el.getBoundingClientRect();
    setTip({ text: el.dataset.tip ?? "", kbd: el.dataset.tipk, x: r.right + 10, y: r.top + r.height / 2 });
  }

  // Close the rail's Needs popover on outside click / Escape.
  useEffect(() => {
    if (needsPopTop === null) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".sb-pop-needs") && !t.closest(".sb-needs-rail")) setNeedsPopTop(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNeedsPopTop(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [needsPopTop]);

  function renderNavItem(label: string, groupLabel: string) {
    const route = NAV_ROUTES[label];
    const isActive = route
      ? (label === "Timeline" ? subPath === route : subPath.startsWith(route))
      : subPath === "/" && activeSection === label;
    const text = display(label);
    const dot = queuePages.has(label) ? <span className="sb-dot" aria-label="needs review" /> : null;
    const content = (
      <>
        <SvgIcon d={NAV_ICONS[label] ?? ""} className="i lg-only" />
        {PAPER_NAV_ICONS[label] && <PaperIcon name={PAPER_NAV_ICONS[label]} className="i pp-only" />}
        <span className="sb-lbl">{text}</span>
        {dot}
      </>
    );

    const inner = route ? (
      <Link href={orgPath(route)} onClick={onClose} aria-current={isActive ? "page" : undefined} className="sb-item" data-tip={text} draggable={false}>
        {content}
      </Link>
    ) : (
      <button type="button" onClick={() => goToDashboardSection(label)} aria-current={isActive ? "page" : undefined} className="sb-item" data-tip={text} draggable={false}>
        {content}
      </button>
    );

    if (!isOrgAdmin) return <div key={label}>{inner}</div>;

    // Admins get a drag-reorderable wrapper: the whole row is the handle, with a
    // drop-line above the hovered target during a drag.
    const isDropTarget = dragOverLabel === label && dragLabel !== null && dragLabel !== label;
    return (
      <div
        key={label}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", label);
          setDragLabel(label);
          setTip(null);
        }}
        onDragEnd={() => { setDragLabel(null); setDragOverLabel(null); }}
        onDragOver={(e) => {
          if (!dragLabel || dragLabel === label) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOverLabel !== label) setDragOverLabel(label);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverLabel(prev => (prev === label ? null : prev));
          }
        }}
        onDrop={(e) => { e.preventDefault(); handleNavDrop(groupLabel, label); }}
        className={`sb-drag${dragLabel === label ? " dragging" : ""}`}
      >
        {isDropTarget && <span aria-hidden className="sb-drop" />}
        {inner}
      </div>
    );
  }

  const needs = queues.length > 0 && (
    <>
      <section className={`sb-needs${needsOpen ? "" : " closed"}`} aria-label="Needs you">
        <button type="button" className="sb-needs-h" onClick={() => setNeedsOpen(!needsOpen)} aria-expanded={needsOpen} aria-controls="sb-needs-list">
          <SvgIcon d={ICON_INBOX} className="i lg-only" /><PaperIcon name="flag" className="i pp-only" />Needs you
          <span className="sb-needs-end">
            <span className="sb-needs-hint">{needsOpen ? "Hide" : "Show"}</span>
            <span className="sb-needs-stack" aria-hidden="true">
              {queues.map(q => <span key={q.key} className={`sb-tone ${q.tone}`} />)}
            </span>
            <span className="sb-needs-n">{queueTotal}</span>
          </span>
        </button>
        <div className="sb-needs-body">
          <ul id="sb-needs-list">
            {queues.map(q => (
              <li key={q.key}>
                <Link href={orgPath(q.href)} onClick={onClose} className="sb-needs-row" tabIndex={needsOpen ? undefined : -1}>
                  <span className={`sb-num ${q.tone}`}>{q.n}</span>
                  <span className="sb-what">{q.text}</span>
                  <span className="sb-where">{display(q.page)}<span className="arr" aria-hidden="true">→</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <button
        type="button"
        className="sb-item sb-needs-rail"
        data-tip={`Needs you · ${queueTotal}`}
        aria-label={`Needs you, ${queueTotal}`}
        aria-expanded={showNeedsPop}
        onClick={(e) => {
          if (needsPopTop !== null) { setNeedsPopTop(null); return; }
          const top = e.currentTarget.getBoundingClientRect().top - (asideRef.current?.getBoundingClientRect().top ?? 0);
          setTip(null);
          setNeedsPopTop(top);
        }}
      >
        <SvgIcon d={ICON_INBOX} className="i" />
        <span className="sb-dot" />
      </button>
    </>
  );

  return (
    <>
      {open && <div className="sb-scrim" onClick={onClose} />}
      <aside
        ref={asideRef}
        className={`sb${open ? " open" : ""}`}
        aria-label="Sidebar"
        onMouseOver={onTipOver}
        onMouseLeave={() => setTip(null)}
        onClick={() => setTip(null)}
      >
        <OrgSwitcher termLabel={term} />

        <nav className="sb-nav" aria-label="Main navigation">
          {needs}
          {NAV_GROUPS.map(group => {
            const items = applyNavOrder(group.items, navOrder).filter(label => visibleNavSet.has(label));
            if (items.length === 0) return null;
            const headingId = `sidebar-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;
            return (
              <section key={group.label} className="sb-grp" data-grp={group.label} aria-labelledby={headingId}>
                <div className="sb-grp-h"><span id={headingId}>{group.label}</span></div>
                <div className="sb-items">
                  {items.map(label => renderNavItem(label, group.label))}
                </div>
              </section>
            );
          })}
        </nav>

        <div className="sb-foot">
          <SidebarProfile title={myTitle} onNavigate={onClose} />
          <button
            type="button"
            className="sb-iconbtn sb-collapse"
            onClick={() => { setTip(null); setRail(!rail); }}
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
            data-tip={rail ? "Expand" : "Collapse"}
            data-tipk="["
          >
            <SvgIcon d={ICON_COLLAPSE} className="i lg-only" />
            <PaperIcon name="rail" className="i pp-only" />
          </button>
        </div>

        {showNeedsPop && (
          <div className="sb-pop sb-pop-needs" style={{ top: needsPopTop ?? 0 }} role="menu" aria-label="Needs you">
            <div className="sb-cap">Needs you · {queueTotal}</div>
            {queues.map(q => (
              <Link key={q.key} href={orgPath(q.href)} role="menuitem" className="sb-row" onClick={() => setNeedsPopTop(null)}>
                <span className={`sb-tone ${q.tone}`} />
                <span style={{ fontFamily: "var(--font-geist-mono), monospace" }}>{q.n}</span>
                {q.text}
                <span className="sb-sub" style={{ marginLeft: "auto" }}>{display(q.page)}</span>
              </Link>
            ))}
          </div>
        )}
      </aside>
      {tip && (
        <div className="sb-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          {tip.text}{tip.kbd && <span className="k">{tip.kbd}</span>}
        </div>
      )}
    </>
  );
}
