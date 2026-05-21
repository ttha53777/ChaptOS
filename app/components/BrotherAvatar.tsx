"use client";

import { avatarDisplayUrl } from "@/lib/avatar";
import type { Brother } from "../data";

const SIZES = {
  xs: { box: "h-7 w-7", text: "text-[10px]" },
  sm: { box: "h-8 w-8", text: "text-[11px]" },
  md: { box: "h-10 w-10", text: "text-[12px]" },
  lg: { box: "h-9 w-9", text: "text-[12px]" },
} as const;

function brotherInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

export function BrotherAvatar({
  brother,
  selfId = null,
  selfAvatarUrl = null,
  avatarRevision = 0,
  size = "sm",
  ringClassName = "",
  className = "",
}: {
  brother: Pick<Brother, "id" | "name" | "avatarUrl">;
  selfId?: number | null;
  selfAvatarUrl?: string | null;
  avatarRevision?: number;
  size?: keyof typeof SIZES;
  ringClassName?: string;
  className?: string;
}) {
  const isSelf = selfId != null && brother.id === selfId;
  const avatarUrl = isSelf ? (selfAvatarUrl ?? brother.avatarUrl ?? null) : (brother.avatarUrl ?? null);
  const revision = isSelf ? avatarRevision : 0;
  const src = avatarDisplayUrl(avatarUrl, revision);
  const { box, text } = SIZES[size];
  const initials = brotherInitials(brother.name);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={src}
        src={src}
        alt={brother.name}
        className={`${box} shrink-0 rounded-full object-cover ${ringClassName} ${className}`}
        referrerPolicy="no-referrer"
      />
    );
  }

  // No photo — match the original list/drawer initials UI (not the indigo ProfileAvatar pill).
  const styled = ringClassName.trim().length > 0;
  return (
    <div
      className={`flex ${box} shrink-0 items-center justify-center rounded-full font-bold ${
        styled ? ringClassName : `bg-white/[0.06] text-slate-400 ${text}`
      } ${className}`}
    >
      {initials}
    </div>
  );
}
