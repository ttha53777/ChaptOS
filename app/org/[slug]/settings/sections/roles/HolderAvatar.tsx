import React from "react";
import { avatarDisplayUrl } from "@/lib/avatar";

const TONES = ["peach", "sky", "mint", "butter", "lilac", "rose"] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** The pastel initial disc, or the member's photo when they have one. */
export function HolderAvatar({ id, name, url, size = 30 }: { id: number; name: string; url: string | null; size?: number }) {
  const src = avatarDisplayUrl(url, 0);
  const style = { "--sz": `${size}px`, "--av": `var(--pp-${TONES[Math.abs(id) % TONES.length]})` } as React.CSSProperties;
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="rp-av" style={style} src={src} alt="" referrerPolicy="no-referrer" />
    : <span className="rp-av" style={style} aria-hidden>{initials(name)}</span>;
}
