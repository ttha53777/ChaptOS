import OpenAI from "openai";

// Server-only. Never import this from a client component — it reads OPENAI_API_KEY
// and must never reach the browser. All AI calls go through API routes behind auth,
// mirroring the "all DB access through API routes" rule.

const MODEL = "gpt-4o-mini";

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
      max_tokens: 60, // one short sentence — keep it cheap
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
