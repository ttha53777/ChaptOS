"use client";

// "Ask the Chapter" — floating launcher + slide-in counsel panel. Available
// app-wide via app/layout.tsx. Stores history per-session in localStorage and
// streams answers from /api/ai/chat (SSE). The launcher hides itself when the
// server reports no OPENAI_API_KEY.
//
// Visual language: the warm "dusk" theme (chat-ledger.css), matching the
// Dashboard ("Ledger") and Timeline ("Agenda") redesigns — Fraunces serif for
// the counsel voice, Geist Mono kickers, paper surfaces, violet accents. The
// panel emphasizes three things: (1) it answers in a chapter "counsel" voice,
// (2) it can consult the records (tool-call trail), and (3) it can propose
// actions you ratify (proposal cards).

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { orgFetch } from "../lib/api";
import { iterSSE } from "../lib/sse";
import "./chat-ledger.css";

const STORAGE_KEY = "chaptos_chat_v1";
const PULSE_SEEN_KEY = "chaptos_chat_seen_v1";
const MAX_HISTORY = 50;

interface ProposalCard {
  id: string;                                     // local id for keying
  action: string;                                 // tool name
  endpoint: string;                               // /api/...
  method: "POST" | "PATCH";
  payload: Record<string, unknown>;
  summary: string;
  state: "pending" | "confirming" | "done" | "declined" | "error";
  resultMessage?: string;                         // toast text after Confirm/Decline
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  // For assistant messages, an in-progress tool call to show inline status.
  toolStatus?: { name: string; status: "running" | "done" } | null;
  // Coarse progress phase for the empty-content placeholder: "routing" while the
  // model is still deciding what to look up (the silent pre-tool gap), "working"
  // once it has started calling tools / synthesising the answer.
  phase?: "routing" | "working" | null;
  // Write proposals attached to this assistant turn (rendered as confirm cards).
  proposals?: ProposalCard[];
}

// Starters grouped by domain so the empty state doubles as a capability map —
// the member sees at a glance that the chapter knows people, money, and time.
const STARTER_GROUPS: { label: string; prompts: string[] }[] = [
  { label: "People",    prompts: ["Who's at risk?", "Who hasn't paid dues?"] },
  { label: "Money",     prompts: ["How are we doing on dues?", "What's our treasury balance?"] },
  { label: "This week", prompts: ["What's on this week?", "Any deadlines coming up?"] },
];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Tool names stream raw from the model (e.g. "list_brothers", "get_treasury").
// Surface them in the chapter's counsel voice instead — "consulting the roster"
// reads as deliberation, not a function call. Unmapped tools fall back to a
// de-snaked phrase so a new tool never shows an ugly identifier.
const TOOL_PHRASE: Record<string, string> = {
  list_brothers:           "reviewing the roster",
  get_brother:            "pulling a brother's record",
  list_deadlines:         "checking the deadlines",
  list_instagram_tasks:   "checking the posting queue",
  list_calendar_events:   "consulting the calendar",
  list_parties:           "checking the social calendar",
  sum_transactions:       "tallying the ledger",
  get_treasury:           "reading the treasury",
  get_budget:             "reviewing the budget",
  recent_activity:        "scanning recent activity",
  weekly_digest:          "assembling the week",
  get_event_attendance:   "checking attendance",
  get_brother_attendance: "checking a brother's attendance",
  list_roles:             "reviewing the roster's roles",
  list_service_events:    "checking service hours",
  list_programming_events: "checking programming",
  propose_add_deadline:        "drafting a deadline",
  propose_add_instagram_task:  "drafting a post",
  propose_add_calendar_event:  "drafting a calendar event",
  propose_log_transaction:     "drafting a ledger entry",
  propose_mark_dues_paid:      "drafting a dues update",
  propose_add_programming_event: "drafting a programming event",
};

function toolPhrase(name: string): string {
  return TOOL_PHRASE[name] ?? name.replace(/^(list|get|sum|propose)_/, "").replace(/_/g, " ");
}

// Pretty-print a proposal payload as ordered key → value rows. Falls back to the
// raw JSON disclosure for nested/array values that don't read well in a row.
function proposalRows(payload: Record<string, unknown>): { k: string; v: string }[] {
  return Object.entries(payload)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]) => ({ k: k.replace(/([a-z])([A-Z])/g, "$1 $2"), v: String(v) }));
}

// ────────────────────────────────────────────────────────────────────────────
// MarkdownLite — renders the small markdown subset the assistant actually emits
// (headings, bold/italic, inline code, bullet + numbered lists, paragraphs).
// Deliberately NOT a full markdown engine: the bot's answers are short and
// structured, so a dependency-free renderer keeps the bundle lean. All styling
// lives in chat-ledger.css (.chat-bubble-bot .voice …) so the markup stays clean.
// Anything it doesn't recognize falls through as plain text.
// ────────────────────────────────────────────────────────────────────────────

// Inline pass: split a line into bold / italic / code spans. Runs left-to-right
// so nested-ish cases degrade gracefully rather than mis-parsing.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Matches **bold** | __bold__ | *italic* | _italic_ | `code`
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{m[2]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i${i}`}>{m[4]}</em>);
    } else if (m[5] !== undefined) {
      nodes.push(<code key={`${keyPrefix}-c${i}`}>{m[5]}</code>);
    }
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function MarkdownLite({ text, trailing }: { text: string; trailing?: ReactNode }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, idx) => (
      <li key={`li-${key}-${idx}`}>{renderInline(it, `li-${key}-${idx}`)}</li>
    ));
    blocks.push(list.ordered
      ? <ol key={`ol-${key}`}>{items}</ol>
      : <ul key={`ul-${key}`}>{items}</ul>);
    key++;
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    // Match both "1." and "1)" — the model uses either for ordered lists.
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (bullet) {
      if (list && list.ordered) flushList();
      list = list ?? { ordered: false, items: [] };
      list.items.push(bullet[1]);
      continue;
    }
    if (numbered) {
      if (list && !list.ordered) flushList();
      list = list ?? { ordered: true, items: [] };
      list.items.push(numbered[1]);
      continue;
    }
    flushList();

    if (line === "") continue; // blank line = block separator
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      const Tag = (`h${level}` as "h1" | "h2" | "h3");
      blocks.push(<Tag key={`h-${key++}`}>{renderInline(heading[2], `h-${key}`)}</Tag>);
      continue;
    }
    blocks.push(<p key={`p-${key++}`}>{renderInline(line, `p-${key}`)}</p>);
  }
  flushList();

  // Attach the streaming caret to the final block so it trails the text.
  if (trailing) blocks.push(<span key="caret">{trailing}</span>);
  return <div className="voice">{blocks}</div>;
}

// Sparkle icon — outlined, matches the app's heroicons-style SVG language.
function SparkleIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
      <path d="M5 15l.6 1.6L7.2 17l-1.6.6L5 19l-.6-1.6L2.8 17l1.6-.4L5 15z" />
    </svg>
  );
}

// Animated "the chapter is deliberating" indicator for the gap before the first
// token. A trio of drifting dots gives the empty bubble a heartbeat instead of a
// frozen line; the serif label names the current phase. Replaces the old static
// <p className="thinking"> so the longest wait (model reasoning) reads as alive.
function ThinkingDots({ label }: { label: string }) {
  return (
    <div className="chat-thinking" role="status" aria-live="polite">
      <span className="dots" aria-hidden>
        <span className="dot" /><span className="dot" /><span className="dot" />
      </span>
      <span className="lbl">{label}</span>
    </div>
  );
}

function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY) : [];
  } catch { return []; }
}

function saveHistory(msgs: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_HISTORY))); }
  catch { /* localStorage full — silently drop */ }
}

export function ChatWidget() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = unknown
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false); // first-run nudge on the launcher
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  // Mirror of `messages` for synchronous reads in sendMessage — building the
  // request body inside a setMessages updater isn't reliable under React 18
  // batching (could read stale/empty state and POST {messages: []} → 400).
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Probe whether the chat is enabled (key configured). Hide the launcher if not.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/chat", { method: "GET" })
      .then(r => (r.ok ? r.json() : { enabled: false }))
      .then((d: { enabled?: boolean }) => { if (!cancelled) setEnabled(d.enabled === true); })
      .catch(() => { if (!cancelled) setEnabled(false); });
    return () => { cancelled = true; };
  }, []);

  // Load persisted history once on mount. Show the first-run pulse only when the
  // member has never opened the panel before (no seen-flag, no history).
  useEffect(() => {
    setMessages(loadHistory());
    try {
      if (!localStorage.getItem(PULSE_SEEN_KEY) && !localStorage.getItem(STORAGE_KEY)) setPulse(true);
    } catch { /* ignore */ }
  }, []);

  // Persist on every change.
  useEffect(() => { saveHistory(messages); }, [messages]);

  // Auto-scroll the message list to the bottom on new content.
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  // Open/close via Esc and the ⌘K / Ctrl-K shortcut (discoverability). When the
  // panel closes, also cancel any in-flight stream.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && open) { setOpen(false); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // On open: dismiss the pulse for good, cancel nothing; focus the composer.
  // On close: abort any in-flight stream.
  useEffect(() => {
    if (open) {
      if (pulse) { setPulse(false); try { localStorage.setItem(PULSE_SEEN_KEY, "1"); } catch { /* ignore */ } }
      // Defer focus until the slide-in transform settles.
      const t = setTimeout(() => textareaRef.current?.focus(), 320);
      return () => clearTimeout(t);
    }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
  }, [open, pulse]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMsg: ChatMessage = { id: newId(), role: "user", content: trimmed };
    const assistantMsg: ChatMessage = { id: newId(), role: "assistant", content: "", toolStatus: null, phase: "routing" };
    // Build the request body from a ref to the freshest committed history, NOT
    // from inside the setMessages updater — that updater isn't guaranteed to run
    // synchronously (React 18 batching), so reading payloadHistory after it could
    // see an empty array and POST {messages: []} → HTTP 400. The ref is always
    // current, and we append the new user message explicitly.
    const payloadHistory = [...messagesRef.current, userMsg]
      .filter(m => m.content.trim().length > 0)
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await orgFetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadHistory }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const errText = res.status === 429 ? "Slow down — too many messages." : `Sorry, the chat failed (HTTP ${res.status}).`;
        setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: errText, toolStatus: null } : m));
        setStreaming(false);
        return;
      }

      for await (const { event, data } of iterSSE(res.body)) {
        let parsed: unknown;
        try { parsed = JSON.parse(data); } catch { continue; }
        if (event === "text") {
          const delta = (parsed as { delta?: string }).delta ?? "";
          setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: m.content + delta, toolStatus: null, phase: "working" } : m));
        } else if (event === "tool_call") {
          const tc = parsed as { name?: string; status?: "running" | "done" };
          if (tc.name && tc.status) {
            setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, toolStatus: tc.status === "done" ? null : { name: tc.name!, status: tc.status! }, phase: "working" } : m));
          }
        } else if (event === "proposal") {
          const p = parsed as { action?: string; endpoint?: string; method?: "POST" | "PATCH"; payload?: Record<string, unknown>; summary?: string };
          if (p.action && p.endpoint && p.method && p.payload && p.summary) {
            const card: ProposalCard = { id: newId(), action: p.action, endpoint: p.endpoint, method: p.method, payload: p.payload, summary: p.summary, state: "pending" };
            setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, proposals: [...(m.proposals ?? []), card] } : m));
          }
        } else if (event === "done") {
          break;
        }
      }
    } catch (e) {
      // Aborted by the user (closing the panel) — leave whatever was streamed.
      if ((e as { name?: string })?.name !== "AbortError") {
        console.error("chat stream failed:", e);
        setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: m.content || "(network error)", toolStatus: null } : m));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [streaming]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  function handleClear() {
    setMessages([]);
    setInput("");
  }

  // Update a single proposal card by message + card id.
  function updateProposal(msgId: string, cardId: string, patch: Partial<ProposalCard>) {
    setMessages(prev => prev.map(m => m.id !== msgId ? m : {
      ...m,
      proposals: (m.proposals ?? []).map(p => p.id === cardId ? { ...p, ...patch } : p),
    }));
  }

  async function confirmProposal(msgId: string, card: ProposalCard) {
    updateProposal(msgId, card.id, { state: "confirming" });
    try {
      const res = await orgFetch(card.endpoint, {
        method: card.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card.payload),
      });
      if (res.ok) {
        updateProposal(msgId, card.id, { state: "done", resultMessage: "Ratified." });
      } else {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        const msg = res.status === 403
          ? "Admin-only — your account can't confirm this."
          : (errBody.error ?? `Failed (HTTP ${res.status}).`);
        updateProposal(msgId, card.id, { state: "error", resultMessage: msg });
      }
    } catch (e) {
      updateProposal(msgId, card.id, { state: "error", resultMessage: e instanceof Error ? e.message : "Network error." });
    }
  }

  function declineProposal(msgId: string, card: ProposalCard) {
    updateProposal(msgId, card.id, { state: "declined", resultMessage: "Declined." });
  }

  const isMac = useMemo(() => typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform), []);
  const shortcut = isMac ? "⌘K" : "Ctrl K";

  // Hide entirely when AI isn't enabled (no API key configured), and while the
  // enabled probe is in flight (avoids a flash of the launcher).
  if (enabled !== true) return null;

  return (
    <div className="chat-root">
      {/* Floating launcher — warm paper pill with a serif invitation */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask Chapt"
          className={`chat-launcher${pulse ? " pulse" : ""}`}
        >
          <SparkleIcon className="spark" />
          <span>Ask Chapt</span>
          <kbd className="hint">{shortcut}</kbd>
        </button>
      )}

      {/* Backdrop */}
      {open && <div className="chat-backdrop" onClick={() => setOpen(false)} aria-hidden />}

      {/* Counsel panel */}
      <div role="dialog" aria-label="Ask Chapt" className={`chat-panel${open ? "" : " closed"}`}>
        {/* Header */}
        <header className="chat-head">
          <div className="id">
            <span className="crest"><SparkleIcon /></span>
            <div>
              <div className="ttl">Ask Chapt</div>
              <div className="sub">Counsel · saved on this device</div>
            </div>
          </div>
          <div className="tools">
            {messages.length > 0 && (
              <button onClick={handleClear} className="h-btn">Clear</button>
            )}
            <button onClick={() => setOpen(false)} aria-label="Close" className="h-close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        </header>

        {/* Scroll region */}
        <div className="chat-scroll">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <p className="lede">Ask anything about <em>the chapter</em>.</p>
              <p className="blurb">
                Brothers, dues, treasury, this week&apos;s agenda — the chapter consults its records and answers.
                It can also <b>propose actions</b> for you to ratify.
              </p>
              <div className="chat-starts">
                {STARTER_GROUPS.map(group => (
                  <div key={group.label} className="chat-start-group">
                    <div className="g-lbl">{group.label}</div>
                    <div className="chat-start-grid">
                      {group.prompts.map(p => (
                        <button key={p} onClick={() => void sendMessage(p)} disabled={streaming} className="chat-start">
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-stream">
              {messages.map(m => (
                <div key={m.id} className={`chat-turn ${m.role === "user" ? "user" : "bot"}`}>
                  {m.role === "user" ? (
                    <div className="chat-bubble-user">{m.content}</div>
                  ) : (
                    <div className="chat-bubble-bot">
                      {m.content
                        ? <MarkdownLite text={m.content} trailing={streaming && m === messages[messages.length - 1] ? <span className="chat-caret" aria-hidden /> : undefined} />
                        : (!m.proposals || m.proposals.length === 0) && !m.toolStatus &&
                          <ThinkingDots label={m.phase === "routing" ? "Deciding what to check" : "Consulting the records"} />}
                      {m.toolStatus && (
                        <div className="chat-tool">
                          <span className="orbit" aria-hidden />
                          <span>Now {toolPhrase(m.toolStatus.name)}…</span>
                        </div>
                      )}
                      {m.proposals?.map(card => {
                        const rows = proposalRows(card.payload);
                        const hasComplex = rows.length < Object.keys(card.payload).length;
                        return (
                          <div key={card.id} className="chat-proposal">
                            <div className="chat-prop-head">
                              <span className="seal">Proposal</span>
                              <span className="what">{card.summary}</span>
                            </div>
                            <div className="chat-prop-body">
                              {rows.length > 0 && (
                                <div className="chat-prop-detail">
                                  {rows.map(r => (
                                    <div key={r.k} className="chat-prop-row">
                                      <span className="k">{r.k}</span>
                                      <span className="val">{r.v}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {(hasComplex || rows.length === 0) && (
                                <details className="chat-prop-raw">
                                  <summary>Full payload</summary>
                                  <pre>{JSON.stringify(card.payload, null, 2)}</pre>
                                </details>
                              )}

                              {card.state === "pending" && (
                                <div className="chat-prop-actions">
                                  <button onClick={() => void confirmProposal(m.id, card)} className="chat-ratify">Ratify</button>
                                  <button onClick={() => declineProposal(m.id, card)} className="chat-decline">Decline</button>
                                </div>
                              )}
                              {card.state === "confirming" && (
                                <p className="chat-prop-state busy">
                                  <span className="chat-spin" aria-hidden />
                                  Ratifying…
                                </p>
                              )}
                              {card.state === "done" && (
                                <p className="chat-prop-state done">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
                                  {card.resultMessage}
                                </p>
                              )}
                              {card.state === "declined" && (
                                <p className="chat-prop-state gone">{card.resultMessage}</p>
                              )}
                              {card.state === "error" && (
                                <p className="chat-prop-state fail">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                  {card.resultMessage}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <form onSubmit={handleSubmit} className="chat-composer">
          <div className="chat-input-wrap">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the chapter…"
              rows={1}
              disabled={streaming}
              className="chat-textarea"
            />
            <button type="submit" disabled={!input.trim() || streaming} className="chat-send" aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="foot">
            <span>Enter to send · Shift+Enter for a line</span>
            <span>Esc to close</span>
          </div>
        </form>
      </div>
    </div>
  );
}
