"use client";

// The files attached to the current Ask Chapt conversation.
//
// A conversation is a client-side thread (its messages live in localStorage),
// so its files hang off a client-generated thread id stored beside the history,
// under `${storageKey}:files`. The server holds the extracted text; this hook
// holds the chips: uploading → reading → ready, or failed with the server's own
// reason. Only ready files are sent with a question (attachmentIds), and every
// question sends all of them, because the server keeps no conversation state.
//
// On mount the stored list is reconciled against the server, which drops files
// that were removed elsewhere or expired.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { orgFetch, orgUpload } from "../../lib/api";
import type { ChatAttachmentInfo, FileLimits } from "./types";

export type ChipStatus = "uploading" | "reading" | "ready" | "failed";

export interface AttachmentChip {
  key: string;
  name: string;
  status: ChipStatus;
  /** 0–1 while uploading. */
  progress: number;
  info?: ChatAttachmentInfo;
  error?: string;
}

interface Stored { threadId: string; files: ChatAttachmentInfo[]; sent: string[] }

const newThreadId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));

function load(key: string): Stored | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Stored>;
    if (typeof s.threadId !== "string" || !Array.isArray(s.files)) return null;
    return { threadId: s.threadId, files: s.files, sent: Array.isArray(s.sent) ? s.sent : [] };
  } catch { return null; }
}

function errorText(body: unknown, status: number): string {
  const msg = (body as { error?: unknown } | null)?.error;
  if (typeof msg === "string" && msg.trim()) return msg;
  if (status === 429) return "Too many uploads — wait a minute and try again.";
  return "That file couldn't be attached.";
}

export function useAttachments(storageKey: string, limits: FileLimits | null) {
  const key = `${storageKey}:files`;
  const enabled = limits !== null;
  const [threadId, setThreadId] = useState<string>("");
  const [chips, setChips] = useState<AttachmentChip[]>([]);
  // Ids already sent with a question — the bubble names a file only the first time.
  const sentRef = useRef<Set<string>>(new Set());
  const chipsRef = useRef(chips);
  chipsRef.current = chips;

  // Load, then reconcile with the server's list for this thread.
  useEffect(() => {
    if (!enabled) return;
    const stored = load(key);
    const tid = stored?.threadId ?? newThreadId();
    setThreadId(tid);
    sentRef.current = new Set(stored?.sent ?? []);
    setChips((stored?.files ?? []).map(f => ({ key: f.id, name: f.name, status: "ready", progress: 1, info: f })));
    if (!stored?.files.length) return;
    let cancelled = false;
    orgFetch(`/api/ai/attachments?threadId=${encodeURIComponent(tid)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((live: ChatAttachmentInfo[] | null) => {
        if (cancelled || !Array.isArray(live)) return;
        setChips(prev => [
          ...live.map(f => ({ key: f.id, name: f.name, status: "ready" as const, progress: 1, info: f })),
          ...prev.filter(c => c.status !== "ready"),
        ]);
      })
      .catch(() => { /* keep the stored list; the chat drops anything stale server-side */ });
    return () => { cancelled = true; };
  }, [key, enabled]);

  // Persist the ready files (never the in-flight or failed chips).
  useEffect(() => {
    if (!enabled || !threadId) return;
    const files = chips.filter(c => c.status === "ready" && c.info).map(c => c.info!);
    try {
      if (files.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ threadId, files, sent: [...sentRef.current] } satisfies Stored));
    } catch { /* storage full — the server list still holds them */ }
  }, [chips, threadId, key, enabled]);

  const patch = useCallback((k: string, p: Partial<AttachmentChip>) => {
    setChips(prev => prev.map(c => (c.key === k ? { ...c, ...p } : c)));
  }, []);

  const add = useCallback((files: File[]) => {
    if (!limits || !threadId) return;
    const live = chipsRef.current.filter(c => c.status !== "failed").length;
    files.forEach((file, i) => {
      const k = `local-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const base: AttachmentChip = { key: k, name: file.name || "Untitled", status: "uploading", progress: 0 };
      if (live + i >= limits.maxFiles) {
        setChips(prev => [...prev, { ...base, status: "failed", error: `A conversation can hold ${limits.maxFiles} files. Remove one first.` }]);
        return;
      }
      if (file.size > limits.maxBytes) {
        setChips(prev => [...prev, { ...base, status: "failed", error: "That file is over 4 MB. Try a smaller export." }]);
        return;
      }
      setChips(prev => [...prev, base]);
      const form = new FormData();
      form.append("file", file);
      form.append("threadId", threadId);
      orgUpload("/api/ai/attachments", form, f => patch(k, f >= 1 ? { progress: 1, status: "reading" } : { progress: f }))
        .then(({ status, body }) => {
          if (status === 201 || status === 200) {
            const info = body as ChatAttachmentInfo;
            setChips(prev => {
              // Same bytes again: the server handed back the file already here.
              const dupe = prev.some(c => c.key !== k && c.info?.id === info.id);
              return dupe ? prev.filter(c => c.key !== k) : prev.map(c => (c.key === k ? { key: info.id, name: info.name, status: "ready", progress: 1, info } : c));
            });
          } else {
            patch(k, { status: "failed", error: errorText(body, status) });
          }
        })
        .catch(() => patch(k, { status: "failed", error: "The upload didn't finish. Check your connection and try again." }));
    });
  }, [limits, threadId, patch]);

  const remove = useCallback((k: string) => {
    const chip = chipsRef.current.find(c => c.key === k);
    setChips(prev => prev.filter(c => c.key !== k));
    if (chip?.info) {
      void orgFetch(`/api/ai/attachments/${encodeURIComponent(chip.info.id)}`, { method: "DELETE" }).catch(() => undefined);
    }
  }, []);

  /** ← New: forget this thread's files on the server and start a fresh thread. */
  const clear = useCallback(() => {
    if (!enabled) return;
    const old = threadId;
    if (old && chipsRef.current.some(c => c.info)) {
      void orgFetch(`/api/ai/attachments?threadId=${encodeURIComponent(old)}`, { method: "DELETE" }).catch(() => undefined);
    }
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    sentRef.current = new Set();
    setChips([]);
    setThreadId(newThreadId());
  }, [enabled, threadId, key]);

  const ready = useMemo(() => chips.filter(c => c.status === "ready" && c.info).map(c => c.info!), [chips]);
  const busy = chips.some(c => c.status === "uploading" || c.status === "reading");

  /** Ids for the request, and the names first sent with this message. Marks them sent. */
  const takeForSend = useCallback((): { ids: string[]; newNames: string[] } => {
    const newNames = ready.filter(f => !sentRef.current.has(f.id)).map(f => f.name);
    for (const f of ready) sentRef.current.add(f.id);
    return { ids: ready.map(f => f.id), newNames };
  }, [ready]);

  return { enabled, chips, ready, busy, add, remove, clear, takeForSend };
}
