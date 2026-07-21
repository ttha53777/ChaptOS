"use client";

/**
 * Client-side state for the /create flow: the Draft reducer plus the small
 * display helpers the mock kept as globals (slugify, monogram, gradient,
 * vocab resolution). The Draft shape and its persistence contract live in
 * lib/onboarding/draft — this file only decides how UI events mutate it.
 */

import { useEffect, useReducer, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  DRAFT_STORAGE_KEY,
  LEGACY_DRAFT_STORAGE_KEY,
  defaultEventTypes,
  defaultMetrics,
  emptyDraft,
  parseDraft,
  type CreateStep,
  type Draft,
} from "@/lib/onboarding/draft";
import {
  MAX_DRAFT_EVENT_TYPES,
  nextCustomTypeSlug,
  resolveEventTypeRows,
  starterEventTypes,
  type DraftCustomEventType,
  type DraftEventTypeRow,
} from "@/lib/onboarding/event-types";
import {
  BUILTIN_METRIC_DEFAULTS,
  KIND_TO_TYPE,
  KIND_VOCAB_DELTA,
  getVariant,
  type BuiltinMetricId,
  type KindId,
} from "@/lib/onboarding/kinds";
import { seatsFromTemplate, type Seat } from "@/lib/onboarding/seats";
import { PERM_AREAS, togglePerm, toggleArea } from "@/lib/onboarding/perm-areas";
import { ALWAYS_ON_WORKFLOWS, BASE_WORKFLOWS, getOrgType, type WorkflowId } from "@/lib/org-types";
import { getBuiltinEventType } from "@/lib/event-types";
import type { Permission } from "@/lib/permissions";
import { resolveLabel, type VocabKey } from "@/lib/vocab";
import { ROOT_DOMAIN } from "@/lib/domains";
import { MAX_SLUG_LEN } from "@/lib/slug-rules";

/** The structured picks an AI interpretation may apply — nothing the founder
    couldn't also do by hand (workflow toggles + vocab chips). */
export interface AiPicks {
  addWorkflows: WorkflowId[];
  removeWorkflows: WorkflowId[];
  vocab: Partial<Record<VocabKey, string>>;
}

export type FlowAction =
  | { type: "hydrate"; draft: Draft }
  | { type: "setName"; name: string }
  | { type: "setLogo"; dataUrl: string | undefined }
  | { type: "setKind"; kind: KindId }
  | { type: "setVariant"; variant: string }
  | { type: "setFounderName"; name: string }
  | { type: "setBuiltinMetric"; metric: BuiltinMetricId; on: boolean }
  | { type: "addCustomMetric"; name: string; unit: string | null }
  | { type: "removeCustomMetric"; index: number }
  | { type: "applyAiPicks"; picks: AiPicks }
  | { type: "interviewDone" }
  | { type: "goto"; step: CreateStep }
  | { type: "setSlug"; slug: string | null }
  | { type: "toggleWorkflow"; workflow: WorkflowId }
  | { type: "setVocab"; key: VocabKey; value: string | null }
  | { type: "renameSeat"; index: number; title: string }
  | { type: "toggleSeatArea"; index: number; areaId: string }
  | { type: "toggleSeatPerm"; index: number; perm: Permission }
  | { type: "addSeat"; seat: Seat }
  | { type: "renameEventType"; slug: string; label: string }
  | { type: "recolorEventType"; slug: string; color: string; colorDark: string }
  | { type: "addEventType"; label: string; color: string; colorDark: string }
  | { type: "removeEventType"; slug: string };

/**
 * Template-backed defaults for a kind. Resets variant and metric flags too — a
 * new kind answer means the old activity profile no longer applies.
 *
 * The kind decides the org's WORDS (Brother/Chapter), its SEATS, and its metric
 * defaults. It deliberately does NOT decide the activity pages: those are owned
 * by the interview's beats ("in a normal month, which of these happen?"), where
 * an activity the founder doesn't name leaves its page off. Seeding the
 * template's full page set here would mean the guess silently survives an answer
 * that didn't include it — the interview would be theatre over a preset. So we
 * seed only BASE_WORKFLOWS (see lib/org-types.ts). Filtering the template rather
 * than spreading BASE_WORKFLOWS keeps this honest if a template ever omits one.
 */
function kindDefaults(
  draft: Draft,
  kind: KindId,
): Pick<Draft, "kind" | "variant" | "enabledWorkflows" | "seats" | "vocab" | "metrics" | "eventTypes"> {
  const template = getOrgType(KIND_TO_TYPE[kind])!;
  return {
    kind,
    variant: null,
    enabledWorkflows: template.enabledWorkflows.filter(w => BASE_WORKFLOWS.includes(w)),
    seats: seatsFromTemplate(KIND_TO_TYPE[kind]),
    vocab: {},
    metrics: { ...BUILTIN_METRIC_DEFAULTS[kind], custom: draft.metrics.custom },
    // A different kind means a different starter category set (and a different
    // word for meetings, which the chapter type's label follows) — so the
    // Timeline step's answer resets to "not asked yet" rather than carrying the
    // old template's Social/Fundraiser/Programming into a sports team.
    eventTypes: defaultEventTypes(),
  };
}

/**
 * Recompute the draft for a variant pick: the kind's base template, then the
 * modifier's deltas. Seats are always derived from the template (never
 * incremental) so re-picking a variant — or switching to a different one —
 * resets cleanly instead of stacking deltas.
 *
 * A variant does NOT touch enabledWorkflows. Pages are owned by the interview's
 * activity beats (see kindDefaults), so a variant only re-shapes what it was
 * ever uniquely good for: SEATS, WORDS, and metric defaults. This also removes a
 * real clobber hazard — the AI concierge can resolve a variant on a LATER turn
 * than the activities checklist, and a workflow-resetting applyVariant would
 * wipe the founder's picks.
 */
function applyVariant(draft: Draft, variantId: string): Draft {
  if (!draft.kind) return draft;
  const mod = getVariant(draft.kind, variantId);
  if (!mod) return { ...draft, variant: variantId };

  const baseSeats = seatsFromTemplate(KIND_TO_TYPE[draft.kind]);
  const removed = new Set(mod.seatRemove ?? []);
  const seats: Seat[] = baseSeats.filter(s => s.all || !removed.has(s.title));
  for (const add of mod.seatAdd ?? []) {
    seats.push({ title: add.title, color: add.color, permissions: [...add.permissions] });
  }

  return {
    ...draft,
    variant: variantId,
    seats,
    vocab: { ...draft.vocab, ...mod.vocabDelta },
    metrics: {
      ...BUILTIN_METRIC_DEFAULTS[draft.kind],
      ...mod.metricDefaults,
      custom: draft.metrics.custom,
    },
  };
}

/** Steps past the interview need a kind — backfill the fraternity template (same
    default the mock used) so a kindless draft never renders empty.

    The UI no longer reaches this: CreateFlow gates every path to those steps on
    draft.kind, so the interview's kind beat always runs first. It survives as the
    last line of defense for a restored or hand-edited draft that somehow arrives
    kindless, and it deliberately seeds only BASE_WORKFLOWS (via kindDefaults) —
    pages are owned by the beats, and a fallback that resurrected the template's
    full guess would reintroduce exactly the preset this flow exists to kill. */
function ensureKind(draft: Draft): Draft {
  if (draft.kind) return draft;
  return {
    ...draft,
    ...kindDefaults(draft, "fraternity"),
    skipped: !draft.interviewDone,
  };
}

function editSeat(draft: Draft, index: number, edit: (seat: Seat) => Seat): Draft {
  return { ...draft, seats: draft.seats.map((s, i) => (i === index ? edit(s) : s)) };
}

/**
 * The page set a set of picks WOULD produce. The reducer's applyAiPicks case is
 * the only writer, but the interview also needs to know whether a pick actually
 * moves anything — a removeWorkflows entry for a page that's already off, or an
 * add for one that's already on, is declared intent that changes nothing, and
 * flashing the sheet for it is what makes the blueprint look like it refreshes
 * without updating. Both callers share this so they can't disagree.
 */
export function nextWorkflows(draft: Draft, picks: AiPicks): WorkflowId[] {
  const workflows = new Set(draft.enabledWorkflows);
  for (const w of picks.addWorkflows) workflows.add(w);
  for (const w of picks.removeWorkflows) {
    if (!ALWAYS_ON_WORKFLOWS.includes(w)) workflows.delete(w);
  }
  return [...workflows];
}

/** Whether `picks` would actually change the draft's page set (order-insensitive). */
export function workflowsChanged(draft: Draft, picks: AiPicks): boolean {
  const next = nextWorkflows(draft, picks);
  if (next.length !== draft.enabledWorkflows.length) return true;
  const before = new Set(draft.enabledWorkflows);
  return next.some(w => !before.has(w));
}

/** The page set a `setKind` resets to — what a concierge turn's picks land on top
    of when that same turn also answered the kind beat. */
export function workflowsForKind(draft: Draft, kind: KindId): Draft {
  return { ...draft, enabledWorkflows: kindDefaults(draft, kind).enabledWorkflows };
}

export function flowReducer(draft: Draft, action: FlowAction): Draft {
  switch (action.type) {
    case "hydrate":
      return action.draft;
    case "setName":
      return { ...draft, name: action.name };
    case "setLogo":
      return { ...draft, logoDataUrl: action.dataUrl };
    case "setKind":
      return { ...draft, ...kindDefaults(draft, action.kind), skipped: false };
    case "setVariant":
      return applyVariant(draft, action.variant);
    case "setFounderName":
      return { ...draft, founderName: action.name };
    case "setBuiltinMetric":
      return { ...draft, metrics: { ...draft.metrics, [action.metric]: action.on } };
    case "addCustomMetric": {
      const name = action.name.trim().slice(0, 40);
      // Cap matches the draft schema (and the API's) so write-through and the
      // eventual payload can never carry more than provisioning accepts.
      if (!name || draft.metrics.custom.length >= 5) return draft;
      const unit = action.unit?.trim().slice(0, 10) || null;
      return { ...draft, metrics: { ...draft.metrics, custom: [...draft.metrics.custom, { name, unit }] } };
    }
    case "removeCustomMetric":
      return {
        ...draft,
        metrics: { ...draft.metrics, custom: draft.metrics.custom.filter((_, i) => i !== action.index) },
      };
    case "applyAiPicks": {
      const vocab = { ...draft.vocab };
      for (const [k, v] of Object.entries(action.picks.vocab)) {
        if (v) vocab[k] = v.trim().slice(0, 40);
      }
      return { ...draft, enabledWorkflows: nextWorkflows(draft, action.picks), vocab };
    }
    case "interviewDone":
      return { ...draft, interviewDone: true, skipped: false };
    case "goto": {
      const next = action.step === "name" || action.step === "interview" ? draft : ensureKind(draft);
      return { ...next, step: action.step };
    }
    case "setSlug":
      return { ...draft, slug: action.slug };
    case "toggleWorkflow": {
      const workflows = new Set(draft.enabledWorkflows);
      if (workflows.has(action.workflow)) workflows.delete(action.workflow);
      else workflows.add(action.workflow);
      return { ...draft, enabledWorkflows: [...workflows] };
    }
    case "setVocab": {
      const vocab = { ...draft.vocab };
      if (action.value) vocab[action.key] = action.value;
      else delete vocab[action.key];
      return { ...draft, vocab };
    }
    case "renameSeat":
      return editSeat(draft, action.index, s => ({ ...s, title: action.title.trim() || s.title }));
    case "toggleSeatArea": {
      const area = PERM_AREAS.find(a => a.id === action.areaId);
      if (!area) return draft;
      return editSeat(draft, action.index, s =>
        s.all ? s : { ...s, permissions: toggleArea(s.permissions, area) },
      );
    }
    case "toggleSeatPerm":
      return editSeat(draft, action.index, s =>
        s.all ? s : { ...s, permissions: togglePerm(s.permissions, action.perm) },
      );
    case "addSeat":
      return { ...draft, seats: [...draft.seats, action.seat] };
    case "renameEventType": {
      const label = action.label.trim().slice(0, 40);
      if (!label) return draft;
      return editEventType(draft, action.slug, {
        builtin: over => ({ ...over, label }),
        custom:  type => ({ ...type, label }),
      });
    }
    case "recolorEventType":
      return editEventType(draft, action.slug, {
        builtin: over => ({ ...over, color: action.color, colorDark: action.colorDark }),
        custom:  type => ({ ...type, color: action.color, colorDark: action.colorDark }),
      });
    case "addEventType": {
      const label = action.label.trim().slice(0, 40);
      const customs = materializeCustoms(draft);
      if (!label || customs.length >= MAX_DRAFT_EVENT_TYPES) return draft;
      const taken = [
        ...resolveEventTypeRows(eventTypeArgs(draft)).map(r => r.slug),
        ...customs.map(c => c.slug),
      ];
      return {
        ...draft,
        eventTypes: {
          ...draft.eventTypes,
          customs: [
            ...customs,
            {
              slug:  nextCustomTypeSlug(label, taken),
              label,
              color: action.color,
              colorDark: action.colorDark,
              // Ungated: a category the founder typed by hand shouldn't vanish
              // because a page is off. Starters keep their "events" gating.
              workflowId: null,
            },
          ],
        },
      };
    }
    case "removeEventType":
      return {
        ...draft,
        eventTypes: {
          ...draft.eventTypes,
          customs: materializeCustoms(draft).filter(c => c.slug !== action.slug),
        },
      };
  }
}

/**
 * The custom list as a concrete array. `customs: null` means "whatever the org
 * type seeds", so the FIRST edit of any kind materializes the starters into the
 * draft — after that the founder's list is the answer, and removing every entry
 * genuinely means "no custom categories" rather than reverting to the template.
 */
function materializeCustoms(draft: Draft): DraftCustomEventType[] {
  return draft.eventTypes.customs ?? starterEventTypes(draft.kind);
}

/**
 * Apply an edit to one event type, routing by whether the slug is a built-in.
 * Built-ins are edited as sparse overrides (the row itself comes from the
 * registry); customs are edited in the materialized list.
 */
function editEventType(
  draft: Draft,
  slug: string,
  edit: {
    builtin: (over: NonNullable<Draft["eventTypes"]["builtins"][string]>) => Draft["eventTypes"]["builtins"][string];
    custom:  (type: DraftCustomEventType) => DraftCustomEventType;
  },
): Draft {
  if (getBuiltinEventType(slug)) {
    return {
      ...draft,
      eventTypes: {
        ...draft.eventTypes,
        builtins: { ...draft.eventTypes.builtins, [slug]: edit.builtin(draft.eventTypes.builtins[slug] ?? {}) },
      },
    };
  }
  return {
    ...draft,
    eventTypes: {
      ...draft.eventTypes,
      customs: materializeCustoms(draft).map(c => (c.slug === slug ? edit.custom(c) : c)),
    },
  };
}

/**
 * The flow's Draft store: writes through to localStorage on every change
 * (client-only, after hydration, so the server render never touches window).
 * QuotaExceeded (a 2 MB logo on a full origin) keeps the in-memory draft
 * working — persistence is best-effort.
 *
 * A stored draft is restored ONLY on the post-OAuth resume leg (?resume=1).
 * Every other visit to /create starts a fresh, empty draft and discards any
 * leftover — so a founder who reopens /create to "start again" never lands on
 * top of a half-finished draft from days ago.
 */
export function useDraft(): [Draft, React.Dispatch<FlowAction>, boolean] {
  const [draft, dispatch] = useReducer(flowReducer, undefined, emptyDraft);
  const restored = useRef(false);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const isResume = useSearchParams().get("resume") === "1";

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      // A pre-redesign v1 draft can never parse under the v2 schema — drop the
      // old key on sight so it doesn't linger in storage forever.
      window.localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
      if (!isResume) {
        // Fresh visit: never resume a leftover draft — clear it so the write-
        // through effect below can't re-persist the stale one either.
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        forceRender();
        return;
      }
      const saved = parseDraft(window.localStorage.getItem(DRAFT_STORAGE_KEY));
      if (saved) dispatch({ type: "hydrate", draft: saved });
      else forceRender();
    } catch {
      forceRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ ...draft, savedAt: Date.now() }),
      );
    } catch {
      // Best-effort — an oversized logo or a full origin must not break the flow.
    }
  }, [draft]);

  return [draft, dispatch, restored.current];
}

export function clearStoredDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/* ─── Display helpers (ported from the mock) ─────────────────────────────── */

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LEN);
}

/** The slug shown/submitted: an explicit edit wins, else derived from the name. */
export function draftSlug(draft: Draft): string {
  return draft.slug ?? slugify(draft.name.trim());
}

export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";
}

const GRADS: readonly [string, string][] = [
  ["#7c3aed", "#a78bfa"], ["#9a6b1f", "#ddb36a"], ["#a04a68", "#d98ba3"],
  ["#3f6e4e", "#7fb08a"], ["#2f5d7c", "#7fb3d9"], ["#7a4a2b", "#d9a05b"],
];

/** Deterministic gradient from the org name — the product's logo fallback. */
export function grad(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const g = GRADS[h % GRADS.length]!;
  return `linear-gradient(135deg, ${g[0]}, ${g[1]})`;
}

/** The host shown in URL previews (chaptos.app/<slug>). */
export const DISPLAY_HOST = ROOT_DOMAIN === "localhost" ? "chaptos.app" : ROOT_DOMAIN;

/** Enabled workflows as a Set — what the perm-area gates consume. */
export function wfSet(draft: Draft): ReadonlySet<WorkflowId> {
  return new Set(draft.enabledWorkflows);
}

/**
 * Resolve a display word for the draft: founder edits → kind delta (Sister) →
 * template overrides → canonical defaults. Mirrors what provisionOrg will
 * store (template ∪ kind delta ∪ edits), so the sheet never lies.
 */
export function draftVocab(draft: Draft, key: VocabKey, plural = false): string {
  const template = draft.kind ? getOrgType(KIND_TO_TYPE[draft.kind]) : null;
  const overrides = {
    ...template?.vocabularyOverrides,
    ...(draft.kind ? KIND_VOCAB_DELTA[draft.kind] : undefined),
    ...draft.vocab,
  };
  return resolveLabel(key, overrides, plural);
}

/** The arguments resolveEventTypeRows needs, read off the draft. */
function eventTypeArgs(draft: Draft) {
  return {
    builtins:         draft.eventTypes.builtins,
    customs:          draft.eventTypes.customs,
    kind:             draft.kind,
    meetingsLabel:    draftVocab(draft, "Meetings"),
    enabledWorkflows: draft.enabledWorkflows,
  };
}

/**
 * The org's timeline event types as the draft would create them: built-ins in
 * registry order, then customs, each marked `active` by whether its gating page
 * is on. The Timeline step, its preview and the Blueprint step's chips all read
 * this — and so does the payload mapper (draftToCreateOrgInput), which is what
 * keeps the preview honest.
 */
export function draftEventTypes(draft: Draft): DraftEventTypeRow[] {
  return resolveEventTypeRows(eventTypeArgs(draft));
}
