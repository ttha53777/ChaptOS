"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PaperIcon } from "../../../components/paper/PaperIcon";
import { ApiError } from "../../../lib/api";
import { FUNDRAISER_KINDS } from "@/lib/fundraisers";
import type { Fundraiser, FundraiserKind } from "@/lib/api-types/fundraisers";

// Shared pieces of the Fundraisers page, ported from _design/Fundraiser Simple Paper Mock.html.

export { $m, daysFrom, fmtD, dow3, cap1, rel, clock, hours } from "@/lib/fundraising/ledger";
import { $m, JAR, jarCap, jarY, goalClose, jarLabel, dotsOn, LIST } from "@/lib/fundraising/ledger";
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dt(s: string) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }

/** The API's own sentence when it sent one, else a plain fallback. */
export function errorText(e: unknown, fallback: string): string {
  const body = e instanceof ApiError ? (e.body as { error?: unknown } | null) : null;
  return typeof body?.error === "string" ? body.error : fallback;
}

export function Cal({ date, className = "" }: { date: string; className?: string }) {
  const d = dt(date);
  return <span className={`fz-cal ${className}`} aria-hidden="true"><small>{MON3[d.getMonth()]}</small><b>{d.getDate()}</b></span>;
}

export function KindChip({ kind }: { kind: FundraiserKind }) {
  const K = FUNDRAISER_KINDS[kind];
  return <span className={`fz-chip fz-t-${K.hue}`}><PaperIcon name={K.icon} />{K.label}</span>;
}

export function Dots({ f }: { f: Fundraiser }) {
  const n = dotsOn(f);
  return <span className="fz-dots" aria-label={LIST.step(n)}>
    <i className={n >= 1 ? "on" : ""} /><i className={n >= 2 ? "on" : ""} /><i className={n >= 3 ? "on" : ""} />
  </span>;
}

/** The price tag that hangs off a card. Ghost "?" until wrapped. */
export function PriceTag({ made, rt }: { made: number | null; rt: number }) {
  const w = made != null, loss = w && made < 0;
  return <span className={`fz-ptag${w ? (loss ? " loss" : "") : " ghost"}`} style={{ ["--rt" as string]: `${rt}deg` }} aria-hidden="true">
    <svg viewBox="0 0 110 122">
      <path className="str" d="M55 -14C47 -4 63 4 55 22" />
      <path className="body" d="M14 32 55 10l41 22v74a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6Z" /><circle className="hole" cx="55" cy="26" r="4.6" />
      <text className="k" x="55" y="62" textAnchor="middle">{loss ? "SHORT" : "MADE"}</text>
      <text className="v" x="55" y="90" textAnchor="middle">{w ? $m(Math.abs(made)) : "?"}</text>
    </svg>
  </span>;
}

/* ---------- the jar ------------------------------------------------------------
   Butter fills up to what the supplies cost (paying yourself back), mint is
   everything above that line (what you made). If the money never reaches the
   line, the gap is a rose hatch: the honest "short". One dashed line = supplies;
   a lilac one = the goal. Mounts empty, then pours on the next frame. */
const J_TOP = JAR.top, J_H = JAR.h;
const BODY = JAR.body;

export function MoneyJar({ sup, goal, inn, stamp = null, slam = false, className = "" }: {
  sup: number; goal: number | null; inn: number | null;
  stamp?: "WRAPPED" | "SHORT" | null; slam?: boolean; className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [poured, setPoured] = useState(false);
  useEffect(() => {
    let b = 0; const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setPoured(true)); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, []);
  const shown = poured ? inn : null;
  const v = shown ?? 0;
  const cap = jarCap(sup, goal, inn);
  const ty = (x: number) => jarY(x, cap);
  const hide = J_H + 20;
  const at = (y: number, show: boolean) => ({ transform: `translateY(${show ? y : hide}px)` });
  const cls = `lay${poured ? "" : " instant"}`;
  const close = goalClose(sup, goal, cap);
  const coins = <rect x="0" y={J_TOP} width="200" height="200" fill={`url(#fzc${uid})`} className="coins" />;
  return <svg className={`fz-jar ${className}`} viewBox="0 0 200 250" role="img"
    aria-label={jarLabel(sup, inn)}>
    <defs>
      <clipPath id={`fzj${uid}`}><path d={BODY} /></clipPath>
      <pattern id={`fzc${uid}`} width="24" height="15" patternUnits="userSpaceOnUse"><circle cx="6" cy="5" r="4.2" fill="var(--note-ink)" /><circle cx="18" cy="12" r="4.2" fill="var(--note-ink)" /></pattern>
      <pattern id={`fzh${uid}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--rose-soft)" /><path d="M0 0v8" stroke="var(--rose-ink)" strokeWidth="2.2" opacity=".55" /></pattern>
    </defs>
    <path className="glass" d={BODY} />
    <g clipPath={`url(#fzj${uid})`}>
      <g className={cls} style={at(ty(sup), shown != null && v < sup)}><rect x="0" y={J_TOP} width="200" height="200" fill={`url(#fzh${uid})`} /></g>
      <g className={cls} style={at(ty(v), v > sup)}><rect className="f-made" x="0" y={J_TOP} width="200" height="200" />{coins}</g>
      <g className={cls} style={at(ty(Math.min(v, sup)), v > 0)}><rect className="f-sup" x="0" y={J_TOP} width="200" height="200" />{coins}</g>
    </g>
    <path className="glare" d="M44 104v74" /><path className="jbody" d={BODY} />
    <rect className="lid" x="50" y="16" width="100" height="26" rx="6" /><path className="lidl" d="M56 25h88M56 33h88" />
    {sup > 0 && <g className="ln-g" style={{ transform: `translateY(${ty(sup)}px)` }}>
      <line className="ln" x1="16" x2="184" y1={J_TOP} y2={J_TOP} /><text className="lt" x="34" y={J_TOP - 6}>supplies {$m(sup)}</text>
    </g>}
    {!!goal && <g className="ln-g" style={{ transform: `translateY(${ty(goal)}px)` }}>
      <line className="ln goal" x1="16" x2="184" y1={J_TOP} y2={J_TOP} /><text className="lt goal" x="166" textAnchor="end" y={close ? J_TOP + 14 : J_TOP - 6}>goal {$m(goal)}</text>
    </g>}
    {stamp && <g className={`stamp${stamp === "SHORT" ? " loss" : ""}${slam ? " slam" : ""}`}>
      <rect x="96" y="40" width="104" height="32" rx="6" /><text x="148" y="62" textAnchor="middle">{stamp}</text>
    </g>}
  </svg>;
}

/** Count a dollar figure up from zero on mount (skipped for reduced motion). */
export function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(to);
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) { setV(to); return; }
    first.current = false;
    if (!to || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now(), dur = 900; let raf = 0;
    const step = (t: number) => {
      const k = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - k, 3);
      setV(k < 1 ? Math.round(to * e) : to);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{$m(v)}</>;
}

/** The mock's paper burst: pastel bits flung from an element. */
export function burst(el: Element | null) {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect(), cx = r.left + Math.min(r.width, 260) / 2, cy = r.top + r.height / 2;
  const cols = ["--mint", "--butter", "--peach", "--sky", "--lilac", "--rose"];
  const scope = el.closest(".fz-scope") ?? document.body;
  for (let i = 0; i < 34; i++) {
    const b = document.createElement("i"); b.className = "fz-bit";
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 150;
    b.style.cssText = `left:${cx}px;top:${cy}px;background:var(${cols[i % cols.length]});--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 40}px;--r:${Math.random() * 540 - 270}deg`;
    scope.appendChild(b); setTimeout(() => b.remove(), 950);
  }
}
