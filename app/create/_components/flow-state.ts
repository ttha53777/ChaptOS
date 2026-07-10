"use client";

/**
 * Client-side state for the /create flow: the Draft reducer plus the small
 * display helpers the mock kept as globals (slugify, monogram, gradient,
 * vocab resolution). The Draft shape and its persistence contract live in
 * lib/onboarding/draft — this file only decides how UI events mutate it.
 */

import { useEffect, useReducer, useRef } from "react";
import {
  DRAFT_STORAGE_KEY,
  emptyDraft,
  parseDraft,
  type CreateStep,
  type Draft,
} from "@/lib/onboarding/draft";
import { KIND_TO_TYPE, KIND_VOCAB_DELTA, PAIN_WF, type KindId, type PainId } from "@/lib/onboarding/kinds";
import { seatsFromTemplate, type Seat } from "@/lib/onboarding/seats";
import { PERM_AREAS, togglePerm, toggleArea } from "@/lib/onboarding/perm-areas";
import { getOrgType, type WorkflowId } from "@/lib/org-types";
import type { Permission } from "@/lib/permissions";
import { resolveLabel, type VocabKey } from "@/lib/vocab";
import { ROOT_DOMAIN } from "@/lib/domains";

export type FlowAction =
  | { type: "hydrate"; draft: Draft }
  | { type: "setName"; name: string }
  | { type: "setLogo"; dataUrl: string | undefined }
  | { type: "setKind"; kind: KindId }
  | { type: "setPain"; pain: PainId }
  | { type: "setFounderName"; name: string }
  | { type: "interviewDone" }
  | { type: "skipInterview" }
  | { type: "goto"; step: CreateStep }
  | { type: "setSlug"; slug: string | null }
  | { type: "toggleWorkflow"; workflow: WorkflowId }
  | { type: "setVocab"; key: VocabKey; value: string | null }
  | { type: "renameSeat"; index: number; title: string }
  | { type: "toggleSeatArea"; index: number; areaId: string }
  | { type: "toggleSeatPerm"; index: number; perm: Permission }
  | { type: "addSeat"; seat: Seat };

/** Template-backed defaults for a kind (workflows honor an already-given pain). */
function kindDefaults(draft: Draft, kind: KindId): Pick<Draft, "kind" | "enabledWorkflows" | "seats" | "vocab"> {
  const template = getOrgType(KIND_TO_TYPE[kind])!;
  const workflows = new Set<WorkflowId>(template.enabledWorkflows);
  if (draft.pain) workflows.add(PAIN_WF[draft.pain]);
  return {
    kind,
    enabledWorkflows: [...workflows],
    seats: seatsFromTemplate(KIND_TO_TYPE[kind]),
    vocab: {},
  };
}

/** Steps past the interview need a kind — backfill the fraternity template
    (same default the mock used) so deep rail jumps never render empty. */
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
    case "setPain": {
      const workflows = new Set(draft.enabledWorkflows);
      workflows.add(PAIN_WF[action.pain]);
      return { ...draft, pain: action.pain, enabledWorkflows: [...workflows] };
    }
    case "setFounderName":
      return { ...draft, founderName: action.name };
    case "interviewDone":
      return { ...draft, interviewDone: true, skipped: false };
    case "skipInterview":
      return { ...ensureKind({ ...draft, kind: draft.kind ?? null }), skipped: true, step: "roles" };
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
  }
}

/**
 * The flow's Draft store: restores from localStorage on mount (client-only,
 * after hydration, so the server render never touches window) and writes
 * through on every change. QuotaExceeded (a 2 MB logo on a full origin) keeps
 * the in-memory draft working — persistence is best-effort.
 */
export function useDraft(): [Draft, React.Dispatch<FlowAction>, boolean] {
  const [draft, dispatch] = useReducer(flowReducer, undefined, emptyDraft);
  const restored = useRef(false);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
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
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
