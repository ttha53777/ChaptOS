"use client";

import { ActivityFeed } from "../widgets";
import type { MobileActions, MobileTasksData } from "./MobileDashboard";

export function MobileLogsTab({ tasksData, actions }: {
  tasksData: MobileTasksData;
  actions: MobileActions;
}) {
  return (
    <ActivityFeed entries={tasksData.activityFeed} onExpand={() => actions.setWidgetDrawer("activity")} />
  );
}
