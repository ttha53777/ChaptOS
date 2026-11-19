/**
 * Files attached to this chapter's Ask Chapt thread (the paper-clip chip). Same model as
 * the web (app/components/chat/useAttachments.ts): the thread is a client-side id; each
 * file is uploaded once (POST /api/ai/attachments, multipart `file` + `threadId`) and
 * every ready file goes with every question (attachmentIds). The bubble names a file only
 * the first time it's sent. Kept on the phone per chapter; reconciled against the server's
 * list on open (files expire).
 *
 * Uploads go through XMLHttpRequest because fetch reports no upload progress; the chip
 * fills as bytes leave. A refused file stays as a failed chip with the server's reason
 * (the chip shakes once; ~/chat/Composer).
 */
import type { ChatAttachmentInfo, FileLimits } from "@/lib/api-types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { api } from "~/api/client";
import { getAccessToken } from "~/auth";
import { config } from "~/config";
import { activeOrg } from "~/state/org";
import { createStore } from "~/state/store";

export interface FileChip {
  key: string;
  name: string;
  status: "uploading" | "reading" | "ready" | "failed";
  /** 0–1 while uploading. */
  progress: number;
  info?: ChatAttachmentInfo;
  error?: string;
}

interface FilesState { slug: string | null; threadId: string; chips: FileChip[]; sent: string[] }
const store = createStore<FilesState>({ slug: null, threadId: "", chips: [], sent: [] });
const key = (slug: string) => `chaptos.chat.${slug}:files`;

const newThreadId = () => "10000000-1000-4000-8000-100000000000".replace(/[018]/g, ch => (Number(ch) ^ ((Math.random() * 16) >> (Number(ch) / 4))).toString(16));

function set(p: Partial<FilesState> | ((s: FilesState) => Partial<FilesState>)) {
  const s = store.get();
  store.set({ ...s, ...(typeof p === "function" ? p(s) : p) });
}
function patchChip(k: string, p: Partial<FileChip>) {
  set(s => ({ chips: s.chips.map(c => (c.key === k ? { ...c, ...p } : c)) }));
}

function save() {
  const { slug, threadId, chips, sent } = store.get();
  if (!slug) return;
  const files = chips.filter(c => c.status === "ready" && c.info).map(c => c.info!);
  (files.length ? AsyncStorage.setItem(key(slug), JSON.stringify({ threadId, files, sent })) : AsyncStorage.removeItem(key(slug))).catch(() => {});
}

export const useFiles = () => useSyncExternalStore(store.subscribe, store.get, store.get);

export async function openFiles(slug: string) {
  if (store.get().slug === slug) return;
  let stored: { threadId: string; files: ChatAttachmentInfo[]; sent: string[] } | null = null;
  try {
    const raw = await AsyncStorage.getItem(key(slug));
    stored = raw ? JSON.parse(raw) : null;
  } catch { /* fresh */ }
  const threadId = stored?.threadId ?? newThreadId();
  const chips: FileChip[] = (stored?.files ?? []).map(f => ({ key: f.id, name: f.name, status: "ready", progress: 1, info: f }));
  store.set({ slug, threadId, chips, sent: stored?.sent ?? [] });
  if (!stored?.files.length) return;
  // The server forgets expired files: keep only the ones it still has.
  try {
    const live = await api<ChatAttachmentInfo[]>("/api/ai/attachments", { query: { threadId } });
    const ids = new Set(live.map(f => f.id));
    if (store.get().slug === slug) { set(s => ({ chips: s.chips.filter(c => !c.info || ids.has(c.info.id)) })); save(); }
  } catch { /* offline: keep what we had */ }
}

export interface PickedFile { uri: string; name: string; size?: number | null; mimeType?: string | null }

function upload(form: FormData, onProgress: (f: number) => void): Promise<{ status: number; body: unknown }> {
  return getAccessToken().then(token => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${config.apiUrl}/api/ai/attachments`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    const org = activeOrg.get().slug;
    if (org) xhr.setRequestHeader("x-org-slug", org);
    xhr.setRequestHeader("x-app-version", config.appVersion);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = e => { if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let body: unknown = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(form);
  }));
}

function errorText(body: unknown, status: number): string {
  const msg = (body as { error?: unknown } | null)?.error;
  if (typeof msg === "string" && msg.trim()) return msg;
  if (status === 429) return "Too many uploads. Wait a minute and try again.";
  return "That file couldn't be attached.";
}

export function addFiles(files: PickedFile[], limits: FileLimits) {
  const { threadId } = store.get();
  if (!threadId) return;
  const live = store.get().chips.filter(c => c.status !== "failed").length;
  files.forEach((file, i) => {
    const k = `local-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
    const base: FileChip = { key: k, name: file.name || "Untitled", status: "uploading", progress: 0 };
    const ext = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`;
    const refuse = live + i >= limits.maxFiles ? `A conversation can hold ${limits.maxFiles} files. Remove one first.`
      : file.size != null && file.size > limits.maxBytes ? `That file is over ${Math.round(limits.maxBytes / 1048576)} MB. Try a smaller export.`
      : !limits.extensions.includes(ext) ? "Ask Chapt can read PDF, Word (.docx), Excel (.xlsx), CSV and text files."
      : null;
    if (refuse) { set(s => ({ chips: [...s.chips, { ...base, status: "failed", error: refuse }] })); return; }
    set(s => ({ chips: [...s.chips, base] }));
    const form = new FormData();
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream" } as unknown as Blob);
    form.append("threadId", threadId);
    upload(form, f => patchChip(k, f >= 1 ? { progress: 1, status: "reading" } : { progress: f }))
      .then(({ status, body }) => {
        if (store.get().threadId !== threadId) return;
        if (status === 200 || status === 201) {
          const info = body as ChatAttachmentInfo;
          set(s => {
            const dupe = s.chips.some(c => c.key !== k && c.info?.id === info.id);
            return { chips: dupe ? s.chips.filter(c => c.key !== k) : s.chips.map(c => (c.key === k ? { key: info.id, name: info.name, status: "ready", progress: 1, info } : c)) };
          });
          save();
        } else patchChip(k, { status: "failed", error: errorText(body, status) });
      })
      .catch(() => patchChip(k, { status: "failed", error: "The upload didn't finish. Check your connection and try again." }));
  });
}

export function removeFile(k: string) {
  const chip = store.get().chips.find(c => c.key === k);
  set(s => ({ chips: s.chips.filter(c => c.key !== k) }));
  save();
  if (chip?.info) void api(`/api/ai/attachments/${encodeURIComponent(chip.info.id)}`, { method: "DELETE" }).catch(() => undefined);
}

/** New chat: forget this thread's files on the server and start a fresh thread id. */
export function clearFiles() {
  const { threadId, slug, chips } = store.get();
  if (chips.some(c => c.info)) void api("/api/ai/attachments", { method: "DELETE", query: { threadId } }).catch(() => undefined);
  store.set({ slug, threadId: newThreadId(), chips: [], sent: [] });
  if (slug) AsyncStorage.removeItem(key(slug)).catch(() => {});
}

/** Ids for the request, and the names this message is the first to carry. Marks them sent. */
export function takeForSend(): { ids: string[]; newNames: string[] } {
  const s = store.get();
  const ready = s.chips.filter(c => c.status === "ready" && c.info).map(c => c.info!);
  const newNames = ready.filter(f => !s.sent.includes(f.id)).map(f => f.name);
  set({ sent: [...new Set([...s.sent, ...ready.map(f => f.id)])] });
  save();
  return { ids: ready.map(f => f.id), newNames };
}

export const filesBusy = (chips: FileChip[]) => chips.some(c => c.status === "uploading" || c.status === "reading");
