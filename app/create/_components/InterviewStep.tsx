"use client";

/**
 * Step 2 — INTERVIEW. A scripted spine with AI branches.
 *
 * The question skeleton is deterministic (a warm intro that captures the
 * founder's name → kind → variant → activity → metrics) and every CHIP tap is
 * handled locally with zero AI. (The founder's seat title keeps the kind
 * default, editable on the Roles step; the current term is set later, in the
 * workspace — see SemesterGate.) Free-text answers route through
 * POST /api/ai/interview when it's configured (probed once on mount): the
 * model interprets the words into structured picks and — on the activity
 * stage — may ask up to MAX_ACTIVITY_FOLLOWUPS specific clarifying questions
 * to settle the page set. Any AI failure falls back to the keyword matchers,
 * so the conversation never blocks on the model.
 *
 * AI picks dispatch the SAME reducer actions the founder's own taps use
 * (applyAiPicks = workflow toggles + vocab chips), and the blueprint review
 * still stands between this chat and anything being built.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Draft } from "@/lib/onboarding/draft";
import {
  BUILTIN_METRIC_IDS,
  BUILTIN_METRIC_LABEL,
  KIND_VARIANTS,
  VARIANT_QUESTION,
  matchKind,
  matchVariant,
  type BuiltinMetricId,
  type KindId,
} from "@/lib/onboarding/kinds";
import type { WorkflowId } from "@/lib/org-types";
import { draftVocab, type FlowAction } from "./flow-state";
import {
  askInterviewAi,
  probeInterviewAi,
  missingFields,
  ACTIVITIES_CHIP,
  type InterviewAiResult,
  type InterviewAiTurn,
} from "./interview-ai";
import type { SheetFlash } from "./BlueprintSheet";

/**
 * The "normal month — which of these happen?" checklist (beat 4). Each option
 * pairs the founder-facing label with the workflow id(s) it enables. This table
 * MUST mirror the ACTIVITY → PAGE MAPPING block in the concierge prompt
 * (app/api/ai/interview/route.ts) so the tapped-checklist path and the model's
 * free-text path resolve identical pages. Rendered as a multi-select grid (the
 * same accumulate-then-submit pattern the scripted metrics picker uses) because
 * its six options exceed the concierge's 4-chip cap.
 */
const ACTIVITY_OPTIONS: { id: string; label: string; workflows: WorkflowId[] }[] = [
  { id: "meetings",  label: "Chapter meetings",             workflows: ["meetings"] },
  { id: "socials",   label: "Social events or parties",     workflows: ["parties"] },
  { id: "service",   label: "Service or volunteering",      workflows: ["service"] },
  { id: "fundraise", label: "Fundraisers or programs",      workflows: ["events", "finance"] },
  { id: "tasks",     label: "Handing out tasks/deadlines",  workflows: ["tasks"] },
  { id: "online",    label: "Posting content online",       workflows: ["communications"] },
];

type Stage =
  | "intro"
  | "kind"
  | "variant"
  | "activity"
  | "metrics"
  | "done";

type Msg = { id: number; kind: "bot" | "q" | "user"; body: ReactNode };
type Chip = { label: string; pick: () => void };

/** Activity-stage clarify loop: at most this many AI follow-up questions
    (≈6 questions total in the workflow portion, counting the opener). Used by
    the SCRIPTED fallback path only. */
const MAX_ACTIVITY_FOLLOWUPS = 5;

/** Concierge (AI-led) loop cap: after this many model-driven turns we stop
    asking the model and drain any still-missing fields through the scripted
    machine, so the interview always terminates regardless of model behavior. */
const MAX_CONCIERGE_TURNS = 12;

/** Canonical order the scripted machine collects fields in — used to pick the
    resume stage when the concierge hands off (mid-conversation fallback or the
    early-exit/loop-cap backstop). First still-missing stage wins. */
const STAGE_ORDER: Stage[] = [
  "intro", "kind", "variant", "activity", "metrics",
];

/** How long the "typing…" indicator shows before an AI reply lands — scaled to
    the reply length so a longer message "takes longer to type" (reads far more
    human than a fixed delay). The scripted path keeps its own fixed timings. */
function typingDelay(text: string): number {
  return Math.min(1400, Math.max(500, 400 + text.length * 12));
}

const KIND_REPLIES: Record<KindId, ReactNode> = {
  fraternity: <>A fraternity — so it&rsquo;s <b>Brothers</b>, <b>Chapter</b>, and <b>Semesters</b> from here on. The words are set; what you actually <em>do</em> comes next.</>,
  sorority:   <>A sorority — <b>Sisters</b>, <b>Chapter</b>, <b>Semesters</b>. The words are set; now let&rsquo;s get the substance right.</>,
  club:       <>Got it — <b>Members</b> and <b>Meetings</b>, no Greek assumed. Now let&rsquo;s pin down what kind of club.</>,
  team:       <>A team — <b>Players</b>, <b>Practice</b>, <b>Seasons</b>. One more question tells me how serious it is.</>,
  service:    <>A service org — <b>service hours</b> lead and the words stay plain. Let&rsquo;s check the pages fit.</>,
  honor:      <>An honor society — <b>standards</b> and <b>attendance</b> lead; parties stay off. Let&rsquo;s check the pages.</>,
  arts:       <>A performing-arts group — <b>Rehearsals</b> and a calendar built for performing. One more question.</>,
  other:      <>Got it — I&rsquo;ll start you neutral: <b>Members</b>, <b>Meetings</b>, and only the pages you turn on.</>,
};

const VARIANT_REPLIES: Record<string, ReactNode> = {
  "fraternity:social":       <>The classic shape — <b>parties, dues, service</b>, the whole chapter machine. It&rsquo;s all on the sheet.</>,
  "fraternity:professional": <>Parties off, <b>pro-dev on</b> — events, dues and attendance lead, with VP Membership and VP Professional Development seats.</>,
  "fraternity:service":      <><b>Service hours front and center</b>, parties off — a Service Chair seat is on the sheet.</>,
  "fraternity:honor":        <><b>Standards and attendance</b> lead; parties are off and a Standards Chair holds the line.</>,
  "club:casual":             <>Kept light — <b>events and comms</b>, no roll call, no treasury until you need them.</>,
  "club:pre-professional":   <><b>Dues, attendance</b> and a Professional Dev Chair — built for a serious roster.</>,
  "club:competition":        <><b>Attendance counts</b> and logistics matter — a Logistics Lead seat is ready.</>,
  "club:cultural":           <><b>Events and announcements</b> lead — festivals and showcases, with a treasury kept for fundraising.</>,
  "team:competitive":        <>League-ready — <b>attendance mandatory</b>, and a treasury for fees and travel.</>,
  "team:casual":             <>Loose and easy — <b>no roll call</b>, no coach seat, just the roster and the calendar.</>,
  "arts:production":         <>Rehearsals building to a run — <b>Stage Manager</b> and the full production bench.</>,
  "arts:ensemble":           <>Rehearsals and gigs — no stage-manager hierarchy, and a <b>Music Director</b> seat instead.</>,
};

function titleCase(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .replace(/\b[a-z]/g, c => c.toUpperCase());
}

/** Pull a founder's name out of a free-text intro ("hey, I'm Alex — starting a
    frat" → "Alex"). Deterministic fallback for the scripted path (the concierge
    extracts founderName via the model). Strips a leading greeting + self-intro
    lead-in, then keeps the first 1–3 name-ish words before any sentence break.
    Returns "" when nothing name-like is found, so the caller falls back to the
    Google name. */
function extractFounderName(text: string): string {
  let s = text.trim().replace(/\s+/g, " ");
  // Drop a leading greeting: "hi", "hey", "hello", "yo", optionally with "there".
  s = s.replace(/^(hi|hey|hello|yo|hiya|howdy)\b[\s,!.]*(there\b[\s,!.]*)?/i, "");
  // Drop a self-intro lead-in. Order matters: "my name is" must be tried before
  // "my name('s)" so the "is" isn't left behind.
  s = s.replace(/^(i'?m|i am|my name is|my name'?s|this is|it'?s|name'?s|call me)\b[\s,:]*/i, "");
  // Take the run up to the first sentence break — punctuation that separates
  // clauses (comma, period, semicolon, spaced dash) or a filler/verb word.
  // NOTE: a bare hyphen is NOT a break (keeps "Jean-Luc" intact).
  const head =
    s.split(/[,.;]|\s[—–-]\s|\b(?:and|but|from|starting|setting|here|founder|president|the)\b/i)[0]?.trim() ?? "";
  // Keep at most three name-ish words: alphabetic (apostrophes/hyphens allowed),
  // and drop filler articles/pronouns that aren't names.
  const STOP = new Set(["the", "a", "an", "im", "and", "of", "my", "our"]);
  const words = head
    .split(" ")
    .filter(Boolean)
    .filter(w => /^[\p{L}][\p{L}'’-]*$/u.test(w) && !STOP.has(w.toLowerCase()))
    .slice(0, 3);
  return titleCase(words.join(" ")).slice(0, 60);
}

export function InterviewStep({
  draft,
  dispatch,
  onFlash,
  onDone,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  onFlash: (section: NonNullable<SheetFlash>["section"]) => void;
  onDone: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [chips, setChips] = useState<Chip[] | null>(null);
  const [stage, setStage] = useState<Stage>("kind");
  const [showCta, setShowCta] = useState(false);
  const [draftText, setDraftText] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextId = useRef(0);

  // AI plumbing: availability (probed once), the activity clarify-loop
  // transcript, and how many follow-ups the model has already spent.
  const aiOn = useRef(false);
  const activityTranscript = useRef<InterviewAiTurn[]>([]);
  const activityFollowUps = useRef(0);

  // Concierge (AI-led) plumbing. `mode` decides which driver owns the
  // conversation: "ai" = the concierge asks its own questions; "scripted" = the
  // deterministic spine (also the mid-conversation fallback target). The whole
  // interview flows through convoTranscript; convoTurns caps the model loop.
  const [mode, setMode] = useState<"ai" | "scripted">("scripted");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const convoTranscript = useRef<InterviewAiTurn[]>([]);
  const convoTurns = useRef(0);

  // The activities beat (beat 4) renders a multi-select checklist in place of
  // tap-chips: when non-null, the checklist grid is shown and this Set holds the
  // founder's in-progress selections (ACTIVITY_OPTIONS ids). Null the rest of
  // the time. Submitting ("Done →") clears it and resumes the concierge loop.
  const [activityPicks, setActivityPicks] = useState<Set<string> | null>(null);

  // Refs mirror the latest draft/stage for use inside timeouts/async handlers.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const stageRef = useRef(stage);
  stageRef.current = stage;

  function later(fn: () => void, ms: number) {
    timers.current.push(setTimeout(fn, ms));
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages, typing, chips, showCta, draft.metrics]);

  function push(kind: Msg["kind"], body: ReactNode) {
    setMessages(m => [...m, { id: nextId.current++, kind, body }]);
  }

  const vocab = (key: Parameters<typeof draftVocab>[1], plural = false) =>
    draftVocab(draftRef.current, key, plural);

  /* ─── The question script ─────────────────────────────────────────────── */

  function ask(stage: Stage) {
    setStage(stage);
    switch (stage) {
      case "intro": {
        push("q", <>Hi! I&rsquo;ll help you set up <em>{draftRef.current.name.trim() || "your organization"}</em> in a few minutes. First though — who do I have the pleasure of meeting?</>);
        setChips([{ label: "I'll use my Google name", pick: () => answerIntro("", "I'll use my Google name") }]);
        break;
      }
      case "kind": {
        push("q", <>Tell me about <em>{draftRef.current.name.trim() || "your organization"}</em> — what kind of organization is it?</>);
        setChips([
          { label: "A fraternity", pick: () => answerKind("fraternity", "A fraternity") },
          { label: "A sorority", pick: () => answerKind("sorority", "A sorority") },
          { label: "A club or student org", pick: () => answerKind("club", "A club or student org") },
          { label: "A sports team", pick: () => answerKind("team", "A sports team") },
          { label: "A service org", pick: () => answerKind("service", "A service org") },
          { label: "An honor society", pick: () => answerKind("honor", "An honor society") },
          { label: "A performing-arts group", pick: () => answerKind("arts", "A performing-arts group") },
          { label: "Something else", pick: () => answerKind("other", "Something else") },
        ]);
        break;
      }
      case "variant": {
        const kind = draftRef.current.kind;
        const variants = kind ? KIND_VARIANTS[kind] : undefined;
        if (!kind || !variants?.length) return ask("activity");
        push("q", <>{VARIANT_QUESTION[kind]}</>);
        setChips(variants.map(v => ({ label: v.label, pick: () => answerVariant(v.id, v.label) })));
        break;
      }
      case "activity": {
        const q = `Look at the Pages list on the sheet — in a sentence or two, what does ${draftRef.current.name.trim() || "your org"} actually do, and did I get anything wrong?`;
        activityTranscript.current = [{ role: "q", text: q }];
        activityFollowUps.current = 0;
        push("q", <>Look at the <b>Pages</b> list on the sheet — in a sentence or two, what does <em>{draftRef.current.name.trim() || "your org"}</em> actually do, and did I get anything wrong?</>);
        setChips([{ label: "Looks right — next", pick: () => answerActivitySkip() }]);
        break;
      }
      case "metrics": {
        push("q", <>What should I track for each {vocab("Member").toLowerCase()}? Tap everything you want on the sheet — or type your own.</>);
        setChips(null); // metrics chips render live from the draft, below
        break;
      }
      case "done": {
        dispatch({ type: "interviewDone" });
        later(() => setShowCta(true), 500);
        break;
      }
    }
  }

  /** Scripted beat: clear chips, type, reply, then ask the next question. */
  function respond(reply: ReactNode, next: Stage, flash?: NonNullable<SheetFlash>["section"]) {
    setChips(null);
    setTyping(true);
    if (flash) later(() => onFlash(flash), 500);
    later(() => {
      setTyping(false);
      push("bot", reply);
      later(() => ask(next), 650);
    }, 850);
  }

  /* ─── Answers (chips = deterministic; free-text may go through AI) ─────── */

  function answerKind(kind: KindId, label: string) {
    push("user", label);
    dispatch({ type: "setKind", kind });
    onFlash("pages");
    respond(KIND_REPLIES[kind], "variant", "words");
  }

  function answerVariant(variantId: string, label: string) {
    const kind = draftRef.current.kind ?? "other";
    push("user", label);
    dispatch({ type: "setVariant", variant: variantId });
    onFlash("pages");
    respond(
      VARIANT_REPLIES[`${kind}:${variantId}`] ?? <>Got it — I&rsquo;ve tuned the pages and seats for that.</>,
      "activity",
      "seats",
    );
  }

  function answerActivitySkip() {
    push("user", "Looks right — next");
    respond(<>Then the pages stand. One more thing.</>, "metrics");
  }

  /** The activity clarify loop: free-text and follow-up answers both land here. */
  async function answerActivity(text: string) {
    push("user", text);
    activityTranscript.current.push({ role: "user", text });
    setChips(null);
    setTyping(true);

    const result = aiOn.current
      ? await askInterviewAi("activity", draftRef.current, activityTranscript.current)
      : null;
    setTyping(false);

    if (!result) {
      // Deterministic fallback: no interpretation, no loop — the blueprint's
      // toggles are one step away, so acknowledge and move on.
      push("bot", <>Noted — you can flip any page on or off when you review the blueprint. One more thing.</>);
      later(() => ask("metrics"), 650);
      return;
    }

    dispatch({ type: "applyAiPicks", picks: result.picks });
    if (result.picks.addWorkflows.length || result.picks.removeWorkflows.length) onFlash("pages");
    if (Object.keys(result.picks.vocab).length) later(() => onFlash("words"), 450);
    push("bot", <>{result.reply || "Got it — the sheet's updated."}</>);

    const followUp = activityFollowUps.current < MAX_ACTIVITY_FOLLOWUPS ? result.followUp : null;
    if (!followUp) {
      later(() => ask("metrics"), 650);
      return;
    }
    activityFollowUps.current += 1;
    activityTranscript.current.push({ role: "q", text: followUp.question });
    later(() => {
      push("q", <>{followUp.question}</>);
      setChips([
        ...followUp.chips.map(c => ({ label: c, pick: () => void answerActivity(c) })),
        { label: "That's everything — next", pick: () => answerActivityDone() },
      ]);
    }, 650);
  }

  function answerActivityDone() {
    push("user", "That's everything — next");
    respond(<>Good — the pages are settled. One more thing.</>, "metrics");
  }

  function toggleMetric(metric: BuiltinMetricId) {
    dispatch({ type: "setBuiltinMetric", metric, on: !draftRef.current.metrics[metric] });
    onFlash("metrics");
  }

  /** Free-text at the metrics stage — an extra thing to track per member. */
  async function answerMetricText(text: string) {
    push("user", text);
    setTyping(true);
    const result = aiOn.current
      ? await askInterviewAi("metrics", draftRef.current, [
          { role: "q", text: "What else should be tracked per member?" },
          { role: "user", text },
        ])
      : null;
    setTyping(false);

    const metrics = result?.picks.customMetrics.length
      ? result.picks.customMetrics
      : [{ name: titleCase(text).slice(0, 40), unit: null }];
    for (const m of metrics) dispatch({ type: "addCustomMetric", name: m.name, unit: m.unit });
    onFlash("metrics");
    push(
      "bot",
      result?.reply ? (
        <>{result.reply}</>
      ) : (
        <>Added <b>{metrics.map(m => m.name).join(", ")}</b> — every {vocab("Member").toLowerCase()} gets a column for it.</>
      ),
    );
  }

  function answerMetricsDone() {
    const m = draftRef.current.metrics;
    const tracked = BUILTIN_METRIC_IDS.filter(id => m[id]).map(id => BUILTIN_METRIC_LABEL[id].toLowerCase());
    const all = [...tracked, ...m.custom.map(c => c.name.toLowerCase())];
    push("user", "That's the list");
    respond(
      all.length ? (
        <>Tracking <b>{all.join(", ")}</b> per {vocab("Member").toLowerCase()} — that&rsquo;s the whole blueprint. Let&rsquo;s set up the rest of your roles.</>
      ) : (
        <>Nothing tracked per {vocab("Member").toLowerCase()} — the dashboard stays clean, and you can add measures in Settings anytime. That&rsquo;s the whole blueprint; let&rsquo;s set up your roles.</>
      ),
      "done",
      "metrics",
    );
  }

  /** The opener: the founder introduces themselves; we pull their name out of
      the free text (or fall back to the Google name via the chip) and move on
      to the org questions. */
  function answerIntro(rawText: string, label: string) {
    push("user", label);
    const name = extractFounderName(rawText);
    dispatch({ type: "setFounderName", name });
    const first = name.trim().split(/\s+/)[0];
    respond(
      first ? (
        <>Great to meet you, <b>{first}</b>! Let&rsquo;s get <em>{draftRef.current.name.trim() || "your org"}</em> set up.</>
      ) : (
        <>No problem — I&rsquo;ll use your Google name. Let&rsquo;s get <em>{draftRef.current.name.trim() || "your org"}</em> set up.</>
      ),
      "kind",
    );
  }

  /* ─── Concierge (AI-led) driver ───────────────────────────────────────── */

  /** Apply a validated concierge result's picks to the draft — the SAME reducer
      actions the founder's own taps use, so the blueprint stays the one source
      of truth. Flashes the sheet sections that actually changed. */
  function applyConciergePicks(picks: InterviewAiResult["picks"]) {
    const p = picks;
    if (p.kind) dispatch({ type: "setKind", kind: p.kind });
    // A variant only makes sense once a kind exists; setKind resets variant, so
    // this sequential dispatch (reducer sees the new kind) applies it cleanly.
    if (p.variant) dispatch({ type: "setVariant", variant: p.variant });
    if (p.addWorkflows.length || p.removeWorkflows.length || Object.keys(p.vocab).length) {
      dispatch({ type: "applyAiPicks", picks: { addWorkflows: p.addWorkflows, removeWorkflows: p.removeWorkflows, vocab: p.vocab } });
    }
    // The model re-sends the FULL metric list every turn (it can't see what's
    // already on the sheet), so only add names not already present — otherwise
    // "Chapter points" lands twice. Case-insensitive, matching how a founder
    // would read a duplicate.
    const existing = new Set(draftRef.current.metrics.custom.map(c => c.name.trim().toLowerCase()));
    for (const m of p.customMetrics) {
      const key = m.name.trim().toLowerCase();
      if (key && !existing.has(key)) {
        existing.add(key);
        dispatch({ type: "addCustomMetric", name: m.name, unit: m.unit });
      }
    }
    if (p.founderName) dispatch({ type: "setFounderName", name: p.founderName });

    // Flash the sheet sections that changed (kind/variant reshuffle seats).
    if (p.kind || p.variant) onFlash("seats");
    if (p.addWorkflows.length || p.removeWorkflows.length) onFlash("pages");
    if (Object.keys(p.vocab).length) later(() => onFlash("words"), 450);
    if (p.customMetrics.length) later(() => onFlash("metrics"), 300);
  }

  /** The first stage still unresolved, in canonical order — where the scripted
      machine should pick up when the concierge hands off. */
  function resumeStage(): Stage {
    const missing = new Set<string>(missingFields(draftRef.current));
    // kind is the only hard gate. If it's missing, resume from the intro — that
    // beat captures the founder's name and then flows into the kind question.
    if (missing.has("kind")) return "intro";
    // kind settled → nothing is strictly owed (name falls back to the Google
    // name, metrics/roles are optional). Land on metrics so the founder gets one
    // last look at per-member tracking before the blueprint.
    return "metrics";
  }

  /** Hand the rest of the interview to the scripted machine. Used by the
      mid-conversation fallback (AI turn failed) and the early-exit/loop-cap
      backstops. The draft already holds every prior pick, so the spine resumes
      with no re-asking. `bridge` is a short human line easing the transition. */
  function handoffToScripted(bridge: ReactNode) {
    setMode("scripted");
    aiOn.current = false; // don't thrash a failing/exhausted model for the rest
    setActivityPicks(null); // close the activities checklist if it was open
    push("bot", bridge);
    const next = resumeStage();
    later(() => ask(next), 650);
  }

  /**
   * One AI-led turn. `userText` is the founder's message (null only for the
   * opening turn). The model reacts, extracts picks across the whole transcript,
   * asks its OWN next question, and signals completion — with client-side guards
   * so it can neither end early (missing fields) nor loop forever (turn cap).
   */
  async function runConcierge(userText: string | null) {
    if (userText !== null) {
      push("user", userText);
      convoTranscript.current.push({ role: "user", text: userText });
    }
    setChips(null);
    setActivityPicks(null); // close the activities checklist if it was open
    setTyping(true);
    convoTurns.current += 1;

    const result = await askInterviewAi(
      "concierge",
      draftRef.current,
      convoTranscript.current,
      missingFields(draftRef.current),
    );

    if (!result) {
      // Mid-conversation failure → fall back to the scripted spine at the right
      // stage. setTyping(false) inside handoff's push path via respond? No —
      // clear it here since we bypass respond().
      setTyping(false);
      handoffToScripted(<>Let me just confirm a couple of things.</>);
      return;
    }

    applyConciergePicks(result.picks);
    // Draft mutations above are async (reducer) — read freshness from the draft
    // on the NEXT tick when deciding completion; for now trust the model's
    // picks were applied and re-check missingFields after the reply lands.
    later(() => {
      setTyping(false);
      push("bot", <>{result.reply || "Got it — the sheet's updated."}</>);

      const stillMissing = missingFields(draftRef.current);
      const hitCap = convoTurns.current >= MAX_CONCIERGE_TURNS;

      // Completion: honor the model's "done" only when nothing is actually left.
      if (result.done && stillMissing.length === 0) {
        later(() => finishInterview(), 650);
        return;
      }
      // Early-exit or loop-cap guard: fields remain but the model quit (or we're
      // out of turns) → drain the rest through the scripted machine.
      if ((result.done && stillMissing.length > 0) || hitCap || !result.next) {
        handoffToScripted(<>Let me just confirm a couple of things.</>);
        return;
      }

      // Normal case: ask the model's own next question. The activities beat is
      // special — the model signals it with the ACTIVITIES_CHIP sentinel as its
      // only chip; render the multi-select checklist instead of tap-chips.
      const isActivities =
        result.next.chips.length === 1 && result.next.chips[0] === ACTIVITIES_CHIP;
      convoTranscript.current.push({ role: "q", text: result.next.question });
      later(() => {
        push("q", <>{result.next!.question}</>);
        if (isActivities) {
          setChips(null);
          setActivityPicks(new Set());
        } else {
          setChips(result.next!.chips.map(c => ({ label: c, pick: () => void runConcierge(c) })));
        }
      }, 400);
    }, typingDelay(result.reply));
  }

  /* ─── Activities checklist (beat 4) ───────────────────────────────────────── */

  /** Toggle one activities-checklist option in the in-progress selection. */
  function toggleActivity(id: string) {
    setActivityPicks(prev => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** "Done →" on the activities checklist: translate the selected options into
      one addWorkflows pick, apply it through the SAME concierge path (so the
      blueprint flashes identically), then feed a plain-language summary back to
      the model as the founder's answer so it reacts and drives the next beat. */
  function submitActivities() {
    const picked = ACTIVITY_OPTIONS.filter(o => activityPicks?.has(o.id));
    setActivityPicks(null);
    const workflows = [...new Set(picked.flatMap(o => o.workflows))];
    if (workflows.length) {
      applyConciergePicks({
        addWorkflows: workflows,
        removeWorkflows: [],
        vocab: {},
        kind: null,
        variant: null,
        customMetrics: [],
        founderName: null,
      });
    }
    // A human-readable summary the model reacts to (or "none of those").
    // runConcierge pushes it as the user bubble AND into the transcript, so we
    // don't push it here — that would double it.
    const summary = picked.length
      ? picked.map(o => o.label.toLowerCase()).join(", ")
      : "none of those, really";
    void runConcierge(summary);
  }

  /** Wrap up the interview (from either driver): mark done + reveal the CTA. */
  function finishInterview() {
    dispatch({ type: "interviewDone" });
    setStage("done");
    setChips(null);
    later(() => setShowCta(true), 500);
  }

  /* ─── Free-text routing ───────────────────────────────────────────────── */

  async function onFreeText(text: string) {
    const s = stageRef.current;
    if (s === "intro") {
      answerIntro(text, text);
    } else if (s === "kind") {
      if (aiOn.current) {
        push("user", text);
        setChips(null);
        setTyping(true);
        const result = await askInterviewAi("kind", draftRef.current, [
          { role: "q", text: "What kind of organization is it?" },
          { role: "user", text },
        ]);
        setTyping(false);
        const kind = result?.picks.kind ?? matchKind(text);
        dispatch({ type: "setKind", kind });
        onFlash("pages");
        // The model may have resolved the variant from the same sentence
        // ("we're a pre-med frat") — apply it and skip the variant question.
        // Sequential dispatches are fine: the reducer sees setKind's state.
        const variant = result?.picks.variant ?? null;
        if (variant) dispatch({ type: "setVariant", variant });
        respond(
          result?.reply ? <>{result.reply}</> : KIND_REPLIES[kind],
          variant ? "activity" : "variant",
          "words",
        );
      } else {
        answerKind(matchKind(text), text);
      }
    } else if (s === "variant") {
      const kind = draftRef.current.kind ?? "other";
      const variant = matchVariant(kind, text);
      if (variant) answerVariant(variant, text);
      else answerActivitySkip();
    } else if (s === "activity") {
      void answerActivity(text);
    } else if (s === "metrics") {
      void answerMetricText(text);
    }
  }

  /* ─── Boot ────────────────────────────────────────────────────────────── */

  // Idempotent (it REPLACES the transcript) so React StrictMode's dev
  // double-mount doesn't drop the first question or duplicate the intro. A
  // founder revisiting a finished interview gets a short recap + CTA instead
  // of being made to re-answer.
  useEffect(() => {
    if (draftRef.current.interviewDone) {
      setStage("done");
      setMessages([{ id: nextId.current++, kind: "bot", body: <>We&rsquo;ve already talked — your blueprint is on the right, built from your answers. Head to your roles whenever you&rsquo;re ready.</> }]);
      setShowCta(true);
      return;
    }
    setStage("intro");
    setChips(null);
    setShowCta(false);
    setMessages([{ id: nextId.current++, kind: "bot", body: <>A few quick questions. Everything you say goes onto the blueprint on the right — you&rsquo;ll review the whole sheet before anything is built.</> }]);

    // Await the probe so we can branch the very first question: an AI-led
    // concierge opener when configured, else the deterministic scripted spine
    // (starting with the intro). The concierge's opening turn seeds its
    // transcript with an internal system beat and lets the model phrase
    // question #1 itself.
    let cancelled = false;
    void probeInterviewAi().then(enabled => {
      if (cancelled) return;
      aiOn.current = enabled;
      if (enabled) {
        setMode("ai");
        convoTranscript.current = [{ role: "q", text: "Warmly greet the founder and invite them to introduce themselves (capture their name into founderName), then get the setup going." }];
        convoTurns.current = 0;
        void runConcierge(null);
      } else {
        setMode("scripted");
        later(() => ask("intro"), 900);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The composer disables while a message is in flight (typing) or the
  // interview is over — otherwise a keystroke would be silently swallowed.
  const composerBusy = typing;
  const composerDone = stage === "done";
  const placeholder = composerDone
    ? "That's everything — your blueprint is on the right."
    : composerBusy
      ? "One moment…"
      : mode === "ai"
        ? "Answer in your own words…"
        : stage === "intro"
          ? "Introduce yourself — just your name is plenty…"
          : stage === "metrics"
            ? 'Type another measure — e.g. "chapter points"…'
            : stage === "activity"
              ? "Describe it in your own words — a sentence or two…"
              : "Type your own answer…";

  // A short hint that free-text is genuinely read, not just a fallback box.
  const composerHint =
    composerDone || composerBusy
      ? null
      : mode === "ai"
        ? "Type a reply, or tap an option"
        : stage === "activity"
          ? aiOn.current
            ? "I'll read this and adjust the sheet"
            : "Or tap an option above"
          : "Prefer to tap? Use the options above";

  function submitDraft() {
    const value = draftText.trim();
    if (!value || composerBusy || composerDone) return;
    setDraftText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    // In AI mode every answer (typed or tapped) is just a concierge turn; the
    // scripted spine keeps its per-stage free-text routing.
    if (modeRef.current === "ai") void runConcierge(value);
    else void onFreeText(value);
  }

  return (
    <div className="chat-col">
      <div className="chat" ref={chatRef}>
        {messages.map(m =>
          m.kind === "user" ? (
            <div key={m.id} className="msg user">
              <div className="m-body">{m.body}</div>
            </div>
          ) : (
            <div key={m.id} className={`msg${m.kind === "q" ? " q" : ""}`}>
              <span className="m-glyph">C</span>
              <div className="m-body">{m.body}</div>
            </div>
          ),
        )}
        {typing && (
          <div className="msg">
            <span className="m-glyph">C</span>
            <div className="typing"><i /><i /><i /></div>
          </div>
        )}
        {chips && (
          <div className="chips">
            {chips.map(c => (
              <button key={c.label} className="chip" onClick={c.pick}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {activityPicks !== null && !typing && (
          <div className="chips chips-multi">
            {ACTIVITY_OPTIONS.map(o => (
              <button
                key={o.id}
                className={`chip${activityPicks.has(o.id) ? " sel" : ""}`}
                aria-pressed={activityPicks.has(o.id)}
                onClick={() => toggleActivity(o.id)}
              >
                {o.label}
              </button>
            ))}
            <button className="chip go" onClick={submitActivities}>
              Done →
            </button>
          </div>
        )}
        {mode === "scripted" && stage === "metrics" && !typing && (
          <div className="chips chips-multi">
            {BUILTIN_METRIC_IDS.map(id => (
              <button
                key={id}
                className={`chip${draft.metrics[id] ? " sel" : ""}`}
                aria-pressed={draft.metrics[id]}
                onClick={() => toggleMetric(id)}
              >
                {BUILTIN_METRIC_LABEL[id]}
              </button>
            ))}
            {draft.metrics.custom.map((m, i) => (
              <button
                key={`${m.name}-${i}`}
                className="chip sel custom"
                title="Remove"
                onClick={() => dispatch({ type: "removeCustomMetric", index: i })}
              >
                {m.name}
                {m.unit ? ` (${m.unit})` : ""}
                <span className="chip-x">×</span>
              </button>
            ))}
            <button className="chip" onClick={() => inputRef.current?.focus()}>
              Something else…
            </button>
            <button className="chip go" onClick={answerMetricsDone}>
              Done →
            </button>
          </div>
        )}
        {showCta && (
          <button className="cta chat-cta" onClick={onDone}>
            Set up your roles<span>→</span>
          </button>
        )}
      </div>
      <div className="chat-foot">
        <div className={`composer${composerBusy ? " busy" : ""}${composerDone ? " done" : ""}`}>
          <textarea
            ref={inputRef}
            className="free"
            rows={1}
            value={draftText}
            placeholder={placeholder}
            disabled={composerDone}
            onChange={e => {
              setDraftText(e.target.value);
              // Auto-grow: reset then track content, capped so the chat stays
              // the focus. The cap matches the max-height in CSS.
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
            }}
            onKeyDown={e => {
              // Enter sends; Shift+Enter (or a busy/done composer) inserts a
              // newline / does nothing — never eats the keystroke silently.
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              submitDraft();
            }}
            aria-label="Type your own answer"
          />
          <button
            type="button"
            className="send"
            onClick={submitDraft}
            disabled={composerBusy || composerDone || !draftText.trim()}
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M4 12h13M11 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {composerHint && <p className="composer-hint">{composerHint}</p>}
      </div>
    </div>
  );
}
