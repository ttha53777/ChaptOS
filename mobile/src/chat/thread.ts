/**
 * The Ask Chapt conversation on this phone: one thread per chapter, kept in
 * AsyncStorage (like the web's localStorage history; the server keeps no thread).
 *
 * send() appends the question and an assistant turn seeded with the guessed ledger
 * (~/chat/intent), then reads the stream (~/chat/stream). Ledger events are staged
 * ~90ms apart (tightening as the queue deepens) so a batch cascades instead of landing
 * at once; every terminal event (answer, text, proposal, notice, done, abort, failure)
 * flushes the queue synchronously first, so an answer never waits on the animation.
 * With reduced motion nothing is staged. These are the web's cadence rules.
 *
 * The request history is prose: each turn's text, or its verdict + rows, or the drafts
 * it made (so a follow-up like "make it $45" reaches a model that saw the draft).
 */
import type { AnswerData } from "@/lib/api-types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { createStore } from "~/state/store";
import { dropProvisional, intentFor, planFor, reconcileStep, settleLedger } from "./intent";
import { ChatHttpError, ChatOffError, streamChat } from "./stream";
import type { ChatMsg, LedgerStep, ProposalCard } from "./types";

const MAX_HISTORY = 40;
const STEPS_KEPT = 6;
const key = (slug: string) => `chaptos.chat.${slug}`;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

interface ThreadState { slug: string | null; loaded: boolean; messages: ChatMsg[]; streaming: boolean }
const store = createStore<ThreadState>({ slug: null, loaded: false, messages: [], streaming: false });

/** Assistant turns created in this app session: only these play their entrance (no replay on reopen). */
export const freshIds = new Set<string>();

let reduced = false;
export function setReducedMotion(r: boolean) { reduced = r; }

let abort: AbortController | null = null;
const stage = { q: [] as Array<() => void>, timer: null as ReturnType<typeof setTimeout> | null };

function setMessages(f: (m: ChatMsg[]) => ChatMsg[]) {
  const s = store.get();
  store.set({ ...s, messages: f(s.messages) });
}
function patch(id: string, p: Partial<ChatMsg> | ((m: ChatMsg) => ChatMsg)) {
  setMessages(ms => ms.map(m => (m.id === id ? (typeof p === "function" ? p(m) : { ...m, ...p }) : m)));
}

function flushStage() {
  if (stage.timer) { clearTimeout(stage.timer); stage.timer = null; }
  while (stage.q.length) stage.q.shift()!();
}
function enqueueStage(mutation: () => void) {
  if (reduced) { mutation(); return; }
  stage.q.push(mutation);
  if (stage.timer) return;
  const pump = () => {
    stage.timer = null;
    const next = stage.q.shift();
    if (!next) return;
    next();
    if (!stage.q.length) return;
    const gap = stage.q.length > 6 ? 0 : stage.q.length > 3 ? 45 : 90;
    stage.timer = setTimeout(pump, gap);
  };
  stage.timer = setTimeout(pump, 0);
}

/* ── persistence ──────────────────────────────────────────────────────────────── */

function save() {
  const { slug, messages } = store.get();
  if (!slug || !messages.length) return;
  const trimmed = messages.slice(-MAX_HISTORY).map((m, i, all) => ({
    ...m,
    steps: all.length - i > STEPS_KEPT ? undefined : m.steps?.filter(s => !s.provisional),
    composing: undefined,
  }));
  AsyncStorage.setItem(key(slug), JSON.stringify(trimmed)).catch(() => {});
}

/** Load this chapter's thread (once per chapter switch). A turn that was mid-stream when the app died is settled, never left spinning. */
export async function openThread(slug: string) {
  const s = store.get();
  if (s.slug === slug && s.loaded) return;
  if (s.streaming) stop();
  store.set({ slug, loaded: false, messages: [], streaming: false });
  let messages: ChatMsg[] = [];
  try {
    const raw = await AsyncStorage.getItem(key(slug));
    const parsed = raw ? (JSON.parse(raw) as ChatMsg[]) : [];
    messages = Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY).map(m => ({
      ...m,
      steps: m.steps?.filter(st => !st.provisional).map(st => (st.status === "done" ? st : { ...st, status: "done" as const })),
      composing: undefined,
      proposals: m.proposals?.map(p => (p.state === "confirming" ? { ...p, state: "error" as const, resultMessage: "Interrupted. Not confirmed." } : p)),
    })) : [];
  } catch { /* unreadable: start fresh */ }
  if (store.get().slug === slug) store.set({ slug, loaded: true, messages, streaming: false });
}

export function clearThread() {
  stop();
  const { slug } = store.get();
  store.set({ ...store.get(), messages: [] });
  if (slug) AsyncStorage.removeItem(key(slug)).catch(() => {});
}

export const useThread = () => useSyncExternalStore(store.subscribe, store.get, store.get);
export const threadNow = () => store.get();

/* ── history ──────────────────────────────────────────────────────────────────── */

export function answerText(a: AnswerData): string {
  return [a.verdict.replace(/\*/g, ""), ...a.rows.map(r => [r.title, r.subtitle, r.value].filter(Boolean).join(" — "))].join("\n");
}

function messageText(m: ChatMsg): string {
  if (m.role === "user" && m.attachments?.length) return `${m.content}\n(attached: ${m.attachments.join(", ")})`;
  if (m.content.trim()) return m.content;
  if (m.answer) return answerText(m.answer);
  if (m.proposals?.length) return m.proposals.map(p => `Drafted for confirmation (${p.state}): ${p.summary}`).join("\n");
  return "";
}

/* ── a turn ───────────────────────────────────────────────────────────────────── */

export function stop() { abort?.abort(); }

export async function send(question: string, files: { ids: string[]; newNames: string[] } = { ids: [], newNames: [] }) {
  const text = question.trim();
  const s = store.get();
  if (!text || s.streaming) return;
  flushStage();
  stage.q.length = 0;

  const user: ChatMsg = { id: newId(), role: "user", content: text, ...(files.newNames.length ? { attachments: files.newNames } : {}) };
  const asst: ChatMsg = { id: newId(), role: "assistant", content: "", steps: planFor(text), intent: intentFor(text) };
  freshIds.add(asst.id);
  const history = [...s.messages, user].map(m => ({ role: m.role, content: messageText(m) })).filter(m => m.content.trim()).slice(-12);
  store.set({ ...s, messages: [...s.messages, user, asst], streaming: true });

  const controller = new AbortController();
  abort = controller;
  const aid = asst.id;
  const slugAtSend = s.slug;
  // A chapter switch mid-turn: stop writing into a thread that's no longer showing.
  const live = () => store.get().slug === slugAtSend;

  try {
    for await (const ev of streamChat({ messages: history, ...(files.ids.length ? { attachmentIds: files.ids } : {}) }, controller.signal)) {
      if (!live()) break;
      switch (ev.event) {
        case "step": {
          const st: LedgerStep = { id: ev.data.id, verb: ev.data.verb, ...(ev.data.source ? { source: ev.data.source } : {}), status: "pending" };
          if (st.id && st.verb) enqueueStage(() => patch(aid, m => ({ ...m, steps: reconcileStep(m.steps ?? [], st), composing: false })));
          break;
        }
        case "step_start":
          enqueueStage(() => patch(aid, m => ({ ...m, steps: dropProvisional(m.steps ?? []).map(st => (st.id === ev.data.id ? { ...st, status: "active" as const } : st)) })));
          break;
        case "step_done":
          enqueueStage(() => patch(aid, m => ({ ...m, steps: (m.steps ?? []).map(st => (st.id === ev.data.id ? { ...st, status: "done" as const, ...(ev.data.finding ? { finding: ev.data.finding } : {}) } : st)) })));
          break;
        case "step_drop": {
          const ids = new Set(Array.isArray(ev.data.ids) ? ev.data.ids : []);
          if (ids.size) enqueueStage(() => patch(aid, m => ({ ...m, steps: (m.steps ?? []).filter(st => !ids.has(st.id)) })));
          break;
        }
        case "composing":
          enqueueStage(() => patch(aid, m => ({ ...m, steps: dropProvisional(m.steps ?? []), composing: true })));
          break;
        case "answer": {
          flushStage();
          const a = ev.data;
          if (typeof a.verdict !== "string") break;
          const answer: AnswerData = {
            verdict: a.verdict,
            rows: Array.isArray(a.rows) ? a.rows : [],
            follows: Array.isArray(a.follows) ? a.follows : [],
            sources: Array.isArray(a.sources) ? a.sources : [],
            ...(a.askback && Array.isArray(a.askback.questions) && a.askback.questions.length ? { askback: a.askback } : {}),
            ...(a.shape && typeof a.shape === "object" && typeof a.shape.type === "string" ? { shape: a.shape } : {}),
            ...(Array.isArray(a.citations) ? { citations: a.citations } : {}),
            ...(a.tone ? { tone: a.tone } : {}),
          };
          patch(aid, m => ({ ...m, answer, steps: settleLedger(m.steps) }));
          break;
        }
        case "text":
          flushStage();
          patch(aid, m => (m.notice ? m : { ...m, content: m.content + (ev.data.delta ?? ""), steps: settleLedger(m.steps) }));
          break;
        case "notice":
          flushStage();
          if (["timeout", "error", "cut_short"].includes(ev.data.kind)) patch(aid, m => ({ ...m, notice: { kind: ev.data.kind }, steps: settleLedger(m.steps), composing: false }));
          break;
        case "note_refs":
          flushStage();
          if (Array.isArray(ev.data.refs)) {
            const ok = ev.data.refs.filter(r => typeof r?.text === "string" && typeof r?.ref?.id === "number" && typeof r?.ref?.type === "string");
            if (ok.length) patch(aid, { noteRefs: ok });
          }
          break;
        case "proposal": {
          flushStage();
          const p = ev.data;
          if (p.action && p.endpoint && p.method && p.payload && p.display && p.perm) {
            const card: ProposalCard = { ...p, sig: typeof p.sig === "string" ? p.sig : null, id: newId(), state: "pending" };
            patch(aid, m => ({ ...m, proposals: [...(m.proposals ?? []), card] }));
          }
          break;
        }
        case "done":
          flushStage();
          patch(aid, m => ({ ...m, steps: settleLedger(m.steps), composing: false }));
          break;
        case "open":
          break;
      }
      if (ev.event === "done") break;
    }
  } catch (e) {
    flushStage();
    if (!live()) { /* switched away */ }
    else if ((e as { name?: string })?.name === "AbortError") {
      patch(aid, m => ({ ...m, stopped: true, steps: settleLedger(m.steps), composing: false }));
    } else {
      const status = e instanceof ChatHttpError ? e.status : undefined;
      const message = e instanceof ChatHttpError || e instanceof ChatOffError ? e.message : undefined;
      patch(aid, m => {
        const at = (m.steps ?? []).find(st => !st.provisional && st.status === "active")?.source;
        return { ...m, error: { ...(at ? { at } : {}), ...(status ? { status } : {}), ...(message ? { message } : {}) }, steps: settleLedger(m.steps), composing: false };
      });
    }
  } finally {
    flushStage();
    if (abort === controller) abort = null;
    if (live()) { store.set({ ...store.get(), streaming: false }); save(); }
  }
}

/* ── after a turn ─────────────────────────────────────────────────────────────── */

export function patchProposal(msgId: string, cardId: string, p: Partial<ProposalCard>) {
  patch(msgId, m => ({ ...m, proposals: (m.proposals ?? []).map(c => (c.id === cardId ? { ...c, ...p } : c)) }));
  save();
}

export function markReplied(msgId: string) { patch(msgId, { replied: true }); save(); }
