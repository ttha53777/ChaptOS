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
interface Opts { rows: AnswerRow[]; today: string; access?: ToolAccess; question?: string }

interface Playbook {
  /** One line for the model: when this is the right playbook. */
  when: string;
  /**
   * What the user's own question must match for this playbook to be drawn.
   * The model picks the key, but it can't vouch for the fit: with no playbook
   * for "how do I invite people" it once drew custom_metric under a correct
   * join-link headline. A miss draws nothing and the headline stands alone.
   */
  asks: RegExp;
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
    asks: /\b(custom )?metrics?\b|\btrack(ing)?\b.*\b(per member|each member|hours|reps|books|number)\b|\bnew (stat|number|kpi)\b/i,
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
    asks: /\bthresholds?\b|\bat[- ]risk\b|\bon watch\b|\bwatch (line|band|list)\b|\b(service )?hours? goal\b|\bcut-?off\b/i,
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
    asks: /\b(log|record|add|enter|track)\b.*\b(expense|income|payment|purchase|money|transaction|spend(ing)?|receipt)s?\b|\b(expense|income|transaction)s?\b.*\b(log|record|add|enter)\b/i,
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
  // app/org/[slug]/brothers/page.tsx ("Invite") → app/components/members/InviteLinkSheet.tsx
  // ("Copy" / "Create a link (expires in 7 days)") → JoinRequestsPanel.tsx ("Review & approve")
  invite_members: {
    when: "invite or add people to the chapter, share the join link, or approve someone who asked to join",
    asks: /\binvit(e|es|ing|ation)\b|\bjoin (link|request)s?\b|\b(add|get|bring|onboard)\b.*\b(people|members?|brothers?|sisters?|someone|new)\b|\bapprove\b.*\b(request|join|member|someone)\b|\blet .* (in|join)\b/i,
    crumbs: ["Roster", "Invite"],
    steps: [
      { title: "Open Invite on the Roster", hint: "No working link? Create a link (expires in 7 days)." },
      { title: "Copy the link and send it", hint: "Anyone who opens it signs in with Google and asks to join. The link alone never gets anyone in." },
      { title: "Review & approve each request", hint: "Requests wait at the top of the Roster. You can hand them a role as you approve." },
    ],
    screen: { label: "Roster", path: "/brothers" },
    perm: { name: "MANAGE_SETTINGS", label: "Manage settings" },
  },
  // Dashboard band + MobileTabBar quick action "Open check-in"
  open_checkin: {
    when: "take attendance live while a meeting is happening",
    asks: /\bcheck[- ]?in\b|\b(take|track|do)\b.*\battendance\b.*\b(live|during|now|today|at the meeting)\b/i,
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
    asks: /\b(mark|record|enter|take|log|fix|update)\b.*\b(attendance|attended|present|who (came|showed))\b|\battendance\b.*\b(after|past|last|yesterday)\b/i,
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
    asks: /\bexcus(e|ed|ing)\b/i,
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
    asks: /\bexempt(ion)?\b|\b(abroad|co-?op|inactive|leave of absence)\b/i,
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

/**
 * Pure: does the user's question ask for what this playbook does? Unknown key
 * or no question to check → no. Exported for tests.
 */
export function playbookFits(key: string, question: string | undefined): boolean {
  if (!(key in HOWTO_PLAYBOOKS) || !question?.trim()) return false;
  return (HOWTO_PLAYBOOKS[key as PlaybookKey] as Playbook).asks.test(question);
}

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
  if (!req.playbook || !playbookFits(req.playbook, o.question)) return null;
  return stepsFromPlaybook(req.playbook, req.examples, o.access);
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
