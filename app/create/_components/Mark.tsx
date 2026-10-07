"use client";

/**
 * The org's mark: a tilted paper square with its initials, in a pastel the name
 * picks deterministically — or the uploaded crest. No colour picker, on purpose.
 */

import { Ic, initials, markTones } from "./paper";

export function Mark({ name, logoUrl, className }: { name: string; logoUrl?: string | null; className?: string }) {
  const n = name.trim();
  const { fill, shadow } = markTones(n);
  const cls = `mark${className ? ` ${className}` : ""}`;
  if (logoUrl) {
    return (
      <span className={cls} style={{ ["--mk" as string]: "var(--card)", ["--mks" as string]: `var(--${shadow})` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL, nothing to optimise */}
        <img src={logoUrl} alt="" />
      </span>
    );
  }
  if (!n) {
    return (
      <span className={`${cls} empty`}>
        <Ic name="upload" />
      </span>
    );
  }
  return (
    <span className={cls} style={{ ["--mk" as string]: `var(--${fill})`, ["--mks" as string]: `var(--${shadow})` }}>
      {initials(n)}
    </span>
  );
}
