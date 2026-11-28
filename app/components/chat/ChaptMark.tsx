"use client";

/**
 * The Ask Chapt mark: the ChaptOS smile tile with a speech tail, alive.
 * Look and motion: _design/Ask Chapt Talking Tile.html. Plan:
 * docs/ask-chapt-mark-plan.md.
 *
 * One persistent SVG with every state's markup present; a state change only
 * rewrites `data-state` and CSS (chapt-mark.css) eases between poses. Memoized
 * on primitive props so ChatWidget's per-delta re-renders never reach it. The
 * one piece of JS motion, the answering pencil, is Web Animations keyframes
 * sampled once (chapt-mark-path.ts), started on entering `answering` and
 * cancelled on leaving it.
 */

import { memo, useEffect, useId, useRef, type CSSProperties } from "react";
import type { MarkState } from "@/lib/chat/mark-state";
import { PENCIL_CYCLE_MS, PENCIL_REST, WORD_PATHS, pencilKeyframes } from "./chapt-mark-path";
import "./chapt-mark.css";

/** A stable per-instance blink offset within the 5.4s blink, so marks on one
 *  screen don't blink in unison (and no Math.random, so no hydration mismatch). */
function blinkDelay(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return `${-((Math.abs(h) % 540) / 100).toFixed(2)}s`;
}

/** How long a cancelled pencil keeps moving while its CSS fade-out plays. */
const PENCIL_FADE_MS = 220;

export const ChaptMark = memo(function ChaptMark({ state, size, className }: { state: MarkState; size: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const id = useId();

  // The pencil: four animations on one timeline, only while answering.
  useEffect(() => {
    if (state !== "answering") return;
    const svg = ref.current;
    if (!svg || typeof svg.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = svg.querySelector<SVGGElement>(".cmk-pmove");
    const w1 = svg.querySelector<SVGPathElement>(".cmk-w1");
    const w2 = svg.querySelector<SVGPathElement>(".cmk-w2");
    const eyes = svg.querySelector<SVGGElement>(".cmk-drift");
    if (!move || !w1 || !w2 || !eyes) return;
    const k = pencilKeyframes();
    const timing: KeyframeAnimationOptions = { duration: PENCIL_CYCLE_MS, iterations: Infinity, easing: "linear" };
    const anims = [move.animate(k.move, timing), w1.animate(k.w1, timing), w2.animate(k.w2, timing), eyes.animate(k.eyes, timing)];
    // Pin all four to the same start so the tip never drifts off the line.
    const t0 = document.timeline?.currentTime;
    if (t0 != null) for (const a of anims) a.startTime = t0;
    return () => {
      // Keep writing through the CSS fade, then stop.
      setTimeout(() => { for (const a of anims) a.cancel(); }, PENCIL_FADE_MS);
    };
  }, [state]);

  // Dev only: count commits, so a check can assert the mark re-renders per
  // state change and not per streamed delta (scripts/_askmark-shot.ts).
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !ref.current) return;
    const el = ref.current as SVGSVGElement & { __renders?: number };
    el.__renders = (el.__renders ?? 0) + 1;
  });

  return (
    <svg
      ref={ref}
      className={className ? `cmk ${className}` : "cmk"}
      data-state={state}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      focusable="false"
      style={{ "--bd": blinkDelay(id) } as CSSProperties}
    >
      <g className="cmk-pose">
        <g className="cmk-motion">
          <path className="cmk-tile" d="M11.5 3.5h17a9 9 0 0 1 9 9v9.5a9 9 0 0 1-9 9H18.5l-7.2 6v-6.1a9 9 0 0 1-8.8-8.9v-9.5a9 9 0 0 1 9-9z" />
          <g className="cmk-look">
            <g className="cmk-drift">
              <g className="cmk-eye cmk-eye-l">
                <g className="cmk-pupil-wrap"><g className="cmk-blink"><circle className="cmk-pupil" cx="14.6" cy="14.6" r="1.9" /></g></g>
                <path className="cmk-happy" d="M12.5 15.6q2.1-2.6 4.2 0" />
                <path className="cmk-dash" d="M13 14.8h3.2" />
              </g>
              <g className="cmk-eye cmk-eye-r">
                <g className="cmk-pupil-wrap"><g className="cmk-blink"><circle className="cmk-pupil" cx="25.4" cy="14.6" r="1.9" /></g></g>
                <path className="cmk-happy" d="M23.3 15.6q2.1-2.6 4.2 0" />
                <path className="cmk-dash" d="M23.8 14.8h3.2" />
              </g>
              <g className="cmk-mouth">
                <path className="cmk-m-smile" d="M16.9 21.4q3.1 3.3 6.2 0" />
                <g className="cmk-m-o"><ellipse className="cmk-m-o-shape" cx="20" cy="22.2" rx="2.6" ry="2.9" /></g>
                <path className="cmk-m-flat" d="M18.2 22.4h3.6" />
                <path className="cmk-m-wave" d="M16.8 22.6q1.6-1.5 3.2 0t3.2 0" />
              </g>
            </g>
          </g>
        </g>
        <g className="cmk-thought">
          <circle className="cmk-t1" cx="22.6" cy="-1.3" r="1.35" />
          <circle className="cmk-t2" cx="27.3" cy="-1.3" r="1.35" />
          <circle className="cmk-t3" cx="32" cy="-1.3" r="1.35" />
        </g>
        <g className="cmk-script">
          <path className="cmk-w1" pathLength={1} d={WORD_PATHS[0]} />
          <path className="cmk-w2" pathLength={1} d={WORD_PATHS[1]} />
        </g>
        <g className="cmk-pencil">
          <g className="cmk-pmove" transform={PENCIL_REST}>
            <path className="cmk-p-wood" d="M0 0L3.6-1.9V1.9z" />
            <path className="cmk-p-lead" d="M0 0L1.3-.68V.68z" />
            <rect className="cmk-p-body" x="3.6" y="-1.9" width="8.4" height="3.8" />
            <rect className="cmk-p-band" x="12" y="-1.9" width="1.7" height="3.8" />
            <rect className="cmk-p-rub" x="13.7" y="-1.9" width="2.4" height="3.8" rx="1" />
          </g>
        </g>
      </g>
    </svg>
  );
});
