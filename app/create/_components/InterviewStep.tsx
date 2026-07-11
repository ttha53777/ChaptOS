"use client";

/**
 * Step 2 — INTERVIEW. A scripted spine with AI branches.
 *
 * The question skeleton is deterministic (kind → variant → activity → term
 * model → current term → metrics → your name → your title) and every CHIP tap
 * is handled locally with zero AI. Free-text answers route through
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
  FOUNDER_TITLE_ALTERNATES,
  KIND_VARIANTS,
  VARIANT_QUESTION,
  matchKind,
  matchVariant,
  type BuiltinMetricId,
  type KindId,
} from "@/lib/onboarding/kinds";
import {
  TERM_MODELS,
  TERM_MODEL_LABEL,
  matchTermModel,
  suggestTerms,
  type TermModel,
  type TermSuggestion,
} from "@/lib/onboarding/terms";
import { draftVocab, type FlowAction } from "./flow-state";
import { askInterviewAi, probeInterviewAi, type InterviewAiTurn } from "./interview-ai";
import type { SheetFlash } from "./BlueprintSheet";

type Stage =
  | "kind"
  | "variant"
  | "activity"
  | "termModel"
  | "term"
  | "metrics"
  | "founderName"
  | "founderTitle"
  | "done";

type Msg = { id: number; kind: "bot" | "q" | "user"; body: ReactNode };
type Chip = { label: string; pick: () => void };

/** Activity-stage clarify loop: at most this many AI follow-up questions
    (≈6 questions total in the workflow portion, counting the opener). */
const MAX_ACTIVITY_FOLLOWUPS = 5;

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

const TERM_MODEL_REPLIES: Record<TermModel, ReactNode> = {
  semester:     <><b>Semesters</b> it is — dues and attendance reset each term.</>,
  quarter:      <><b>Quarters</b> — quick cycles; everything resets four times a year.</>,
  season:       <><b>Seasons</b> — the roster and records follow your competitive year.</>,
  "year-round": <><b>Year-round</b> — one long ledger, no mid-year resets.</>,
};

function fmtRange(t: TermSuggestion): string {
  const f = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(t.startDate)} – ${f(t.endDate)}`;
}

function titleCase(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .replace(/\b[a-z]/g, c => c.toUpperCase());
}

export function InterviewStep({
  draft,
  dispatch,
  onFlash,
  onDone,
  onSkip,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  onFlash: (section: NonNullable<SheetFlash>["section"]) => void;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [chips, setChips] = useState<Chip[] | null>(null);
  const [stage, setStage] = useState<Stage>("kind");
  const [showCta, setShowCta] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextId = useRef(0);

  // AI plumbing: availability (probed once), the activity clarify-loop
  // transcript, and how many follow-ups the model has already spent.
  const aiOn = useRef(false);
  const activityTranscript = useRef<InterviewAiTurn[]>([]);
  const activityFollowUps = useRef(0);

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
      case "termModel": {
        push("q", <>How does your calendar reset?</>);
        setChips(TERM_MODELS.map(m => ({ label: TERM_MODEL_LABEL[m], pick: () => answerTermModel(m, TERM_MODEL_LABEL[m]) })));
        break;
      }
      case "term": {
        const model = draftRef.current.termModel ?? "semester";
        const suggestions = suggestTerms(model);
        push("q", <>Which {vocab("Period").toLowerCase()} are we in right now?</>);
        setChips([
          ...suggestions.map(t => ({
            label: `${t.label} (${fmtRange(t)})`,
            pick: () => answerTerm(t, `${t.label} (${fmtRange(t)})`, false),
          })),
          {
            label: "I'll set the dates on the blueprint",
            pick: () => answerTerm(suggestions[0]!, "I'll set the dates on the blueprint", true),
          },
        ]);
        break;
      }
      case "metrics": {
        push("q", <>What should I track for each {vocab("Member").toLowerCase()}? Tap everything you want on the sheet — or type your own.</>);
        setChips(null); // metrics chips render live from the draft, below
        break;
      }
      case "founderName": {
        push("q", <>Almost done — what should everyone call <b>you</b>?</>);
        setChips([{ label: "I'll use my Google name", pick: () => answerName("", "I'll use my Google name") }]);
        break;
      }
      case "founderTitle": {
        const current = draftRef.current.seats.find(s => s.all)?.title ?? "President";
        const alternates = FOUNDER_TITLE_ALTERNATES[draftRef.current.kind ?? "other"].filter(t => t !== current);
        push("q", <>And what&rsquo;s your title?</>);
        setChips([
          { label: current, pick: () => answerTitle(current, current) },
          ...alternates.map(t => ({ label: t, pick: () => answerTitle(t, t) })),
        ]);
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
    respond(<>Then the pages stand. Two quick calendar questions.</>, "termModel");
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
      push("bot", <>Noted — you can flip any page on or off when you review the blueprint. Two quick calendar questions.</>);
      later(() => ask("termModel"), 650);
      return;
    }

    dispatch({ type: "applyAiPicks", picks: result.picks });
    if (result.picks.addWorkflows.length || result.picks.removeWorkflows.length) onFlash("pages");
    if (Object.keys(result.picks.vocab).length) later(() => onFlash("words"), 450);
    push("bot", <>{result.reply || "Got it — the sheet's updated."}</>);

    const followUp = activityFollowUps.current < MAX_ACTIVITY_FOLLOWUPS ? result.followUp : null;
    if (!followUp) {
      later(() => ask("termModel"), 650);
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
    respond(<>Good — the pages are settled. Two quick calendar questions.</>, "termModel");
  }

  function answerTermModel(model: TermModel, label: string) {
    push("user", label);
    dispatch({ type: "setTermModel", model });
    onFlash("term");
    respond(TERM_MODEL_REPLIES[model], "term");
  }

  function answerTerm(term: TermSuggestion, label: string, deferred: boolean) {
    push("user", label);
    dispatch({ type: "setTerm", term });
    onFlash("term");
    respond(
      deferred ? (
        <>No problem — I&rsquo;ve pencilled in <b>{term.label}</b>; the exact dates are editable on the blueprint.</>
      ) : (
        <><b>{term.label}</b> it is — attendance and dues will book against it from day one.</>
      ),
      "metrics",
    );
  }

  /** Free-text at the term stage: match a suggestion label, else pencil in the first. */
  function answerTermText(text: string) {
    const model = draftRef.current.termModel ?? "semester";
    const suggestions = suggestTerms(model);
    const lower = text.toLowerCase();
    const hit = suggestions.find(t => lower.includes(t.label.toLowerCase())) ??
      suggestions.find(t => t.label.toLowerCase().split(" ").some(w => w.length > 3 && lower.includes(w)));
    answerTerm(hit ?? suggestions[0]!, text, !hit);
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
        <>Tracking <b>{all.join(", ")}</b> per {vocab("Member").toLowerCase()} — the dashboard shows exactly that, nothing else.</>
      ) : (
        <>Nothing tracked per {vocab("Member").toLowerCase()} — the dashboard stays clean. You can add measures in Settings anytime.</>
      ),
      "founderName",
      "metrics",
    );
  }

  function answerName(name: string, label: string) {
    push("user", label);
    dispatch({ type: "setFounderName", name });
    const first = name.trim().split(/\s+/)[0];
    respond(
      first ? <>Nice to meet you, <b>{first}</b>. Last one.</> : <>No problem — we&rsquo;ll use your Google name. Last one.</>,
      "founderTitle",
    );
  }

  async function answerTitle(title: string, label: string, viaText = false) {
    push("user", label);
    let resolved = title;
    if (viaText && aiOn.current) {
      setChips(null);
      setTyping(true);
      const result = await askInterviewAi("founder-title", draftRef.current, [
        { role: "q", text: "What is your title?" },
        { role: "user", text: label },
      ]);
      setTyping(false);
      if (result?.picks.founderTitle) resolved = result.picks.founderTitle;
    }
    dispatch({ type: "setFounderTitle", title: resolved });
    respond(
      <><b>{resolved}</b> of <em>{draftRef.current.name.trim() || "your org"}</em> — it&rsquo;s on the founder seat. Your blueprint is ready; let&rsquo;s set up the rest of your roles.</>,
      "done",
      "seats",
    );
  }

  /* ─── Free-text routing ───────────────────────────────────────────────── */

  async function onFreeText(text: string) {
    const s = stageRef.current;
    if (s === "kind") {
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
    } else if (s === "termModel") {
      answerTermModel(matchTermModel(text), text);
    } else if (s === "term") {
      answerTermText(text);
    } else if (s === "metrics") {
      void answerMetricText(text);
    } else if (s === "founderName") {
      answerName(text, text);
    } else if (s === "founderTitle") {
      void answerTitle(titleCase(text), text, true);
    }
  }

  /* ─── Boot ────────────────────────────────────────────────────────────── */

  // Idempotent (it REPLACES the transcript) so React StrictMode's dev
  // double-mount doesn't drop the first question or duplicate the intro. A
  // founder revisiting a finished interview gets a short recap + CTA instead
  // of being made to re-answer.
  useEffect(() => {
    void probeInterviewAi().then(enabled => {
      aiOn.current = enabled;
    });
    if (draftRef.current.interviewDone) {
      setStage("done");
      setMessages([{ id: nextId.current++, kind: "bot", body: <>We&rsquo;ve already talked — your blueprint is on the right, built from your answers. Head to your roles whenever you&rsquo;re ready.</> }]);
      setShowCta(true);
      return;
    }
    setStage("kind");
    setChips(null);
    setShowCta(false);
    setMessages([{ id: nextId.current++, kind: "bot", body: <>A few quick questions. Everything you say goes onto the blueprint on the right — you&rsquo;ll review the whole sheet before anything is built.</> }]);
    const boot = setTimeout(() => ask("kind"), 900);
    return () => clearTimeout(boot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placeholder =
    stage === "metrics"
      ? 'Type another measure — e.g. "chapter points"…'
      : stage === "founderTitle"
        ? "Type your title…"
        : "Type your own answer…";

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
        {stage === "metrics" && !typing && (
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
        <input
          ref={inputRef}
          className="free"
          placeholder={placeholder}
          disabled={stage === "done"}
          onKeyDown={e => {
            const value = e.currentTarget.value.trim();
            if (e.key !== "Enter" || !value || typing || stageRef.current === "done") return;
            e.currentTarget.value = "";
            void onFreeText(value);
          }}
          aria-label="Type your own answer"
        />
        <button className="ghost-link" onClick={onSkip}>
          Skip — pick a template instead
        </button>
      </div>
    </div>
  );
}
