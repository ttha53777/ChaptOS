"use client";

// Floating Ask button + slide-in chat panel. Available app-wide via app/layout.tsx.
// Stores history per-session in localStorage. Streams answers from /api/ai/chat (SSE).
// The button hides itself when the server reports no OPENAI_API_KEY.

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

const STORAGE_KEY = "chaptos_chat_v1";
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
  // Write proposals attached to this assistant turn (rendered as confirm cards).
  proposals?: ProposalCard[];
}

const STARTER_PROMPTS = [
  "What's on this week?",
  "Who's at risk?",
  "How are we doing on dues?",
  "What's our treasury balance?",
];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Sparkle icon — outlined, matches the app's heroicons-style SVG language.
function SparkleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
      <path d="M5 15l.6 1.6L7.2 17l-1.6.6L5 19l-.6-1.6L2.8 17l1.6-.4L5 15z" />
    </svg>
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

// Simple SSE-line parser for fetch() ReadableStream — keeps us off EventSource
// (which only supports GET). Yields {event, data} per dispatch.
async function* iterSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE dispatches are separated by a blank line ("\n\n").
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (dataLines.length > 0) yield { event, data: dataLines.join("\n") };
    }
  }
}

export function ChatWidget() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = unknown
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Probe whether the chat is enabled (key configured). Hide the button if not.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/chat", { method: "GET" })
      .then(r => (r.ok ? r.json() : { enabled: false }))
      .then((d: { enabled?: boolean }) => { if (!cancelled) setEnabled(d.enabled === true); })
      .catch(() => { if (!cancelled) setEnabled(false); });
    return () => { cancelled = true; };
  }, []);

  // Load persisted history once on mount.
  useEffect(() => { setMessages(loadHistory()); }, []);

  // Persist on every change.
  useEffect(() => { saveHistory(messages); }, [messages]);

  // Auto-scroll the message list to the bottom on new content.
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  // Esc closes the panel; cancel any in-flight stream.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Cancel any in-flight stream when the panel closes.
  useEffect(() => { if (!open && abortRef.current) { abortRef.current.abort(); abortRef.current = null; } }, [open]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMsg: ChatMessage = { id: newId(), role: "user", content: trimmed };
    const assistantMsg: ChatMessage = { id: newId(), role: "assistant", content: "", toolStatus: null };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    // Send only the last ~12 messages — the server also caps, but trimming on
    // the client means less request-body upload time. Recent turns matter more
    // than verbatim history; the assistant can always re-tool if it needs facts.
    const payload = [...messages, userMsg]
      .filter(m => m.content.trim().length > 0)
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
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
          setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: m.content + delta, toolStatus: null } : m));
        } else if (event === "tool_call") {
          const tc = parsed as { name?: string; status?: "running" | "done" };
          if (tc.name && tc.status) {
            setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, toolStatus: tc.status === "done" ? null : { name: tc.name!, status: tc.status! } } : m));
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
  }

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
      const res = await fetch(card.endpoint, {
        method: card.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card.payload),
      });
      if (res.ok) {
        updateProposal(msgId, card.id, { state: "done", resultMessage: "Done." });
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

  // Hide entirely when AI isn't enabled (no API key configured).
  if (enabled === false) return null;
  // While the enabled probe is in flight, render nothing (avoids a flash of the button).
  if (enabled === null) return null;

  return (
    <>
      {/* Floating Ask button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open chat"
          className="group fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-4 py-2.5 text-[13px] font-semibold text-indigo-100 shadow-[0_8px_28px_-10px_rgba(99,102,241,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-all hover:border-indigo-400/50 hover:bg-indigo-500/25 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07090f]"
          style={{ backgroundImage: "radial-gradient(ellipse at 30% 20%, rgba(129,140,248,0.18) 0%, transparent 70%)" }}
        >
          <SparkleIcon className="h-4 w-4 text-indigo-300 transition-colors group-hover:text-indigo-200" />
          <span>Ask</span>
        </button>
      )}

      {/* Backdrop — matches existing drawer convention (BrotherDrawer etc.) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] lg:bg-black/20"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Panel — translucent frosted indigo glass over the app surface */}
      <div
        role="dialog"
        aria-label="Chapter chat"
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-white/[0.07] shadow-2xl transition-transform duration-300 ease-in-out sm:w-[420px] ${open ? "translate-x-0" : "translate-x-full pointer-events-none"}`}
        style={{
          // Layered: dark surface at ~80% + soft indigo bloom from top-right, all over a backdrop blur
          background: "linear-gradient(to bottom, rgba(12,14,20,0.85) 0%, rgba(12,14,20,0.92) 60%, rgba(12,14,20,0.95) 100%), radial-gradient(ellipse 60% 40% at 90% 0%, rgba(99,102,241,0.18) 0%, transparent 70%)",
          backdropFilter: "saturate(140%) blur(16px)",
          WebkitBackdropFilter: "saturate(140%) blur(16px)",
        }}
      >
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-400/25 bg-indigo-500/15 text-indigo-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <SparkleIcon className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-[14px] font-semibold leading-tight text-white">Ask the Chapter</p>
              <p className="text-[10px] leading-tight text-slate-500">Saved on this device</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-white/[0.06] hover:text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
              <div className="rounded-full bg-indigo-500/15 px-3 py-1 text-[11px] font-medium text-indigo-300">Try a starter</div>
              <p className="text-[13px] leading-relaxed text-slate-400">Ask anything about the chapter — brothers, deadlines, treasury, this week's agenda.</p>
              <div className="flex w-full flex-col gap-2">
                {STARTER_PROMPTS.map(p => (
                  <button
                    key={p}
                    onClick={() => void sendMessage(p)}
                    disabled={streaming}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left text-[12px] text-slate-300 transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/[0.06] hover:text-white disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {messages.map(m => (
                <li key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  {m.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl rounded-br-md border border-indigo-400/30 bg-indigo-500/30 px-3 py-2 text-[13px] leading-relaxed text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
                      {m.content}
                    </div>
                  ) : (
                    <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[13px] leading-relaxed text-slate-200">
                      {m.content
                        ? <p className="whitespace-pre-wrap">{m.content}{streaming && m === messages[messages.length - 1] && <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-indigo-400 align-middle" aria-hidden />}</p>
                        : (!m.proposals || m.proposals.length === 0) && <p className="text-slate-500 italic">Thinking…</p>}
                      {m.toolStatus && (
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" aria-hidden />
                          <span>Looking up <code className="rounded bg-white/[0.05] px-1 text-[10px] text-slate-400">{m.toolStatus.name}</code>…</span>
                        </p>
                      )}
                      {m.proposals?.map(card => (
                        <div key={card.id} className="mt-3 rounded-lg border border-indigo-500/30 bg-indigo-500/[0.07] p-3">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 shrink-0 rounded bg-indigo-500/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-200">Proposal</span>
                            <p className="text-[12px] leading-snug text-slate-200">{card.summary}</p>
                          </div>
                          {/* Payload preview */}
                          <pre className="mt-2 max-h-32 overflow-auto rounded bg-black/30 px-2 py-1.5 text-[10px] leading-snug text-slate-400">{JSON.stringify(card.payload, null, 2)}</pre>
                          {card.state === "pending" && (
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => void confirmProposal(m.id, card)}
                                className="flex-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-500"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => declineProposal(m.id, card)}
                                className="flex-1 rounded-md border border-white/[0.1] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/[0.06]"
                              >
                                Decline
                              </button>
                            </div>
                          )}
                          {card.state === "confirming" && (
                            <p className="mt-2 text-[11px] italic text-slate-400">Submitting…</p>
                          )}
                          {card.state === "done" && (
                            <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
                              {card.resultMessage}
                            </p>
                          )}
                          {card.state === "declined" && (
                            <p className="mt-2 text-[11px] text-slate-500">{card.resultMessage}</p>
                          )}
                          {card.state === "error" && (
                            <p className="mt-2 flex items-center gap-1 text-[11px] text-red-400">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                              {card.resultMessage}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
              <div ref={messagesEndRef} />
            </ul>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="shrink-0 border-t border-white/[0.06] bg-black/20 p-3">
          <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] focus-within:border-indigo-500/40 focus-within:bg-white/[0.05]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about the chapter…"
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none bg-transparent px-3 py-2.5 text-[13px] text-white placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
              style={{ minHeight: 40, maxHeight: 160 }}
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              className="m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-600"
              aria-label="Send"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
