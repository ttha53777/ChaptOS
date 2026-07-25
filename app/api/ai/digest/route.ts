import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { checkMutationRate } from "@/lib/rate-limit";
import { aiEnabled, narrate } from "@/lib/ai";
import { getOrgType } from "@/lib/org-types";
import { resolveLabel, type VocabOverrides } from "@/lib/vocab";

// In-memory narration cache, keyed by a content hash of the week's digest.
// The same weekly-digest state is narrated once per warm server instance;
// the client also persists per-key in localStorage. Resets on deploy/cold start.
declare global {
  // eslint-disable-next-line no-var
  var _digestNarrationCache: Map<string, string> | undefined;
}
const cache: Map<string, string> = globalThis._digestNarrationCache ?? new Map();
globalThis._digestNarrationCache = cache;

/**
 * The narration persona, built from the org's own type and vocabulary.
 *
 * Hardcoding "college fraternity chapter" / "brothers" meant a sports team, a
 * theatre company and a nonprofit all got fraternity-voiced summaries. The org
 * type and labels are read server-side from the request context rather than
 * accepted from the client, so a caller can't steer the prompt.
 */
function buildSystemPrompt(orgTypeLabel: string, memberPlural: string): string {
  return `You are an assistant for a ${orgTypeLabel}'s operations dashboard.
Given a JSON summary, write ONE short sentence (max ~15 words) an officer can read at a glance. Refer to people as "${memberPlural}". Be terse and specific. No markdown, no greeting, no preamble — just the single sentence.

Reading the summary:
- scheduledThisWeekCount is how many things fall inside this week. When it is 0, nothing is scheduled — say so plainly.
- deadlinesOverdueFromEarlier counts work due BEFORE this week that is still open. It is NOT part of this week's schedule. When it is above 0 you MUST mention it, even if the week itself is empty.
- Never write "no deadlines" (or similar) when deadlinesOverdueFromEarlier is above 0 — those deadlines exist and are late.

Rules:
- Lead with whatever is most actionable: overdue work first, then this week's items.
- Do not restate the week's dates; the dashboard already displays them.
- Never invent deadlines, events, or urgency that are not in the summary. A genuinely quiet week is a valid and useful thing to report.`;
}

interface DigestBody {
  key: string;
  weekRange: { start: string; end: string };
  deadlines: { title: string; dueDate: string }[];
  instagram: { title: string; dueDate: string }[];
  events: { title: string; date: string }[];
  parties: { name: string; date: string }[];
  atRiskCount: number;
  overdueCount: number;
}

export async function POST(req: NextRequest) {
  // Membership gate (see ai/chat): operates on chapter data, so require an
  // active membership, not just a resolvable org. Rate limit handled below.
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;

  // Feature dormant without a key — tell the client so it stops asking.
  if (!aiEnabled()) return Response.json({ narration: null, enabled: false });

  const limited = checkMutationRate(ctx.actorId, 20, 60_000);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as DigestBody | null;
  if (!body || typeof body.key !== "string" || !body.key) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  // Namespace the cache by org: the prompt now varies per org, so two orgs must
  // never share a narration even if their content keys coincide.
  const cacheKey = `${ctx.orgId}|${body.key}`;

  // Cache hit: return the already-generated narration without calling the model.
  const cached = cache.get(cacheKey);
  if (cached) return Response.json({ narration: cached, enabled: true, cached: true });

  // Persona comes from the org record, never the request body.
  const org = await ctx.db.organization.findUnique({
    where: { id: ctx.orgId },
    select: { orgType: true, config: { select: { vocabularyOverrides: true } } },
  });
  const orgTypeLabel = getOrgType(org?.orgType)?.label.toLowerCase() ?? "student organization";
  const memberPlural = resolveLabel(
    "Member",
    (org?.config?.vocabularyOverrides ?? {}) as VocabOverrides,
    true,
  ).toLowerCase();

  // Compact summary — we send counts + item titles/dates, never raw DB rows.
  // Field names are deliberately explicit about the this-week / earlier split:
  // given a bare `deadlinesDue: []` next to an overdue count, the model reads
  // the empty array and reports "no deadlines" while three sit overdue on the
  // same screen.
  const deadlinesDueThisWeek = (body.deadlines ?? []).slice(0, 10);
  const instagramDueThisWeek = (body.instagram ?? []).slice(0, 10);
  const eventsThisWeek       = (body.events ?? []).slice(0, 10);
  const partiesThisWeek      = (body.parties ?? []).slice(0, 10);
  const summary = {
    scheduledThisWeekCount:
      deadlinesDueThisWeek.length + instagramDueThisWeek.length +
      eventsThisWeek.length + partiesThisWeek.length,
    deadlinesDueThisWeek,
    instagramDueThisWeek,
    eventsThisWeek,
    partiesThisWeek,
    membersFlaggedAtRisk: body.atRiskCount ?? 0,
    deadlinesOverdueFromEarlier: body.overdueCount ?? 0,
  };

  const narration = await narrate(buildSystemPrompt(orgTypeLabel, memberPlural), JSON.stringify(summary));
  if (narration) cache.set(cacheKey, narration);

  return Response.json({ narration, enabled: true });
}
