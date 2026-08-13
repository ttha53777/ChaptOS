// Event ideas — opening a tapped Ask Chapt suggestion into a real proposal.
//
// An advisory answer about programming ends in rows like "Weekly Brotherhood
// Dinner", each one a whole event compressed into a title and a clause about
// why it matters. Tapping one used to navigate to the Events screen, which is
// where the idea went to die: the officer arrived at an empty calendar holding
// nothing but a remembered phrase, and had to retype the idea as a form.
//
// This service turns that row into two things the panel shows together — the
// reasoning behind the idea in enough depth to decide on it, and a prefilled
// proposal card that books it. Both come back in ONE request; the panel opens
// instantly on the row's own text and fills in as they land.
//
// What is NOT here is as deliberate as what is. The card carries a title and a
// category and nothing else: no date, no time, no location, no description.
// Those are the fields only the chapter can answer, and a plausible-looking
// guess in a date field is worse than an empty one — it's a wrong answer
// wearing the costume of a filled form, one Confirm away from a real event on
// a real calendar. The model is told this in the prompt and, more importantly,
// is never asked for them: buildEventIdeaProposal doesn't accept a date at all.

import type { RequestContext } from "@/lib/context";
import { ValidationError } from "@/lib/errors";
import { getOpenAI, CHAT_MODEL } from "@/lib/ai";
import { runProposal, type Proposal } from "@/lib/ai-tools";
import { logError } from "@/lib/observability";
import type { EventIdeaInput } from "@/lib/validation/ai";

/** One event type as the panel's category chips need it. */
export interface EventIdeaCategory {
  slug: string;
  label: string;
  /** Chapter events must be mandatory — the card enforces it, so it must know. */
  mandatoryDefault: boolean;
}

export interface EventIdeaCard {
  /** The idea's title, echoed back — the panel's heading. */
  title: string;
  /** Prose explaining the idea. Empty when the model is unavailable. */
  explanation: string;
  /** The org's creatable event types, for the card's category chips. */
  categories: EventIdeaCategory[];
  /** The category prefilled on the card, or null when nothing matched safely. */
  category: string | null;
  /**
   * The signed proposal — permission resolved, HMAC applied, server-built. The
   * panel edits its payload locally but can never mint one of these itself,
   * which is what keeps the approval record trustworthy.
   */
  proposal: Proposal | null;
  /** Why `proposal` is null, for the panel to explain rather than fail silently. */
  blocked?: string;
}

/**
 * Category chips the panel may offer. Mirrors proposeAddCalendarEvent's own
 * check (creatable, not hidden) so a chip can never name a type the proposal
 * handler would then reject — the panel must not offer a choice that fails on
 * Confirm.
 */
async function usableCategories(ctx: RequestContext): Promise<EventIdeaCategory[]> {
  const rows = await ctx.db.calendarEventType.findMany({
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows
    .filter(t => t.creatable && !t.hidden)
    .map(t => ({ slug: t.slug, label: t.label, mandatoryDefault: t.mandatoryDefault }));
}

/**
 * Guess which of the org's event types a suggestion belongs to, from the words
 * the suggestion itself uses.
 *
 * Category is the one field beyond the title we prefill, and it earns that by
 * being cheap to check and cheap to fix: it renders as a visible chip row with
 * the pick highlighted, so a wrong guess is one tap from right. Contrast a date,
 * which looks equally authoritative and is silently wrong.
 *
 * Deliberately conservative — an unrecognised idea returns null and the user
 * picks, rather than defaulting to whatever type happens to sort first.
 */
function guessCategory(text: string, categories: EventIdeaCategory[]): string | null {
  const hay = text.toLowerCase();
  // A type whose own label appears in the idea is as certain as this gets.
  const byLabel = categories.find(c => c.label.length > 2 && hay.includes(c.label.toLowerCase()));
  if (byLabel) return byLabel.slug;

  // Otherwise map the vocabulary of the idea onto type slugs, most specific
  // first. Only slugs the org actually has can win.
  const has = (slug: string) => categories.find(c => c.slug === slug)?.slug ?? null;
  const hints: Array<[RegExp, string]> = [
    [/\b(service|volunteer|philanthrop|charity|cleanup|donat)/, "service"],
    [/\b(fundrais|fundy|raise money|profit share)/, "fundraiser"],
    [/\b(rush|recruit)/, "rush"],
    [/\b(dinner|social|game night|movie|bowling|intramural|sports|retreat|brotherhood|mixer|tailgate|party)/, "social"],
    [/\b(workshop|speaker|study|academic|professional|résumé|resume|career|alumni panel)/, "program"],
    [/\b(chapter meeting|weekly meeting|formal meeting)/, "chapter"],
  ];
  for (const [re, slug] of hints) {
    if (re.test(hay)) {
      const hit = has(slug);
      if (hit) return hit;
    }
  }
  return null;
}

const EXPLAIN_SYSTEM = `You are advising a college fraternity/organization officer who is considering running a specific event. They tapped one suggestion to learn more before scheduling it.

Write 3 short paragraphs, plain prose, no headings, no markdown, no bullet points, no lists:
1. Why this event works for the chapter — what it actually builds, and who it reaches.
2. Roughly how it runs — cadence, the shape of an evening, who owns it.
3. Ballpark cost and effort, hedged honestly (say "roughly", "usually", "depends on turnout"). Use plain dollar ranges per head where useful.

Rules:
- NEVER suggest a specific date, day of the week as a commitment, time, or venue name. The officer's chapter owns its calendar; you do not know it. Speak in terms of cadence ("weekly", "once a term") only.
- Be concrete and grounded, not promotional. No exclamation marks, no hype, no "unforgettable".
- Under 160 words total. Write to a busy officer who is deciding, not to a crowd.`;

/**
 * The explanation prose. Returns "" on any failure — a panel with a card and no
 * essay is still useful, so nothing here is allowed to fail the request.
 */
async function explainIdea(input: EventIdeaInput, orgId: number): Promise<string> {
  const openai = getOpenAI();
  if (!openai) return "";
  try {
    const context = [
      `Event idea: ${input.title}`,
      input.subtitle ? `Why it was suggested: ${input.subtitle}` : "",
      input.question ? `The officer had asked: ${input.question}` : "",
    ].filter(Boolean).join("\n");
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      // Three short paragraphs, plus gpt-5.x reasoning headroom on the same cap.
      max_completion_tokens: 900,
      // Explaining a familiar kind of event is recall, not deduction — effort
      // here buys latency, not quality, and this blocks a panel the user is
      // already looking at. NOTE: any reasoning_effort makes gpt-5.2 reject a
      // non-default temperature, so tone comes from the prompt (see lib/ai).
      reasoning_effort: "none",
      prompt_cache_key: `event-idea-org-${orgId}`,
      messages: [
        { role: "system", content: EXPLAIN_SYSTEM },
        { role: "user", content: context },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    logError(e, { route: "lib/services/event-idea:explainIdea", extra: { orgId } });
    return "";
  }
}

/**
 * Build the signed proposal behind an idea.
 *
 * The date problem: runProposal validates propose_add_calendar_event, whose
 * schema requires a date — the card is normally minted only once the model has
 * one. Here we deliberately have none, and refuse to invent one. So the draft is
 * signed against a PLACEHOLDER date that the panel must overwrite before its
 * Confirm enables, and `date` is returned blank on the card.
 *
 * That placeholder never reaches the calendar: the panel's own gate keeps
 * Confirm disabled until the user picks a real date, and /api/calendar re-parses
 * and re-authorizes whatever is finally posted. The signature covers the draft
 * as an audit artifact of what was PROPOSED, and the approval record is written
 * from the edited payload the user actually confirmed.
 */
async function buildEventIdeaProposal(
  ctx: RequestContext,
  title: string,
  category: string,
): Promise<Proposal | { error: string }> {
  return runProposal(
    "propose_add_calendar_event",
    { title, date: PLACEHOLDER_DATE, category },
    ctx.db,
    {
      orgId:           ctx.orgId,
      actorId:         ctx.actorId,
      permissions:     ctx.permissions,
      isOrgAdmin:      ctx.isOrgAdmin,
      isPlatformAdmin: ctx.isPlatformAdmin,
    },
  );
}

/**
 * A date the schema accepts and no chapter would ever mean. It exists only to
 * get a well-formed draft through validation; the panel blanks the field and
 * blocks Confirm until a real one is chosen, so this string is never what gets
 * booked. Kept obviously synthetic so it's unmistakable if it ever surfaces.
 */
const PLACEHOLDER_DATE = "1970-01-01";

/** True when a payload still carries the placeholder — never confirmable. */
export function isPlaceholderDate(date: unknown): boolean {
  return date === PLACEHOLDER_DATE;
}

/**
 * Open an event idea: the explanation and the prefilled, signed proposal.
 *
 * The two halves are independent on purpose. A member without MANAGE_EVENTS
 * still gets the full explanation and a card that renders its own permission
 * gate — the same blocked-not-routed treatment every other writ card gets,
 * because there is no officer-approval queue for this path yet.
 */
export async function getEventIdea(ctx: RequestContext, input: EventIdeaInput): Promise<EventIdeaCard> {
  const categories = await usableCategories(ctx);
  if (categories.length === 0) {
    throw new ValidationError("This chapter has no event types that new events can be created under.");
  }

  const category = guessCategory(`${input.title} ${input.subtitle ?? ""}`, categories);

  // The prose and the card are independent — run them together so the panel
  // waits for the slower one, not for their sum.
  const [explanation, drafted] = await Promise.all([
    explainIdea(input, ctx.orgId),
    // With no confident category we still need a signed card, so the draft is
    // built against the first usable type and the panel starts with no chip
    // selected — the user's pick rewrites `category` in the payload before
    // Confirm unlocks, exactly as it rewrites the date.
    buildEventIdeaProposal(ctx, input.title, category ?? categories[0].slug),
  ]);

  if ("error" in drafted) {
    logError(new Error(drafted.error), {
      route: "lib/services/event-idea:getEventIdea",
      extra: { orgId: ctx.orgId, title: input.title },
    });
    return { title: input.title, explanation, categories, category, proposal: null, blocked: drafted.error };
  }

  return { title: input.title, explanation, categories, category, proposal: drafted };
}
