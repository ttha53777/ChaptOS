import OpenAI from "openai";

// Server-only. Never import this from a client component — it reads OPENAI_API_KEY
// and must never reach the browser. All AI calls go through API routes behind auth,
// mirroring the "all DB access through API routes" rule.

// gpt-5.2 is a current-generation model — stronger tool selection and reasoning
// than gpt-4o at comparable latency for our short, tool-heavy turns. Note the API
// shape differs: gpt-5.x reject the legacy `max_tokens` param and require
// `max_completion_tokens` (which also counts reasoning tokens). All call sites use
// MAX_COMPLETION_TOKENS below so a model swap stays a one-place change.
const MODEL = "gpt-5.2";

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null; // feature stays dormant until a key is configured
  if (!client) {
    // Bound every call: without these, a hung connection blocks the request
    // indefinitely. The SDK throws APITimeoutError on timeout, which narrate/
    // recommendSetup's try/catch already degrades to null — so this turns an
    // unbounded hang into a graceful fallback. 30s sits above normal turn
    // latency; maxRetries lets the SDK ride out transient 429s/5xx with backoff.
    // (Streaming routes also need a mid-stream idle watchdog — timeout covers the
    // initial connect / non-stream call, not stalls between chunks.)
    client = new OpenAI({ apiKey: key, timeout: 30_000, maxRetries: 2 });
  }
  return client;
}

/** True when an API key is configured — lets callers skip work when AI is off. */
export function aiEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** Shared OpenAI client. Returns null when no key — callers should fall back gracefully. */
export function getOpenAI(): OpenAI | null {
  return getClient();
}

/** The chat model used app-wide. Kept here so swaps are a one-line change. */
export const CHAT_MODEL = MODEL;

/**
 * Output-token cap for chat turns. On gpt-5.x this is `max_completion_tokens` and
 * counts reasoning tokens too, so it's set well above gpt-4o's old 400 — a low cap
 * can starve the visible answer when the model spends budget on reasoning. Chat
 * answers are still short by design; this just leaves reasoning headroom.
 */
export const MAX_COMPLETION_TOKENS = 2000;

/**
 * Reasoning effort for chat turns. Chat questions are short, tool-heavy lookups
 * — the hard part is picking the right tool + args, which "low" handles as well
 * as the default while spending far fewer reasoning tokens. Cuts time-to-first-
 * token substantially. Bump if eval tool-selection scores regress.
 *
 * gpt-5.2's effort ladder is none < low < medium < high < xhigh ("minimal" is
 * gpt-5.0-only, invalid on 5.2). "none" is the lowest-latency rung. It once
 * 400'd on the live route alongside the route-only params `prompt_cache_key` +
 * `stream:true`, so we sat on "low" — but that combo was re-probed live
 * (2026-06-14) against the real API and now succeeds, emitting the right
 * first-turn tool call. Switched to "none" for the fastest time-to-first-token
 * on tool-selection turns; fall back to "low" if eval tool-selection regresses.
 * NOTE: setting any reasoning_effort makes gpt-5.2 reject a non-default
 * temperature, so there's no temperature here — terseness comes from the prompt.
 */
export const CHAT_REASONING_EFFORT: OpenAI.ReasoningEffort = "none";

/**
 * Generate a short natural-language narration from a system prompt + user content.
 * Returns null on any failure (missing key, network, API error) so callers can
 * degrade gracefully — the structured data always stands on its own.
 */
export async function narrate(system: string, user: string): Promise<string | null> {
  const openai = getClient();
  if (!openai) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      // one short sentence of output, plus reasoning headroom (gpt-5.x counts
      // reasoning tokens against this cap). max_completion_tokens replaces the
      // legacy max_tokens, which gpt-5.x rejects.
      max_completion_tokens: 400,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    return text || null;
  } catch (e) {
    console.error("narrate() failed:", e);
    return null;
  }
}

/**
 * The raw, UNVALIDATED setup recommendation from the model. Every field is the
 * model's free choice and MUST be validated/intersected against the real
 * registries by the caller before use — never trust these ids/keys directly.
 */
export interface RawSetupRoleProposal {
  name: string;
  rank: number;
  permissions: string[];   // permission NAMES (e.g. "MANAGE_TREASURY"), not bits
  color: string;
}

export interface RawSetupCustomField {
  label: string;
  type: "text" | "number" | "select";
  showOnRoster: boolean;
  required: boolean;
}

export interface RawSetupRecommendation {
  enabledWorkflows: string[];
  shownWidgets: string[];
  vocabulary: Record<string, string>;
  // Proposed member-status cutoffs. Numbers only; the caller clamps to bounds
  // via resolveThresholds(). Partial — missing keys fall back to defaults.
  thresholds: Record<string, number>;
  // Proposed non-founder roles. The caller maps permission names→bits, clamps
  // ranks <100, and the founder admin role is added by the apply step, not here.
  roles: RawSetupRoleProposal[];
  // Proposed custom member fields (2–4 max, capped by caller). No id/rosterOrder
  // — those are generated server-side in validateCustomMemberFields(). Optional so
  // existing callers (tests) can omit it before upgrading.
  customMemberFields?: RawSetupCustomField[];
  rationale: string;
}

/**
 * Ask the model to recommend a starting org setup from a free-text description.
 * Output is constrained to a JSON schema so the shape is stable; the ID/KEY
 * VALUES are still arbitrary model output and the caller must validate them
 * against ALL_WORKFLOWS / WORKFLOW_FEATURES / VOCAB_KEYS.
 *
 * `system` should enumerate the valid workflow ids, widget ids, and vocab keys
 * so the model is grounded. Returns null on missing key, network/API error, or
 * unparseable output — the caller falls back to the org-type preset.
 */
/**
 * The raw, UNVALIDATED /create-interview interpretation from the model. Every
 * id/key is the model's free choice and MUST be intersected with the real
 * registries by the caller (validateInterviewResult in the interview route)
 * before use.
 *
 * followUp is flattened into a nullable question + a chips array (instead of a
 * nested nullable object) because strict json_schema handles ["string","null"]
 * unions much more reliably than nullable sub-objects.
 */
export interface RawInterviewMetric {
  name: string;
  unit: string | null;
}

export interface RawInterviewResult {
  reply: string;
  addWorkflows: string[];
  removeWorkflows: string[];
  vocabulary: Record<string, string>;
  kind: string | null;
  variant: string | null;
  customMetrics: RawInterviewMetric[];
  followUpQuestion: string | null;
  followUpChips: string[];
  confidence: "high" | "low";
  // Concierge-stage fields. The four legacy stage prompts leave these at their
  // null/false defaults (they use followUp* + never drive completion); the
  // concierge prompt uses nextQuestion/nextChips/done to lead the conversation
  // and founderName to resolve a field the old stages never carried. (The term
  // is no longer collected here — a fresh org sets it in the workspace via
  // SemesterGate.) One json_schema, two prompt contracts (see the route).
  founderName: string | null;
  nextQuestion: string | null;
  nextChips: string[];
  done: boolean;
}

/**
 * Interpret one free-text /create-interview turn: resolve the founder's words
 * into structured picks and optionally ONE clarifying follow-up question.
 *
 * `system` enumerates the valid ids for the current stage (the route builds
 * it); `messages` is the short interview transcript so far. Non-streaming —
 * these are one-or-two-sentence turns, and a null return (missing key, API
 * error, unparseable output) tells the caller to use its deterministic
 * fallback. reasoning_effort "none" keeps latency down on what is a short
 * classification turn; NOTE gpt-5.2 rejects any non-default temperature once
 * reasoning_effort is set, so none is passed.
 */
export async function interpretInterview(
  system: string,
  messages: { role: "assistant" | "user"; content: string }[],
): Promise<RawInterviewResult | null> {
  const openai = getClient();
  if (!openai) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      // Structured picks + a one-liner reply; reasoning tokens count too.
      max_completion_tokens: 700,
      reasoning_effort: "none",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "interview_interpretation",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              reply:           { type: "string" },
              addWorkflows:    { type: "array", items: { type: "string" } },
              removeWorkflows: { type: "array", items: { type: "string" } },
              // {key,label}[] instead of an open object — strict json_schema
              // rejects open-ended additionalProperties (see recommendSetup).
              vocabulary: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: { key: { type: "string" }, label: { type: "string" } },
                  required: ["key", "label"],
                },
              },
              kind:    { type: ["string", "null"] },
              variant: { type: ["string", "null"] },
              customMetrics: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    unit: { type: ["string", "null"] },
                  },
                  required: ["name", "unit"],
                },
              },
              followUpQuestion: { type: ["string", "null"] },
              followUpChips:    { type: "array", items: { type: "string" } },
              confidence:       { type: "string", enum: ["high", "low"] },
              // Concierge-stage fields (legacy stages return null/[]/false).
              founderName:      { type: ["string", "null"] },
              nextQuestion:     { type: ["string", "null"] },
              nextChips:        { type: "array", items: { type: "string" } },
              done:             { type: "boolean" },
            },
            required: [
              "reply", "addWorkflows", "removeWorkflows", "vocabulary", "kind", "variant",
              "customMetrics", "followUpQuestion", "followUpChips", "confidence",
              "founderName", "nextQuestion", "nextChips", "done",
            ],
          },
        },
      },
      messages: [{ role: "system" as const, content: system }, ...messages],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as Record<string, unknown>;

    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
    const nullableString = (v: unknown): string | null => (typeof v === "string" ? v : null);

    const vocabulary: Record<string, string> = {};
    if (Array.isArray(parsed.vocabulary)) {
      for (const pair of parsed.vocabulary as Array<{ key?: unknown; label?: unknown }>) {
        if (typeof pair?.key === "string" && typeof pair?.label === "string") {
          vocabulary[pair.key] = pair.label;
        }
      }
    }
    const customMetrics: RawInterviewMetric[] = [];
    if (Array.isArray(parsed.customMetrics)) {
      for (const m of parsed.customMetrics as Array<Record<string, unknown>>) {
        if (typeof m?.name !== "string") continue;
        customMetrics.push({ name: m.name, unit: typeof m.unit === "string" ? m.unit : null });
      }
    }

    return {
      reply:            typeof parsed.reply === "string" ? parsed.reply : "",
      addWorkflows:     strings(parsed.addWorkflows),
      removeWorkflows:  strings(parsed.removeWorkflows),
      vocabulary,
      kind:             nullableString(parsed.kind),
      variant:          nullableString(parsed.variant),
      customMetrics,
      followUpQuestion: nullableString(parsed.followUpQuestion),
      followUpChips:    strings(parsed.followUpChips),
      confidence:       parsed.confidence === "low" ? "low" : "high",
      founderName:      nullableString(parsed.founderName),
      nextQuestion:     nullableString(parsed.nextQuestion),
      nextChips:        strings(parsed.nextChips),
      done:             parsed.done === true,
    };
  } catch (e) {
    console.error("interpretInterview() failed:", e);
    return null;
  }
}

export async function recommendSetup(system: string, user: string): Promise<RawSetupRecommendation | null> {
  const openai = getClient();
  if (!openai) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "setup_recommendation",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              enabledWorkflows: { type: "array", items: { type: "string" } },
              shownWidgets:     { type: "array", items: { type: "string" } },
              // Vocabulary as an ARRAY of {key,label} pairs, not an open object:
              // OpenAI strict json_schema rejects objects with open-ended
              // additionalProperties. The caller filters keys to VOCAB_KEYS.
              vocabulary: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: { key: { type: "string" }, label: { type: "string" } },
                  required: ["key", "label"],
                },
              },
              // Member-status cutoffs. strict mode requires every key in `required`,
              // so the model always returns all five (it returns defaults when unsure).
              thresholds: {
                type: "object",
                additionalProperties: false,
                properties: {
                  attendanceAtRisk: { type: "number" },
                  attendanceWatch:  { type: "number" },
                  gpaAtRisk:        { type: "number" },
                  gpaWatch:         { type: "number" },
                  serviceHoursGoal: { type: "number" },
                },
                required: ["attendanceAtRisk", "attendanceWatch", "gpaAtRisk", "gpaWatch", "serviceHoursGoal"],
              },
              // Proposed non-founder roles (the founder admin role is added by the
              // apply step). permissions are NAMES; the caller maps them to bits.
              roles: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name:        { type: "string" },
                    rank:        { type: "number" },
                    permissions: { type: "array", items: { type: "string" } },
                    color:       { type: "string" },
                  },
                  required: ["name", "rank", "permissions", "color"],
                },
              },
              // Custom member fields (2–4 per org; caller caps at 5 + generates ids).
              customMemberFields: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    label:        { type: "string" },
                    type:         { type: "string", enum: ["text", "number", "select"] },
                    showOnRoster: { type: "boolean" },
                    required:     { type: "boolean" },
                  },
                  required: ["label", "type", "showOnRoster", "required"],
                },
              },
              rationale: { type: "string" },
            },
            // strict mode requires EVERY property listed in `required`.
            required: ["enabledWorkflows", "shownWidgets", "vocabulary", "thresholds", "roles", "customMemberFields", "rationale"],
          },
        },
      },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as {
      enabledWorkflows?: unknown;
      shownWidgets?: unknown;
      vocabulary?: unknown;
      thresholds?: unknown;
      roles?: unknown;
      customMemberFields?: unknown;
      rationale?: unknown;
    };
    if (!Array.isArray(parsed.enabledWorkflows) || !Array.isArray(parsed.shownWidgets)) {
      return null;
    }
    // Flatten the {key,label}[] into the Record the caller validates.
    const vocabulary: Record<string, string> = {};
    if (Array.isArray(parsed.vocabulary)) {
      for (const pair of parsed.vocabulary as Array<{ key?: unknown; label?: unknown }>) {
        if (typeof pair?.key === "string" && typeof pair?.label === "string") {
          vocabulary[pair.key] = pair.label;
        }
      }
    }
    // Thresholds: keep only finite numbers; the caller clamps via resolveThresholds.
    const thresholds: Record<string, number> = {};
    if (parsed.thresholds && typeof parsed.thresholds === "object") {
      for (const [k, v] of Object.entries(parsed.thresholds as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v)) thresholds[k] = v;
      }
    }
    // Roles: keep well-formed proposals; the caller maps perms→bits + clamps ranks.
    const roles: RawSetupRoleProposal[] = [];
    if (Array.isArray(parsed.roles)) {
      for (const r of parsed.roles as Array<Record<string, unknown>>) {
        if (typeof r?.name !== "string") continue;
        roles.push({
          name: r.name,
          rank: typeof r.rank === "number" && Number.isFinite(r.rank) ? r.rank : 0,
          permissions: Array.isArray(r.permissions)
            ? (r.permissions as unknown[]).filter((p): p is string => typeof p === "string")
            : [],
          color: typeof r.color === "string" ? r.color : "",
        });
      }
    }
    const customMemberFields: RawSetupCustomField[] = [];
    if (Array.isArray(parsed.customMemberFields)) {
      for (const f of parsed.customMemberFields as Array<Record<string, unknown>>) {
        if (typeof f?.label !== "string") continue;
        customMemberFields.push({
          label:        f.label,
          type:         (f.type === "text" || f.type === "number" || f.type === "select") ? f.type : "text",
          showOnRoster: Boolean(f.showOnRoster),
          required:     Boolean(f.required),
        });
      }
    }
    return {
      enabledWorkflows: parsed.enabledWorkflows.filter((w): w is string => typeof w === "string"),
      shownWidgets: parsed.shownWidgets.filter((w): w is string => typeof w === "string"),
      vocabulary,
      thresholds,
      roles,
      customMemberFields,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
    };
  } catch (e) {
    console.error("recommendSetup() failed:", e);
    return null;
  }
}
