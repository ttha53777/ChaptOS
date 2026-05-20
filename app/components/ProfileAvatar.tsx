"use client";

import { avatarDisplayUrl } from "@/lib/avatar";

const SIZES = {
  xs: { box: "h-7 w-7", text: "text-[10px]" },
  sm: { box: "h-8 w-8", text: "text-[12px]" },
  md: { box: "h-10 w-10", text: "text-[14px]" },
  lg: { box: "h-9 w-9", text: "text-[12px]" },
} as const;

export function ProfileAvatar({
  name,
  avatarUrl,
  revision = 0,
  size = "sm",
  ringClassName = "",
  className = "",
}: {
  name?: string;
  avatarUrl?: string | null;
  revision?: number;
  size?: keyof typeof SIZES;
  ringClassName?: string;
  className?: string;
}) {
  const initial = name?.charAt(0).toUpperCase() ?? "?";
  const src = avatarDisplayUrl(avatarUrl ?? null, revision);
  const { box, text } = SIZES[size];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={src}
        src={src}
        alt={name ?? "Profile"}
        className={`${box} shrink-0 rounded-full object-cover ${ringClassName} ${className}`}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 ${text} font-bold text-white shadow-[0_2px_8px_rgba(99,102,241,0.4)] ${ringClassName} ${className}`}
    >
      {initial}
    </div>
  );
}
