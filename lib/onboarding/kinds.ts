/**
 * Interview vocabulary for the /create flow.
 *
 * `kind` is the human answer to "what kind of group is this?" — it resolves to
 * one of the seven real org-type template ids in lib/org-types.ts. Sorority is
 * the one kind without its own template: it shares the fraternity template and
 * differs only in vocabulary (Member: "Sister"), applied via KIND_VOCAB_DELTA.
 *
 * `variant` refines the kind's SHAPE — the seats a professional chapter elects,
 * the words an ensemble uses, the metrics an honor society tracks. It no longer
 * decides pages: the interview asks what the org actually does in a normal month
 * and the answers own the page set (see BEAT_WORKFLOWS in lib/org-types.ts), so
 * nothing is inferred from the kind word alone. The scripted interview no longer
 * asks for a variant at all; the AI concierge may still resolve one when the
 * founder's own words make it obvious ("we're a pre-med frat").
 *
 * Pure data + matchers, no React, no DB — shared by the interview UI and the
 * draft→createOrgInput mapper, and unit-tested directly.
 */

import type { Permission } from "@/lib/permissions";
import type { VocabOverrides } from "@/lib/vocab";

export const KIND_IDS = [
  "fraternity",
  "sorority",
  "club",
  "team",
  "service",
  "honor",
  "arts",
  "other",
] as const;

export type KindId = (typeof KIND_IDS)[number];

/** Resolve a human kind to the real org-type template id. */
export const KIND_TO_TYPE: Record<KindId, string> = {
  fraternity: "fraternity",
  sorority:   "fraternity",
  club:       "generic-club",
  team:       "sports-team",
  service:    "service-org",
  honor:      "honor-society",
  arts:       "performing-arts",
  other:      "generic-org",
};

/** Chip / sheet labels for each kind. */
export const KIND_LABEL: Record<KindId, string> = {
  fraternity: "A fraternity",
  sorority:   "A sorority",
  club:       "A club",
  team:       "A sports team",
  service:    "A service org",
  honor:      "An honor society",
  arts:       "A performing-arts group",
  other:      "Another kind of org",
};

/**
 * Vocabulary the kind adds ON TOP of its template's overrides. Only sorority
 * carries a delta today — it rides the fraternity template but its members
 * are Sisters, not Brothers.
 */
export const KIND_VOCAB_DELTA: Partial<Record<KindId, VocabOverrides>> = {
  sorority: { Member: "Sister" },
};

// ─── Built-in per-member metrics ─────────────────────────────────────────────

/** The four per-member measures every org gets columns for (Brother model). */
export const BUILTIN_METRIC_IDS = ["attendance", "gpa", "duesOwed", "serviceHours"] as const;

export type BuiltinMetricId = (typeof BUILTIN_METRIC_IDS)[number];

export type BuiltinMetricFlags = Record<BuiltinMetricId, boolean>;

export const BUILTIN_METRIC_LABEL: Record<BuiltinMetricId, string> = {
  attendance:   "Attendance",
  gpa:          "GPA",
  duesOwed:     "Dues owed",
  serviceHours: "Service hours",
};

/**
 * Which built-ins each kind tracks by default (variant metricDefaults layer on
 * top). This is what kills the "GPA KPI ships to every org" noise — a sports
 * team never sees a Chapter GPA widget unless it asks for one.
 */
export const BUILTIN_METRIC_DEFAULTS: Record<KindId, BuiltinMetricFlags> = {
  fraternity: { attendance: true, gpa: true,  duesOwed: true,  serviceHours: true },
  sorority:   { attendance: true, gpa: true,  duesOwed: true,  serviceHours: true },
  club:       { attendance: true, gpa: false, duesOwed: true,  serviceHours: false },
  team:       { attendance: true, gpa: false, duesOwed: false, serviceHours: false },
  service:    { attendance: true, gpa: false, duesOwed: true,  serviceHours: true },
  honor:      { attendance: true, gpa: true,  duesOwed: true,  serviceHours: true },
  arts:       { attendance: true, gpa: false, duesOwed: true,  serviceHours: false },
  other:      { attendance: true, gpa: false, duesOwed: false, serviceHours: false },
};

// ─── Variants ────────────────────────────────────────────────────────────────

/** A seat a variant adds on top of the base template's roleSeeds. */
export interface VariantSeatAdd {
  title: string;
  color: string;
  permissions: readonly Permission[];
}

/**
 * An activity-profile modifier layered on the kind's base template. Everything
 * is a delta: absent fields mean "keep the template's answer". Applied
 * draft-side only (flow-state's setVariant) — the server keeps receiving a
 * fully-resolved blueprint.
 *
 * A variant does NOT carry workflow deltas. The interview's activity beats own
 * the page set ("in a normal month, which of these happen?" — unnamed = off), so
 * a variant would only be able to contradict an explicit answer. What it IS
 * uniquely good for is the rest of the shape: the seats a professional chapter
 * elects, the words an ensemble uses, the metrics an honor society tracks.
 */
export interface VariantModifier {
  id: string;
  /** Chip label. */
  label: string;
  /** Written into draft.vocab (wins over template + kind delta). */
  vocabDelta?: VocabOverrides;
  /** Titles of base-template seats to drop (never matches the founder seat). */
  seatRemove?: readonly string[];
  seatAdd?:    readonly VariantSeatAdd[];
  /** Built-in metric flags this variant flips off/on vs the kind default. */
  metricDefaults?: Partial<BuiltinMetricFlags>;
}

/**
 * The disambiguation chips per kind. The FIRST variant is the kind's default —
 * an empty modifier that keeps the template as-is. Kinds without entries
 * (service, honor, other) skip the variant question entirely.
 */
export const KIND_VARIANTS: Partial<Record<KindId, readonly VariantModifier[]>> = {
  fraternity: [
    { id: "social", label: "Social" },
    {
      id: "professional",
      label: "Professional",
      // Social/PR seats give way to the two VP offices professional chapters
      // actually elect. (Whether parties/service pages exist is the activity
      // beats' call, not this modifier's.)
      seatRemove: ["Social", "PR"],
      seatAdd: [
        { title: "VP Professional Development", color: "#8B5CF6", permissions: ["MANAGE_EVENTS", "MANAGE_TASKS"] },
        { title: "VP Membership",               color: "#3B82F6", permissions: ["MANAGE_BROTHERS", "MANAGE_ATTENDANCE"] },
      ],
      metricDefaults: { serviceHours: false },
    },
    {
      id: "service",
      label: "Service",
      // Service-hours-first — the service-org shape wearing Brother/Chapter vocab.
      seatRemove: ["Social"],
      seatAdd: [{ title: "Service Chair", color: "#10B981", permissions: ["MANAGE_SERVICE", "MANAGE_EVENTS"] }],
      metricDefaults: { gpa: false },
    },
    {
      id: "honor",
      label: "Honor / academic",
      seatRemove: ["Social"],
      seatAdd: [{ title: "Standards Chair", color: "#8B5CF6", permissions: ["MANAGE_ATTENDANCE", "MANAGE_BROTHERS"] }],
    },
  ],
  club: [
    {
      id: "casual",
      label: "Casual / interest",
      // A Discord and an occasional event — no roll call, no treasury.
      metricDefaults: { attendance: false, duesOwed: false },
    },
    {
      id: "pre-professional",
      label: "Pre-professional",
      seatAdd: [{ title: "Professional Dev Chair", color: "#8B5CF6", permissions: ["MANAGE_EVENTS", "MANAGE_TASKS"] }],
      metricDefaults: { gpa: true },
    },
    {
      id: "competition",
      label: "Competition",
      seatAdd: [{ title: "Logistics Lead", color: "#EC4899", permissions: ["MANAGE_EVENTS", "MANAGE_TASKS", "MANAGE_DOCS"] }],
    },
    {
      id: "cultural",
      label: "Cultural",
      // Festivals and showcases lead; finance stays for fundraising.
      seatAdd: [{ title: "Cultural Events Chair", color: "#EC4899", permissions: ["MANAGE_EVENTS", "MANAGE_ANNOUNCEMENTS"] }],
      metricDefaults: { attendance: false },
    },
  ],
  team: [
    {
      id: "competitive",
      label: "Competitive / club sport",
      // League fees are real money — the dues column earns its place.
      metricDefaults: { duesOwed: true },
    },
    {
      id: "casual",
      label: "Intramural / casual",
      seatRemove: ["Coach"],
      metricDefaults: { attendance: false },
    },
  ],
  arts: [
    { id: "production", label: "A production company" },
    {
      id: "ensemble",
      label: "An ensemble",
      // A-cappella / band / dance crew: no stage-manager hierarchy, members
      // aren't "Cast members", gigs + dues instead of a show run.
      seatRemove: ["Stage Manager"],
      seatAdd: [{ title: "Music Director", color: "#3B82F6", permissions: ["MANAGE_EVENTS", "MANAGE_ATTENDANCE"] }],
      vocabDelta: { Member: "Member" },
    },
  ],
};

/** Sorority disambiguates exactly like a fraternity. */
KIND_VARIANTS.sorority = KIND_VARIANTS.fraternity;

export function getVariant(kind: KindId | null, variantId: string | null): VariantModifier | null {
  if (!kind || !variantId) return null;
  return KIND_VARIANTS[kind]?.find(v => v.id === variantId) ?? null;
}

// ─── Founder title chips ─────────────────────────────────────────────────────

/**
 * Alternate titles offered after "what's your title?" — the current founder
 * seat's name always leads; these are the also-rans per kind.
 */
export const FOUNDER_TITLE_ALTERNATES: Record<KindId, readonly string[]> = {
  fraternity: ["Founder", "VP Operations"],
  sorority:   ["Founder", "VP Operations"],
  club:       ["Founder", "Director"],
  team:       ["Coach", "Manager"],
  service:    ["Director", "Coordinator"],
  honor:      ["Director", "Founder"],
  arts:       ["President", "Music Director"],
  other:      ["Founder", "President"],
};

// ─── Free-text matchers ──────────────────────────────────────────────────────

/**
 * Keyword matchers for the interview's free-text fallback. Deliberately naive
 * `includes` chains (ported from the design mock) — the chips are the primary
 * input and the AI interpreter the smart path; these just keep a typed answer
 * from dead-ending when both are unavailable. Unmatched kind text reads as
 * "other"; unmatched variant text reads as the kind's default (first) variant.
 */
export function matchKind(text: string): KindId {
  const lower = text.toLowerCase();
  if (lower.includes("frat")) return "fraternity";
  if (lower.includes("soror")) return "sorority";
  if (lower.includes("team") || lower.includes("sport")) return "team";
  if (lower.includes("service") || lower.includes("volunteer")) return "service";
  if (lower.includes("honor")) return "honor";
  if (
    lower.includes("theat") || lower.includes("danc") || lower.includes("music") ||
    lower.includes("art") || lower.includes("choir") || lower.includes("band")
  ) return "arts";
  if (lower.includes("club") || lower.includes("student") || lower.includes("org")) return "club";
  return "other";
}

export function matchVariant(kind: KindId, text: string): string | null {
  const variants = KIND_VARIANTS[kind];
  if (!variants?.length) return null;
  const lower = text.toLowerCase();
  if (kind === "fraternity" || kind === "sorority") {
    if (lower.includes("professional") || lower.includes("business") || lower.includes("pre-") || lower.includes("med") || lower.includes("law") || lower.includes("engineer")) return "professional";
    if (lower.includes("service") || lower.includes("volunteer")) return "service";
    if (lower.includes("honor") || lower.includes("academic")) return "honor";
    if (lower.includes("social")) return "social";
  } else if (kind === "club") {
    if (lower.includes("professional") || lower.includes("career") || lower.includes("consult") || lower.includes("finance") || lower.includes("business")) return "pre-professional";
    if (lower.includes("compet") || lower.includes("debate") || lower.includes("robot") || lower.includes("esport")) return "competition";
    if (lower.includes("cultur") || lower.includes("heritage") || lower.includes("international")) return "cultural";
    if (lower.includes("casual") || lower.includes("interest") || lower.includes("hobby") || lower.includes("social")) return "casual";
  } else if (kind === "team") {
    if (lower.includes("intramural") || lower.includes("casual") || lower.includes("rec") || lower.includes("pickup")) return "casual";
    if (lower.includes("compet") || lower.includes("varsity") || lower.includes("league") || lower.includes("club")) return "competitive";
  } else if (kind === "arts") {
    if (lower.includes("cappella") || lower.includes("band") || lower.includes("ensemble") || lower.includes("choir") || lower.includes("dance")) return "ensemble";
    if (lower.includes("production") || lower.includes("theat") || lower.includes("play") || lower.includes("show")) return "production";
  }
  return variants[0]!.id;
}

export function isKindId(id: string): id is KindId {
  return (KIND_IDS as readonly string[]).includes(id);
}

/**
 * Read a typed answer to one of the interview's yes/no beats ("do you keep
 * shared docs?", "does the org handle payments?").
 *
 * Defaults to YES on anything that isn't a recognizable negation: a founder who
 * bothers to TYPE at a "do you …?" prompt is nearly always elaborating on a yes
 * ("yeah, a drive folder and the bylaws") rather than negating — the ones who
 * mean no reach for the "No" chip. Erring toward yes also errs toward the safer
 * mistake: an extra page they can toggle off on the blueprint, rather than a
 * missing one they never think to look for.
 */
export function matchYesNo(text: string): boolean {
  return !/\b(no|nope|nah|never|none|nothing|not really|don'?t|doesn'?t|do not|neither)\b/i.test(text);
}
