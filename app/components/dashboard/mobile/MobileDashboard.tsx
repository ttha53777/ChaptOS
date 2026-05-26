"use client";

import { useState } from "react";
import type { Brother, PartyEvent, Deadline, InstagramTask, ActivityEntry, CalendarEvent } from "../../../data";
import type { CurrentUser } from "../../../context/ChapterContext";
import type { Announcement } from "../AnnouncementCard";
import { MobileSummary } from "./MobileSummary";
import { MobileTabBar, type MobileTab } from "./MobileTabBar";
import { MobileOverviewTab } from "./MobileOverviewTab";
import { MobileTasksTab } from "./MobileTasksTab";
import { MobileMoneyTab } from "./MobileMoneyTab";
import { MobileLogsTab } from "./MobileLogsTab";

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
  deadlinesDue: Deadline[];
  igDue: InstagramTask[];
  eventsThisWeek: CalendarEvent[];
  partiesThisWeek: PartyEvent[];
  atRiskCount: number;
}

export interface MobileTasksData {
  weeklyDigest: WeeklyDigest;
  weekRange: { start: string; end: string };
  digestNarration: string | null;
  deadlineList: Deadline[];
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
}

export interface MobileDashboardProps {
  kpis: MobileKpis;
  announcement: Announcement | null;
  onEditAnnouncement: () => void;
  brothersData: MobileBrothersData;
  tasksData: MobileTasksData;
  moneyData: MobileMoneyData;
  actions: MobileActions;
}

export function MobileDashboard(props: MobileDashboardProps) {
  const { kpis, announcement, onEditAnnouncement, brothersData, tasksData, moneyData, actions } = props;
  const [activeTab, setActiveTab] = useState<MobileTab>("Overview");

  return (
    <div className="flex flex-col">
      {/* Sticky summary + tab bar stay glanceable while a tab body scrolls */}
      <div className="page-ambient sticky top-0 z-10 border-b border-white/[0.06]">
        <MobileSummary
          announcement={announcement}
          kpis={kpis}
          onEditAnnouncement={onEditAnnouncement}
          onOpenKpi={actions.setActiveDrawer}
        />
        <MobileTabBar activeTab={activeTab} onChange={setActiveTab} />
      </div>

      <div className="px-4 py-4">
        {activeTab === "Overview" && (
          <MobileOverviewTab tasksData={tasksData} brothersData={brothersData} actions={actions} />
        )}
        {activeTab === "Tasks" && (
          <MobileTasksTab tasksData={tasksData} actions={actions} />
        )}
        {activeTab === "Money" && (
          <MobileMoneyTab moneyData={moneyData} actions={actions} />
        )}
        {activeTab === "Logs" && (
          <MobileLogsTab tasksData={tasksData} actions={actions} />
        )}
      </div>
    </div>
  );
}
