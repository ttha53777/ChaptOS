"use client";

import { useState } from "react";
import type { Brother, PartyEvent, Task, InstagramTask, ActivityEntry, CalendarEvent, AttentionItem } from "../../../data";
import type { CurrentUser } from "../../../context/ChapterContext";
import type { Announcement } from "../AnnouncementCard";
import type { QuickActionKey } from "../QuickActionsMenu";
import { isNavVisible } from "../../Sidebar";
import { MobileSummary } from "./MobileSummary";
import { MobileTabBar, type MobileTab } from "./MobileTabBar";
import { MobileHomeTab } from "./MobileHomeTab";
import { MobileActivityHub, type ActivityGroup } from "./MobileActivityHub";
import "./mobile-dusk.css";

// String-literal unions kept structurally identical to the (non-exported) types
// in app/page.tsx — TypeScript matches them by shape, so the mobile tree stays
// decoupled from the route file while the setters type-check.
export type KPIDrawerKey = "attendance" | "dues" | "gpa" | "service" | "treasury" | "door";
export type WidgetDrawerKey = "health" | "digest" | "deadlines" | "instagram" | "activity" | "parties";
export type StatusFilter = "All" | "Good" | "Watch" | "At Risk";

export interface MobileHealth {
  score: number;
  label: "Healthy" | "Needs Attention" | "Critical";
  breakdown: Record<string, number>;
}

export interface MobileKpis {
  avgAttendance: number; belowAttCount: number;
  outstandingDues: number; owingCount: number;
  chapterGPA: number; belowGpaCount: number;
  totalServiceHrs: number; onTrackSvc: number; brotherCount: number;
  liveBalance: number; liveProjected: number;
  totalDoorRev: number; bestEvent: PartyEvent | null;
}

export interface MobileBrothersData {
  filteredBrothers: Brother[];
  brotherList: Brother[];
  statusCounts: { Good: number; Watch: number; "At Risk": number };
  search: string;
  statusFilter: string;
  selfId: number | null;
  currentUser: CurrentUser | null;
  avatarRevision: number;
  isAdmin: boolean;
}

export interface WeeklyDigest {
  deadlinesDue: Task[];
  igDue: InstagramTask[];
  eventsThisWeek: CalendarEvent[];
  partiesThisWeek: PartyEvent[];
  atRiskCount: number;
}

export interface MobileTasksData {
  weeklyDigest: WeeklyDigest;
  weekRange: { start: string; end: string };
  digestNarration: string | null;
  deadlineList: Task[];
  igTaskList: InstagramTask[];
  activityFeed: ActivityEntry[];
}

export interface MobileMoneyData {
  liveBalance: number;
  liveProjected: number;
  liveTrend: { month: string; balance: number }[];
  totalDoorRev: number;
  partyList: PartyEvent[];
  partyChartData: { name: string; revenue: number }[];
  statusChartData: { name: string; count: number; fill: string }[];
  svcChartData: { name: string; hours: number }[];
  goodCount: number;
  brotherCount: number;
  onTrackSvc: number;
  serviceHoursGoal: number;
  maxRevenue: number;
  bestEvent: PartyEvent | null;
}

export interface MobileActions {
  setSearch: (v: string) => void;
  setStatusFilter: (v: StatusFilter) => void;
  setSelectedBrotherId: (id: number) => void;
  setActiveDrawer: (k: KPIDrawerKey) => void;
  setWidgetDrawer: (k: WidgetDrawerKey) => void;
  setActiveModal: (m: "deadline" | "ig" | "revenue") => void;
  openPayDues: (b: Brother) => void;
  addServiceHour: (b: Brother, hours?: number) => void;
  completeDeadline: (id: number) => void;
  openEditDeadline: (id: number) => void;
  deleteDeadline: (id: number) => void;
  completeIG: (id: number) => void;
  openEditIG: (id: number) => void;
  deleteIG: (id: number) => void;
  openReimbursements: () => void;
}

export interface MobileDashboardProps {
  firstName: string;
  orgName: string | null;
  health: MobileHealth;
  needsAttention: AttentionItem[];
  kpis: MobileKpis;
  announcement: Announcement | null;
  onEditAnnouncement: () => void;
  brothersData: MobileBrothersData;
  tasksData: MobileTasksData;
  moneyData: MobileMoneyData;
  actions: MobileActions;
  /** Opens the app sidebar drawer (the bottom bar's "More" entry). */
  onOpenSidebar: () => void;
  /** Quick-actions wiring for the header "+" (reuses the existing menu). */
  onQuickAction: (k: QuickActionKey) => void;
  quickActionsAdmin: boolean;
  /** Gates the "Add Deadline" quick action (MANAGE_TASKS). */
  quickActionsCanManageTasks?: boolean;
  enabledWorkflows?: readonly string[];
  /** Opens the signed-in member's own record; absent when they have no roster row. */
  onOpenStanding?: () => void;
}

export function MobileDashboard(props: MobileDashboardProps) {
  const {
    firstName, orgName, health, needsAttention, kpis, announcement, onEditAnnouncement,
    brothersData, tasksData, moneyData, actions,
    onOpenSidebar, onQuickAction, quickActionsAdmin, quickActionsCanManageTasks, enabledWorkflows, onOpenStanding,
  } = props;

  const igEnabled = isNavVisible("Instagram", enabledWorkflows ?? []);

  const [activeTab, setActiveTab] = useState<MobileTab>("Home");
  // Inner drill state for the Activity hub: null = the card menu, else the
  // chosen group's full view. Reset whenever you leave/re-enter the tab.
  const [activeGroup, setActiveGroup] = useState<ActivityGroup | null>(null);

  function handleTabChange(t: MobileTab) {
    // Re-tapping Activity while inside a group returns to the hub menu.
    if (t === "Activity" && activeTab === "Activity") setActiveGroup(null);
    setActiveTab(t);
  }

  return (
    <div className="dash-mobile flex min-h-screen flex-col">
      {/* Sticky summary stays glanceable while the tab body scrolls. pt-safe pads
          past the iOS notch so the greeting isn't clipped under the system bar.
          Only the Home tab carries the rich header; the Activity hub owns its
          own simple title/back affordance. */}
      {activeTab === "Home" && (
        <div className="dm-ambient sticky top-0 z-10 border-b border-[var(--line-soft)] pt-safe">
          <MobileSummary
            firstName={firstName}
            orgName={orgName}
            announcement={announcement}
            kpis={kpis}
            onEditAnnouncement={onEditAnnouncement}
            onOpenKpi={actions.setActiveDrawer}
            isAdmin={quickActionsAdmin}
            canManageTasks={quickActionsCanManageTasks}
            onQuickAction={onQuickAction}
            enabledWorkflows={enabledWorkflows}
            onOpenStanding={onOpenStanding}
          />
        </div>
      )}

      {/* pb-28 keeps the last row clear of the fixed bottom tab bar. On the
          Activity tab there's no sticky header, so pad past the notch here. */}
      <div className={`px-4 py-4 pb-28 ${activeTab === "Home" ? "" : "pt-safe"}`}>
        {activeTab === "Home" && (
          <MobileHomeTab health={health} needsAttention={needsAttention} tasksData={tasksData} actions={actions} igEnabled={igEnabled} />
        )}
        {activeTab === "Activity" && (
          <MobileActivityHub
            activeGroup={activeGroup}
            onSelectGroup={setActiveGroup}
            onBack={() => setActiveGroup(null)}
            tasksData={tasksData}
            moneyData={moneyData}
            brothersData={brothersData}
            actions={actions}
            igEnabled={igEnabled}
          />
        )}
      </div>

      <MobileTabBar activeTab={activeTab} onChange={handleTabChange} onMore={onOpenSidebar} />
    </div>
  );
}
