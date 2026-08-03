"use client";

/**
 * Step 2 — INTERVIEW. Two drivers, one set of questions.
 *
 * The interview asks what the org ACTUALLY DOES and lets the answers decide the
 * pages. It never infers a page set from the kind word: "a fraternity" settles
 * the WORDS (Brother, Chapter) and the seats, but whether there's a Parties page
 * comes from the founder saying they throw socials. An activity they don't name
 * leaves its page off (see BEAT_WORKFLOWS in lib/org-types.ts) — otherwise the
 * template's guess would silently survive an answer that didn't include it, and
 * the interview would be theatre over a preset.
 *
 * The beats, in order:
 *   name → kind → activities (multi-select) → docs → payments → door* → metrics
 *   (* door revenue is asked only when the founder named socials/parties.)
 *
 * Two drivers ask them:
 *   - CONCIERGE (mode "ai") — the model phrases each beat itself and reacts to
 *     the answers. It signals the activities beat with the ACTIVITIES_CHIP
 *     sentinel; the client renders the same checklist either way.
 *   - SCRIPTED (mode "scripted") — the deterministic spine, used when AI isn't
 *     configured, is rate-limited, or fails mid-conversation. It asks the SAME
 *     beats with zero model calls, so a founder never gets a worse interview
 *     just because the model is down.
 *
 * Both drivers dispatch the SAME reducer actions the founder's own taps use, and
 * the blueprint review still stands between this chat and anything being built.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MAX_CUSTOM_METRICS, type Draft } from "@/lib/onboarding/draft";
import {
  BUILTIN_METRIC_IDS,
  BUILTIN_METRIC_LABEL,
  getVariant,
  matchKind,
  matchMetricText,
  matchVariantExact,
  matchYesNoAnswer,
  type BuiltinMetricId,
  type KindId,
  type YesNoAnswer,
} from "@/lib/onboarding/kinds";
import {
  ACTIVITY_OPTIONS,
  activityLabels,
  activityPicksToAiPicks,
  readActivities,
} from "@/lib/onboarding/activities";
import {
  draftVocab,
  workflowsChanged,
  workflowsForKind,
  type FlowAction,
} from "./flow-state";
import {
  askInterviewAi,
  probeInterviewAi,
  missingFields,
  ACTIVITIES_CHIP,
  type InterviewAiResult,
  type InterviewAiTurn,
} from "./interview-ai";
import type { SheetFlash } from "./BlueprintSheet";

type Stage =
  | "intro"
  | "kind"
  | "activities"
  | "docs"
  | "payments"
  | "door"
  | "metrics"
  | "done";

type Msg = { id: number; kind: "bot" | "q" | "user"; body: ReactNode };
type Chip = { label: string; pick: () => void };

/** Concierge (AI-led) loop cap: after this many model-driven turns we stop
    asking the model and drain any still-missing fields through the scripted
    machine, so the interview always terminates regardless of model behavior. */
const MAX_CONCIERGE_TURNS = 12;

/** How long the "typing…" indicator shows before an AI reply lands — scaled to
    the reply length so a longer message "takes longer to type" (reads far more
    human than a fixed delay). The scripted path keeps its own fixed timings. */
function typingDelay(text: string): number {
  return Math.min(1400, Math.max(500, 400 + text.length * 12));
}

/**
 * The reply to the kind answer. Each one claims ONLY what the kind actually
 * decides now — the words, the seats, the metric defaults — and hands the pages
 * to the next beat. Nothing here may promise a page: "the classic shape —
 * parties, dues, service, the whole chapter machine" was exactly the assumption
 * this interview no longer makes.
 */
const KIND_REPLIES: Record<KindId, ReactNode> = {
  fraternity: <>A fraternity — so it&rsquo;s <b>Brothers</b>, <b>Chapter</b>, and <b>Semesters</b> from here on. The words are set; the <em>pages</em> come from what you actually do.</>,
  sorority:   <>A sorority — <b>Sisters</b>, <b>Chapter</b>, <b>Semesters</b>. The words are set; now let&rsquo;s build the pages off what you actually run.</>,
  club:       <>Got it — <b>Members</b> and <b>Meetings</b>, nothing Greek assumed. The pages come from what you actually do.</>,
  team:       <>A team — <b>Players</b>, <b>Practice</b>, <b>Seasons</b>. Now let&rsquo;s see what a normal month looks like.</>,
  service:    <>A service org — the words stay plain. Let&rsquo;s build the pages off what you actually run.</>,
  honor:      <>An honor society — noted. Nothing&rsquo;s assumed about the pages; that&rsquo;s the next question.</>,
  arts:       <>A performing-arts group — <b>Rehearsals</b> and a calendar built for performing. Now, a normal month.</>,
  other:      <>Got it — I&rsquo;ll keep the words plain, and you&rsquo;ll get only the pages you turn on.</>,
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
  resumed,
  onFlash,
  onDone,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  /** This draft was restored mid-interview (a reload, or the OAuth leg) and
      already carries answers — open as a continuation, not a first hello. */
  resumed: boolean;
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

  // Whether AI is configured at all (probed once on mount). Decides which driver
  // opens the interview, and gates the one remaining model call in the scripted
  // path (answerMetricText's metric parse, which has its own local fallback).
  const aiOn = useRef(false);

  /**
   * Synchronous turn latch.
   *
   * React state cannot guard a turn. `composerBusy` was just `typing`, which is
   * set INSIDE the async handler, so two clicks dispatched before React
   * committed both sailed through: triple-clicking Send produced the reply twice
   * and the next question three times, and every chip and "Done →" was wide open
   * because they had no busy check at all. A ref flips synchronously on the
   * first click, so the second has something to hit.
   *
   * It also closes a second, slower hole. `respond()` clears `typing` 650ms
   * before it asks the next question, and runConcierge ~400ms before — windows
   * where the composer was live but `stageRef` still pointed at the PREVIOUS
   * beat, so a typed answer was routed to the question already answered. The
   * latch is held until a question is actually on screen awaiting an answer,
   * which is the honest definition of "your turn".
   */
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  /** Take the turn. False means someone else already has it — bail. */
  function lockTurn(): boolean {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }
  /** Hand the turn back to the founder. Called where a question is on screen. */
  function unlockTurn() {
    busyRef.current = false;
    setBusy(false);
  }
  /** Wrap a chip / button handler so a double-tap can only fire it once. */
  function once(fn: () => void): () => void {
    return () => {
      if (lockTurn()) fn();
    };
  }

  // Concierge (AI-led) plumbing. `mode` decides which driver owns the
  // conversation: "ai" = the concierge asks its own questions; "scripted" = the
  // deterministic spine (also the mid-conversation fallback target). The whole
  // interview flows through convoTranscript; convoTurns caps the model loop.
  const [mode, setMode] = useState<"ai" | "scripted">("scripted");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const convoTranscript = useRef<InterviewAiTurn[]>([]);
  const convoTurns = useRef(0);

  // The activities beat renders a multi-select checklist in place of tap-chips:
  // when non-null, the grid is shown and this Set holds the founder's in-progress
  // selections (ACTIVITY_OPTIONS ids). Null the rest of the time. Keyed on the
  // state rather than on `mode`, so the SAME grid serves both drivers — the
  // concierge opens it via the ACTIVITIES_CHIP sentinel, the scripted spine via
  // its "activities" stage. Submitting ("Done →") clears it and moves on.
  const [activityPicks, setActivityPicks] = useState<Set<string> | null>(null);

  // How many times each yes/no beat has been answered with a non-answer. Caps
  // the re-ask at one, so "I'd rather not say" twice moves on instead of looping.
  const yesNoRetries = useRef<Partial<Record<Stage, number>>>({});

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

  /** The org's name for question copy, with a graceful stand-in when it's blank. */
  const orgName = () => draftRef.current.name.trim() || "your org";

  /* ─── The question script ─────────────────────────────────────────────── */

  function ask(stage: Stage) {
    // "done" is not a question — it's the exit, and finishInterview owns the
    // state from there (it may refuse and hand off rather than end).
    if (stage === "done") return finishInterview();
    setStage(stage);
    switch (stage) {
      case "intro": {
        push("q", <>Hi! I&rsquo;ll help you set up <em>{draftRef.current.name.trim() || "your organization"}</em> in a few minutes. First though — who do I have the pleasure of meeting?</>);
        setChips([{ label: "I'll use my Google name", pick: once(() => answerIntro("", "I'll use my Google name")) }]);
        break;
      }
      case "kind": {
        push("q", <>Tell me about <em>{draftRef.current.name.trim() || "your organization"}</em> — what kind of organization is it?</>);
        setChips([
          { label: "A fraternity", pick: once(() => answerKind("fraternity", "A fraternity")) },
          { label: "A sorority", pick: once(() => answerKind("sorority", "A sorority")) },
          { label: "A club or student org", pick: once(() => answerKind("club", "A club or student org")) },
          { label: "A sports team", pick: once(() => answerKind("team", "A sports team")) },
          { label: "A service org", pick: once(() => answerKind("service", "A service org")) },
          { label: "An honor society", pick: once(() => answerKind("honor", "An honor society")) },
          { label: "A performing-arts group", pick: once(() => answerKind("arts", "A performing-arts group")) },
          { label: "Something else", pick: once(() => answerKind("other", "Something else")) },
        ]);
        break;
      }
      case "activities": {
        push("q", <>Thinking about a normal month for <em>{orgName()}</em> — which of these actually happen? (Pick as many as apply.)</>);
        setChips(null);          // the checklist grid renders instead, below
        setActivityPicks(new Set());
        break;
      }
      case "docs": {
        push("q", <>Do you keep shared documents or links {vocab("Member", true).toLowerCase()} need access to — a handbook, drive folder, bylaws?</>);
        setChips([
          { label: "Yes", pick: once(() => answerDocs("yes", "Yes")) },
          { label: "Not really", pick: once(() => answerDocs("no", "Not really")) },
        ]);
        break;
      }
      case "payments": {
        push("q", <>Does <em>{orgName()}</em> handle any payments — {vocab("Dues").toLowerCase()}, event fees, anything like that?</>);
        setChips([
          { label: "Yes — dues", pick: once(() => answerPayments("yes", "Yes — dues")) },
          { label: "Event fees", pick: once(() => answerPayments("yes", "Event fees")) },
          { label: "No money", pick: once(() => answerPayments("no", "No money")) },
        ]);
        break;
      }
      case "door": {
        // CONDITIONAL. Only worth asking of an org that actually throws the kind
        // of event that takes money at the door — i.e. one that just told us it
        // holds socials. Asking an honor society about door money reads as
        // broken. Reads the DRAFT (not a local) so it behaves identically when
        // the concierge hands off mid-interview.
        if (!draftRef.current.enabledWorkflows.includes("parties")) return ask("metrics");
        push("q", <>Do parties or events at <em>{orgName()}</em> typically bring in door money or ticket sales?</>);
        setChips([
          { label: "Yes", pick: once(() => answerDoor("yes", "Yes")) },
          { label: "No", pick: once(() => answerDoor("no", "No")) },
        ]);
        break;
      }
      case "metrics": {
        push("q", <>What should I track for each {vocab("Member").toLowerCase()}? Tap everything you want on the sheet — or type your own.</>);
        setChips(null); // metrics chips render live from the draft, below
        break;
      }
    }
    // A question is now on screen with its chips — the founder's turn. Every
    // path that ends a beat lands here, which is why this is the one release
    // point for the latch. ("done" returned above; finishInterview keeps it.)
    unlockTurn();
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

  /* ─── Answers — every beat below is deterministic (no model calls) ─────── */

  /**
   * The kind beat. `typed` is the founder's own words when they wrote the answer
   * rather than tapping a chip — the only place a variant can come from.
   *
   * The concierge resolves a variant whenever the founder's phrasing makes one
   * obvious ("we're a pre-med frat"), and a variant is not cosmetic: it rebuilds
   * the seat list and flips metric defaults. The scripted spine used to resolve
   * none, so the SAME sentence built a different org depending on whether the
   * model happened to be up — "we're a professional fraternity" got VP
   * Professional Development and no service-hours column with AI on, and Social
   * and PR chairs with a service-hours column with AI off.
   *
   * matchVariantExact only answers when the words actually name one, so a chip
   * tap (which carries no such signal) still resolves nothing.
   */
  function answerKind(kind: KindId, label: string, typed?: string) {
    push("user", label);
    dispatch({ type: "setKind", kind });
    // setKind is a reset that clears variant, so this must follow it. Same
    // sequencing as applyConciergePicks.
    const variant = typed ? matchVariantExact(kind, typed) : null;
    if (variant) dispatch({ type: "setVariant", variant });
    const variantLabel = variant ? getVariant(kind, variant)?.label : null;
    // The kind sets the WORDS and the seats. It deliberately does not light up
    // pages — those come from the activities beat next — so flash "words", not
    // "pages" (the Pages section is genuinely still nearly empty here).
    respond(
      variantLabel ? (
        <>
          {KIND_REPLIES[kind]} <em>{variantLabel}</em>, so I&rsquo;ve set the officer seats to match.
        </>
      ) : (
        KIND_REPLIES[kind]
      ),
      "activities",
      "words",
    );
    // The seats visibly changed — say where to look, after the words flash.
    if (variant) later(() => onFlash("seats"), 900);
  }

  /**
   * A founder who won't commit at a yes/no beat.
   *
   * "not sure" and "I'd rather not say" used to read as YES, so the bot answered
   * a question the founder had just declined to answer ("Money gets tracked,
   * then — Treasury is on the sheet"). Re-ask once, because the chips are right
   * there and the first hedge is usually just thinking out loud. If they still
   * won't pick, take that at face value: change NOTHING and say so. Leaving the
   * page off is both the draft's current state and the reversible choice, and
   * the blueprint is one tap away. Two attempts, so this always terminates.
   */
  function hedgedYesNo(stage: Stage, deferReply: ReactNode, next: Stage) {
    const n = (yesNoRetries.current[stage] ?? 0) + 1;
    yesNoRetries.current[stage] = n;
    if (n === 1) {
      setTyping(true);
      later(() => {
        setTyping(false);
        push("bot", <>No rush — a yes or a no is all I need here.</>);
        later(() => ask(stage), 400);
      }, 700);
      return;
    }
    respond(deferReply, next);
  }

  function answerDocs(answer: YesNoAnswer, label: string) {
    push("user", label);
    if (answer === "unclear") {
      return hedgedYesNo(
        "docs",
        <>No problem — I&rsquo;ll leave <b>Docs</b> off for now. It&rsquo;s one tap on the blueprint whenever you want it.</>,
        "payments",
      );
    }
    const yes = answer === "yes";
    dispatch({
      type: "applyAiPicks",
      picks: { addWorkflows: yes ? ["docs"] : [], removeWorkflows: yes ? [] : ["docs"], vocab: {} },
    });
    respond(
      yes
        ? <>Then <b>Docs</b> is on — one place for the handbook and the links, instead of the group chat.</>
        : <>No Docs page, then. It&rsquo;s one tap away on the blueprint if that changes.</>,
      "payments",
      "pages",
    );
  }

  function answerPayments(answer: YesNoAnswer, label: string) {
    push("user", label);
    if (answer === "unclear") {
      return hedgedYesNo(
        "payments",
        <>That&rsquo;s fine — I&rsquo;ll leave <b>{vocab("Treasury")}</b> off rather than guess. You can add it on the blueprint.</>,
        "door",
      );
    }
    const yes = answer === "yes";
    dispatch({
      type: "applyAiPicks",
      picks: { addWorkflows: yes ? ["finance"] : [], removeWorkflows: yes ? [] : ["finance"], vocab: {} },
    });
    respond(
      yes
        ? <>Money gets tracked, then — <b>{vocab("Treasury")}</b> is on the sheet.</>
        : <>No treasury for now — the sheet stays lean.</>,
      "door",
      "pages",
    );
  }

  function answerDoor(answer: YesNoAnswer, label: string) {
    push("user", label);
    // Parties is already on — this beat only runs when it is (see ask("door")).
    // So "yes" adds nothing new; it decides what the Parties page is FOR. The
    // add is kept for idempotence and to mirror the concierge, which can reach
    // this beat by a path where parties isn't on yet. "no" is already a no-op,
    // which is why an unresolved hedge costs nothing here.
    if (answer === "unclear") {
      return hedgedYesNo(
        "door",
        <>No matter — <b>Parties</b> keeps the guest list and the budget either way.</>,
        "metrics",
      );
    }
    const yes = answer === "yes";
    if (yes) {
      dispatch({ type: "applyAiPicks", picks: { addWorkflows: ["parties"], removeWorkflows: [], vocab: {} } });
    }
    respond(
      yes
        ? <>Then <b>Parties</b> carries a door count and a wrap-up, not just a date.</>
        : <>Fine — Parties stays for the guest list and the budget, no door column needed.</>,
      "metrics",
      "pages",
    );
  }

  function toggleMetric(metric: BuiltinMetricId) {
    dispatch({ type: "setBuiltinMetric", metric, on: !draftRef.current.metrics[metric] });
    onFlash("metrics");
  }

  /**
   * Add custom metrics, skipping any already on the sheet. Both callers need
   * this: the concierge re-sends its FULL metric list every turn (it can't see
   * the sheet), and a founder typing at the metrics stage can repeat themselves.
   * Without it "Chapter points" lands twice. Case-insensitive, the way a founder
   * would read a duplicate. Returns what was actually added, for the reply copy.
   */
  function addCustomMetrics(metrics: { name: string; unit: string | null }[]) {
    const existing = new Set(draftRef.current.metrics.custom.map(c => c.name.trim().toLowerCase()));
    const added: typeof metrics = [];
    // Count as we go. The reducer silently no-ops past the cap, so counting only
    // the dispatches we ACTUALLY made is what keeps the reply honest — reporting
    // an add the draft rejected is how the bot ended up saying "Added Chapter
    // Points — every member gets a column for it" over an unchanged sheet.
    let count = draftRef.current.metrics.custom.length;
    let droppedFull = false;
    for (const m of metrics) {
      const key = m.name.trim().toLowerCase();
      if (!key || existing.has(key)) continue;
      if (count >= MAX_CUSTOM_METRICS) {
        droppedFull = true;
        break;
      }
      existing.add(key);
      added.push(m);
      count += 1;
      dispatch({ type: "addCustomMetric", name: m.name, unit: m.unit });
    }
    return { added, droppedFull };
  }

  /**
   * Free-text at the metrics stage.
   *
   * Whatever was typed used to become a column name verbatim, so "no" created a
   * per-member column called "No" and "we track chapter points" created one
   * called "We Track Chapter Points". There was no way to decline by typing at
   * all. These become real OrgMetricDefinition rows at provisioning — durable
   * furniture in the founder's workspace — so the reader is three-valued and
   * never guesses: a decline ends the beat, an unreadable answer is re-asked.
   */
  async function answerMetricText(text: string) {
    const read = matchMetricText(text);

    if (read.kind === "done") {
      // They answered the question — with "nothing else". Their own words.
      return answerMetricsDone(text);
    }
    if (read.kind === "unreadable") {
      push("user", text);
      setTyping(true);
      later(() => {
        setTyping(false);
        push("bot", <>Sorry — what should I call that column? A word or two is plenty, like &ldquo;chapter points&rdquo;.</>);
        unlockTurn(); // the metrics grid is still on screen; their turn again
      }, 700);
      return;
    }

    push("user", text);
    setTyping(true);
    // The one model call left in the scripted spine. It only refines the parse
    // into {name, unit} — it can't ask a question or move a page — and the
    // deterministic read above is a complete answer on its own.
    const result = aiOn.current
      ? await askInterviewAi("metrics", draftRef.current, [
          { role: "q", text: "What else should be tracked per member?" },
          { role: "user", text },
        ])
      : null;
    setTyping(false);

    const metrics = result?.picks.customMetrics.length
      ? result.picks.customMetrics
      : [{ name: read.name, unit: read.unit }];
    const { added, droppedFull } = addCustomMetrics(metrics);
    if (added.length) onFlash("metrics");
    push(
      "bot",
      droppedFull && !added.length ? (
        <>That&rsquo;s {MAX_CUSTOM_METRICS} of your own already — the sheet&rsquo;s full. You can swap one out above, or add more from Settings once you&rsquo;re in.</>
      ) : added.length === 0 ? (
        <>Already on the sheet — every {vocab("Member").toLowerCase()} has that column.</>
      ) : result?.reply ? (
        <>{result.reply}</>
      ) : (
        <>Added <b>{added.map(m => m.name).join(", ")}</b> — every {vocab("Member").toLowerCase()} gets a column for it.</>
      ),
    );
    unlockTurn(); // the metrics grid stays open for another measure
  }

  function answerMetricsDone(userLabel = "That's the list") {
    const m = draftRef.current.metrics;
    const tracked = BUILTIN_METRIC_IDS.filter(id => m[id]).map(id => BUILTIN_METRIC_LABEL[id].toLowerCase());
    const all = [...tracked, ...m.custom.map(c => c.name.toLowerCase())];
    push("user", userLabel);
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
    // ONLY dispatch setKind when the kind actually CHANGES. The model re-sends
    // its resolved `kind` on every turn (the response schema requires the field,
    // and structured output fills it with the standing answer rather than null),
    // but setKind is a RESET — kindDefaults wipes enabledWorkflows back to
    // BASE_WORKFLOWS and rebuilds seats, vocab, metrics and event types from the
    // template. Dispatching it on an unchanged re-send silently stripped every
    // page the activities checklist had just turned on, leaving only whatever
    // that same turn's addWorkflows happened to carry: the founder answers "yes,
    // we do all of those", and the blueprint empties out a beat later.
    const kindChanged = !!p.kind && p.kind !== draftRef.current.kind;
    if (kindChanged) dispatch({ type: "setKind", kind: p.kind! });
    // A variant only makes sense once a kind exists; setKind resets variant, so
    // this sequential dispatch (reducer sees the new kind) applies it cleanly.
    // Re-sends are skipped for the same reason as kind — applyVariant rebuilds
    // seats from the template, discarding any seat edits — but a real kind change
    // always re-applies, since setKind just cleared the variant out from under it.
    const variantChanged = !!p.variant && (kindChanged || p.variant !== draftRef.current.variant);
    if (variantChanged) dispatch({ type: "setVariant", variant: p.variant! });
    if (p.addWorkflows.length || p.removeWorkflows.length || Object.keys(p.vocab).length) {
      dispatch({ type: "applyAiPicks", picks: { addWorkflows: p.addWorkflows, removeWorkflows: p.removeWorkflows, vocab: p.vocab } });
    }
    const { added: addedMetrics } = addCustomMetrics(p.customMetrics);
    if (p.founderName) dispatch({ type: "setFounderName", name: p.founderName });

    // Flash the sheet sections that actually changed (kind/variant reshuffle
    // seats). Metrics flash on what was ADDED, not on what the model re-sent —
    // it repeats its full list every turn, and flashing an unchanged section
    // would draw the eye to nothing. Pages are the same trap and worse: the model
    // re-sends its whole workflow list every turn, so a non-empty add/remove is
    // NOT evidence anything moved. Ask what the picks would actually do — and ask
    // it of the post-setKind draft, since a kind answer resets the set to BASE.
    if (kindChanged || variantChanged) onFlash("seats");
    const base = kindChanged ? workflowsForKind(draftRef.current, p.kind!) : draftRef.current;
    if (workflowsChanged(base, { addWorkflows: p.addWorkflows, removeWorkflows: p.removeWorkflows, vocab: {} })) {
      onFlash("pages");
    }
    if (Object.keys(p.vocab).length) later(() => onFlash("words"), 450);
    if (addedMetrics.length) later(() => onFlash("metrics"), 300);
  }

  /** The first stage still unresolved, in canonical order — where the scripted
      machine should pick up when the concierge hands off, and where a resumed
      draft re-enters the conversation. */
  function resumeStage(): Stage {
    const missing = new Set<string>(missingFields(draftRef.current));
    // kind is a hard gate. If it's missing we still need the kind question —
    // but only route through "intro" when the founder's NAME is also still
    // unknown, because that beat's whole job is asking for it. The concierge
    // captures the name on its very first turn, so a handoff right after that
    // would otherwise re-ask it ("what's your name?" twice in a row).
    if (missing.has("kind")) {
      return draftRef.current.founderName.trim() ? "kind" : "intro";
    }
    // So is the activities beat — it is the ONLY authority for which pages an
    // org gets (see the WORKFLOW AUTHORITY block in lib/org-types.ts), so a
    // handoff that skipped it (the concierge resolving `kind` and then failing,
    // hitting the turn cap, or signalling done early) would provision an org
    // with no meetings, parties, service or events page. missingFields owns that
    // judgement now, off the draft's recorded answer rather than a guess at the
    // page set — a founder who ticks nothing has still answered it.
    if (missing.has("workflows")) return "activities";

    // Pages settled → nothing else is strictly owed (name falls back to the
    // Google name, metrics/roles are optional). Land on metrics so the founder
    // gets one last look at per-member tracking before the blueprint.
    return "metrics";
  }

  /** Hand the rest of the interview to the scripted machine. Used by the
      mid-conversation fallback (AI turn failed) and the early-exit/loop-cap
      backstops. The draft already holds every prior pick, so the spine resumes
      with no re-asking. `bridge` is a short human line easing the transition —
      pass null when there is nothing to bridge FROM (the opening turn failed, so
      the founder has said nothing yet and the spine simply opens the interview). */
  function handoffToScripted(bridge: ReactNode | null) {
    setMode("scripted");
    aiOn.current = false; // don't thrash a failing/exhausted model for the rest
    setActivityPicks(null); // close the activities checklist if it was open
    if (bridge) push("bot", bridge);
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
      // AI turn failed → fall back to the scripted spine at the right stage.
      // (setTyping is cleared here because we bypass respond().) On the OPENING
      // turn nothing has been said yet, so a "let me confirm a couple of things"
      // bridge would be nonsense — the scripted spine just opens the interview
      // itself. Only a mid-conversation failure gets the bridge line.
      setTyping(false);
      handoffToScripted(userText === null ? null : <>Let me just confirm a couple of things.</>);
      return;
    }

    applyConciergePicks(result.picks);
    // Draft mutations above are async (reducer) — read freshness from the draft
    // on the NEXT tick when deciding completion; for now trust the model's
    // picks were applied and re-check missingFields after the reply lands.
    later(() => {
      setTyping(false);
      push("bot", <>{result.reply || "Got it — the sheet's updated."}</>);

      const hitCap = convoTurns.current >= MAX_CONCIERGE_TURNS;

      // Completion: hand the model's "done" to finishInterview, which honors it
      // only when nothing is actually left and otherwise drains the remaining
      // beats through the scripted machine. The check lives THERE, not here, so
      // no exit can route around it.
      if (result.done) {
        later(() => finishInterview(), 650);
        return;
      }
      // Loop-cap / no-next-question guard: the model didn't say done but has
      // nowhere to go → drain the rest through the scripted machine.
      if (hitCap || !result.next) {
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
          setChips(result.next!.chips.map(c => ({ label: c, pick: once(() => void runConcierge(c)) })));
        }
        unlockTurn(); // question is up — the founder's turn
      }, 400);
    }, typingDelay(result.reply));
  }

  /* ─── The activities checklist (shared by both drivers) ───────────────────── */

  /** Toggle one activities-checklist option in the in-progress selection. */
  function toggleActivity(id: string) {
    setActivityPicks(prev => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Re-ask the activities beat rather than act on an answer we can't fully read.
   * Stays on the stage and re-opens the checklist, so the founder taps their way
   * out of a phrasing the keyword reader doesn't cover.
   *
   * `seed` pre-ticks the grid with what we DID understand — an answer that only
   * ruled things out ("no parties") tells us five of the six, so the founder
   * confirms with one tap instead of retyping. `line` names what we caught, so
   * the pre-ticked boxes don't look like a guess out of nowhere.
   */
  function reopenActivities(seed?: ReadonlySet<string>, line?: ReactNode) {
    setChips(null);
    setTyping(true);
    later(() => {
      setTyping(false);
      push(
        "bot",
        line ?? <>Sorry — I didn&rsquo;t catch which ones. Tap the ones that happen and I&rsquo;ll set those pages up.</>,
      );
      setActivityPicks(new Set(seed ?? []));
      unlockTurn(); // checklist is back up — the founder's turn
    }, 700);
  }

  function activitiesReply(picked: string[]): ReactNode {
    if (!picked.length) {
      return <>Kept lean, then — just the roster and the dashboard. You can add any page you want on the blueprint.</>;
    }
    return <>Good — <b>{picked.map(l => l.toLowerCase()).join(", ")}</b>. Those are your pages.</>;
  }

  /**
   * Settle the activities beat. THE CHECKLIST IS AUTHORITATIVE: what the founder
   * ticked goes on and every other activity-owned page goes OFF, so a page the
   * kind template would have guessed can never survive an answer that didn't
   * name it. (docs / finance / parties can still return at the later docs,
   * payments and door beats — those run after and are strict refinements.)
   *
   * Shared by both drivers, so tapping and typing land identically: the concierge
   * hands the summary back to the model to react to; the scripted spine replies
   * itself and walks on to the next beat.
   *
   * `echo` is whether to render the founder's answer as a user bubble. The typed
   * path already pushed their literal words, and runConcierge pushes its own —
   * only the tap path needs us to voice the selection.
   */
  function submitActivities(ids: ReadonlySet<string>, echo: boolean) {
    const picked = activityLabels(ids);
    setActivityPicks(null);
    const picks = activityPicksToAiPicks(ids);
    // Only pulse the sheet if the ticks actually move a page. The checklist always
    // declares removals across its whole domain, so an unticked box that was
    // already off is a no-op — flashing on it is what made the blueprint look like
    // it was refreshing without ever updating.
    const moved = workflowsChanged(draftRef.current, picks);
    dispatch({ type: "applyAiPicks", picks });
    // The beat is now ANSWERED — including when nothing was ticked, which is a
    // real answer ("we don't do any of that") and not the same as never asking.
    // missingFields reads this, and it is what stops the interview ending before
    // the org has any pages at all.
    dispatch({ type: "activitiesAnswered" });
    if (moved) onFlash("pages");

    const summary = picked.length
      ? picked.map(l => l.toLowerCase()).join(", ")
      : "none of those, really";

    if (modeRef.current === "ai") {
      // runConcierge pushes the user bubble AND the transcript entry itself.
      void runConcierge(summary);
      return;
    }
    if (echo) push("user", summary);
    respond(activitiesReply(picked), "docs");
  }

  /**
   * The interview's ONE exit, from either driver: mark done + reveal the CTA.
   *
   * Guarded, because ending is not the caller's call to make. Both drivers can
   * reach here with beats still owed — the concierge by signalling `done` early
   * (structured output will happily set it the turn after the kind resolves),
   * the scripted spine only via a hand-edited state — and an interview that ends
   * before the activities beat provisions an org with no pages at all. So a
   * still-missing field turns "finish" into a handoff that asks for it instead.
   * The handoff always routes through the owed beat, which records its answer,
   * so this can't loop.
   */
  function finishInterview() {
    const missing = missingFields(draftRef.current);
    if (missing.length > 0) {
      handoffToScripted(<>Let me just confirm a couple of things.</>);
      return;
    }
    dispatch({ type: "interviewDone" });
    setStage("done");
    setChips(null);
    later(() => setShowCta(true), 500);
  }

  /* ─── Free-text routing (scripted spine) ──────────────────────────────────
     Every branch is deterministic. The spine is what runs when the model is
     unavailable, so it must never itself need the model — the one exception is
     answerMetricText, which only PARSES a typed metric into {name, unit} and has
     its own titleCase fallback (it can't ask a question or change a page). */

  function onFreeText(text: string) {
    const s = stageRef.current;
    if (s === "intro") {
      answerIntro(text, text);
    } else if (s === "kind") {
      // Their own words go to BOTH readers: the kind, and any variant the
      // sentence actually names. This is what keeps "we're a professional
      // fraternity" building the same org here as it does under the concierge.
      answerKind(matchKind(text), text, text);
    } else if (s === "activities") {
      // Typed instead of tapped — read the sentence onto the checklist and run
      // the SAME authoritative submit, so typing and tapping agree. Their own
      // words are the user bubble, so don't echo a synthesized summary too.
      push("user", text);
      const read = readActivities(text);
      if (read === null) {
        // Unreadable → re-open the checklist rather than submitting. The submit
        // is authoritative, so guessing an empty set here would turn every
        // activity page off on the strength of a sentence we can't parse.
        reopenActivities();
      } else if (read.confident) {
        submitActivities(read.ids, false);
      } else {
        // Negatives only ("no parties") — we know what to rule out but never
        // heard what they DO. Confirm the rest instead of inventing it.
        const ruledOut = activityLabels(read.off).map(l => l.toLowerCase()).join(", ");
        reopenActivities(
          read.ids,
          <>Got it — no {ruledOut}. I&rsquo;ve ticked the rest; drop anything else that doesn&rsquo;t happen.</>,
        );
      }
    } else if (s === "docs") {
      answerDocs(matchYesNoAnswer(text), text);
    } else if (s === "payments") {
      answerPayments(matchYesNoAnswer(text), text);
    } else if (s === "door") {
      answerDoor(matchYesNoAnswer(text), text);
    } else if (s === "metrics") {
      void answerMetricText(text);
    }
  }

  /**
   * The internal beat that opens the concierge's transcript.
   *
   * On a fresh draft it's simply "say hello and get their name". On a RESTORED
   * one the model is meeting a conversation already in progress with none of it
   * in its transcript, so the brief hands it what the draft holds and tells it
   * not to re-ask. (The per-turn `answers` + `missingFields` priors go with every
   * request already — this is only about how turn one reads.)
   */
  function resumedConciergeBrief(): string {
    if (!resumed) {
      return "Warmly greet the founder and invite them to introduce themselves (capture their name into founderName), then get the setup going.";
    }
    const d = draftRef.current;
    const known = [
      d.founderName.trim() && `the founder is ${d.founderName.trim()}`,
      d.name.trim() && `the org is ${d.name.trim()}`,
      d.kind && `it is a ${d.kind}`,
      `pages so far: ${d.enabledWorkflows.join(", ") || "none decided"}`,
    ].filter(Boolean);
    return `The founder stepped away and has just come back — you already spoke, but you cannot see that part of the conversation. Already settled: ${known.join("; ")}. Welcome them back in ONE short line, do NOT re-ask anything already settled above, and continue with the first thing in STILL NEEDED.`;
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
    // A RESTORED draft mid-interview is a continuation, not a first meeting.
    // The chat transcript isn't persisted (only the answers are), so without
    // this a reload replayed "who do I have the pleasure of meeting?" over a
    // blueprint already listing their org, their words and half their pages —
    // and re-asked beats the sheet visibly shows as answered.
    setStage("intro");
    setChips(null);
    setShowCta(false);
    setMessages([
      {
        id: nextId.current++,
        kind: "bot",
        body: resumed ? (
          <>Welcome back — I still have everything you told me, on the right. Let&rsquo;s pick up where we left off.</>
        ) : (
          <>A few quick questions. Everything you say goes onto the blueprint on the right — you&rsquo;ll review the whole sheet before anything is built.</>
        ),
      },
    ]);

    // Await the probe so we can branch the very first question: an AI-led
    // concierge opener when configured, else the deterministic scripted spine
    // (starting with the intro). The concierge's opening turn seeds its
    // transcript with an internal system beat and lets the model phrase
    // question #1 itself.
    // Held from boot until the first question is on screen, so a founder who
    // clicks into the composer during the probe can't start a turn early.
    lockTurn();
    let cancelled = false;
    void probeInterviewAi().then(enabled => {
      if (cancelled) return;
      aiOn.current = enabled;
      if (enabled) {
        setMode("ai");
        convoTranscript.current = [{ role: "q", text: resumedConciergeBrief() }];
        convoTurns.current = 0;
        void runConcierge(null);
      } else {
        // Scripted: resumeStage() is already the "first thing still owed", so a
        // resumed draft re-enters at the right beat instead of the intro.
        later(() => ask(resumed ? resumeStage() : "intro"), 900);
        setMode("scripted");
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The composer disables while a turn is in flight or the interview is over.
  // This tracks the LATCH, not `typing`: typing clears up to 650ms before the
  // next question exists, and answers sent into that gap were routed against the
  // beat that had already been answered.
  const composerBusy = busy;
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
            : stage === "activities"
              ? "Or just describe a normal month in your own words…"
              : "Type your own answer…";

  // A short hint that free-text is genuinely read, not just a fallback box.
  const composerHint =
    composerDone || composerBusy
      ? null
      : mode === "ai"
        ? "Type a reply, or tap an option"
        : stage === "activities"
          ? "Tick everything that applies — or type it"
          : "Prefer to tap? Use the options above";

  function submitDraft() {
    const value = draftText.trim();
    if (!value || composerDone) return;
    // Take the latch AFTER the empty check, so an empty send never strands it.
    // Synchronous, so a double-click or a click racing an Enter can't both pass.
    if (!lockTurn()) return;
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
              // disabled mirrors the latch so a taken turn LOOKS taken; the ref
              // inside `once` is what actually stops a double-tap, since this
              // prop only lands after React commits.
              <button key={c.label} className="chip" onClick={c.pick} disabled={busy}>
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
            <button
              className="chip go"
              onClick={once(() => submitActivities(activityPicks, true))}
              disabled={busy}
            >
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
            <button className="chip go" onClick={once(() => answerMetricsDone())} disabled={busy}>
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
