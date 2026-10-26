"use client";

import React, { useEffect, useRef, useState } from "react";
import { PaperTile, type PaperIconName, type PaperTone } from "./paper/PaperIcon";
import "./mobile-shell.css";

/**
 * A phone bottom sheet: slides up over a scrim, drags down to close (from the
 * grabber or the header), closes on Escape or a scrim tap.
 *
 * Rendered in place, not portalled. Every page root (.main-route-transition)
 * carries a transform, so a fixed sheet inside it is laid out against the page
 * root, which is the viewport, and it stacks with the page's own modals and
 * drawers: a modal opened from inside the sheet lands on top of it, where a
 * body-level sheet would have covered it. Rendering it inside `.dash` also
 * keeps the dashboard card styles on whatever it holds.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  icon,
  tone = "butter",
  tall,
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: PaperIconName;
  tone?: PaperTone;
  /** Fixed at 88% of the screen instead of hugging its content. */
  tall?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  // Stay mounted through the slide-down, then unmount.
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number; t0: number } | null>(null);
  // Callers pass an inline onClose; reading it through a ref keeps the effect
  // below from re-running (and re-grabbing focus) on every parent render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames: the first paints it off-screen, the second slides it in.
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [open]);

  // While a sheet is up, the floating Ask Chapt launcher and the live check-in
  // bar (both on <body>, so above anything in the page) step aside.
  useEffect(() => {
    if (!open) return;
    const el = document.documentElement;
    el.dataset.sheet = "1";
    return () => { delete el.dataset.sheet; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => sheetRef.current?.focus({ preventScroll: true }), 60);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); } };
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); prev?.focus?.({ preventScroll: true }); };
  }, [open]);

  if (!mounted) return null;

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { y0: e.clientY, dy: 0, t0: e.timeStamp };
    e.currentTarget.setPointerCapture(e.pointerId);
    sheetRef.current?.classList.add("dragging");
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !sheetRef.current) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    sheetRef.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    const el = sheetRef.current;
    if (!d || !el) return;
    el.classList.remove("dragging");
    el.style.transform = "";
    // A long drag, or a short flick, closes it.
    const fast = d.dy / Math.max(1, e.timeStamp - d.t0) > 0.6;
    if (d.dy > 110 || (fast && d.dy > 30)) onClose();
  };

  return (
    <div className={`bsheet-layer${shown ? " open" : ""}`}>
      <div className="bsheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={`bsheet${tall ? " tall" : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="bsheet-drag" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="bsheet-grab" aria-hidden="true" />
          <div className="bsheet-h">
            {icon && <PaperTile icon={icon} tone={tone} />}
            <h2>{title}</h2>
            <button type="button" className="bsheet-x" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>
        <div className="bsheet-b">{children}</div>
      </div>
    </div>
  );
}
