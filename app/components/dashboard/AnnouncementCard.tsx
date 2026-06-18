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
  const hasBody = a.body.trim().length > 0;
  const hasCta = Boolean(a.ctaLabel && a.ctaUrl);
  const hasFooter = !isPlaceholder && (a.authorName || stamp || hasCta);

  const ambientGlow =
    "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(239,68,68,0.05) 0%, transparent 60%), #10121a";
  const accentGradient =
    "linear-gradient(90deg, transparent 0%, #ef4444 20%, #f87171 50%, #ef4444 80%, transparent 100%)";

  return (
    <Card style={{ background: ambientGlow }} className="overflow-hidden">
      <div className="h-[2px]" style={{ background: accentGradient }} />
      <div className="relative px-6 py-5">
        {/* Edit button parks in the top-right so the title can sit dead-center
            without being pushed off-axis by the affordance. */}
        <button
          onClick={onEdit}
          aria-label="Edit announcement"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(236,231,221,0.12)] bg-white/[0.04] text-[#958d7c] hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 transition-colors"
        >
          <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 112.828 2.828L11.828 13.828 9 14l.172-2.828z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16" />
          </svg>
        </button>

        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400"
              aria-hidden
            >
              <SvgIcon d={PIN_PATH} className="h-5 w-5" />
            </span>
            <h2 className="text-[32px] font-bold leading-tight tracking-tight text-[#ece7dd] sm:text-[36px]">
              {a.title}
            </h2>
          </div>

          {hasBody && (
            <p className="max-w-2xl text-[14px] leading-relaxed text-[#c9c2b4]">
              {a.body}
            </p>
          )}

          {hasFooter && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] text-[#958d7c]">
              {a.authorName && <span>Posted by {a.authorName}</span>}
              {a.authorName && stamp && <span aria-hidden>·</span>}
              {stamp && <span>{stamp}</span>}
              {hasCta && (
                <a
                  href={a.ctaUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1 text-[12px] font-semibold text-red-300 hover:border-red-400/60 hover:bg-red-500/20 hover:text-red-200 transition-colors"
                >
                  {a.ctaLabel}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
