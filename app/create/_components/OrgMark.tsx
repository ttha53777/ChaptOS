"use client";

/**
 * The org's mark: the uploaded icon when present, else the deterministic
 * gradient monogram (the product's real logo-fallback behavior). With no name
 * and no logo it renders the dashed "empty" placeholder.
 */

import { grad, gradIvory, monogram } from "./flow-state";

export function OrgMark({
  name,
  logoUrl,
  className = "mark",
}: {
  name: string;
  logoUrl?: string;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <span
        className={className}
        // Separate longhands, not the `background` shorthand: the shorthand
        // resets background-size to `auto`, clobbering the stylesheet's `cover`
        // and rendering the image at native size in the corner.
        style={{ backgroundColor: "var(--mark-logo-bg)", backgroundImage: `url(${logoUrl})` }}
        aria-hidden
      />
    );
  }
  const named = !!name.trim();
  if (!named) {
    return <span className={`${className} empty`} aria-hidden>·</span>;
  }
  // Both gradients are emitted; create-flow.css aliases --mk to the themed one,
  // so the mark re-paints on a theme flip without re-rendering.
  const trimmed = name.trim();
  return (
    <span
      className={className}
      style={{
        ["--mk-dusk" as string]: grad(trimmed),
        ["--mk-ivory" as string]: gradIvory(trimmed),
      }}
      aria-hidden
    >
      {monogram(name)}
    </span>
  );
}
