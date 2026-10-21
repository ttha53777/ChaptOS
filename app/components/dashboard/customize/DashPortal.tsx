"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders Customize mode's overlays (the tray, the number picker) on <body>.
 *
 * The page root (.main-route-transition) carries `will-change: transform`, which
 * makes it the containing block for anything `position: fixed` inside it — the
 * off-canvas tray then widened the scroll area and the page slid sideways. The
 * wrapper re-enters the `.dash` scope so the overlays keep its tokens and
 * styles, and `display: contents` keeps it out of layout.
 */
export function DashPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="dash" data-dashboard-theme="dusk" style={{ display: "contents" }}>{children}</div>,
    document.body,
  );
}
