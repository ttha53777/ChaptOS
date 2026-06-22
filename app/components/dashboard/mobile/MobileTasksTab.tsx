"use client";

import { fmtDate, taskAssigneeLabel } from "../../../data";
import { Card, TaskBadge, TaskUrgencyBadge } from "../primitives";
import type { MobileActions, MobileTasksData } from "./MobileDashboard";

const CAP = 4;

export function MobileTasksTab({ tasksData, actions, igEnabled }: {
  tasksData: MobileTasksData;
  actions: MobileActions;
  igEnabled: boolean;
}) {
  const { deadlineList, igTaskList } = tasksData;
  const activeIgTasks = igTaskList.filter(t => t.status !== "Complete");

  return (
    <div className="space-y-4">
      {/* Deadlines */}
      <Card
        style={{ background: "linear-gradient(to bottom, #818cf810 0%, #10121a 50%)" }}
        className="overflow-hidden transition-colors active:border-white/[0.14]"
        onClick={() => actions.setWidgetDrawer("deadlines")}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <h2 className="text-[13px] font-semibold text-[#ece7dd]">Tasks</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#958d7c]">{deadlineList.length} tasks</span>
            <button onClick={(e) => { e.stopPropagation(); actions.setActiveModal("deadline"); }} className="rounded-md bg-[#a78bfa]/15 px-2 py-0.5 text-[10px] font-semibold text-[#a78bfa] active:bg-[#a78bfa]/25 transition-colors">+ Add</button>
          </div>
        </div>
        <div className="divide-y divide-white/[0.05]">
          {deadlineList.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-[#958d7c]">No tasks yet — tap + Add to create one</p>
          ) : deadlineList.slice(0, CAP).map(d => (
            <div key={d.id} onClick={e => e.stopPropagation()} className="flex items-center gap-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[12px] font-medium ${d.status === "done" ? "line-through text-[#958d7c]" : "text-[#ece7dd]"}`}>{d.title}</p>
                <p className="text-[11px] text-[#958d7c]">{d.dueDate ? fmtDate(d.dueDate) : "No date"} · {taskAssigneeLabel(d, 1)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {d.status !== "done" && (
                  <button onClick={() => actions.completeDeadline(d.id)} title="Mark complete" className="flex h-7 w-7 items-center justify-center rounded active:bg-emerald-500/20 text-[#958d7c] active:text-emerald-400 transition-colors">
                    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </button>
                )}
                <button onClick={() => actions.openEditDeadline(d.id)} title="Edit" className="flex h-7 w-7 items-center justify-center rounded active:bg-[#a78bfa]/20 text-[#958d7c] active:text-[#a78bfa] transition-colors">
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button onClick={() => actions.deleteDeadline(d.id)} title="Delete" className="flex h-7 w-7 items-center justify-center rounded active:bg-red-500/20 text-[#958d7c] active:text-red-400 transition-colors">
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
              <TaskUrgencyBadge task={d} />
            </div>
          ))}
          {deadlineList.length > CAP && (
            <button onClick={() => actions.setWidgetDrawer("deadlines")} className="w-full px-4 py-2.5 text-center text-[11px] font-medium text-[#c9c2b4] active:bg-white/[0.03]">+{deadlineList.length - CAP} more · View all</button>
          )}
        </div>
      </Card>

      {/* Instagram — hidden when communications workflow is off */}
      {igEnabled && <Card
        style={{ background: "linear-gradient(to bottom, #f472b610 0%, #10121a 50%)" }}
        className="overflow-hidden transition-colors active:border-white/[0.14]"
        onClick={() => actions.setWidgetDrawer("instagram")}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <h2 className="text-[13px] font-semibold text-[#ece7dd]">Instagram</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#958d7c]">{activeIgTasks.length} posts</span>
            <button onClick={(e) => { e.stopPropagation(); actions.setActiveModal("ig"); }} className="rounded-md bg-[#a78bfa]/15 px-2 py-0.5 text-[10px] font-semibold text-[#a78bfa] active:bg-[#a78bfa]/25 transition-colors">+ Add</button>
          </div>
        </div>
        <div className="divide-y divide-white/[0.05]">
          {activeIgTasks.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-[#958d7c]">No active IG posts</p>
          ) : activeIgTasks.slice(0, CAP).map(t => (
            <div key={t.id} onClick={e => e.stopPropagation()} className="flex items-center gap-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[12px] font-medium ${t.status === "Complete" ? "line-through text-[#958d7c]" : "text-[#ece7dd]"}`}>{t.title}</p>
                <p className="text-[11px] text-[#958d7c]">{fmtDate(t.dueDate)} · {t.type}</p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {t.status !== "Complete" && (
                  <button onClick={() => actions.completeIG(t.id)} title="Mark complete" className="flex h-7 w-7 items-center justify-center rounded active:bg-emerald-500/20 text-[#958d7c] active:text-emerald-400 transition-colors">
                    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </button>
                )}
                <button onClick={() => actions.openEditIG(t.id)} title="Edit" className="flex h-7 w-7 items-center justify-center rounded active:bg-[#a78bfa]/20 text-[#958d7c] active:text-[#a78bfa] transition-colors">
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button onClick={() => actions.deleteIG(t.id)} title="Delete" className="flex h-7 w-7 items-center justify-center rounded active:bg-red-500/20 text-[#958d7c] active:text-red-400 transition-colors">
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
              <TaskBadge status={t.status} />
            </div>
          ))}
          {activeIgTasks.length > CAP && (
            <button onClick={() => actions.setWidgetDrawer("instagram")} className="w-full px-4 py-2.5 text-center text-[11px] font-medium text-[#c9c2b4] active:bg-white/[0.03]">+{activeIgTasks.length - CAP} more · View all</button>
          )}
        </div>
      </Card>}
    </div>
  );
}
