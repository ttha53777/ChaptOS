// How-to playbooks (docs/ask-chapt-answer-system-plan.md, Phase 3) — the closed
// list a Steps answer is drawn from, plus the Decline block.
//
// A how-to the model writes freehand can name a button that doesn't exist. So
// the model only picks a playbook by key; the crumbs, steps and field labels
// below were each written by reading the real screen, and are what reaches the
// user. Add a playbook only after finding every label in the UI (grep the
// component), the same rule as app/components/chat/ui-labels.ts.
//
// Server only: the client gets the resolved steps on the wire, never this file.

import type { db } from "@/lib/db";
import type { AnswerRow, ToolAccess } from "@/lib/ai-tools";
import type { ShapeRequest } from "@/lib/ai-shape-request";
import type { ShapeEvidence } from "@/lib/ai-shape-evidence";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { DeclineShape, StepsShape } from "@/lib/api-types";
import type { BuiltShape } from "@/lib/ai-shapes";

type Scoped = ReturnType<typeof db>;
interface Opts { rows: AnswerRow[]; today: string; access?: ToolAccess }

interface Playbook {
  /** One line for the model: when this is the right playbook. */
  when: string;
  crumbs: string[];
  steps: Array<{ title: string; hint?: string; fields?: string[] }>;
  /** Relative to the org, like SCREEN_PATHS. */
  screen: { label: string; path: string };
  perm: { name: Permission; label: string } | null;
}

export const HOWTO_PLAYBOOKS = {
  // app/org/[slug]/settings/sections/CustomMetricsSection.tsx
  custom_metric: {
    when: "track a new number per member (study hours, reps, books read)",
    crumbs: ["Settings", "Custom metrics", "Add metric"],
    steps: [
      { title: "Name it", hint: "The slug can't be changed later. Unit is optional.", fields: ["Name", "Slug", "Unit"] },
      { title: "Set the goal per member", hint: "At or above it counts as on track.", fields: ["Goal (per member)"] },
      { title: "Draw the at-risk line", hint: "Under it counts as at risk. Watch is an optional middle band.", fields: ["At Risk below", "Watch below"] },
      { title: "Pick the KPI card headline", fields: ["KPI card headline"] },
    ],
    screen: { label: "Custom metrics", path: "/settings?section=custom-metrics" },
    perm: { name: "MANAGE_SETTINGS", label: "Manage settings" },
  },
  // app/org/[slug]/settings/sections/ThresholdsSection.tsx
  thresholds: {
    when: "change when members show as at risk or on watch, or the service hours goal",
    crumbs: ["Settings", "Thresholds"],
    steps: [
      { title: "Attendance", hint: "In percent.", fields: ["At risk below", "Watch below"] },
      { title: "GPA", fields: ["At risk below", "Watch below"] },
      { title: "Service", fields: ["Hours goal"] },
    ],
    screen: { label: "Thresholds", path: "/settings?section=thresholds" },
    perm: { name: "MANAGE_SETTINGS", label: "Manage settings" },
  },
  // app/org/[slug]/treasury/page.tsx ("Log money") → app/components/treasury/TxForm.tsx
  log_money: {
    when: "record an expense or income in the ledger",
    crumbs: ["Treasury", "Log money"],
    steps: [
      { title: "Pick income or expense", fields: ["Type"] },
      { title: "Fill in the amount", fields: ["Amount ($)", "Category", "Date"] },
      { title: "Say what it was", fields: ["Description"] },
      { title: "Link it to an event", hint: "Optional.", fields: ["Linked Events"] },
    ],
    screen: { label: "Treasury", path: "/treasury" },
    perm: { name: "MANAGE_TREASURY", label: "Manage treasury" },
  },
  // Dashboard band + MobileTabBar quick action "Open check-in"
  open_checkin: {
    when: "take attendance live while a meeting is happening",
    crumbs: ["Dashboard", "Open check-in"],
    steps: [
      { title: "Open check-in when the meeting starts", hint: "From the dashboard, or the quick actions on a phone." },
      { title: "Members check themselves in", hint: "From their phones. Attendance goes on each member's record." },
    ],
    screen: { label: "Dashboard", path: "" },
    perm: { name: "MANAGE_ATTENDANCE", label: "Manage attendance" },
  },
  // app/org/[slug]/timeline/page.tsx — the event sheet's "Mark who attended"
  mark_attendance: {
    when: "record attendance after a meeting already happened",
    crumbs: ["Timeline", "The meeting", "Mark who attended"],
    steps: [
      { title: "Open the meeting on Timeline" },
      { title: "Mark who attended" },
    ],
    screen: { label: "Timeline", path: "/timeline" },
    perm: { name: "MANAGE_ATTENDANCE", label: "Manage attendance" },
  },
  // app/components/members/MemberSpotlight.tsx — "Excuse" on a missed meeting
  excuse_member: {
    when: "excuse someone else's absence as an officer",
    crumbs: ["Roster", "Their card", "Excuse"],
    steps: [
      { title: "Open their card from the Roster" },
      { title: "Excuse the meeting they missed", hint: "An excused meeting doesn't count for or against them." },
    ],
    screen: { label: "Roster", path: "/brothers" },
    perm: { name: "MANAGE_ATTENDANCE", label: "Manage attendance" },
  },
  // app/components/members/MemberSpotlight.tsx — "Mark exempt…"
  mark_exempt: {
    when: "take someone out of attendance for a whole semester (abroad, co-op, inactive)",
    crumbs: ["Roster", "Their card", "Mark exempt…"],
    steps: [
      { title: "Open their card from the Roster" },
      { title: "Mark exempt…", hint: "They drop out of every mandatory event this semester and never show as at risk for it." },
    ],
    screen: { label: "Roster", path: "/brothers" },
    perm: { name: "MANAGE_ATTENDANCE", label: "Manage attendance" },
  },
} as const satisfies Record<string, Playbook>;

export type PlaybookKey = keyof typeof HOWTO_PLAYBOOKS;
export const PLAYBOOK_KEYS = Object.keys(HOWTO_PLAYBOOKS) as PlaybookKey[];

/** One line per playbook, for the prompt. */
export function playbookGuide(): string {
  return PLAYBOOK_KEYS.map(k => `${k} (${HOWTO_PLAYBOOKS[k].when})`).join("; ");
}

function allowed(access: ToolAccess | undefined, perm: Permission): boolean {
  if (!access) return false;
  return access.isPlatformAdmin || access.isOrgAdmin || hasPermission(access.permissions, perm);
}

/**
 * Pure: a playbook + the model's example values + who's asking → Steps.
 * Examples fill only fields the playbook itself declares; anything else is
 * dropped. Exported for tests.
 */
export function stepsFromPlaybook(key: string, examples: Record<string, string> | undefined, access: ToolAccess | undefined): BuiltShape<StepsShape> | null {
  if (!(key in HOWTO_PLAYBOOKS)) return null;
  const pb: Playbook = HOWTO_PLAYBOOKS[key as PlaybookKey];
  const ex = new Map(Object.entries(examples ?? {}).map(([k, v]) => [k.trim().toLowerCase(), v]));
  return {
    shape: {
      type: "steps",
      playbook: key,
      crumbs: [...pb.crumbs],
      steps: pb.steps.map(s => ({
        title: s.title,
        ...(s.hint ? { hint: s.hint } : {}),
        ...(s.fields ? { fields: s.fields.map(f => ({ label: f, ...(ex.get(f.toLowerCase()) ? { example: ex.get(f.toLowerCase())! } : {}) })) } : {}),
      })),
      screen: { ...pb.screen },
      perm: pb.perm ? { label: pb.perm.label, ok: allowed(access, pb.perm.name) } : null,
    },
    rows: [],
  };
}

export async function buildSteps(req: ShapeRequest, _evidence: ShapeEvidence, _scoped: Scoped, _orgId: number, o: Opts): Promise<BuiltShape | null> {
  return req.playbook ? stepsFromPlaybook(req.playbook, req.examples, o.access) : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Decline
// ────────────────────────────────────────────────────────────────────────────

/** Pure: the scope line is fixed copy with the org's name; the model can't reword it. */
export function declineShape(orgName: string | null): BuiltShape<DeclineShape> {
  const whose = orgName?.trim() ? `${orgName.trim()}'s` : "your chapter's";
  return { shape: { type: "decline", scope: `I only read ${whose} records in ChaptOS: events, money, people, minutes and docs.` }, rows: [] };
}

export async function buildDecline(_req: ShapeRequest, _evidence: ShapeEvidence, scoped: Scoped): Promise<BuiltShape | null> {
  const org = await scoped.organization.findFirst({ select: { name: true } }) as { name: string } | null;
  return declineShape(org?.name ?? null);
}
