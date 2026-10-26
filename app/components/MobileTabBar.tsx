"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useChapter } from "../context/ChapterContext";
import { useOrgPath } from "../hooks/useOrgPath";
import { useVocab } from "../hooks/useVocab";
import { useFeature } from "../hooks/useFeature";
import { visibleQuickActions, type QuickActionKey } from "./dashboard/QuickActionsMenu";
import { PaperIcon, PaperTile, type PaperIconName, type PaperTone } from "./paper/PaperIcon";
import { BottomSheet } from "./BottomSheet";
import "./mobile-shell.css";

/** What the Create sheet can start: the dashboard's quick actions, plus opening
 *  check-in and writing the pinned note. */
export type CreateKey = QuickActionKey | "checkin" | "announcement";

/** Fired on window with detail { key } when Create is picked on the dashboard. */
export const CREATE_EVENT = "chapt:create";
/** Off the dashboard, Create goes home with ?create=<key> and the dashboard runs it. */
export const CREATE_PARAM = "create";

const CREATE_KEYS: readonly string[] = ["expense", "revenue", "excuse", "deadline", "task", "event", "ig", "checkin", "announcement"];
export function isCreateKey(v: unknown): v is CreateKey {
  return typeof v === "string" && CREATE_KEYS.includes(v);
}

const FACE: Partial<Record<CreateKey, { label: string; icon: PaperIconName; tone: PaperTone }>> = {
  event:        { label: "New event",   icon: "cal",       tone: "sky" },
  task:         { label: "Add task",    icon: "box",       tone: "peach" },
  announcement: { label: "Pinned note", icon: "pin",       tone: "butter" },
  expense:      { label: "Log expense", icon: "wallet",    tone: "rose" },
  revenue:      { label: "Log revenue", icon: "cash",      tone: "mint" },
  excuse:       { label: "Log excuse",  icon: "form",      tone: "lilac" },
  ig:           { label: "IG post",     icon: "camera",    tone: "peach" },
};

/**
 * The phone's bottom tab bar (below 768px; hidden by CSS above that): Home,
 * Timeline, Create, the roster and More, which opens the sidebar drawer for
 * every other page. Rendered by Sidebar, so it exists on every org page and
 * nowhere else.
 */
export function MobileTabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const orgPath = useOrgPath();
  const v = useVocab();
  const feature = useFeature();
  const { currentUser, can } = useChapter();
  const [createOpen, setCreateOpen] = useState(false);

  const subPath = (() => {
    if (!pathname) return "/";
    const rest = pathname.replace(/^\/[^/]+/, "");
    return rest === "" ? "/" : rest;
  })();

  const wf = currentUser?.org?.enabledWorkflows;
  // The roster page is the "members" workflow (NAV_WORKFLOW_MAP.Brotherhood);
  // shown while /me is still loading, like the sidebar.
  const showRoster = !wf || wf.includes("members");
  const joins = currentUser?.org?.pendingJoinRequestCount ?? 0;

  const canAttendance = can("MANAGE_ATTENDANCE");
  const actions = visibleQuickActions({
    isAdmin: (currentUser?.isAdmin ?? false) || can("MANAGE_TREASURY") || canAttendance,
    canManageTasks: can("MANAGE_TASKS"),
    enabledWorkflows: wf,
  })
    // "Add deadline" opens the same form as "Add task"; one tile is enough here.
    .map(a => a.key).filter(k => k !== "deadline");
  const keys: CreateKey[] = [
    ...actions.filter(k => k === "event" || k === "task"),
    ...(can("MANAGE_ANNOUNCEMENTS") && feature("operations", "announcement") ? ["announcement" as const] : []),
    ...actions.filter(k => k !== "event" && k !== "task"),
  ];

  function pick(key: CreateKey) {
    setCreateOpen(false);
    if (subPath === "/") {
      window.dispatchEvent(new CustomEvent(CREATE_EVENT, { detail: { key } }));
    } else {
      router.push(`${orgPath("/")}?${CREATE_PARAM}=${key}`);
    }
  }

  const tab = (href: string, label: string, icon: PaperIconName, active: boolean, badge = 0) => (
    <Link href={orgPath(href)} className="mtb-tab" aria-current={active ? "page" : undefined}>
      <span className="mtb-ic"><PaperIcon name={icon} />{badge > 0 && <b className="mtb-badge">{badge > 9 ? "9+" : badge}</b>}</span>
      <span className="mtb-lbl">{label}</span>
    </Link>
  );

  return (
    <>
      <nav className="mtb" aria-label="Main">
        {tab("/", "Home", "home", subPath === "/")}
        {tab("/timeline", "Timeline", "timeline", subPath === "/timeline")}
        <button type="button" className="mtb-create" aria-label="Create" aria-haspopup="dialog" onClick={() => setCreateOpen(true)}>
          <PaperIcon name="plus" />
        </button>
        {showRoster && tab("/brothers", v("Member", true), "people", subPath.startsWith("/brothers"), joins)}
        <button type="button" className="mtb-tab" onClick={onMore} aria-label="More pages">
          <span className="mtb-ic"><PaperIcon name="menu" /></span>
          <span className="mtb-lbl">More</span>
        </button>
      </nav>

      <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Create" icon="plus" tone="lilac" className="mtb-sheet">
        {canAttendance && (
          <button type="button" className="mcr-hero" onClick={() => pick("checkin")}>
            <PaperIcon name="check" />
            <span><b>Open check-in</b><small>Members check themselves in from their phones</small></span>
            <PaperIcon name="arrow-r" />
          </button>
        )}
        <div className="mcr-grid">
          {keys.map(k => {
            const f = FACE[k];
            if (!f) return null;
            return (
              <button key={k} type="button" className="mcr-it" onClick={() => pick(k)}>
                <PaperTile icon={f.icon} tone={f.tone} />
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
