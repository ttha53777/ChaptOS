import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { checkMutationRate } from "@/lib/rate-limit";
import { aiEnabled, narrate } from "@/lib/ai";

// In-memory narration cache, keyed by a content hash of the week's digest.
// The same weekly-digest state is narrated once per warm server instance;
// the client also persists per-key in localStorage. Resets on deploy/cold start.
declare global {
  // eslint-disable-next-line no-var
  var _digestNarrationCache: Map<string, string> | undefined;
}
const cache: Map<string, string> = globalThis._digestNarrationCache ?? new Map();
globalThis._digestNarrationCache = cache;

const SYSTEM = `You are an assistant for a college fraternity chapter's operations dashboard.
Given a JSON summary of this week's agenda (deadlines, Instagram tasks, mandatory events, parties, and how many brothers are flagged at-risk), write ONE short sentence (max ~15 words) an officer can read at a glance.
Lead with what matters most this week. Be terse and specific. No markdown, no greeting, no preamble — just the single sentence.`;

interface DigestBody {
  key: string;
  weekRange: { start: string; end: string };
  deadlines: { title: string; dueDate: string }[];
  instagram: { title: string; dueDate: string }[];
  events: { title: string; date: string }[];
  parties: { name: string; date: string }[];
  atRiskCount: number;
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

  // Cache hit: return the already-generated narration without calling the model.
  const cached = cache.get(body.key);
  if (cached) return Response.json({ narration: cached, enabled: true, cached: true });

  // Compact summary — we send counts + item titles/dates, never raw DB rows.
  const summary = {
    weekRange: body.weekRange,
    deadlinesDue: (body.deadlines ?? []).slice(0, 10),
    instagramDue: (body.instagram ?? []).slice(0, 10),
    mandatoryEvents: (body.events ?? []).slice(0, 10),
    parties: (body.parties ?? []).slice(0, 10),
    atRiskCount: body.atRiskCount ?? 0,
  };

  const narration = await narrate(SYSTEM, JSON.stringify(summary));
  if (narration) cache.set(body.key, narration);

  return Response.json({ narration, enabled: true });
}
