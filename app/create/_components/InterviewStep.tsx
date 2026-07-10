"use client";

/**
 * Step 2 — INTERVIEW. The scripted three-question chat (kind, pain, your
 * name): serif questions, tap chips, a typing indicator, and a free-text
 * fallback routed through the keyword matchers. Fully deterministic — no AI.
 * Ported from the mock's QUESTIONS engine; the cadence/term questions were
 * cut, and "what should everyone call you?" was added (createOrgInput needs
 * founderName and the mock never collected it).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Draft } from "@/lib/onboarding/draft";
import {
  matchKind,
  matchPain,
  type KindId,
  type PainId,
} from "@/lib/onboarding/kinds";
import { draftVocab, type FlowAction } from "./flow-state";
import type { SheetFlash } from "./BlueprintSheet";

type Msg = { id: number; kind: "bot" | "q" | "user"; body: ReactNode };
type Chip = { label: string; pick: () => void };

const KIND_REPLIES: Record<KindId, ReactNode> = {
  fraternity: <>A fraternity — so it&rsquo;s <b>Brothers</b>, <b>Chapter</b>, and <b>Semesters</b> from here on. Watch the sheet: your blueprint just learned to speak Greek.</>,
  sorority:   <>A sorority — <b>Sisters</b>, <b>Chapter</b>, <b>Semesters</b>. The blueprint speaks your language now.</>,
  club:       <>Got it — <b>Members</b>, <b>Meetings</b>, <b>Semesters</b>. No Greek assumed.</>,
  team:       <>A team — <b>Players</b>, <b>Practice</b>, <b>Seasons</b>. The sheet is set up that way.</>,
  service:    <>A service org — I&rsquo;ll put <b>service hours</b> and <b>events</b> forward, and keep the words plain.</>,
  honor:      <>An honor society — <b>attendance</b> and <b>standards</b> lead; parties stay off.</>,
  arts:       <>A performing-arts group — <b>Cast members</b>, <b>Rehearsals</b>, and a calendar built for a run.</>,
  other:      <>Got it — I&rsquo;ll start you neutral: <b>Members</b>, <b>Meetings</b>, and only the pages you turn on.</>,
};

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
  const [stage, setStage] = useState(0); // 0 kind · 1 pain · 2 your name · 3 done
  const [showCta, setShowCta] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextId = useRef(0);

  // Refs mirror the latest draft/stage for use inside timeouts.
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
  }, [messages, typing, chips, showCta]);

  function push(kind: Msg["kind"], body: ReactNode) {
    setMessages(m => [...m, { id: nextId.current++, kind, body }]);
  }

  const painReply = (p: PainId): ReactNode => {
    const member = draftVocab(draftRef.current, "Member").toLowerCase();
    const meeting = draftVocab(draftRef.current, "Meetings").toLowerCase();
    return {
      dues:       <>Heard. <b>Dues goes front and center</b> — every unpaid {member} at a glance, and nobody chases screenshots again.</>,
      attendance: <>Then attendance runs itself from now on — mandatory {meeting}s, excuses, and a live percentage per {member}.</>,
      events:     <>Planning it is. <b>The calendar leads</b>, with wrap-ups and door revenue one tap away.</>,
      comms:      <>One place to say it, everywhere it lands — <b>Announcements go up top</b>.</>,
    }[p];
  };

  function ask(idx: number) {
    if (idx === 0) {
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
    } else if (idx === 1) {
      push("q", <>What eats most of your time running it?</>);
      setChips([
        { label: "Chasing dues", pick: () => answerPain("dues", "Chasing dues") },
        { label: "Tracking attendance", pick: () => answerPain("attendance", "Tracking attendance") },
        { label: "Planning events", pick: () => answerPain("events", "Planning events") },
        { label: "Keeping everyone informed", pick: () => answerPain("comms", "Keeping everyone informed") },
      ]);
    } else if (idx === 2) {
      push("q", <>Last one — what should everyone call <b>you</b>?</>);
      setChips([
        { label: "I'll use my Google name", pick: () => answerName("", "I'll use my Google name") },
      ]);
    } else {
      setStage(3);
      dispatch({ type: "interviewDone" });
      later(() => setShowCta(true), 500);
    }
  }

  function respond(reply: ReactNode, nextIdx: number, flash?: NonNullable<SheetFlash>["section"]) {
    setChips(null);
    setTyping(true);
    if (flash) later(() => onFlash(flash), 500);
    later(() => {
      setTyping(false);
      push("bot", reply);
      later(() => {
        setStage(nextIdx);
        ask(nextIdx);
      }, 650);
    }, 850);
  }

  function answerKind(kind: KindId, label: string) {
    push("user", label);
    dispatch({ type: "setKind", kind });
    onFlash("pages");
    respond(KIND_REPLIES[kind], 1, "words");
  }

  function answerPain(pain: PainId, label: string) {
    push("user", label);
    dispatch({ type: "setPain", pain });
    onFlash("pages");
    respond(painReply(pain), 2);
  }

  function answerName(name: string, label: string) {
    push("user", label);
    dispatch({ type: "setFounderName", name });
    const first = name.trim().split(/\s+/)[0];
    respond(
      first
        ? <>Nice to meet you, <b>{first}</b>. Your blueprint is ready — let&rsquo;s set up your roles.</>
        : <>No problem — we&rsquo;ll use your Google name. Your blueprint is ready — let&rsquo;s set up your roles.</>,
      3,
      "seats",
    );
  }

  function onFreeText(text: string) {
    const s = stageRef.current;
    if (s === 0) answerKind(matchKind(text), text);
    else if (s === 1) answerPain(matchPain(text), text);
    else if (s === 2) answerName(text, text);
  }

  // Boot. Idempotent (it REPLACES the transcript) so React StrictMode's dev
  // double-mount doesn't drop the first question or duplicate the intro. A
  // founder revisiting a finished interview gets a short recap + CTA instead
  // of being made to re-answer.
  useEffect(() => {
    if (draftRef.current.interviewDone) {
      setStage(3);
      setMessages([{ id: nextId.current++, kind: "bot", body: <>We&rsquo;ve already talked — your blueprint is on the right, built from your answers. Head to your roles whenever you&rsquo;re ready.</> }]);
      setShowCta(true);
      return;
    }
    setStage(0);
    setChips(null);
    setShowCta(false);
    setMessages([{ id: nextId.current++, kind: "bot", body: <>Three quick questions. Everything you say goes onto the blueprint on the right — you&rsquo;ll review the whole sheet before anything is built.</> }]);
    const boot = setTimeout(() => ask(0), 900);
    return () => clearTimeout(boot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {showCta && (
          <button className="cta chat-cta" onClick={onDone}>
            Set up your roles<span>→</span>
          </button>
        )}
      </div>
      <div className="chat-foot">
        <input
          className="free"
          placeholder="Type your own answer…"
          disabled={stage >= 3}
          onKeyDown={e => {
            const value = e.currentTarget.value.trim();
            if (e.key !== "Enter" || !value || typing || stageRef.current >= 3) return;
            e.currentTarget.value = "";
            onFreeText(value);
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
