"use client";

import type { InstagramTask } from "../../data";
import { instagramDate, instagramDays, postedOn, type InstagramLane } from "@/lib/instagram-planner";
import { PaperIcon } from "../../components/paper/PaperIcon";
import { formatKey, InstagramSnapshot } from "./InstagramSnapshot";
export type Lane = InstagramLane;

export function duePill(task: InstagramTask, today: string): { cls: string; label: string } {
  if (task.status === "posted") return { cls: "ok", label: "posted" };
  const diff = instagramDays(task.dueDate, today);
  return diff < 0 ? { cls: "late", label: `${-diff}d late` } : diff === 0 ? { cls: "soon", label: "today" } : { cls: diff <= 7 ? "soon" : "cool", label: `in ${diff}d` };
}
export function InstagramPostCard({ task, lane, today, canManage, selected, fresh, busy, linkedEventTitle, onSelect, onEdit, onDelete, onComplete }: {
  task: InstagramTask; lane: Lane; today: string; canManage: boolean; selected?: boolean; fresh?: boolean; busy?: boolean; linkedEventTitle?: string;
  onSelect: (t: InstagramTask) => void; onEdit: (t: InstagramTask) => void; onDelete: (t: InstagramTask) => void; onComplete: (t: InstagramTask, from: HTMLElement) => void;
}) {
  const pill = duePill(task, today), posted = task.status === "posted";
  return <article id={`igp-post-${task.id}`} className={`igp-row igp-ty-${formatKey(task.type)} igp-ln-${lane}${selected ? " on" : ""}${fresh ? " fresh" : ""}`} aria-busy={busy}>
    <button className="igp-row-open" onClick={() => onSelect(task)} aria-label={`View ${task.title}`}>
      <span className="sn"><InstagramSnapshot type={task.type} developing={!posted} /></span>
      <span className="igp-row-text"><span className="t">{task.title}</span><span className="m">
        <span className="igp-chip"><i />{task.type}</span>
        <span>{posted ? `Posted ${instagramDate(postedOn(task))}` : `Due ${new Date(task.dueDate + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" })}, ${instagramDate(task.dueDate)}`}</span>
        {linkedEventTitle && <span className="igp-ev"><PaperIcon name="cal" />{linkedEventTitle}</span>}
      </span></span>
      <span className={`igp-due ${pill.cls}`}>{pill.label}</span>
    </button>
    {canManage && <div className="igp-acts">
      {!posted && <button className="igp-iconbtn ok" disabled={busy} onClick={e => onComplete(task, e.currentTarget)} aria-label={`Mark ${task.title} posted`} title="Mark posted"><PaperIcon name="check" /></button>}
      <button className="igp-iconbtn" disabled={busy} onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`} title="Edit"><PaperIcon name="pencil" /></button>
      <button className="igp-iconbtn del" disabled={busy} onClick={() => onDelete(task)} aria-label={`Delete ${task.title}`} title="Delete"><PaperIcon name="trash" /></button>
    </div>}
  </article>;
}
