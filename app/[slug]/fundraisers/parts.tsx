"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PaperIcon } from "../../components/paper/PaperIcon";
import { ApiError } from "../../lib/api";
import { FUNDRAISER_KINDS, formatDollars } from "@/lib/fundraisers";
import type { Fundraiser, FundraiserKind } from "@/lib/api-types/fundraisers";

// Shared pieces of the Fundraisers page, ported from _design/Fundraiser Simple Paper Mock.html.

export const $m = formatDollars;
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dt(s: string) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
export const daysFrom = (s: string, today: string) => Math.round((dt(s).getTime() - dt(today).getTime()) / 864e5);
export const fmtD = (s: string) => { const d = dt(s); return `${MON3[d.getMonth()]} ${d.getDate()}`; };
export const dow3 = (s: string) => DOW[dt(s).getDay()].slice(0, 3);
export const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function rel(s: string, today: string): string {
  const n = daysFrom(s, today);
  if (n === 0) return "today"; if (n === -1) return "yesterday"; if (n === 1) return "tomorrow";
  if (n < 0 && n > -7) return DOW[dt(s).getDay()];
  if (n > 0 && n < 7) return "this " + DOW[dt(s).getDay()];
  return fmtD(s);
}
/** "14:00" → "2 PM", "09:30" → "9:30 AM". */
export function clock(t: string) {
  const [hs, m] = t.split(":"); let h = Number(hs); const ap = h < 12 ? "AM" : "PM"; h = h % 12 || 12;
  return `${h}${m !== "00" ? ":" + m : ""} ${ap}`;
}
/** A range drops the first AM/PM when both match. */
export function hours(f: Pick<Fundraiser, "startTime" | "endTime">) {
  if (!f.startTime) return "";
  if (!f.endTime) return clock(f.startTime);
  let a = clock(f.startTime); const b = clock(f.endTime);
  if (a.slice(-2) === b.slice(-2)) a = a.slice(0, -3);
  return `${a} – ${b}`;
}

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
  const n = f.wrappedAt ? 3 : f.supplies.length ? 1 : 0;
  return <span className="fz-dots" aria-label={`Step ${Math.min(n + 1, 3)} of 3`}>
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
const J_TOP = 74, J_H = 164;
const BODY = "M56 40h88v10c0 8 30 12 30 40v128c0 12-10 22-22 22H48c-12 0-22-10-22-22V90c0-28 30-32 30-40z";

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
  const cap = Math.max(sup * 2.6, (goal ?? 0) * 1.22, (inn ?? 0) * 1.12, 40);
  const ty = (x: number) => J_H * (1 - Math.min(Math.max(x, 0) / cap, 1.02));
  const hide = J_H + 20;
  const at = (y: number, show: boolean) => ({ transform: `translateY(${show ? y : hide}px)` });
  const cls = `lay${poured ? "" : " instant"}`;
  const close = !!goal && sup > 0 && Math.abs(ty(goal) - ty(sup)) < 15;
  const coins = <rect x="0" y={J_TOP} width="200" height="200" fill={`url(#fzc${uid})`} className="coins" />;
  return <svg className={`fz-jar ${className}`} viewBox="0 0 200 250" role="img"
    aria-label={inn == null ? `Money jar. Supplies line at ${$m(sup)}.` : `Money jar: ${$m(inn)} came in against ${$m(sup)} of supplies.`}>
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
