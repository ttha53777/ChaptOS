import React from "react";
import { Card } from "./primitives";
import { SvgIcon } from "../Sidebar";

export type Announcement = {
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  authorName: string | null;
  updatedAt: string; // ISO
};

const PIN_PATH = "M5 11l5-5 7 7-5 5-7-7zm12 6l4 4M9 7l8 8";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const PLACEHOLDER: Announcement = {
  title: "Welcome to your chapter dashboard",
  body: "Officers can post chapter-wide announcements here. Click the pencil to get started.",
  ctaLabel: null,
  ctaUrl: null,
  authorName: null,
  updatedAt: "",
};

export function AnnouncementCard({
  announcement,
  onEdit,
}: {
  announcement: Announcement | null;
  onEdit: () => void;
}) {
  const a = announcement ?? PLACEHOLDER;
  const isPlaceholder = announcement === null;
  const stamp = a.updatedAt ? relativeTime(a.updatedAt) : "";

  const ambientGlow =
    "radial-gradient(ellipse 50% 80% at 8% 50%, rgba(99,102,241,0.05) 0%, transparent 60%), #10121a";
  const accentGradient =
    "linear-gradient(90deg, transparent 0%, #6366f1 20%, #818cf8 50%, #6366f1 80%, transparent 100%)";

  return (
    <Card style={{ background: ambientGlow }} className="overflow-hidden">
      <div className="h-[2px]" style={{ background: accentGradient }} />
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400"
              aria-hidden
            >
              <SvgIcon d={PIN_PATH} className="h-3.5 w-3.5" />
            </span>
            <h2 className="truncate text-[18px] font-bold text-white">{a.title}</h2>
          </div>
          <p className="line-clamp-3 text-[13px] leading-relaxed text-slate-300">{a.body}</p>
          {!isPlaceholder && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              {a.authorName && <span>Posted by {a.authorName}</span>}
              {a.authorName && stamp && <span aria-hidden>·</span>}
              {stamp && <span>{stamp}</span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
          {a.ctaLabel && a.ctaUrl && (
            <a
              href={a.ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-[12px] font-semibold text-indigo-300 hover:border-indigo-400/60 hover:bg-indigo-500/20 hover:text-indigo-200 transition-colors"
            >
              {a.ctaLabel}
            </a>
          )}
          <button
            onClick={onEdit}
            aria-label="Edit announcement"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-400 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors"
          >
            <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 112.828 2.828L11.828 13.828 9 14l.172-2.828z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16" />
            </svg>
          </button>
        </div>
      </div>
    </Card>
  );
}
