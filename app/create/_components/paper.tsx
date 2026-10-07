"use client";

/**
 * Display helpers for the paper /create flow (_design/Org Creation Paper Mock.html):
 * the pastel tones, the org's deterministic mark, the page list the charter
 * shows, and the transcript's two-character markup. Presentation only — what
 * gets built is decided by the draft and lib/onboarding.
 */

import type { ReactNode } from "react";
import { PaperIcon, type PaperIconName } from "@/app/components/paper/PaperIcon";
import type { Draft } from "@/lib/onboarding/draft";
import type { PermAreaId } from "@/lib/onboarding/perm-areas";
import type { WorkflowId } from "@/lib/org-types";
import { draftVocab } from "./flow-state";

export const TONES = ["butter", "mint", "sky", "rose", "lilac", "peach"] as const;
export type Tone = (typeof TONES)[number];

/** A glyph from the shared paper sprite, sized by the flow's `.ic` rule. */
export function Ic({ name, className }: { name: PaperIconName; className?: string }) {
  return <PaperIcon name={name} className={className ? `ic ${className}` : "ic"} />;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The org mark's paper colour, stable for a name, and its offset-shadow partner. */
export function markTones(name: string): { fill: Tone; shadow: Tone } {
  const fill = TONES[hash(name.trim().toLowerCase() || "x") % TONES.length]!;
  return { fill, shadow: TONES[(TONES.indexOf(fill) + 3) % TONES.length]! };
}

export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  if (w.length === 1) return w[0]!.slice(0, 2).toUpperCase();
  return (w[0]![0]! + w[w.length - 1]![0]!).toUpperCase();
}

/**
 * A seat's paper tone. Seats persist a hex (Role.color, read by the dashboard),
 * so the paper look maps the template palette onto its pastels rather than
 * changing what gets stored; anything off-palette falls back by position.
 */
const SEAT_TONE: Record<string, Tone> = {
  "#f59e0b": "butter",
  "#10b981": "mint",
  "#ec4899": "rose",
  "#3b82f6": "sky",
  "#8b5cf6": "lilac",
};
export function seatTone(color: string, index: number): Tone {
  return SEAT_TONE[color.toLowerCase()] ?? TONES[index % TONES.length]!;
}

/** The six ability stickers, in the mock's words. */
export const AREA_META: Record<PermAreaId, { label: string; icon: PaperIconName; tone: Tone; can: string }> = {
  money:    { label: "Money",    icon: "wallet",    tone: "butter", can: "log dues & payments" },
  people:   { label: "People",   icon: "people",    tone: "sky",    can: "edit the roster, roles & invites" },
  meetings: { label: "Meetings", icon: "gavel",     tone: "lilac",  can: "take attendance & run the term" },
  events:   { label: "Events",   icon: "board",     tone: "rose",   can: "plan events & parties" },
  comms:    { label: "Comms",    icon: "megaphone", tone: "peach",  can: "post announcements & Instagram" },
  content:  { label: "Content",  icon: "folder",    tone: "mint",   can: "manage docs, tasks, polls & service" },
};

export interface PageRow {
  id: WorkflowId | "dashboard" | "timeline";
  label: string;
  icon: PaperIconName;
  /** Always in the sidebar — Dashboard, Timeline and the roster. */
  lock: boolean;
  /** Sidebar group: 0 overview, 1 members, 2 operations. */
  group: 0 | 1 | 2;
}

/** Every page the sidebar can show, labelled the way the real sidebar will. */
export function pageRows(draft: Draft): PageRow[] {
  return [
    { id: "dashboard",      label: "Dashboard",                           icon: "home",     lock: true,  group: 0 },
    { id: "timeline",       label: "Timeline",                            icon: "timeline", lock: true,  group: 0 },
    { id: "members",        label: draftVocab(draft, "Member", true),     icon: "people",   lock: true,  group: 1 },
    { id: "meetings",       label: draftVocab(draft, "Meetings"),         icon: "gavel",    lock: false, group: 1 },
    { id: "tasks",          label: "Tasks",                               icon: "box",      lock: false, group: 1 },
    { id: "docs",           label: "Docs",                                icon: "folder",   lock: false, group: 2 },
    { id: "communications", label: "Instagram",                           icon: "camera",   lock: false, group: 2 },
    { id: "events",         label: "Programming",                         icon: "board",    lock: false, group: 2 },
    { id: "service",        label: draftVocab(draft, "Service"),          icon: "heart",    lock: false, group: 2 },
    { id: "parties",        label: "Parties",                             icon: "note",     lock: false, group: 2 },
    { id: "finance",        label: draftVocab(draft, "Treasury"),         icon: "wallet",   lock: false, group: 2 },
  ];
}

export function pageOn(draft: Draft, row: PageRow): boolean {
  return row.lock || draft.enabledWorkflows.includes(row.id as WorkflowId);
}

export function pagesOn(draft: Draft): PageRow[] {
  return pageRows(draft).filter(p => pageOn(draft, p));
}

/* ─── Transcript markup ──────────────────────────────────────────────────────
   Thread lines are stored in localStorage, so they never carry HTML. Two
   control characters are the only markup: B toggles bold, E toggles emphasis. */

export const B = "\u0001";
export const E = "\u0002";

/** Strip the markup characters from anything interpolated into a line. */
export function plain(s: string): string {
  return s.replace(/[\u0001\u0002]/g, "");
}

export function bold(s: string): string {
  return B + plain(s) + B;
}

export function em(s: string): string {
  return E + plain(s) + E;
}

export function Rich({ text }: { text: string }): ReactNode {
  const out: ReactNode[] = [];
  let b = false;
  let e = false;
  text.split(/([\u0001\u0002])/).forEach((part, i) => {
    if (part === B) return void (b = !b);
    if (part === E) return void (e = !e);
    if (!part) return;
    let node: ReactNode = part;
    if (e) node = <em key={`e${i}`}>{node}</em>;
    if (b) node = <b key={`b${i}`}>{node}</b>;
    out.push(typeof node === "string" ? <span key={`s${i}`}>{node}</span> : node);
  });
  return <>{out}</>;
}

/* ─── Words ──────────────────────────────────────────────────────────────── */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-24" → "Aug 24". */
export function fmtDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${MON[Number(m) - 1] ?? ""} ${Number(d)}`;
}

/** "Oct 7, 2026" for today — the charter's drafted/filed date. */
export function todayLong(now: Date = new Date()): string {
  return `${MON[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

export function listy(a: readonly string[]): string {
  return a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
}

export function plural(word: string): string {
  return /s$/i.test(word) ? word : `${word}s`;
}

/** The org's name, or a stand-in while it's still blank. */
export function orgName(draft: Draft): string {
  return draft.name.trim() || "your organization";
}
