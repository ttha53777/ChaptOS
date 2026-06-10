import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { checkMutationRate } from "@/lib/rate-limit";
import { aiEnabled, recommendSetup, type RawSetupRecommendation } from "@/lib/ai";
import { ALL_WORKFLOWS, type WorkflowId } from "@/lib/org-types";
import { WORKFLOW_FEATURES, normalizeDisabledFeatures, type DisabledFeatures } from "@/lib/workflow-features";
import { VOCAB_KEYS, DEFAULT_LABELS, type VocabKey } from "@/lib/vocab";

// POST /api/ai/recommend-setup — suggest a starting org setup from a free-text
// description, for the post-creation onboarding step. The model only PROPOSES;
// it never writes config. The client pre-seeds the picker from the (validated)
// recommendation and saves through the existing admin-gated PATCH /api/orgs/config.
//
// Auth/posture mirrors the other AI routes (digest/chat): requireUser →
// aiEnabled gate → rate limit → graceful null. lib/ai.ts is server-only.
//
// SECURITY: model output is untrusted. Every id/key it returns is intersected
// with the real registries (ALL_WORKFLOWS / WORKFLOW_FEATURES / VOCAB_KEYS)
// before it leaves this route, so a hallucinated id can never reach the client
// or be persisted.

// The dashboard widgets the model may choose to show/hide live under the
// always-on "operations" workflow.
const DASHBOARD_WIDGET_IDS = WORKFLOW_FEATURES.operations.map(f => f.id);

// Validated recommendation handed to the client. Shapes onto the existing config
// dimensions so the client can PATCH it directly.
export interface ValidatedRecommendation {
  enabledWorkflows: WorkflowId[];
  disabledFeatures: DisabledFeatures;          // inverse of the shown widgets
  vocabularyOverrides: Partial<Record<VocabKey, string>>;
  rationale: string;
}

/**
 * Turn the model's UNTRUSTED raw output into a safe recommendation: every id/key
 * is intersected with the real registries so a hallucinated value can never reach
 * the client or be persisted. Pure + exported so it's unit-testable without the
 * model. Mirrors the normalizers the org-config service applies on write.
 */
export function validateRecommendation(raw: RawSetupRecommendation): ValidatedRecommendation {
  // Intersect with ALL_WORKFLOWS (drops hallucinated ids); always include the
  // always-on "operations" workflow.
  const enabledWorkflows = ALL_WORKFLOWS.filter(w =>
    raw.enabledWorkflows.includes(w) || w === "operations",
  );
  // Keep only real widget ids the model chose to SHOW, then invert: anything in
  // the registry NOT shown becomes disabled.
  const shown = new Set(raw.shownWidgets.filter(id => DASHBOARD_WIDGET_IDS.includes(id)));
  const hiddenOps = DASHBOARD_WIDGET_IDS.filter(id => !shown.has(id));
  const disabledFeatures = normalizeDisabledFeatures(
    hiddenOps.length ? { operations: hiddenOps } : {},
  );
  // Keep only known vocab keys with non-empty values, trimmed + capped to 40
  // (the same limit the config validator enforces).
  const vocabularyOverrides: Partial<Record<VocabKey, string>> = {};
  for (const key of VOCAB_KEYS) {
    const v = raw.vocabulary[key];
    if (typeof v === "string" && v.trim()) {
      vocabularyOverrides[key] = v.trim().slice(0, 40);
    }
  }
  return {
    enabledWorkflows,
    disabledFeatures,
    vocabularyOverrides,
    rationale: typeof raw.rationale === "string" ? raw.rationale.slice(0, 200) : "",
  };
}

function buildSystemPrompt(): string {
  const widgetList = WORKFLOW_FEATURES.operations
    .map(f => `  - ${f.id}: ${f.label} — ${f.description}`)
    .join("\n");
  const vocabList = VOCAB_KEYS
    .map(k => `  - ${k} (default "${DEFAULT_LABELS[k]}")`)
    .join("\n");
  return `You configure the onboarding setup for a multi-purpose organization operations app.
Given a founder's plain-language description of their organization, recommend a sensible STARTING setup.

Choose ONLY from these exact ids/keys — never invent new ones.

WORKFLOWS (pages the org can enable), choose the relevant subset by id:
${ALL_WORKFLOWS.map(w => `  - ${w}`).join("\n")}
Always include "operations" (it backs the always-on Dashboard/Timeline pages).

DASHBOARD WIDGETS (return the ones to SHOW in "shownWidgets"; omitted ones are hidden):
${widgetList}
Only show a widget when the org plausibly tracks that data. e.g. a hobby club with no GPA/dues should NOT show kpi-gpa or kpi-dues; the fraternity "health" widget only fits orgs tracking attendance+dues+gpa+service together.

VOCABULARY (optional label overrides) — return "vocabulary" as an ARRAY of {key, label} pairs, only for keys whose default doesn't fit:
${vocabList}
e.g. a sports team → [{key:"Member",label:"Player"},{key:"Period",label:"Season"}]; a volunteer group → [{key:"Member",label:"Volunteer"},{key:"Service",label:"Volunteering"}]. Omit a key (don't include a pair) to keep its default. Empty array if nothing needs renaming.

Return concise choices. The "rationale" is ONE short sentence (max ~20 words) the founder reads to understand the suggestion. No markdown.`;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Feature dormant without a key — tell the client so it hides the step.
  if (!aiEnabled()) return Response.json({ enabled: false });

  const limited = checkMutationRate(user.id, 20, 60_000);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { description?: unknown } | null;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) {
    return Response.json({ error: "A description is required" }, { status: 400 });
  }
  // Cap input length — a description is a sentence or two, not an essay.
  const userContent = description.slice(0, 800);

  const raw = await recommendSetup(buildSystemPrompt(), userContent);
  // Model/parse failure → null recommendation; the client falls back to the
  // org-type preset. enabled stays true so the client knows AI *is* configured.
  if (!raw) return Response.json({ enabled: true, recommendation: null });

  // Validate every id/key against the real registries before it leaves the route.
  const recommendation = validateRecommendation(raw);
  return Response.json({ enabled: true, recommendation });
}

// GET — cheap "is AI configured?" probe so the onboarding page can decide whether
// to render the describe step without making the founder type first.
export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ enabled: aiEnabled() });
}
