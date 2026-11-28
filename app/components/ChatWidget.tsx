"use client";

// "Ask Chapt" — the Spotlight. A floating launcher opens a centered spotlight
// modal over a blurred scrim (⌘K / Ctrl-K toggles, Esc closes). Streams from
// /api/ai/chat (SSE — protocol documented in the route): the thinking state
// renders as a REASONING LEDGER (steps posting findings + Consulted chips)
// that collapses into an auditable trace above the answer; answers are hybrid
// (serif verdict + tappable result rows + Sources + follow-ups + feedback);
// writes surface as permission-gated writ cards (Approve / Discard, or a
// blocked gate naming who holds the authority). History is localStorage-only.
// The launcher hides itself when the server reports no OPENAI_API_KEY.
//
// Visual language: the warm dusk vocabulary of _design/Ask Chapt Spotlight
// v3.html — Fraunces serif counsel voice, ONE violet accent, zero gradients.
// Styling in chat-spotlight.css; fonts come from next/font vars on <html>.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ClipboardEvent as ReactClipboardEvent, type DragEvent as ReactDragEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { orgFetch } from "../lib/api";
import { iterSSE } from "../lib/sse";
import { useChapter } from "../context/ChapterContext";
import { IcAlert, IcArrow, IcCal, IcClip, IcCoin, IcFile, IcFlag, IcMic, IcPlus, IcRedo, IcSend, IcStop, IcUsers, IcX } from "./chat/icons";
import { Slip } from "./chat/Slip";
import { MarkdownLite } from "./chat/MarkdownLite";
import { AnswerSkeleton, MarkedQuestion, WorkingLine } from "./chat/WorkingLine";
import { AnswerBlock, DraftVerdict } from "./chat/AnswerBlock";
import { PeekSheet, type PeekSeed } from "./chat/PeekSheet";
import { EventIdeaPanel, type EventIdeaSeed } from "./chat/EventIdeaPanel";
import { WritCard } from "./chat/WritCard";
import { useProposalChoices } from "./chat/useProposalChoices";
import { usePhoneSheet, useSheetDrag } from "./chat/usePhoneSheet";
import { ChaptMark } from "./chat/ChaptMark";
import { useMarkState } from "./chat/useMarkState";
import { useDictation } from "./chat/useDictation";
import { PhoneLanding } from "./chat/PhoneLanding";
import { ApprovalsView } from "./chat/ApprovalsView";
import { AttachmentTray } from "./chat/AttachmentTray";
import { useAttachments } from "./chat/useAttachments";
import { ExcerptSheet } from "./chat/ExcerptSheet";
import { parseCitations } from "./chat/CitationChips";
import { refreshDuesStandings } from "../hooks/useDuesStandings";
import { dropOtherPeoplesChats } from "../lib/local-session";
import { dropProvisional, intentFor, planFor, reconcileStep, settleHalted, settleLedger } from "./chat/intent";
import {
  newId,
  rowAction,
  stepRow,
  timeStamp,
  type AnswerCitation,
  type AnswerData,
  type AnswerRow,
  type ChatMessage,
  type FileLimits,
  type EntityRef,
  type RefType,
  type LedgerStep,
  type ProposalCard,
} from "./chat/types";
import "./chat-spotlight.css";
import "./chat-phone.css";
import "./chat/spotlight-desk.css";
import "./chat/chat-attachments.css";
import { orgHref } from "@/lib/org-paths";

const PULSE_SEEN_KEY = "chaptos_chat_seen_v1";
const MAX_HISTORY = 50;
// Only the most recent turns keep their ledger steps in storage — traces on
// old turns are rarely reopened and steps are the bulky part of a message.
const STEPS_KEPT = 10;

// A curated three, not a directory — each maps to a real answer flow.
const STARTERS = [
  { icon: <IcCoin size={14} />, label: "Outstanding dues", q: "How are we doing on dues?" },
  { icon: <IcUsers size={14} />, label: "Attendance gaps", q: "Who missed the last two meetings?" },
  { icon: <IcCal size={14} />, label: "This week", q: "Summarize what's happening this week." },
] as const;

// Desktop's welcome asks three whole questions that suit any org, dues or not.
// The phone keeps STARTERS on its own landing (PhoneLanding).
const DESK_STARTERS = [
  { icon: <IcFlag size={15} />, tone: "var(--pp-butter)", q: "What's due for me this week?" },
  { icon: <IcCal size={15} />, tone: "var(--pp-sky)", q: "What's happening this week?" },
] as const;
// The third depends on whether the org has a meeting yet. On day one there are
// no minutes to ask about, so whoever can add events is offered the first one
// instead (Ask Chapt asks the type and date, then drafts it for approval).
// Once a chapter meeting exists, booked or held, it asks about the last one.
const LAST_MEETING_STARTER = { icon: <IcFile size={15} />, tone: "var(--pp-peach)", q: "What did we decide at the last meeting?" } as const;
const FIRST_MEETING_STARTER = { icon: <IcPlus size={15} />, tone: "var(--pp-peach)", q: "Can you set up my first meeting?" } as const;

// The welcome → first message flight (desktop): the composer's spring.
// How far below the thread's top edge a newest answer stops when followed —
// the turn's trace and headline sit just under it, the question above the fold.
const ANCHOR_GAP = 14;
const FLIGHT_EASE = "cubic-bezier(.16,.9,.3,1.02)";

type Scene = "briefing" | "thread" | "approvals";

// What the settled bar says, by the surface the action wrote to.
const APPROVED_TEXT: Record<string, string> = {
  dues: "Approved — posted to the ledger.",
  treasury: "Approved — posted to the ledger.",
  timeline: "Approved — added to the timeline.",
  events: "Approved — added to the calendar.",
  programming: "Approved — added to the board.",
  instagram: "Approved — added to the queue.",
  excuse: "Submitted — your excuse is filed.",
  reimbursement: "Submitted — sent to the treasurer.",
  service: "Logged — your hours are recorded.",
  poll: "Voted — your pick is in.",
};

// A task completion shares the timeline kind with adding a deadline, so it
// needs its own line rather than "added to the timeline".
const APPROVED_TEXT_BY_ACTION: Record<string, string> = {
  propose_complete_task: "Done — marked complete.",
};

function approvedText(card: ProposalCard): string {
  return APPROVED_TEXT_BY_ACTION[card.action] ?? APPROVED_TEXT[card.display.kind] ?? "Approved.";
}

/**
 * Stamp how long the turn took, once: the first thing that replaces the
 * working line's placeholder (an answer, prose, a card) or the end of the turn
 * if nothing did. Kept on the message so the settled trace can say it.
 */
function stampElapsed(m: ChatMessage): ChatMessage {
  return m.elapsedMs !== undefined || !m.startedAt ? m : { ...m, elapsedMs: Date.now() - m.startedAt };
}

/** Text a message contributes to the request history (the server wants prose). */
function messageText(m: ChatMessage): string {
  // A later turn learns a file exists from this line; its text reaches the
  // model only through the file tools.
  if (m.role === "user" && m.attachments?.length) return `${m.content}\n(attached: ${m.attachments.join(", ")})`;
  if (m.content.trim()) return m.content;
  if (m.answer) {
    return [
      m.answer.verdict.replace(/\*/g, ""),
      ...m.answer.rows.map(r => [r.title, r.subtitle, r.value].filter(Boolean).join(" — ")),
    ].join("\n");
  }
  // A self-service reply can be the card alone (the server ends the turn
  // without prose). Without this the turn would drop out of the history and a
  // follow-up ("make it $45") would reach a model that never saw the draft.
  if (m.proposals?.length) {
    return m.proposals.map(p => `Drafted for confirmation (${p.state}): ${p.summary}`).join("\n");
  }
  return "";
}

function loadHistory(storageKey: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed)) return [];
    // An in-flight confirm that lost its page can't resolve — surface as error.
    // Likewise a turn interrupted mid-ledger: settle its steps so reopening the
    // trace shows a record rather than a spinner that will never resolve, and
    // drop any guessed step the model never got round to corroborating.
    return parsed.slice(-MAX_HISTORY).map(m => ({
      ...m,
      // Turns saved before the error slip wrote the failure into the prose.
      ...(m.role === "assistant" && m.content === "(network error)" ? { content: "", error: m.error ?? {} } : {}),
      steps: m.steps
        ?.filter(s => !s.provisional)
        .map(s => (s.status === "done" ? s : { ...s, status: "done" as const })),
      composing: undefined,
      // A draft no answer confirmed was never the answer.
      draft: m.answer ? m.draft : undefined,
      proposals: m.proposals?.map(p =>
        p.state === "confirming" ? { ...p, state: "error" as const, resultMessage: "Interrupted — not approved." } : p,
      ),
    }));
  } catch { return []; }
}

function saveHistory(storageKey: string, msgs: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    // An empty thread never overwrites a stored one. ChatWidgetGate renders the
    // widget only once currentUser.org has resolved off /api/auth/me, so on a
    // fresh page load this component mounts, unmounts and mounts again while
    // that settles — and every mount runs this effect once with `messages`
    // still at its initial []. That wiped the stored thread before the mount
    // that would have loaded it got there, so NOTHING survived a reload:
    // answers, traces, and — the part that actually costs something — proposals
    // left pending. A card you hadn't approved yet was destroyed by a refresh,
    // which makes the pending state's implicit promise ("decide later") false.
    // The only legitimate way to reach an empty thread is clearing it, which
    // removes the key outright rather than saving [] over it.
    if (msgs.length === 0) return;
    const trimmed = msgs.slice(-MAX_HISTORY).map((m, i, all) =>
      all.length - i > STEPS_KEPT ? { ...m, steps: undefined } : m,
    );
    localStorage.setItem(storageKey, JSON.stringify(trimmed));
  } catch { /* localStorage full — silently drop */ }
}

/**
 * `storageKey` is this person's thread in this org (chatHistoryKey). The gate
 * also passes it as the React key, so switching org or account remounts the
 * widget instead of carrying one thread's messages into another's key.
 */
export function ChatWidget({ brotherId, storageKey }: { brotherId: number; storageKey: string }) {
  const { currentUser, refreshChapterData, can } = useChapter();
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = unknown
  const [open, setOpen] = useState(false);
  const [scene, setScene] = useState<Scene>("briefing");
  const [pulse, setPulse] = useState(false); // first-run nudge on the launcher
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [selRow, setSelRow] = useState(-1); // keyboard-selected result row on the last answer
  // The open peek, if any — a tapped answer row's record. Layered OVER the
  // thread, which keeps its scroll position underneath.
  const [peek, setPeek] = useState<{ refr: EntityRef; seed: PeekSeed } | null>(null);
  // The open event-idea panel, if any — a tapped programming suggestion, opened
  // into an explanation plus a prefilled proposal. Rides over the thread the
  // same way the peek does, and is mutually exclusive with it.
  const [idea, setIdea] = useState<EventIdeaSeed | null>(null);
  // The open citation, if any — the passage of an attached file a chip points at.
  // Rides over the thread like the peek and the idea panel, exclusive with both.
  const [excerpt, setExcerpt] = useState<AnswerCitation | null>(null);
  // What the composer may attach; null while attachments are off for the deployment.
  const [fileLimits, setFileLimits] = useState<FileLimits | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Mirror of `messages` for synchronous reads in sendMessage — building the
  // request body inside a setMessages updater isn't reliable under React 18
  // batching (could read stale/empty state and POST {messages: []} → 400).
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const threadRef = useRef<HTMLDivElement>(null);
  // Whether the thread is scrolled to its newest turn. New content only pulls
  // the thread down while it is — reading back up the history isn't yanked away
  // by a ledger step landing — and so does the keyboard shrinking the thread.
  const pinnedRef = useRef(true);
  const overlayRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Guards the persist effect until loadHistory has run — see below.
  const loadedRef = useRef(false);

  const actorName = currentUser?.name ?? "you";
  const att = useAttachments(storageKey, fileLimits);
  // Spoken words land in the composer as they're heard; sending stays manual.
  const dictation = useDictation(text => {
    setInput(text);
    requestAnimationFrame(() => { if (textareaRef.current) autosize(textareaRef.current); });
  });
  const cancelDictation = dictation.cancel;

  // The header mark's face: listening, thinking, answering, done… Recomputed
  // every render but it only changes at phase boundaries (useMarkState).
  const markTail = messages[messages.length - 1];
  const markState = useMarkState({
    streaming,
    dictating: dictation.listening,
    typed: input.trim().length > 0,
    turn: markTail?.role === "assistant" ? markTail : null,
  });

  // The option sets a card's category picker offers. Fetched on first open
  // rather than on mount: the widget rides every dashboard route, and a member
  // who never opens it should cost nothing.
  const choices = useProposalChoices(open);

  // Probe whether the chat is enabled (key configured). Hide the launcher if not.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/chat", { method: "GET" })
      .then(r => (r.ok ? r.json() : { enabled: false }))
      .then((d: { enabled?: boolean; files?: boolean; fileLimits?: FileLimits }) => {
        if (cancelled) return;
        setEnabled(d.enabled === true);
        if (d.files === true && d.fileLimits && typeof d.fileLimits.maxBytes === "number") setFileLimits(d.fileLimits);
      })
      .catch(() => { if (!cancelled) setEnabled(false); });
    return () => { cancelled = true; };
  }, []);

  // Load persisted history once on mount. Show the first-run pulse only when the
  // member has never opened the spotlight before (no seen-flag, no history).
  // Anyone else's thread left in this browser goes first: on a shared machine
  // the next person to sign in must not inherit the last one's answers.
  useEffect(() => {
    dropOtherPeoplesChats(brotherId);
    setMessages(loadHistory(storageKey));
    loadedRef.current = true;
    try {
      if (!localStorage.getItem(PULSE_SEEN_KEY) && !localStorage.getItem(storageKey)) setPulse(true);
    } catch { /* ignore */ }
  }, [brotherId, storageKey]);

  // Persist on every change — but never before the load above has run. Both
  // effects fire on mount, and this one used to win with `messages` still at its
  // initial [], overwriting the stored thread with an empty array before the
  // loaded one was committed. Every past turn was destroyed on every reload,
  // pending proposals included: a card left unapproved could not survive a
  // refresh, so the "approve it later" the pending state promises was a lie.
  useEffect(() => {
    if (!loadedRef.current) return;
    saveHistory(storageKey, messages);
  }, [storageKey, messages]);

  // Follow the newest turn while it's pinned, but never past its top. The
  // thread grows into view until the answer's headline reaches the top edge,
  // then holds there: a long answer's rows extend below the fold instead of
  // pushing the verdict out the top (the old pin-to-bottom dropped readers at
  // the end of the rows, past the line that answered them). Scrolls the thread
  // itself: scrollIntoView would also scroll its ancestors, which on a phone
  // is the page behind the sheet.
  const [below, setBelow] = useState<null | "more" | "latest">(null);
  // Until when scroll events are our own smooth scroll, not the reader's.
  const autoScrollUntil = useRef(0);
  const followTarget = useCallback((el: HTMLElement) => {
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const turns = el.querySelectorAll<HTMLElement>(":scope > .msg.ai");
    const last = turns[turns.length - 1];
    if (!last) return { target: max, top: Infinity };
    const top = last.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    return { target: Math.max(0, Math.min(max, top - ANCHOR_GAP)), top };
  }, []);
  // Whether anything waits below the fold, and whose it is: the rest of the
  // answer being read, or newer turns while reading back through history.
  const measureBelow = useCallback((el: HTMLElement, top: number) => {
    const rest = el.scrollHeight - el.clientHeight - el.scrollTop;
    setBelow(rest < 40 ? null : top < el.scrollTop + el.clientHeight ? "more" : "latest");
  }, []);
  const pinThread = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const { target, top } = followTarget(el);
    if (pinnedRef.current && Math.abs(el.scrollTop - target) > 1) {
      // A big step — the answer landing all at once — glides; streamed growth
      // and the keyboard opening track instantly.
      const glide = target - el.scrollTop > 120 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (glide) {
        autoScrollUntil.current = performance.now() + 700;
        el.scrollTo({ top: target, behavior: "smooth" });
      } else {
        el.scrollTop = target;
      }
    }
    measureBelow(el, top);
  }, [followTarget, measureBelow]);
  useEffect(pinThread, [messages, streaming, scene, pinThread]);
  useEffect(() => {
    const el = threadRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(pinThread);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scene, open, pinThread]);
  const onThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const { target, top } = followTarget(el);
    // Still pinned while the reader sits at the follow point; scrolling away
    // from it — up into history, or down through the rows — lets go.
    if (performance.now() > autoScrollUntil.current) pinnedRef.current = Math.abs(el.scrollTop - target) < 48;
    measureBelow(el, top);
  }, [followTarget, measureBelow]);
  // "More below" reads on to the end of the answer; "Latest answer" returns
  // from history to the newest turn's top and follows it again.
  const jumpBelow = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const toEnd = below === "more";
    pinnedRef.current = !toEnd;
    autoScrollUntil.current = performance.now() + 700;
    el.scrollTo({
      top: toEnd ? el.scrollHeight : followTarget(el).target,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [below, followTarget]);

  const openSpotlight = useCallback(() => {
    pinnedRef.current = true;
    setOpen(true);
    setScene(messagesRef.current.length > 0 ? "thread" : "briefing");
  }, []);

  const closeSpotlight = useCallback(() => {
    setOpen(false);
    cancelDictation();
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
  }, [cancelDictation]);

  const { phone, keyboard } = usePhoneSheet(open, overlayRef);

  // Whether the org has any chapter meeting (null until known), for the desktop
  // welcome's third question. Re-read each time the welcome shows: one row, and
  // a meeting approved in chat or added on the Meetings page flips it.
  // The last answer is remembered per org in this browser, so only the very
  // first open waits on the read; after that the row is right at once and the
  // read just confirms it.
  const [hasMeetings, setHasMeetings] = useState<boolean | null>(null);
  const orgSlug = currentUser?.org?.slug;
  useEffect(() => {
    if (!open || phone || scene !== "briefing" || !orgSlug) return;
    const key = `chaptos_has_meetings_v1:${orgSlug}`;
    // This org's last answer, or unknown — never another org's.
    let seen: string | null = null;
    try { seen = localStorage.getItem(key); } catch { /* storage off: just wait for the read */ }
    setHasMeetings(seen === null ? null : seen === "1");
    let cancelled = false;
    orgFetch("/api/calendar?category=chapter&take=1")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((rows: unknown) => {
        if (cancelled) return;
        const has = Array.isArray(rows) && rows.length > 0;
        setHasMeetings(has);
        try { localStorage.setItem(key, has ? "1" : "0"); } catch { /* ignore */ }
      })
      // Unknown: keep what we knew, else fall back to the established question.
      .catch(() => { if (!cancelled) setHasMeetings(prev => prev ?? true); });
    return () => { cancelled = true; };
  }, [open, phone, scene, orgSlug]);
  const canEvents = can("MANAGE_EVENTS");
  // The third row waits for the answer rather than flipping under the reader.
  const deskStarters = hasMeetings === null
    ? DESK_STARTERS
    : [...DESK_STARTERS, hasMeetings || !canEvents ? LAST_MEETING_STARTER : FIRST_MEETING_STARTER];
  const dragHandlers = useSheetDrag(spotRef, closeSpotlight, phone);

  const openCite = useCallback((c: AnswerCitation) => {
    setPeek(null);
    setIdea(null);
    setExcerpt(c);
  }, []);

  const openPeek = useCallback((row: AnswerRow) => {
    if (!row.ref) return;
    setExcerpt(null);
    setPeek({
      refr: row.ref,
      // The row's own text carries the sheet until the fetch lands.
      seed: { title: row.title, subtitle: row.subtitle, kind: row.kind, ask: row.ask, ...(row.event ? { date: row.event.date } : {}) },
    });
  }, []);

  // A suggested event opens the idea panel instead of navigating: the row IS
  // the idea, and the Events screen is where it would otherwise be forgotten.
  // The question that produced the answer rides along so the explanation can be
  // about this chapter's problem rather than the event in the abstract.
  const openIdea = useCallback((row: AnswerRow) => {
    const all = messagesRef.current;
    let question = "";
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].role === "user" && all[i].content.trim()) { question = all[i].content.trim(); break; }
    }
    setPeek(null);
    setIdea({ title: row.title, subtitle: row.subtitle, ...(question ? { question } : {}) });
  }, []);

  // Advisory rows leave for a screen. The path arrives relative to the org (the
  // server resolved it from a closed enum, so it's never model-authored text)
  // and the slug is prefixed here, where the active org is already known — the
  // answer payload stays tenant-free. Closing first means returning by Back
  // lands on the page, not on a stale open spotlight.
  const navRow = useCallback((row: AnswerRow) => {
    const slug = currentUser?.org?.slug;
    if (!row.screen || !slug) return;
    closeSpotlight();
    router.push(orgHref(slug, row.screen.path));
  }, [currentUser?.org?.slug, closeSpotlight, router]);

  /**
   * A confirmed idea became a real event. Close the spotlight and land on the
   * screen the event now lives on, so the officer sees the thing they just
   * created rather than being returned to the chat that described it.
   *
   * That screen is /events. The feature brief calls this "the Timeline", but in
   * this app Timeline is /tasks (deadlines) — a CalendarEvent renders on the
   * Events page (SCREEN_PATHS.events), so that is where a newly booked event is
   * actually visible.
   */
  const onIdeaCreated = useCallback((_eventId: number | null, _payload: Record<string, unknown>) => {
    const slug = currentUser?.org?.slug;
    setIdea(null);
    closeSpotlight();
    if (slug) router.push(orgHref(slug, "/events"));
  }, [currentUser?.org?.slug, closeSpotlight, router]);

  // ⌘K / Ctrl-K toggles; Esc closes. This is the app's one global Cmd+K owner.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      // Esc unwinds one layer at a time — an open panel before the spotlight.
      // A row being edited on a proposal card is the innermost layer of all and
      // cancels itself on Escape. React has already reverted that row and
      // unmounted the editor by the time a bubble-phase listener runs, so this
      // check only sees the editor because we listen during capture — otherwise
      // backing out of one field would close the spotlight on every card.
      if (e.key === "Escape" && (document.activeElement as HTMLElement | null)?.closest(".wv.editing")) return;
      if (e.key === "Escape" && open && excerpt) { setExcerpt(null); return; }
      if (e.key === "Escape" && open && idea) { setIdea(null); return; }
      if (e.key === "Escape" && open && peek) { setPeek(null); return; }
      if (e.key === "Escape" && open) { closeSpotlight(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) closeSpotlight(); else openSpotlight();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, peek, idea, excerpt, openSpotlight, closeSpotlight]);

  // Pages open the spotlight with a question staged in the composer — staged,
  // not sent, so the asker can still edit it. Fired as window "chapt:ask" with
  // detail { q } (the roster's "Ask who's slipping").
  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent<{ q?: string }>).detail?.q;
      openSpotlight();
      if (q) setInput(q);
    };
    window.addEventListener("chapt:ask", onAsk);
    return () => window.removeEventListener("chapt:ask", onAsk);
  }, [openSpotlight]);

  // On open: dismiss the pulse for good; focus the composer. Not on a phone:
  // focusing there raises the keyboard over the landing before anyone asked
  // to type, and buries the starters it exists to show.
  useEffect(() => {
    if (!open) return;
    if (pulse) { setPulse(false); try { localStorage.setItem(PULSE_SEEN_KEY, "1"); } catch { /* ignore */ } }
    if (phone) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open, pulse, scene, phone]);

  // ── The ask flow ───────────────────────────────────────────────────────────

  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => ChatMessage)) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== id) return m;
      return typeof patch === "function" ? patch(m) : { ...m, ...patch };
    }));
  }, []);

  // ── Ledger staging ─────────────────────────────────────────────────────────
  // Tool calls arrive in bursts — several names land in one delta chunk, and
  // parallel tools finish within milliseconds of each other. Applied raw, a
  // batch pops onto screen in a single frame instead of posting like a ledger.
  // So ledger mutations queue and apply a beat apart, spending ONLY the slack
  // we're already waiting through.
  //
  // The queue can never delay an answer, because every terminal event flushes it
  // first. `flushStage` is deliberately synchronous — DO NOT put an `await`
  // between a flush and the patch that follows it, or the answer waits on the
  // animation instead of the other way round. Flushed mutations and the terminal
  // patch land in one React commit, so there is no extra frame either.
  const stageRef = useRef<{ q: Array<() => void>; timer: ReturnType<typeof setTimeout> | null }>({ q: [], timer: null });
  const reducedRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const sync = () => { reducedRef.current = mq.matches; };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const flushStage = useCallback(() => {
    const s = stageRef.current;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    while (s.q.length) s.q.shift()!();
  }, []);

  const enqueueStage = useCallback((mutation: () => void) => {
    const s = stageRef.current;
    if (reducedRef.current) { mutation(); return; }
    s.q.push(mutation);
    const pump = () => {
      s.timer = null;
      const next = s.q.shift();
      if (!next) return;
      next();
      if (s.q.length === 0) return;
      // Tighten as the queue deepens so a three-tool batch still cascades
      // instead of collapsing, while total staged delay stays bounded.
      const gap = s.q.length > 6 ? 0 : s.q.length > 3 ? 45 : 90;
      s.timer = setTimeout(pump, gap);
    };
    if (!s.timer) s.timer = setTimeout(pump, 0);
  }, []);

  // A queued mutation that outlives its turn would patch the wrong message.
  useEffect(() => () => {
    const s = stageRef.current;
    if (s.timer) clearTimeout(s.timer);
    s.q.length = 0;
  }, []);

  const sendMessage = useCallback(async (text: string, opts?: { stayOnWelcome?: boolean }) => {
    const trimmed = text.trim();
    // A file still uploading or being read isn't attached yet — wait for it.
    if (!trimmed || streaming || att.busy) return;

    // The question is going as it stands — a word still in the air mustn't
    // refill the composer after it clears.
    cancelDictation();

    // A new turn supersedes whatever record was open.
    setPeek(null);
    setExcerpt(null);
    // Any mutation still queued belongs to the turn we're replacing.
    flushStage();
    stageRef.current.q.length = 0;

    // Every ready file goes with every question (the server keeps no thread);
    // the bubble names only the ones this message is the first to carry.
    const files = att.takeForSend();
    const userMsg: ChatMessage = { id: newId(), role: "user", content: trimmed, ...(files.newNames.length ? { attachments: files.newNames } : {}) };
    // Seed the ledger with what the question is plainly about, so the wait while
    // the model decides isn't a blank panel. These rows are pending-only guesses
    // (see chat/intent.ts) — the real steps replace or evict them.
    const assistantMsg: ChatMessage = {
      id: newId(),
      role: "assistant",
      content: "",
      steps: planFor(trimmed),
      intent: intentFor(trimmed),
      startedAt: Date.now(),
    };
    const payloadHistory = [...messagesRef.current, userMsg]
      .map(m => ({ role: m.role, content: messageText(m) }))
      .filter(m => m.content.trim().length > 0)
      .slice(-12);
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    // Asking always lands you on the answer, wherever you'd scrolled to.
    pinnedRef.current = true;
    // Leaving the desktop welcome, the scene switches a beat later (askFromWelcome)
    // so the headline can fade first; the request above has already gone.
    if (!opts?.stayOnWelcome) setScene("thread");
    setInput("");
    setSelRow(-1);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const aid = assistantMsg.id;

    try {
      const res = await orgFetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadHistory, ...(files.ids.length ? { attachmentIds: files.ids } : {}) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const errText = res.status === 429 ? "Slow down — too many messages." : `Sorry, the chat failed (HTTP ${res.status}).`;
        patchMessage(aid, { content: errText });
        setStreaming(false);
        return;
      }

      for await (const { event, data } of iterSSE(res.body)) {
        let parsed: unknown;
        try { parsed = JSON.parse(data); } catch { continue; }

        // Ledger events stage; everything terminal flushes first (see enqueueStage).
        if (event === "step") {
          const s = parsed as { id?: string; verb?: string; source?: string };
          if (s.id && s.verb) {
            // Named, not yet running — a pending node on the margin.
            const step: LedgerStep = { id: s.id, verb: s.verb, ...(s.source ? { source: s.source } : {}), status: "pending" };
            enqueueStage(() => patchMessage(aid, m => ({
              ...m,
              steps: reconcileStep(m.steps ?? [], step),
              composing: false,
            })));
          }
        } else if (event === "step_start") {
          const s = parsed as { id?: string };
          if (s.id) {
            enqueueStage(() => patchMessage(aid, m => ({
              ...m,
              // The batch is known now, so any guess it didn't corroborate goes.
              steps: dropProvisional(m.steps ?? []).map(st =>
                st.id === s.id ? { ...st, status: "active" as const } : st,
              ),
            })));
          }
        } else if (event === "step_done") {
          const s = parsed as { id?: string; finding?: string };
          if (s.id) {
            enqueueStage(() => patchMessage(aid, m => ({
              ...m,
              steps: (m.steps ?? []).map(st => st.id === s.id
                ? { ...st, status: "done" as const, ...(s.finding ? { finding: s.finding } : {}) }
                : st),
            })));
          }
        } else if (event === "step_drop") {
          const s = parsed as { ids?: string[] };
          const ids = new Set(Array.isArray(s.ids) ? s.ids : []);
          if (ids.size > 0) {
            enqueueStage(() => patchMessage(aid, m => ({
              ...m,
              steps: (m.steps ?? []).filter(st => !ids.has(st.id)),
            })));
          }
        } else if (event === "composing") {
          // The model is writing, so anything we guessed it would read is
          // settled as wrong — drop it now rather than let it sit there pending
          // until the answer lands.
          enqueueStage(() => patchMessage(aid, m => ({
            ...m,
            steps: dropProvisional(m.steps ?? []),
            composing: true,
          })));
        } else if (event === "verdict_draft") {
          // The headline, ahead of the rows. Provisional until `answer`.
          flushStage();
          const v = (parsed as { verdict?: unknown }).verdict;
          if (typeof v === "string" && v.trim()) patchMessage(aid, m => ({ ...m, draft: v }));
        } else if (event === "verdict_drop") {
          patchMessage(aid, m => (m.draft === undefined ? m : { ...m, draft: undefined }));
        } else if (event === "answer") {
          flushStage();
          const a = parsed as Partial<AnswerData>;
          if (typeof a.verdict === "string") {
            const verdictCites = parseCitations(a.citations);
            const answer: AnswerData = {
              verdict: a.verdict,
              rows: Array.isArray(a.rows)
                ? a.rows.map(r => {
                    const citations = parseCitations(r?.citations);
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { citations: _raw, ...rest } = r;
                    return citations ? { ...rest, citations } : rest;
                  })
                : [],
              ...(verdictCites ? { citations: verdictCites } : {}),
              follows: Array.isArray(a.follows) ? a.follows : [],
              sources: Array.isArray(a.sources) ? a.sources : [],
              ...(a.askback && Array.isArray(a.askback.questions) && a.askback.questions.length > 0
                ? { askback: a.askback }
                : {}),
              ...(a.shape && typeof a.shape === "object" && typeof a.shape.type === "string"
                ? { shape: a.shape }
                : {}),
            };
            patchMessage(aid, m => stampElapsed({ ...m, answer, steps: settleLedger(m.steps) }));
          }
        } else if (event === "text") {
          flushStage();
          const delta = (parsed as { delta?: string }).delta ?? "";
          // After a notice, the text is that status written for older clients —
          // the slip already says it.
          patchMessage(aid, m => (m.notice ? m : stampElapsed({ ...m, content: m.content + delta, draft: m.answer ? m.draft : undefined, steps: settleLedger(m.steps) })));
        } else if (event === "notice") {
          flushStage();
          const kind = (parsed as { kind?: string }).kind;
          if (kind === "timeout" || kind === "error" || kind === "cut_short") {
            patchMessage(aid, m => ({ ...m, notice: { kind }, draft: m.answer ? m.draft : undefined, steps: settleLedger(m.steps), composing: false }));
          }
        } else if (event === "note_refs") {
          flushStage();
          const refs = (parsed as { refs?: unknown }).refs;
          if (Array.isArray(refs)) {
            const ok = refs.filter((r): r is { text: string; ref: { type: RefType; id: number } } =>
              typeof r?.text === "string" && typeof r?.ref?.id === "number" && typeof r?.ref?.type === "string");
            if (ok.length) patchMessage(aid, m => ({ ...m, noteRefs: ok }));
          }
        } else if (event === "proposal") {
          flushStage();
          const p = parsed as Omit<ProposalCard, "id" | "state"> & Record<string, unknown>;
          if (p.action && p.endpoint && p.method && p.payload && p.display && p.perm) {
            const card: ProposalCard = {
              id: newId(),
              action: String(p.action),
              endpoint: String(p.endpoint),
              method: p.method as "POST" | "PATCH",
              payload: p.payload as Record<string, unknown>,
              summary: String(p.summary ?? ""),
              display: p.display as ProposalCard["display"],
              perm: p.perm as ProposalCard["perm"],
              sig: typeof p.sig === "string" ? p.sig : null,
              iat: typeof p.iat === "number" ? p.iat : Date.now(),
              state: "pending",
            };
            patchMessage(aid, m => stampElapsed({ ...m, proposals: [...(m.proposals ?? []), card] }));
          }
        } else if (event === "done") {
          flushStage();
          patchMessage(aid, m => stampElapsed({ ...m, draft: m.answer ? m.draft : undefined, steps: settleLedger(m.steps), composing: false }));
          break;
        }
      }
    } catch (e) {
      flushStage();
      if ((e as { name?: string })?.name === "AbortError") {
        // Stopped by the user — keep whatever arrived, mark the turn stopped,
        // and remember how far it got before the ledger settles.
        patchMessage(aid, m => stampElapsed({
          ...m,
          stopped: true,
          stoppedAfter: (m.steps ?? []).filter(s => !s.provisional && s.status === "done").length,
          steps: settleHalted(m.steps),
          composing: false,
          draft: m.answer ? m.draft : undefined,
        }));
      } else {
        console.error("chat stream failed:", e);
        // Where it broke: the source the active step was reading, if any.
        patchMessage(aid, m => {
          const at = (m.steps ?? []).find(s => !s.provisional && s.status === "active")?.source;
          return stampElapsed({ ...m, error: at ? { at } : {}, steps: settleHalted(m.steps), composing: false, draft: m.answer ? m.draft : undefined });
        });
      }
    } finally {
      flushStage();
      setStreaming(false);
      abortRef.current = null;
    }
  }, [streaming, patchMessage, enqueueStage, flushStage, att.busy, att.takeForSend, cancelDictation]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── Welcome → first message (desktop) ──────────────────────────────────────
  // The request goes first, always: sendMessage runs before any animation, and
  // the stream fills `messages` while the welcome fades. What the flight needs
  // from the welcome (the composer's rect, where the words were) is captured
  // here, before the switch, and played as a FLIP once the thread mounts.
  const flightRef = useRef<{ comp: DOMRect; x: number; y: number } | null>(null);
  const flightAnimsRef = useRef<Animation[]>([]);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current); }, []);

  /** Ask from the desktop welcome. `origin` is the tapped question row, if any. */
  function askFromWelcome(text: string, origin?: HTMLElement) {
    const spot = spotRef.current;
    const comp = spot?.querySelector<HTMLElement>(".brief .composer");
    const field = textareaRef.current;
    const canFly = !phone && !reducedRef.current && scene === "briefing" && !!spot && !!comp && !!field
      && typeof (comp as HTMLElement).animate === "function";
    if (!canFly || !text.trim() || streaming || att.busy) { void sendMessage(text); return; }

    const cr = comp.getBoundingClientRect();
    const or = origin?.getBoundingClientRect();
    flightRef.current = {
      comp: cr,
      // The question's own words: past a row's tile, or where the field's text starts.
      x: or ? or.left + 51 : field.getBoundingClientRect().left,
      y: or ? or.top + or.height / 2 : cr.top + cr.height / 2,
    };
    void sendMessage(text, { stayOnWelcome: true });
    spot.querySelectorAll<HTMLElement>(".brief h2, .brief .try").forEach((el, i) => el.animate(
      [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-8px)" }],
      { duration: 170, delay: i * 18, easing: "ease-in", fill: "forwards" },
    ));
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      leaveTimerRef.current = null;
      // New (or a close) in the meantime leaves no thread to land on.
      if (messagesRef.current.length === 0 || !spotRef.current) { flightRef.current = null; return; }
      setScene(s => (s === "briefing" ? "thread" : s));
    }, 150);
  }

  // The thread's first frame: fly the composer down into the dock, the words up
  // into their card, and fade the turn in behind them.
  useLayoutEffect(() => {
    const from = flightRef.current;
    if (scene !== "thread" || !from) return;
    flightRef.current = null;
    const spot = spotRef.current;
    if (!spot) return;
    const anims: Animation[] = [];
    const comp = spot.querySelector<HTMLElement>(".cs-dock .composer");
    if (comp) {
      const cr = comp.getBoundingClientRect();
      anims.push(comp.animate([
        { transform: `translate(${from.comp.left - cr.left}px, ${from.comp.top - cr.top}px)`, width: `${from.comp.width}px` },
        { transform: "none", width: `${cr.width}px` },
      ], { duration: 560, easing: FLIGHT_EASE }));
    }
    const users = spot.querySelectorAll<HTMLElement>(".cs-thread .msg.user");
    const note = users[users.length - 1];
    if (note) {
      note.style.animation = "none";
      const nr = note.getBoundingClientRect();
      const cs = getComputedStyle(note);
      const dx = from.x - (nr.left + parseFloat(cs.paddingLeft));
      const dy = from.y - (nr.top + nr.height / 2);
      // Bare words at first; the card inks in from 45% of the way.
      const bare = { borderColor: "transparent", backgroundColor: "transparent", boxShadow: "0 0 0 transparent" };
      anims.push(note.animate([
        { transform: `translate(${dx}px, ${dy}px)`, ...bare },
        { ...bare, offset: 0.45 },
        { transform: "none", borderColor: cs.borderColor, backgroundColor: cs.backgroundColor, boxShadow: cs.boxShadow },
      ], { duration: 620, easing: FLIGHT_EASE }));
    }
    const turns = spot.querySelectorAll<HTMLElement>(".cs-thread .msg.ai");
    const turn = turns[turns.length - 1];
    if (turn) {
      turn.style.animation = "none";
      anims.push(turn.animate(
        [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
        { duration: 360, delay: 300, easing: "ease-out", fill: "backwards" },
      ));
    }
    flightAnimsRef.current = anims;
    Promise.all(anims.map(a => a.finished)).catch(() => {}).finally(() => {
      if (flightAnimsRef.current === anims) flightAnimsRef.current = [];
    });
  }, [scene]);

  // A fast answer (the fast path can land in well under 600ms) never waits on
  // the flight: whatever is still moving hurries to its place.
  useEffect(() => {
    const anims = flightAnimsRef.current;
    if (!anims.length) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && (last.answer || last.content || last.proposals?.length)) {
      for (const a of anims) if (a.playState === "running") a.updatePlaybackRate(3);
    }
  }, [messages]);

  // ── Proposal approve / discard ─────────────────────────────────────────────

  function updateProposal(msgId: string, cardId: string, patch: Partial<ProposalCard>) {
    patchMessage(msgId, m => ({
      ...m,
      proposals: (m.proposals ?? []).map(p => (p.id === cardId ? { ...p, ...patch } : p)),
    }));
  }

  async function approveProposal(msgId: string, card: ProposalCard) {
    if (!card.perm.canApprove) return;
    updateProposal(msgId, card.id, { state: "confirming" });
    try {
      const res = await orgFetch(card.endpoint, {
        method: card.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card.payload),
      });
      if (res.ok) {
        const stamp = `${timeStamp()} · ${actorName}`;
        updateProposal(msgId, card.id, { state: "approved", resultMessage: approvedText(card), stamp });
        // The write landed server-side; pull it into the page behind the widget
        // (a recorded dues payment moves the roster, dashboard and Dues tab).
        void refreshChapterData().catch(() => undefined);
        void refreshDuesStandings();
        // Record the approval (fire-and-forget — the domain write already
        // happened; a missing audit row must not un-settle the card). The
        // server verifies the signed blob before writing anything.
        let subjectId: number | null = null;
        try {
          const body = await res.clone().json() as { id?: unknown };
          if (typeof body?.id === "number") subjectId = body.id;
        } catch { /* endpoint returned no JSON id — record without a link */ }
        // An edited card can't echo its signature — the blob was signed over
        // the model's values, not the user's, so it would either misstate the
        // record or fail verification. It names the row the POST just created
        // instead, and the server rebuilds the audit line by reading that row
        // back org-scoped. Without an id there is nothing to read, so an edited
        // card whose endpoint returned no id records nothing rather than
        // recording the pre-edit draft as if it were what happened.
        // Self-service (perm.name null) spent no officer authority, so there
        // is no approval to record — the domain event is the whole trail.
        if (card.perm.name === null) {
          /* nothing to record */
        } else if (card.edited) {
          if (subjectId !== null) {
            void orgFetch("/api/ai/approvals", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source: "edited", action: card.action, subjectId }),
            }).catch(() => { /* audit record is best-effort */ });
          }
        } else if (card.sig) {
          void orgFetch("/api/ai/approvals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: card.action,
              endpoint: card.endpoint,
              method: card.method,
              payload: card.payload,
              display: card.display,
              iat: card.iat,
              sig: card.sig,
              ...(subjectId !== null ? { subjectId } : {}),
            }),
          }).catch(() => { /* audit record is best-effort */ });
        }
      } else {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        const msg = res.status === 403
          ? "Your account can't approve this."
          : (errBody.error ?? `Failed (HTTP ${res.status}).`);
        updateProposal(msgId, card.id, { state: "error", resultMessage: msg, stamp: timeStamp() });
      }
    } catch (e) {
      updateProposal(msgId, card.id, { state: "error", resultMessage: e instanceof Error ? e.message : "Network error.", stamp: timeStamp() });
    }
  }

  /**
   * Commit an inline correction to a pending card. The payload and the rows move
   * together — the card the user reads after saving is the one that will post —
   * and `edited` is set, which is what tells approveProposal that the signature
   * no longer describes this card.
   */
  function editProposal(msgId: string, card: ProposalCard, payload: Record<string, unknown>, rows: ProposalCard["display"]["rows"]) {
    updateProposal(msgId, card.id, {
      payload,
      display: { ...card.display, rows },
      edited: true,
    });
  }

  function discardProposal(msgId: string, card: ProposalCard) {
    const blocked = !card.perm.canApprove;
    updateProposal(msgId, card.id, {
      state: blocked ? "dismissed" : "discarded",
      resultMessage: blocked ? "Dismissed — you can't approve this." : "Discarded — no changes made.",
      stamp: `${timeStamp()} · ${actorName}`,
    });
  }

  // ── Feedback ───────────────────────────────────────────────────────────────

  function giveFeedback(msg: ChatMessage, value: "up" | "down") {
    patchMessage(msg.id, { feedback: value });
    const idx = messagesRef.current.findIndex(m => m.id === msg.id);
    const question = idx > 0 ? messagesRef.current[idx - 1]?.content ?? "" : "";
    void orgFetch("/api/ai/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        helpful: value === "up",
        question: question.slice(0, 300),
        answerKind: msg.answer ? "structured" : "text",
      }),
    }).catch(() => { /* telemetry is best-effort */ });
  }

  // ── Keyboard: ↑↓ row selection, ⏎ approve / ⌫ discard the visible writ ─────

  const lastAnswer = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && m.answer) return m;
    }
    return null;
  }, [messages]);

  const pendingWrit = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      const card = m.proposals?.find(p => p.state === "pending");
      if (card) return { msgId: m.id, card };
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      // Any focused field owns the keyboard, not just the composer. A writ card
      // in edit mode puts real inputs in the thread, and Backspace there must
      // delete a character rather than discard the card being corrected.
      const active = document.activeElement;
      const typing = active instanceof HTMLTextAreaElement
        || active instanceof HTMLInputElement
        || (active instanceof HTMLElement && active.isContentEditable);
      if (typing || scene !== "thread") return;
      const rows = lastAnswer?.answer?.rows ?? [];
      // Row navigation belongs to the thread; an open panel owns the keyboard.
      // The idea panel especially — it is a form, so Enter and the arrows must
      // reach its inputs rather than moving the selection in the thread behind.
      if (peek || idea || excerpt) return;
      if (e.key === "ArrowDown" && rows.length > 0) {
        e.preventDefault();
        setSelRow(i => stepRow(rows, i, 1));
      } else if (e.key === "ArrowUp" && rows.length > 0) {
        e.preventDefault();
        setSelRow(i => stepRow(rows, i, -1));
      } else if (e.key === "Enter" && selRow >= 0 && rowAction(rows[selRow])) {
        // Dispatch through rowAction so Enter and the click handler can't drift
        // apart — the row's affordance already promised one of these three.
        e.preventDefault();
        const act = rowAction(rows[selRow]);
        if (act === "peek") openPeek(rows[selRow]);
        else if (act === "idea") openIdea(rows[selRow]);
        else if (act === "nav") navRow(rows[selRow]);
        else if (act === "ask") void sendMessage(rows[selRow].ask!);
      } else if (e.key === "Enter" && pendingWrit && pendingWrit.card.perm.canApprove) {
        e.preventDefault();
        void approveProposal(pendingWrit.msgId, pendingWrit.card);
      } else if (e.key === "Backspace" && pendingWrit) {
        e.preventDefault();
        discardProposal(pendingWrit.msgId, pendingWrit.card);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scene, peek, idea, excerpt, lastAnswer, pendingWrit, selRow, sendMessage, openPeek, navRow, openIdea]);

  // ── Composer plumbing ──────────────────────────────────────────────────────

  // Asking from the desktop welcome flies the question into the thread.
  function ask(text: string) {
    if (scene === "briefing" && !phone) askFromWelcome(text);
    else void sendMessage(text);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (streaming) stopStreaming();
    else ask(input);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!streaming) ask(input);
    }
  }

  // ── Attachments: paperclip, drop onto the spotlight, paste ────────────────
  function attachFiles(list: FileList | File[] | null | undefined) {
    const files = list ? Array.from(list) : [];
    if (files.length && att.enabled) att.add(files);
  }

  function handlePaste(e: ReactClipboardEvent<HTMLTextAreaElement>) {
    if (!att.enabled || e.clipboardData.files.length === 0) return;
    e.preventDefault();
    attachFiles(e.clipboardData.files);
  }

  const dropProps = att.enabled ? {
    onDragOver: (e: ReactDragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      if (!dragging) setDragging(true);
    },
    onDragLeave: (e: ReactDragEvent) => {
      if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: ReactDragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      setDragging(false);
      attachFiles(e.dataTransfer.files);
    },
  } : {};

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function handleNew() {
    if (streaming) stopStreaming();
    // A flight still waiting to land has nothing to land on now.
    if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
    flightRef.current = null;
    // Starting a new thread is the one legitimate way to an empty one, so it
    // clears the key itself — saveHistory deliberately won't write [] over a
    // stored thread (see there for why an empty save is always a mount artifact).
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setMessages([]);
    setInput("");
    setSelRow(-1);
    setPeek(null);
    setIdea(null);
    setExcerpt(null);
    // A new conversation starts with no files; the old thread's are deleted.
    att.clear();
    setScene("briefing");
    textareaRef.current?.focus();
  }

  const isMac = useMemo(() => typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform), []);
  const shortcut = isMac ? "⌘K" : "Ctrl K";

  // Hide entirely when AI isn't enabled (no API key configured), and while the
  // enabled probe is in flight (avoids a flash of the launcher).
  if (enabled !== true) return null;

  const lastMsg = messages[messages.length - 1];

  // The one composer: in the dock, or on the desktop welcome under the headline.
  // Only one renders at a time, so textareaRef always points at the live field.
  const composer = (
    <>
      {att.enabled && <AttachmentTray chips={att.chips} onRemove={att.remove} />}
      {dictation.error && <p className="mic-note" role="status">{dictation.error}</p>}
      <form className="composer" onSubmit={handleSubmit}>
        {att.enabled && fileLimits && (
          <>
            <button
              type="button"
              className="clip"
              aria-label="Attach a file"
              title="Attach a PDF, Word, Excel, CSV or text file"
              onClick={() => fileInputRef.current?.click()}
            >
              <IcClip />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept={fileLimits.extensions.join(",")}
              onChange={e => { attachFiles(e.target.files); e.target.value = ""; }}
            />
          </>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          rows={1}
          enterKeyHint="send"
          placeholder={scene === "approvals" ? "Ask about an approval…" : scene === "briefing" ? (phone ? "Ask the chapter anything…" : "Ask about your chapter…") : "Ask a follow-up…"}
          onChange={e => {
            // Typing takes the composer back — the next heard word would overwrite it.
            if (dictation.listening) dictation.cancel();
            setInput(e.target.value);
            autosize(e.target);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
        {dictation.supported && (
          <button
            type="button"
            className={`mic${dictation.listening ? " is-listening" : ""}`}
            aria-pressed={dictation.listening}
            aria-label={dictation.listening ? "Stop dictating" : "Dictate your question"}
            title={dictation.listening ? "Stop dictating" : "Dictate"}
            disabled={streaming}
            onClick={() => {
              if (dictation.listening) dictation.stop();
              else dictation.start(input);
              // Back to the field, so Enter sends rather than toggling the mic.
              textareaRef.current?.focus();
            }}
          >
            <IcMic />
          </button>
        )}
        <button
          type="submit"
          className={`send${streaming ? " stop" : ""}`}
          disabled={!streaming && (!input.trim() || att.busy)}
          aria-label={streaming ? "Stop" : att.busy ? "Waiting for the file" : "Ask"}
        >
          {streaming ? <IcStop /> : <IcSend />}
        </button>
      </form>
    </>
  );

  return (
    <div className="chat-root" data-scene={open ? scene : "closed"} data-kb={keyboard ? "" : undefined}>
      {/* Launcher — visible only when the spotlight is closed */}
      {!open && (
        <button onClick={openSpotlight} aria-label="Ask Chapt" className={`chat-launcher${pulse ? " pulse" : ""}`}>
          <ChaptMark state="idle" size={24} />
          <span>Ask Chapt</span>
          <kbd className="hint">{shortcut}</kbd>
        </button>
      )}

      {open && (
        <div ref={overlayRef} className="cs-overlay" onClick={e => { if (e.target === e.currentTarget) closeSpotlight(); }}>
          <div ref={spotRef} className={`cs-spot${dragging ? " is-dropping" : ""}`} role="dialog" aria-label="Ask Chapt" {...dropProps}>
            {/* Header bar — on a phone, also the handle you pull the sheet down by */}
            <div className="cs-bar" {...dragHandlers}>
              {/* Phone only (chat-phone.css): the sheet fills the screen, so there's no scrim to tap. */}
              <button type="button" className="cs-close" aria-label="Close" onClick={closeSpotlight}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {/* The mark is a second status read beside the working line. On a
                  phone the tick stays and the mark sits beside it; a press on
                  the mark doesn't start a sheet drag (useSheetDrag). */}
              {phone && <span className="tick" aria-hidden />}
              <span className="cs-mark" aria-hidden><ChaptMark state={markState} size={phone ? 28 : 30} /></span>
              <span className="title">Ask Chapt</span>
              <span className="spacer" />
              <button
                type="button"
                className="apprchip"
                onClick={() => {
                  setPeek(null);
                  setIdea(null);
                  setScene(s => (s === "approvals" ? (messages.length ? "thread" : "briefing") : "approvals"));
                }}
              >
                Approvals
              </button>
              {scene !== "briefing" && (
                <button type="button" className="newq" onClick={handleNew}>{phone ? "← New" : <><IcPlus size={13} />New</>}</button>
              )}
              {!phone && (
                <button type="button" className="cs-x" aria-label="Close (Esc)" title="Close · Esc" onClick={closeSpotlight}>
                  <IcX size={11} />
                </button>
              )}
            </div>

            <div className="cs-body">
              {/* Briefing — on a phone, a landing page of its own */}
              {scene === "briefing" && phone && (
                <div className="cs-land">
                  <PhoneLanding
                    firstName={currentUser?.name?.trim().split(/\s+/)[0] || null}
                    orgName={currentUser?.org?.name ?? null}
                    timeZone={currentUser?.org?.timeZone ?? null}
                    starters={STARTERS}
                    onAsk={q => void sendMessage(q)}
                  />
                </div>
              )}

              {/* Briefing — one headline, the composer, three questions */}
              {scene === "briefing" && !phone && (
                <div className="cs-welcome">
                  <div className="brief">
                    <h2>Where should we <em>start</em>?</h2>
                    <div className="brief-dock">{composer}</div>
                    <div className="tries">
                      {deskStarters.map(s => (
                        <button
                          key={s.q}
                          type="button"
                          className="try"
                          style={{ "--t": s.tone } as CSSProperties}
                          onClick={e => askFromWelcome(s.q, e.currentTarget)}
                        >
                          <span className="tile">{s.icon}</span>
                          {s.q}
                          <IcArrow className="go" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Thread */}
              {scene === "thread" && (
                <div ref={threadRef} className="cs-thread" aria-live="polite" onScroll={onThreadScroll}>
                  {messages.map((m, mi) => {
                    if (m.role === "user") {
                      // Its reply is the live turn: mark what the guess keyed on.
                      const replyLive = streaming && messages[mi + 1] === lastMsg;
                      return (
                        <div key={m.id} className="msg user send-in">
                          {phone ? <MarkedQuestion text={m.content} live={replyLive} /> : m.content}
                          {m.attachments?.length ? (
                            <span className="msg-files">
                              <IcClip size={12} />{m.attachments.join(", ")}
                            </span>
                          ) : null}
                        </div>
                      );
                    }
                    const isLive = streaming && m === lastMsg;
                    // The question this turn answered — what Try again and Finish it re-send.
                    const asked = messages[mi - 1]?.role === "user" ? messages[mi - 1].content : undefined;
                    const drafted = m.proposals?.filter(p => p.state === "pending" && p.perm.canApprove).length ?? 0;
                    const answered = !!m.answer || !!m.content || (m.proposals?.length ?? 0) > 0;
                    return (
                      <div key={m.id} className="msg ai think-in">
                        <div className="who"><i />Ask Chapt</div>
                        {/* The working line stays put for the whole turn: its
                            status becomes the trace, its chips the record of
                            what was read, and the placeholder below holds the
                            verdict's space — nothing above the reader moves. */}
                        <WorkingLine
                          steps={m.steps ?? []}
                          intent={m.intent ?? "Searching the records…"}
                          composing={m.composing}
                          live={isLive}
                          startedAt={m.startedAt}
                          elapsedMs={m.elapsedMs}
                          stopped={m.stopped}
                          failed={!!m.error || !!m.notice}
                          answered={answered}
                        />
                        {/* The headline, streamed ahead of the rows: muted until
                            the answer confirms it, with the rows' placeholder under it. */}
                        {isLive && !answered && m.draft && <DraftVerdict text={m.draft} />}
                        {isLive && !answered && <AnswerSkeleton writing={!!m.composing} />}
                        <>
                          {m.answer && (
                            <AnswerBlock
                              answer={m.answer}
                              settleVerdict={m.draft !== undefined && m.draft === m.answer.verdict}
                              steps={m.steps ?? []}
                              selectedRow={m === lastAnswer ? selRow : -1}
                              feedback={m.feedback}
                              onAsk={q => void sendMessage(q)}
                              onPeek={openPeek}
                              onNav={navRow}
                              onIdea={openIdea}
                              onFeedback={v => giveFeedback(m, v)}
                              onCite={openCite}
                            />
                          )}
                          {!m.answer && m.content && (
                            <>
                              <MarkdownLite
                                text={m.content}
                                trailing={isLive ? <span className="cs-caret" aria-hidden /> : undefined}
                                refs={m.noteRefs}
                                onRef={r => openPeek({ kind: r.ref.type === "member" ? "person" : r.ref.type === "transaction" ? "money" : r.ref.type, title: r.text, ref: r.ref })}
                              />
                            </>
                          )}
                          {/* Status is a slip, never a line of prose that reads like the answer. */}
                          {!isLive && m.stopped && !m.answer && (
                            <Slip
                              tone="now"
                              dashed
                              icon={<IcStop size={12} />}
                              title={m.stoppedAfter
                                ? `You stopped it after ${m.stoppedAfter} ${m.stoppedAfter === 1 ? "check" : "checks"}.`
                                : "You stopped it."}
                              action={asked ? { label: "Finish it", icon: <IcArrow />, onClick: () => void sendMessage(asked) } : undefined}
                            >
                              {m.content ? "That's as far as it got. Nothing was changed." : "No answer yet. Nothing was changed."}
                            </Slip>
                          )}
                          {!isLive && m.notice && !m.answer && (
                            <Slip
                              tone={m.notice.kind === "cut_short" ? "now" : "watch"}
                              icon={<IcAlert size={14} />}
                              title={m.notice.kind === "timeout" ? "That took too long and timed out." : m.notice.kind === "error" ? "Something went wrong on my end." : "That answer was cut short."}
                              action={asked && m.notice.kind !== "cut_short" ? { label: "Try again", icon: <IcRedo />, onClick: () => void sendMessage(asked) } : undefined}
                            >
                              {m.notice.kind === "cut_short" ? "Ask about a narrower part to see the rest." : "Nothing was changed."}
                            </Slip>
                          )}
                          {!isLive && m.error && !m.answer && (
                            <Slip
                              tone="watch"
                              icon={<IcAlert size={14} />}
                              title={m.error.at ? `Lost the connection while reading ${m.error.at}.` : "Lost the connection."}
                              action={asked ? { label: "Try again", icon: <IcRedo />, onClick: () => void sendMessage(asked) } : undefined}
                            >
                              Nothing was changed.
                            </Slip>
                          )}
                          {m.proposals?.map(card => (
                            <WritCard
                              key={card.id}
                              card={card}
                              onApprove={c => void approveProposal(m.id, c)}
                              onDiscard={c => discardProposal(m.id, c)}
                              onEdit={(c, payload, rows) => editProposal(m.id, c, payload, rows)}
                              choices={choices}
                            />
                          ))}
                          {!isLive && drafted > 0 && (
                            <Slip tone="chapt" icon={<IcFlag size={14} />} title={drafted === 1 ? "Drafted, not sent." : `${drafted} changes drafted, none sent.`}>
                              {drafted === 1 ? "Nothing changes until you approve the card above." : "Nothing changes until you approve the cards above."}
                            </Slip>
                          )}
                        </>
                      </div>
                    );
                  })}
                </div>
              )}
              {scene === "thread" && below && !peek && !idea && !excerpt && (
                <button type="button" className="cs-below" onClick={jumpBelow} key={below}>
                  {below === "more" ? "More below" : "Latest answer"}
                  <IcArrow className="dn" />
                </button>
              )}

              {/* Approvals — the approval record */}
              {scene === "approvals" && <ApprovalsView />}

              {/* The peek rides OVER the body: the thread it came from stays
                  mounted underneath, scroll position and all, so Back is a
                  return rather than a re-render of the conversation. */}
              {peek && (
                <PeekSheet
                  refr={peek.refr}
                  seed={peek.seed}
                  slug={currentUser?.org?.slug}
                  onBack={() => setPeek(null)}
                  onAsk={q => void sendMessage(q)}
                />
              )}

              {/* The idea panel rides over the body on the same terms as the
                  peek — the thread stays mounted, so Back is a return. */}
              {excerpt && <ExcerptSheet citation={excerpt} onBack={() => setExcerpt(null)} />}

              {idea && (
                <EventIdeaPanel
                  seed={idea}
                  onBack={() => setIdea(null)}
                  onCreated={onIdeaCreated}
                />
              )}
            </div>

            {/* Dock / composer — on the desktop welcome the composer sits under the headline instead */}
            {(phone || scene !== "briefing") && <div className="cs-dock">{composer}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
