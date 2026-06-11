import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { checkMutationRate } from "@/lib/rate-limit";
import { aiEnabled, recommendSetup, type RawSetupRecommendation } from "@/lib/ai";
import { ALL_WORKFLOWS, type WorkflowId } from "@/lib/org-types";
import { WORKFLOW_FEATURES, normalizeDisabledFeatures, type DisabledFeatures } from "@/lib/workflow-features";
import { VOCAB_KEYS, DEFAULT_LABELS, type VocabKey } from "@/lib/vocab";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { THRESHOLD_KEYS, DEFAULT_THRESHOLDS, resolveThresholds, type Thresholds } from "@/lib/thresholds";
import { generateFieldId, type CustomMemberFieldDef } from "@/lib/custom-member-fields";

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

// A validated non-founder role: name + rank (<100) + a permission BITFIELD (names
// already resolved) + color. The founder admin role is NOT in here — the apply
// step always (re)creates that one itself.
export interface ValidatedRole {
  name: string;
  rank: number;
  permissions: number;   // bitfield
  color: string;
}

const ROLE_RANK_MAX = 90;        // founder admin role owns 100; proposals stay below
const DEFAULT_ROLE_COLOR = "#6366F1";
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Validated recommendation handed to the client. Shapes onto the existing config
// dimensions so the client can PATCH it directly.
export interface ValidatedRecommendation {
  enabledWorkflows: WorkflowId[];
  disabledFeatures: DisabledFeatures;          // inverse of the shown widgets
  vocabularyOverrides: Partial<Record<VocabKey, string>>;
  thresholds: Thresholds;                      // resolved (clamped + defaults filled)
  roles: ValidatedRole[];                      // non-founder roles only
  customMemberFields: CustomMemberFieldDef[];  // 0–5 proposed fields with server-generated ids
  rationale: string;
}

const MAX_AI_FIELDS = 5;
const ALLOWED_FIELD_TYPES = new Set(["text", "number", "select"]);

/** Validate + generate ids for AI-proposed custom member field definitions. */
function validateCustomMemberFields(raw: NonNullable<RawSetupRecommendation["customMemberFields"]>): CustomMemberFieldDef[] {
  const usedIds: string[] = [];
  return raw
    .slice(0, MAX_AI_FIELDS)
    .filter(f => typeof f.label === "string" && f.label.trim().length > 0)
    .map((f, i) => {
      const label = f.label.trim().slice(0, 64);
      const id = generateFieldId(label, usedIds);
      usedIds.push(id);
      return {
        id,
        label,
        type: ALLOWED_FIELD_TYPES.has(f.type) ? f.type : "text",
        showOnRoster: Boolean(f.showOnRoster),
        required: Boolean(f.required),
        rosterOrder: i,
      } satisfies CustomMemberFieldDef;
    })
    .filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i);
}

/** Map permission NAMES to a bitfield, dropping any unknown name. */
function permissionNamesToBits(names: string[]): number {
  return names.reduce((bits, n) => (n in PERMISSIONS ? bits | PERMISSIONS[n as Permission] : bits), 0);
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
  // Thresholds: keep only known keys, then resolve (clamps out-of-range to
  // defaults + fills any the model omitted). resolveThresholds is the same
  // sanitizer setThresholds uses, so a wild number can never persist.
  const thresholdInput: Record<string, number> = {};
  for (const key of THRESHOLD_KEYS) {
    const v = raw.thresholds[key];
    if (typeof v === "number" && Number.isFinite(v)) thresholdInput[key] = v;
  }
  const thresholds = resolveThresholds(thresholdInput);
  // Roles: drop nameless; map perm names→bits (unknown names dropped); clamp rank
  // to [0, 90] so it's always below the founder's rank-100 admin role; validate
  // color. The founder admin role is never in this list — the apply step owns it.
  const roles: ValidatedRole[] = [];
  for (const r of raw.roles) {
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 60) : "";
    if (!name) continue;
    const rank = Number.isFinite(r.rank) ? Math.max(0, Math.min(ROLE_RANK_MAX, Math.round(r.rank))) : 0;
    roles.push({
      name,
      rank,
      permissions: permissionNamesToBits(Array.isArray(r.permissions) ? r.permissions : []),
      color: typeof r.color === "string" && COLOR_RE.test(r.color) ? r.color : DEFAULT_ROLE_COLOR,
    });
  }
  const customMemberFields = validateCustomMemberFields(
    Array.isArray(raw.customMemberFields) ? raw.customMemberFields : [],
  );
  return {
    enabledWorkflows,
    disabledFeatures,
    vocabularyOverrides,
    thresholds,
    roles,
    customMemberFields,
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

THRESHOLDS (member-status cutoffs) — return all five numbers in "thresholds". Defaults are ${JSON.stringify(DEFAULT_THRESHOLDS)}. Tune to the org: a competitive team wants a higher attendance bar (e.g. attendanceAtRisk 80, attendanceWatch 90); a casual club lower (e.g. 40/60). gpaAtRisk/gpaWatch are 0–4 (use the defaults, or low values if the org doesn't track grades). serviceHoursGoal is hours per member (0 if no service tracking). Return the defaults when unsure.

ROLES — propose 2–4 officer roles in "roles" that fit the org (e.g. team → Captain, Co-Captain, Coach; club → President, Vice President, Treasurer, Secretary). Do NOT propose the top admin/founder role — it's added automatically at rank 100. Each role: a short "name", a "rank" 0–90 (higher = more senior), a "color" hex like "#10B981", and "permissions" — an array of ONLY these exact names, just the ones that role needs:
${Object.keys(PERMISSIONS).map(p => `  - ${p}`).join("\n")}
e.g. a Treasurer gets ["MANAGE_TREASURY"]; a generalist VP might get several. Empty permissions for a purely honorific role.

CUSTOM MEMBER FIELDS — propose 2–4 fields that this org type commonly tracks per-person. Return them in "customMemberFields". Each field: a short "label", a "type" ("text", "number", or "select"), "showOnRoster" (true if this belongs as a visible roster column), and "required" (true only if the field is essential). Return [] if custom fields don't make sense for this org.
Examples by org type:
  - Fraternity/sorority: [{label:"Pledge Class",type:"text",showOnRoster:true,required:false},{label:"Major",type:"text",showOnRoster:false,required:false}]
  - Marching band: [{label:"Instrument",type:"text",showOnRoster:true,required:false},{label:"Section",type:"text",showOnRoster:true,required:false}]
  - Sports team: [{label:"Jersey #",type:"number",showOnRoster:true,required:false},{label:"Position",type:"text",showOnRoster:true,required:false}]
  - Generic club: [{label:"Major",type:"text",showOnRoster:false,required:false},{label:"Graduation Year",type:"number",showOnRoster:false,required:false}]
Keep the list short (2–4 fields). Only include fields the org type commonly tracks.

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
