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
  if (!client) client = new OpenAI({ apiKey: key });
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
export interface RawSetupRecommendation {
  enabledWorkflows: string[];
  shownWidgets: string[];
  vocabulary: Record<string, string>;
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
              rationale: { type: "string" },
            },
            // strict mode requires EVERY property listed in `required`.
            required: ["enabledWorkflows", "shownWidgets", "vocabulary", "rationale"],
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
    return {
      enabledWorkflows: parsed.enabledWorkflows.filter((w): w is string => typeof w === "string"),
      shownWidgets: parsed.shownWidgets.filter((w): w is string => typeof w === "string"),
      vocabulary,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
    };
  } catch (e) {
    console.error("recommendSetup() failed:", e);
    return null;
  }
}
