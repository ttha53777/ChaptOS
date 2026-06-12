"use client";

// Motion primitives for the landing page: scroll parallax and pointer tilt.
// Both are decoration-only and disable themselves under prefers-reduced-motion,
// on touch-only devices (tilt), or when JS never hydrates (elements simply
// stay static — no content depends on these transforms).
import { useEffect, useRef, type ReactNode } from "react";

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Translates its content vertically as the page scrolls, proportional to the
 * element's distance from the viewport center. The OUTER div is measured (it
 * never transforms, so layout queries stay stable); the inner div moves.
 * speed > 0 drifts with the scroll (appears closer), < 0 against it.
 */
export function Parallax({
  speed = 0.15,
  className = "",
  children,
}: {
  speed?: number;
  className?: string;
  children: ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const o = outer.current;
    const el = inner.current;
    if (!o || !el || reducedMotion()) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = o.getBoundingClientRect();
      const mid = r.top + r.height / 2 - window.innerHeight / 2;
      el.style.transform = `translate3d(0, ${(-mid * speed).toFixed(1)}px, 0)`;
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue, { passive: true });
    return () => {
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [speed]);

  return (
    <div ref={outer} className={className}>
      <div ref={inner} style={{ willChange: "transform" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Pointer-tracking 3D tilt (max `max` degrees) with rAF lerp so the motion
 * feels weighted rather than glued to the cursor. Hover-capable pointers only.
 */
export function Tilt({
  max = 4,
  className = "",
  children,
}: {
  max?: number;
  className?: string;
  children: ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const o = outer.current;
    const el = inner.current;
    if (!o || !el) return;
    if (reducedMotion() || !window.matchMedia("(hover: hover)").matches) return;

    let raf = 0;
    let tx = 0, ty = 0; // target rotation
    let cx = 0, cy = 0; // current rotation

    const tick = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      el.style.transform = `rotateX(${cx.toFixed(2)}deg) rotateY(${cy.toFixed(2)}deg)`;
      if (Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      const r = o.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      ty = px * max * 2;
      tx = -py * max * 2;
      start();
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      start();
    };
    o.addEventListener("pointermove", onMove);
    o.addEventListener("pointerleave", onLeave);
    return () => {
      o.removeEventListener("pointermove", onMove);
      o.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [max]);

  return (
    <div ref={outer} className={className} style={{ perspective: "1400px" }}>
      <div ref={inner} style={{ willChange: "transform", transformStyle: "preserve-3d" }}>
        {children}
      </div>
    </div>
  );
}
