"use client";

/**
 * Step 2 — THE INTERVIEW. One conversation on a fixed spine of eight beats:
 * who you are → what kind of org → your role → a normal month → money → files
 * → what to track → the current term → a recap where any line can be changed.
 *
 * Every beat has chips (the primary input) and accepts typed answers through
 * the composer; the readers in lib/onboarding never guess past what was said —
 * an answer they can't read is re-asked, because each one turns pages on or off.
 * Answers land on draft.answers and lib/onboarding/answers.ts rebuilds the
 * charter from all of them, so a recap edit never drops a later answer.
 *
 * The transcript lives on the draft (draft.thread), so a reload or the OAuth
 * round trip reopens the same conversation at the first unanswered beat.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  INTERVIEW_BEATS,
  defaultFounderTitle,
  defaultTermModel,
  isInterviewBeat,
  nextUnansweredBeat,
  readDocsAnswer,
  readFounderName,
  readFounderTitle,
  readMoneyAnswer,
  type InterviewBeat,
} from "@/lib/onboarding/answers";
import { ACTIVITY_IDS, readActivities } from "@/lib/onboarding/activities";
import { MAX_CUSTOM_METRICS, type DocsAnswer, type Draft, type MoneyAnswer, type ThreadLine } from "@/lib/onboarding/draft";
import {
  BUILTIN_METRIC_IDS,
  BUILTIN_METRIC_LABEL,
  FOUNDER_TITLE_ALTERNATES,
  KIND_IDS,
  KIND_LABEL,
  getVariant,
  matchKind,
  matchMetricText,
  type BuiltinMetricFlags,
  type KindId,
} from "@/lib/onboarding/kinds";
import { TERM_MODELS, TERM_PERIOD_VOCAB, matchTermModel, suggestTerms, type TermModel } from "@/lib/onboarding/terms";
import type { PaperIconName } from "@/app/components/paper/PaperIcon";
import type { CharterSection } from "./Charter";
import { periodWord, trackedLabels } from "./Charter";
import { draftVocab, type FlowAction } from "./flow-state";
import { Ic, Rich, bold, em, fmtDay, listy, orgName, plain, plural, type Tone } from "./paper";

type Stage = InterviewBeat | "typing" | "recap";

const TYPING_MS = 900;
const AFTER_REPLY_MS = 520;
const FLASH_MS = 420;

/* ─── Copy ─────────────────────────────────────────────────────────────────── */

const KIND_NOUN: Record<KindId, string> = {
  fraternity: "chapter", sorority: "chapter", club: "club", team: "team",
  service: "org", honor: "society", arts: "company", other: "org",
};
const NOUN_PLURAL: Record<string, string> = { society: "societies", company: "companies" };
const nounPl = (n: string) => NOUN_PLURAL[n] ?? `${n}s`;

/** Kind chips in the mock's words (KIND_LABEL is the sheet's shorter form). */
const KIND_CHIP: Record<KindId, string> = {
  fraternity: "A fraternity",
  sorority:   "A sorority",
  club:       "A club or student org",
  team:       "A sports team",
  service:    "A service org",
  honor:      "An honor society",
  arts:       "A performing-arts group",
  other:      "Something else",
};

const ACTIVITY_META: Record<string, { icon: PaperIconName; tone: Tone; label: string }> = {
  meetings:  { icon: "gavel",  tone: "sky",    label: "Chapter meetings" },
  socials:   { icon: "note",   tone: "rose",   label: "Social events or parties" },
  service:   { icon: "heart",  tone: "mint",   label: "Service or volunteering" },
  fundraise: { icon: "board",  tone: "butter", label: "Fundraisers or programs" },
  tasks:     { icon: "box",    tone: "lilac",  label: "Handing out tasks & deadlines" },
  online:    { icon: "camera", tone: "peach",  label: "Posting content online" },
};

const MONEY_CHIPS: [MoneyAnswer, string][] = [["yes", "Yes — all the time"], ["some", "Now and then"], ["none", "No money"]];
const DOCS_CHIPS: [DocsAnswer, string][] = [["yes", "Yes, a few things"], ["scattered", "Yes, but it’s scattered"], ["none", "Not really"]];

const PLACEHOLDER: Record<InterviewBeat, string> = {
  intro:   "Your name is plenty…",
  kind:    "Or describe it — “a pre-med frat”, “a club volleyball team”…",
  role:    "Or type your title…",
  month:   "Or describe a normal month in your own words…",
  money:   "Or describe it in your own words…",
  docs:    "Or describe it in your own words…",
  metrics: "Add something to track per member…",
  term:    "Or type it — “spring quarter”…",
};

function meetingsWord(d: Draft): string {
  const m = draftVocab(d, "Meetings");
  return m === "Chapter" ? "chapter" : m.toLowerCase();
}

function activityLabel(d: Draft, id: string): string {
  if (id !== "meetings") return ACTIVITY_META[id]?.label ?? id;
  const m = draftVocab(d, "Meetings");
  return m === "Chapter" ? "Chapter meetings" : m === "Meetings" ? "Regular meetings" : m;
}

function monthWords(d: Draft, ids: readonly string[]): string[] {
  const words: Record<string, string> = {
    meetings: meetingsWord(d), socials: "parties", service: "service",
    fundraise: "fundraisers", tasks: "deadlines", online: "posting",
  };
  return ACTIVITY_IDS.filter(id => ids.includes(id)).map(id => words[id]!);
}

function question(beat: InterviewBeat, d: Draft): string {
  const n = em(orgName(d));
  switch (beat) {
    case "intro":   return `Hi — I’ll get ${n} set up while we talk. Takes about two minutes. First, who am I talking to?`;
    case "kind":    return `So what is ${n}? What kind of group are we setting up?`;
    case "role":    return `And you’re ${n}’s…?`;
    case "month":   return `Picture a normal month at ${n}. Which of these actually happen?`;
    case "money":   return `Does ${n} handle any money — ${plain(draftVocab(d, "Dues")).toLowerCase()}, event fees, paying people back?`;
    case "docs":    return `Are there files or links everyone at ${n} needs to be able to find?`;
    case "metrics": return `What should I track for each ${plain(draftVocab(d, "Member")).toLowerCase()}? Tap everything you want on the charter — or type your own.`;
    case "term":    return "Last one — what term are you in right now?";
  }
}

function kindReply(d: Draft): string {
  if (!d.kind) return "";
  const variant = getVariant(d.kind, d.variant);
  const head = variant
    ? `${KIND_LABEL[d.kind]} — the ${variant.label.replace(/^an? /i, "").toLowerCase()} kind`
    : KIND_LABEL[d.kind];
  const member = draftVocab(d, "Member");
  const meetings = draftVocab(d, "Meetings");
  const who =
    member !== "Member"
      ? `it’s ${bold(plural(member))}${meetings !== "Meetings" ? ` and ${bold(meetings)}` : ""} from here on`
      : "";
  const offices = d.seats.filter(s => !s.all).map(s => s.title);
  return (
    plain(head) +
    (who ? ` — so ${who}` : "") +
    "." +
    (offices.length ? ` I’ll start you with the offices ${nounPl(KIND_NOUN[d.kind])} like yours usually elect: ${plain(listy(offices))}.` : "")
  );
}

function monthReply(d: Draft, ids: readonly string[]): string {
  if (!ids.length) return "A quiet one — that’s fine. We’ll keep it to a roster and a timeline, and you can switch pages on whenever you need them.";
  const w = plain(listy(monthWords(d, ids)));
  if (ids.length >= 4) return `A full calendar: ${w}. Each one gets its own page; the rest stay off.`;
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} — each gets its own page. Nothing else clutters the sidebar.`;
}

function moneyReply(d: Draft, v: MoneyAnswer): string {
  const dues = plain(draftVocab(d, "Dues")).toLowerCase();
  const treasury = bold(draftVocab(d, "Treasury"));
  return {
    yes:  `${treasury} is on — ${dues}, payments and reimbursements in one ledger.`,
    some: `${treasury} is on for whatever does come in and go out — it stays quiet otherwise.`,
    none: `No money, no ${plain(draftVocab(d, "Treasury"))} — and nobody gets a ${dues} column.`,
  }[v];
}

function docsReply(v: DocsAnswer): string {
  return {
    yes:       `${bold("Docs")} is on — pin them there and they stay put.`,
    scattered: `Then ${bold("Docs")} gives them one place to live.`,
    none:      "Skipping Docs — one switch in Settings if that changes.",
  }[v];
}

function termReply(d: Draft): string {
  if (!d.term) return "";
  return `${bold(d.term.label)}, ${fmtDay(d.term.startDate)} – ${fmtDay(d.term.endDate)}. You’ll land in a working ${plain(periodWord(d)).toLowerCase()}, not a setup screen.`;
}

function titleChoices(d: Draft): string[] {
  const kind = d.kind ?? "other";
  return [defaultFounderTitle(kind), ...FOUNDER_TITLE_ALTERNATES[kind]].filter((x, i, a) => a.indexOf(x) === i);
}

/* ─── The step ─────────────────────────────────────────────────────────────── */

export function InterviewStep({
  draft,
  dispatch,
  onFlash,
  onDone,
  founderFallback,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  onFlash: (section: CharterSection) => void;
  onDone: () => void;
  founderFallback: string | null;
}) {
  const [stage, setStage] = useState<Stage>(() => (draft.interviewDone ? "recap" : nextUnansweredBeat(draft) ?? "recap"));
  const [picks, setPicks] = useState<string[]>(() => draft.answers.acts ?? []);
  const [metPicks, setMetPicks] = useState<BuiltinMetricFlags>(() => flagsOf(draft));
  const [text, setText] = useState("");

  // Timers read the draft AFTER their answer was reduced, so replies quote it.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const reask = useRef<InterviewBeat | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);
  // Entrance animation: only lines past what was already on screen, and only the
  // widgets of a question that just arrived — never on a tap (re-animating every
  // message blanks the whole conversation for a beat).
  const seen = useRef(draft.thread.length);
  const shownStage = useRef<Stage | null>(stage);
  const freshStage = shownStage.current !== stage;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    seen.current = draft.thread.length;
    shownStage.current = stage;
  });

  const later = useCallback((fn: () => void, ms: number) => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timers.current.push(setTimeout(fn, reduce ? 0 : ms));
  }, []);

  const say = useCallback((...lines: ThreadLine[]) => dispatch({ type: "say", lines }), [dispatch]);

  const askBeat = useCallback(
    (beat: InterviewBeat) => {
      const d = draftRef.current;
      say({ k: "q", t: question(beat, d), b: beat });
      if (beat === "month") setPicks(d.answers.acts ?? []);
      if (beat === "metrics") setMetPicks(flagsOf(d));
      setStage(beat);
    },
    [say],
  );

  const finish = useCallback(() => {
    const d = draftRef.current;
    if (!d.interviewDone) {
      say({ k: "bot", t: `That’s all I need. Here’s ${plain(orgName(d))} as I heard it — tap any line that’s off.` });
      dispatch({ type: "interviewDone" });
    }
    setStage("recap");
  }, [dispatch, say]);

  // Open the conversation — or reopen it at the first unanswered beat.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (draft.interviewDone) return;
    const next = nextUnansweredBeat(draft);
    if (!next) return finish();
    if (!draft.thread.length) return askBeat(next);
    const lastQ = [...draft.thread].reverse().find(l => l.k === "q");
    if (lastQ?.b !== next) {
      say({ k: "bot", t: "Welcome back — let’s pick up where we left off." });
      askBeat(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Echo the answer, show the typing dots, reply, then move on. The answer
      itself has already been dispatched by the caller. */
  const respond = useCallback(
    (userText: string, reply: ((d: Draft) => string | null) | null, flash: CharterSection | null) => {
      say({ k: "me", t: plain(userText).slice(0, 600) });
      setStage("typing");
      if (flash) later(() => onFlash(flash), FLASH_MS);
      later(() => {
        const d = draftRef.current;
        const r = reply?.(d) ?? null;
        if (r) say({ k: "bot", t: r });
        later(() => {
          const next = reask.current ? null : nextUnansweredBeat(draftRef.current);
          reask.current = null;
          if (next) askBeat(next);
          else finish();
        }, r ? AFTER_REPLY_MS : 0);
      }, TYPING_MS);
    },
    [askBeat, finish, later, onFlash, say],
  );

  /** A typed answer that couldn't be read: say so and stay on the beat. */
  const nudge = useCallback(
    (userText: string, reply: string) => {
      say({ k: "me", t: plain(userText).slice(0, 600) });
      setStage("typing");
      const beat = stage;
      later(() => {
        say({ k: "bot", t: reply });
        setStage(beat);
      }, TYPING_MS);
    },
    [later, say, stage],
  );

  /* ── Answers ── */

  function answerIntro(name: string, label: string) {
    dispatch({ type: "answerIntro", founderName: name });
    respond(
      label,
      () => (name ? `Good to meet you, ${bold(name.split(" ")[0]!)}.` : "Works — I’ll take your name from Google when you sign in."),
      "foot",
    );
  }

  function answerKind(kind: KindId, label: string, typed: string | null) {
    dispatch({ type: "answerKind", kind, text: typed });
    respond(label, kindReply, "words");
  }

  function answerRole(title: string, label: string) {
    dispatch({ type: "answerRole", title });
    respond(
      label,
      d =>
        title === "Admin"
          ? `Then your seat is ${bold("Admin")} for now. Everything’s yours until you hand ${bold(defaultFounderTitle(d.kind))} to whoever holds it.`
          : `${bold(title)} it is. That seat can do everything, and it’s yours.`,
      "seats",
    );
  }

  function answerMonth(ids: string[], label: string) {
    dispatch({ type: "answerMonth", acts: ids });
    respond(label, d => monthReply(d, ids), "pages");
  }

  function answerMoney(v: MoneyAnswer, label: string) {
    dispatch({ type: "answerMoney", value: v });
    respond(label, d => moneyReply(d, v), "pages");
  }

  function answerDocs(v: DocsAnswer, label: string) {
    dispatch({ type: "answerDocs", value: v });
    respond(label, () => docsReply(v), "pages");
  }

  function answerMetrics() {
    const finance = draft.enabledWorkflows.includes("finance");
    const flags = { ...metPicks, duesOwed: finance && metPicks.duesOwed };
    dispatch({ type: "answerMetrics", flags });
    const labels = [
      ...BUILTIN_METRIC_IDS.filter(id => flags[id]).map(id => BUILTIN_METRIC_LABEL[id]),
      ...draft.metrics.custom.map(m => m.name),
    ];
    respond(labels.length ? labels.join(", ") : "Nothing for now", null, "metrics");
  }

  function answerTerm(model: TermModel, pick: number, label: string) {
    dispatch({ type: "setTerm", model, pick });
    respond(label, termReply, "words");
  }

  function edit(beat: InterviewBeat) {
    if (stage === "typing") return;
    say({ k: "bot", t: "Sure — let’s fix that." });
    reask.current = beat;
    askBeat(beat);
  }

  function onTyped(raw: string) {
    const v = raw.trim();
    if (!v || !isInterviewBeat(stage)) return;
    switch (stage) {
      case "intro": {
        const name = readFounderName(v);
        return name ? answerIntro(name, v) : nudge(v, "What should everyone call you? Your first and last name is plenty.");
      }
      case "kind":
        return answerKind(matchKind(v), v, v);
      case "role": {
        const title = readFounderTitle(v);
        return title ? answerRole(title, v) : nudge(v, "What’s your title? “President”, “Captain”, “just helping” — anything works.");
      }
      case "month": {
        const read = readActivities(v);
        if (!read) return nudge(v, "I couldn’t tell which of these happen — tap the ones that do, or say it another way.");
        if (!read.confident) {
          setPicks([...read.ids]);
          const off = monthWords(draft, [...read.off]);
          return nudge(v, `So everything except ${plain(listy(off))}? Untick anything that’s off, then tap ${bold("That’s our month")}.`);
        }
        setPicks([...read.ids]);
        return answerMonth([...read.ids], v);
      }
      case "money": {
        const m = readMoneyAnswer(v);
        return m ? answerMoney(m, v) : nudge(v, "No problem — tap whichever is closest. Treasury is one switch in Settings either way.");
      }
      case "docs": {
        const doc = readDocsAnswer(v);
        return doc ? answerDocs(doc, v) : nudge(v, "Tap whichever is closest — Docs is one switch in Settings either way.");
      }
      case "metrics": {
        const m = matchMetricText(v);
        if (m.kind === "done") return answerMetrics();
        if (m.kind === "unreadable") return nudge(v, "I couldn’t turn that into a column — try a short name like “chapter points”.");
        if (draft.metrics.custom.length >= MAX_CUSTOM_METRICS) {
          return nudge(v, `That’s the most I can add here — ${MAX_CUSTOM_METRICS} of your own. More in Settings later.`);
        }
        dispatch({ type: "addCustomMetric", name: m.name, unit: m.unit });
        onFlash("metrics");
        return;
      }
      case "term": {
        const lower = v.toLowerCase();
        const named = /quarter|trimester|season|year|round|rolling|annual|no term|reset/.test(lower);
        const model = named ? matchTermModel(v) : draft.term?.model ?? defaultTermModel(draft.kind);
        const sugs = suggestTerms(model);
        const pick = Math.max(0, sugs.findIndex(s => lower.includes(s.label.split(" ")[0]!.toLowerCase())));
        return answerTerm(model, pick, v);
      }
    }
  }

  /* ── Render ── */

  const open = isInterviewBeat(stage);
  const qi = open ? INTERVIEW_BEATS.indexOf(stage) : -1;
  const progress =
    qi >= 0 ? `Question ${qi + 1} of ${INTERVIEW_BEATS.length}` : stage === "recap" ? `All ${INTERVIEW_BEATS.length} answered` : "about 2 minutes";
  const finance = draft.enabledWorkflows.includes("finance");
  const widgetCls = freshStage ? " new" : "";

  useEffect(() => {
    const t = threadRef.current;
    const last = t?.lastElementChild;
    if (!last) return;
    const id = setTimeout(() => {
      const r = last.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 150) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: window.scrollY + r.bottom - window.innerHeight + 170, behavior: reduce ? "auto" : "smooth" });
      }
    }, 30);
    return () => clearTimeout(id);
  }, [draft.thread.length, stage]);

  return (
    <div className="ask convo">
      <p className="kick">
        Step 2 · A conversation <span className="chip">{progress}</span>
      </p>
      <h1 className="q q--sm">
        Tell me how{" "}
        <span className="hi" style={{ ["--mark" as string]: "var(--lilac)" }}>
          {orgName(draft)}
        </span>{" "}
        actually runs.
      </h1>
      <p className="lede">
        Answer like you’d explain it to a new officer. Every answer writes onto the charter, and you can change any of
        them at the end.
      </p>

      <div className="thread" ref={threadRef}>
        {draft.thread.map((m, i) => {
          const nw = i >= seen.current ? " new" : "";
          if (m.k === "me") {
            return (
              <div key={i} className={`msg me${nw}`}>
                <p>{m.t}</p>
              </div>
            );
          }
          return (
            <div key={i} className={`msg ${m.k}${nw}`}>
              {m.k === "q" ? (
                <span className="chapt">
                  <Ic name="spark" />
                </span>
              ) : (
                <span className="sp" />
              )}
              <p>
                <Rich text={m.t} />
              </p>
            </div>
          );
        })}

        {stage === "typing" && (
          <div className="msg bot new">
            <span className="sp" />
            <div className="typing" aria-label="Typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}

        {stage === "intro" && (
          <div className={`opts${widgetCls}`}>
            <button type="button" className="opt" onClick={() => answerIntro("", "Use my Google name")}>
              Use my Google name
            </button>
          </div>
        )}

        {stage === "kind" && (
          <div className={`opts${widgetCls}`}>
            {KIND_IDS.map(k => (
              <button key={k} type="button" className="opt" onClick={() => answerKind(k, KIND_CHIP[k], null)}>
                {KIND_CHIP[k]}
              </button>
            ))}
          </div>
        )}

        {stage === "role" && (
          <div className={`opts${widgetCls}`}>
            {titleChoices(draft).map(t => (
              <button key={t} type="button" className="opt" onClick={() => answerRole(t, t)}>
                {t}
              </button>
            ))}
            <button type="button" className="opt" onClick={() => answerRole("Admin", "Just setting it up for us")}>
              Just setting it up for us
            </button>
          </div>
        )}

        {stage === "month" && (
          <div className={`acts${widgetCls}`}>
            {ACTIVITY_IDS.map(id => {
              const meta = ACTIVITY_META[id]!;
              const on = picks.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`act t-${meta.tone}`}
                  style={{ ["--p-hs" as string]: `var(--${meta.tone})` }}
                  aria-pressed={on}
                  onClick={() => setPicks(p => (on ? p.filter(x => x !== id) : [...p, id]))}
                >
                  <span className="tile">
                    <Ic name={meta.icon} />
                  </span>
                  <span>{activityLabel(draft, id)}</span>
                  <span className="bx">
                    <Ic name="check" />
                  </span>
                </button>
              );
            })}
            <div className="acts-go">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  answerMonth(
                    [...picks],
                    picks.length ? ACTIVITY_IDS.filter(id => picks.includes(id)).map(id => activityLabel(draft, id)).join(", ") : "None of these, really",
                  )
                }
              >
                {picks.length ? "That’s our month" : "None of these, really"}
                <Ic name="arrow-r" />
              </button>
            </div>
          </div>
        )}

        {stage === "money" && (
          <div className={`opts${widgetCls}`}>
            {MONEY_CHIPS.map(([v, l]) => (
              <button key={v} type="button" className="opt" onClick={() => answerMoney(v, l)}>
                {l}
              </button>
            ))}
          </div>
        )}

        {stage === "docs" && (
          <div className={`opts${widgetCls}`}>
            {DOCS_CHIPS.map(([v, l]) => (
              <button key={v} type="button" className="opt" onClick={() => answerDocs(v, l)}>
                {l}
              </button>
            ))}
          </div>
        )}

        {stage === "metrics" && (
          <>
            <div className={`opts${widgetCls}`}>
              {BUILTIN_METRIC_IDS.filter(id => id !== "duesOwed" || finance).map(id => (
                <button
                  key={id}
                  type="button"
                  className="opt"
                  aria-pressed={metPicks[id]}
                  onClick={() => setMetPicks(m => ({ ...m, [id]: !m[id] }))}
                >
                  {id === "duesOwed" ? `${draftVocab(draft, "Dues")} owed` : BUILTIN_METRIC_LABEL[id]}
                </button>
              ))}
              {draft.metrics.custom.map((c, i) => (
                <button
                  key={`${c.name}-${i}`}
                  type="button"
                  className="opt soft"
                  aria-pressed="true"
                  title="Remove"
                  onClick={() => dispatch({ type: "removeCustomMetric", index: i })}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className={`donebar${widgetCls}`}>
              <button type="button" className="btn" onClick={answerMetrics}>
                Track these
                <Ic name="arrow-r" />
              </button>
              <span className="note">Type below to add your own — “chapter points”, “rush interviews”…</span>
            </div>
          </>
        )}

        {stage === "term" && <TermChips draft={draft} cls={widgetCls} onPick={answerTerm} />}

        {stage === "recap" && <Recap draft={draft} founderFallback={founderFallback} onEdit={edit} onDone={onDone} />}
      </div>

      {stage !== "recap" && (
        <form
          className={`compose${open ? "" : " off"}`}
          autoComplete="off"
          onSubmit={e => {
            e.preventDefault();
            const v = text;
            setText("");
            onTyped(v);
          }}
        >
          <input
            aria-label="Your answer"
            value={text}
            maxLength={300}
            placeholder={open ? PLACEHOLDER[stage] : "…"}
            onChange={e => setText(e.target.value)}
            disabled={!open}
          />
          <button className="send" type="submit" aria-label="Send" disabled={!open || !text.trim()}>
            <Ic name="send" />
          </button>
        </form>
      )}
    </div>
  );
}

function flagsOf(d: Draft): BuiltinMetricFlags {
  return {
    attendance:   d.metrics.attendance,
    gpa:          d.metrics.gpa,
    duesOwed:     d.metrics.duesOwed,
    serviceHours: d.metrics.serviceHours,
  };
}

function TermChips({
  draft,
  cls,
  onPick,
}: {
  draft: Draft;
  cls: string;
  onPick: (model: TermModel, pick: number, label: string) => void;
}) {
  const model = draft.term?.model ?? defaultTermModel(draft.kind);
  const sugs = suggestTerms(model).slice(0, 2);
  const others = TERM_MODELS.filter(m => m !== model);
  return (
    <div className={`opts${cls}`}>
      {sugs.map((s, i) => (
        <button key={s.label} type="button" className="opt" onClick={() => onPick(model, i, s.label)}>
          {s.label}{" "}
          <small className="tsm">
            {fmtDay(s.startDate)} – {fmtDay(s.endDate)}
          </small>
        </button>
      ))}
      {others.map(m => {
        const label = m === "year-round" ? "We run year-round" : `We use ${TERM_PERIOD_VOCAB[m].toLowerCase()}s`;
        return (
          <button key={m} type="button" className="opt soft" onClick={() => onPick(m, 0, label)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Recap({
  draft,
  founderFallback,
  onEdit,
  onDone,
}: {
  draft: Draft;
  founderFallback: string | null;
  onEdit: (beat: InterviewBeat) => void;
  onDone: () => void;
}) {
  const a = draft.answers;
  const kind = draft.kind ?? "other";
  const variant = getVariant(kind, draft.variant);
  const member = draftVocab(draft, "Member");
  const founder = draft.founderName.trim() || founderFallback || "";
  const founderSeat = draft.seats.find(s => s.all);
  const tracked = trackedLabels(draft);
  const treasury = draftVocab(draft, "Treasury");

  const lines: [InterviewBeat, React.ReactNode][] = [
    ["intro", founder ? <>You’re <b>{founder}</b></> : <>You’ll sign in with Google — your name comes from there</>],
    [
      "kind",
      <>
        <b>{orgName(draft)}</b> is {KIND_LABEL[kind].toLowerCase()}
        {variant ? ` — the ${variant.label.replace(/^an? /i, "").toLowerCase()} kind` : ""}
        {member !== "Member" ? ` — ${plural(member)}, ${draftVocab(draft, "Meetings")}` : ""}
      </>,
    ],
    ["role", <>You hold the <b>{founderSeat?.title ?? defaultFounderTitle(draft.kind)}</b> seat</>],
    [
      "month",
      a.acts?.length ? <>A normal month: {listy(monthWords(draft, a.acts))}</> : <>A quiet month — roster and timeline only</>,
    ],
    [
      "money",
      a.money === "none" ? (
        <>No money changes hands</>
      ) : (
        <>
          {a.money === "some" ? "Money now and then" : "Money moves regularly"} — <b>{treasury}</b> is on
        </>
      ),
    ],
    [
      "docs",
      a.docs === "none" ? (
        <>No shared files</>
      ) : a.docs === "scattered" ? (
        <>Scattered files get one home in <b>Docs</b></>
      ) : (
        <>Shared files and links get a <b>Docs</b> page</>
      ),
    ],
    [
      "metrics",
      tracked.length ? (
        <>
          Tracking <b>{listy(tracked.map(x => (x === "GPA" ? x : x.toLowerCase())))}</b> per {member.toLowerCase()}
        </>
      ) : (
        <>Nothing tracked per {member.toLowerCase()}</>
      ),
    ],
    [
      "term",
      draft.term ? (
        <>
          Starting in <b>{draft.term.label}</b> · {fmtDay(draft.term.startDate)} – {fmtDay(draft.term.endDate)}
        </>
      ) : (
        <>No term yet</>
      ),
    ],
  ];

  return (
    <div className="recap new">
      <p className="rk-h">
        <Ic name="clip" />
        {orgName(draft)}, as I heard it
      </p>
      <ol>
        {lines.map(([beat, node]) => (
          <li key={beat}>
            <span className="rt">{node}</span>
            <button type="button" className="rc" onClick={() => onEdit(beat)}>
              Change
            </button>
          </li>
        ))}
      </ol>
      <div className="recap-go">
        <button type="button" className="btn btn--lg" onClick={onDone}>
          That’s us — who can do what
          <Ic name="arrow-r" />
        </button>
      </div>
    </div>
  );
}
