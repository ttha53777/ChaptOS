/**
 * The /create flow's draft — the founder's in-progress answers, persisted to
 * localStorage so the whole pre-auth flow survives the Google OAuth redirect
 * (the founder signs in at the Build step, LAST).
 *
 * The draft is untrusted on the way back in: it round-trips through the
 * browser, so parseDraft() Zod-validates it (and expires it after
 * DRAFT_MAX_AGE_MS) rather than assuming our own writes are intact. A draft
 * that fails to parse is discarded — the founder restarts, never crashes.
 * That discard IS the version-migration story: v1 drafts (the pain-question
 * era) fail the z.literal(2) check and simply restart the two-minute flow.
 *
 * draftToCreateOrgInput() is the single mapping from draft to the real
 * POST /api/orgs payload. tests/onboarding/create-draft.test.ts asserts its
 * output parses under createOrgInput for every kind, so the flow can never
 * ship a payload the API rejects (see the founder-rank clamp below).
 */

import { z } from "zod";
import { ALL_WORKFLOWS, normalizeWorkflows, type WorkflowId } from "@/lib/org-types";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { sanitizeVocabOverrides } from "@/lib/vocab";
import { suggestSlug } from "@/lib/slug-rules";
import type { CreateOrgInput } from "@/lib/validation/org";
import { BUILTIN_METRIC_DEFAULTS, KIND_IDS, KIND_TO_TYPE, KIND_VOCAB_DELTA, type KindId } from "./kinds";
import type { Seat } from "./seats";

export const DRAFT_STORAGE_KEY = "figurints:create-draft:v2";

/** The v1 key — removed on sight so pre-redesign leftovers don't linger. */
export const LEGACY_DRAFT_STORAGE_KEY = "figurints:create-draft:v1";

/** Drafts older than this are discarded on restore (stale slug checks, stale mind). */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 2 MB of image ≈ 2.8 MB of data-URL; anything bigger was never a valid logo. */
const MAX_LOGO_DATA_URL_CHARS = 3_000_000;

export const CREATE_STEPS = ["name", "interview", "roles", "blueprint", "build"] as const;
export type CreateStep = (typeof CREATE_STEPS)[number];

const permissionEnum = z.enum(Object.keys(PERMISSIONS) as [Permission, ...Permission[]]);

const seatSchema = z.object({
  title:       z.string().trim().min(1).max(60),
  color:       z.string().max(9),
  all:         z.boolean().optional(),
  permissions: z.array(permissionEnum).max(20),
});

export const draftSchema = z.object({
  v:       z.literal(2),
  savedAt: z.number().int().positive(),
  step:    z.enum(CREATE_STEPS),
  name:    z.string().max(120),
  /** Explicit URL override from the blueprint's slug editor; null → derive from name. */
  slug:    z.string().max(40).nullable(),
  kind:    z.enum(KIND_IDS).nullable(),
  /** Activity-profile variant id (KIND_VARIANTS); null → kind default / not asked. */
  variant: z.string().max(30).nullable(),
  founderName:   z.string().max(120),
  skipped:       z.boolean(),
  interviewDone: z.boolean(),
  enabledWorkflows: z.array(z.enum(ALL_WORKFLOWS as [WorkflowId, ...WorkflowId[]])).max(ALL_WORKFLOWS.length),
  /** Sparse vocab edits from the interview + blueprint's "Your words" chips
      (singular only). Permissive keys, like blueprintInput — unknown keys are
      dropped when mapping (sanitizeVocabOverrides), and again server-side. */
  vocab: z.record(z.string(), z.string().trim().min(1).max(40)),
  /** Per-member tracking: built-in toggles + custom metric definitions. */
  metrics: z.object({
    attendance:   z.boolean(),
    gpa:          z.boolean(),
    duesOwed:     z.boolean(),
    serviceHours: z.boolean(),
    custom: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(40),
          unit: z.string().trim().max(10).nullable(),
        }),
      )
      .max(5),
  }),
  seats: z.array(seatSchema).max(16),
  logoDataUrl: z.string().startsWith("data:image/").max(MAX_LOGO_DATA_URL_CHARS).optional(),
});

export type Draft = z.infer<typeof draftSchema>;
export type DraftMetrics = Draft["metrics"];

/** The four built-in flags for a kind, as a fresh metrics object (custom empty). */
export function defaultMetrics(kind: KindId | null): DraftMetrics {
  const flags = BUILTIN_METRIC_DEFAULTS[kind ?? "other"];
  return { ...flags, custom: [] };
}

export function emptyDraft(): Draft {
  return {
    v: 2,
    savedAt: Date.now(),
    step: "name",
    name: "",
    slug: null,
    kind: null,
    variant: null,
    founderName: "",
    skipped: false,
    interviewDone: false,
    enabledWorkflows: [],
    vocab: {},
    metrics: defaultMetrics(null),
    seats: [],
  };
}

/**
 * Parse a raw localStorage value into a Draft, or null if it's missing,
 * corrupt, a different version, or expired. Never throws.
 */
export function parseDraft(raw: string | null | undefined): Draft | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = draftSchema.safeParse(json);
  if (!parsed.success) return null;
  if (Date.now() - parsed.data.savedAt > DRAFT_MAX_AGE_MS) return null;
  return parsed.data;
}

/**
 * Non-founder seed rank: descending with position so the seeded hierarchy
 * reads top-down, floored at 40 (same scheme as the design mock). The schema
 * caps every seed at 99 — resolveBlueprint forces the `all` seed to 100
 * server-side, so the founder's rank here is advisory (and MUST stay ≤99;
 * sending the template's literal 100 is the bug the old flow shipped with).
 */
function seedRank(index: number, all: boolean | undefined): number {
  return all ? 99 : Math.max(40, 60 - index * 5);
}

/**
 * Map a draft to the exact POST /api/orgs payload.
 *
 * @param fallbackFounderName - used when the interview's name answer is blank;
 *   the caller resolves it post-auth (Google full_name → email local-part).
 */
export function draftToCreateOrgInput(draft: Draft, fallbackFounderName?: string): CreateOrgInput {
  const name = draft.name.trim();
  const kind = draft.kind ?? "fraternity";

  // Kind vocab (Sister for sororities) under the founder's explicit edits;
  // unknown keys from a tampered draft are dropped here. The cast is safe:
  // sanitizeVocabOverrides never writes an undefined value.
  const vocabularyOverrides = sanitizeVocabOverrides({
    ...KIND_VOCAB_DELTA[kind],
    ...draft.vocab,
  }) as Record<string, string>;

  const roleSeeds = draft.seats
    .filter(s => s.title.trim().length > 0)
    .map((s, i) => ({
      name:        s.title.trim(),
      rank:        seedRank(i, s.all),
      all:         !!s.all,
      permissions: s.all ? [] : [...s.permissions] as Permission[],
      color:       s.color,
    }));

  return {
    name,
    slug: draft.slug ?? suggestSlug(name),
    orgType: KIND_TO_TYPE[kind],
    founderName:
      draft.founderName.trim() || fallbackFounderName?.trim() || "Founder",
    blueprint: {
      enabledWorkflows: normalizeWorkflows(draft.enabledWorkflows),
      vocabularyOverrides,
      roleSeeds,
      // No term is sent from the create flow anymore — a fresh org lands in the
      // workspace with no active Semester and sets its first term via the
      // SemesterGate first-run prompt (app/components/SemesterGate.tsx). The
      // blueprint.term field stays optional server-side for other callers.
      metrics: {
        builtins: {
          attendance:   draft.metrics.attendance,
          gpa:          draft.metrics.gpa,
          duesOwed:     draft.metrics.duesOwed,
          serviceHours: draft.metrics.serviceHours,
        },
        custom: draft.metrics.custom.map(m => ({ name: m.name, unit: m.unit })),
      },
    },
  };
}
