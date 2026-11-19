/**
 * POST /api/ai/chat as a server-sent-event stream, through expo/fetch (React Native's
 * global fetch can't read a body incrementally). Same headers as ~/api/client: bearer,
 * x-org-slug, x-app-version. A 401 refreshes the token once; a 426 trips the update gate.
 *
 * The server answers JSON (ChatAvailability) instead of a stream when Ask Chapt is off.
 * Events are parsed defensively: an unknown event name or bad JSON is skipped, because
 * new events may be added without notice (lib/api-types/chat.ts).
 */
import type { AppUpdateRequired, ChatAvailability, ChatRequest, ChatStreamEventName, ChatStreamEvents } from "@/lib/api-types";
import { fetch as expoFetch } from "expo/fetch";
import { getAccessToken, refreshAccessToken } from "~/auth";
import { config } from "~/config";
import { activeOrg } from "~/state/org";
import { updateGate } from "~/state/update-gate";

export type StreamEvent = { [K in ChatStreamEventName]: { event: K; data: ChatStreamEvents[K] } }[ChatStreamEventName];

export class ChatHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export class ChatOffError extends Error {}

const KNOWN = new Set<string>(["open", "step", "step_start", "step_done", "step_drop", "composing", "text", "answer", "proposal", "notice", "note_refs", "done"]);

async function post(body: ChatRequest, token: string | null, signal: AbortSignal) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream", "x-app-version": config.appVersion };
  if (token) headers.Authorization = `Bearer ${token}`;
  const org = activeOrg.get().slug;
  if (org) headers["x-org-slug"] = org;
  return expoFetch(`${config.apiUrl}/api/ai/chat`, { method: "POST", headers, body: JSON.stringify(body), signal });
}

/** Split an SSE byte stream into { event, data } frames. */
async function* frames(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let cut: number;
      while ((cut = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }
        if (data.length) yield { event, data: data.join("\n") };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamChat(body: ChatRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  let token = await getAccessToken();
  let res = await post(body, token, signal);
  if (res.status === 401 && token) {
    token = await refreshAccessToken();
    if (token) res = await post(body, token, signal);
  }
  if (res.status === 426) {
    const j = (await res.json().catch(() => null)) as Partial<AppUpdateRequired> | null;
    if (j?.code === "APP_UPDATE_REQUIRED" && j.minVersion) updateGate.set({ minVersion: j.minVersion });
    throw new ChatHttpError(426, "Update ChaptOS to keep asking.");
  }
  const type = res.headers.get("content-type") ?? "";
  if (res.ok && type.includes("application/json")) {
    const j = (await res.json().catch(() => null)) as ChatAvailability | null;
    if (j && j.enabled === false) throw new ChatOffError("Ask Chapt is switched off for now.");
  }
  if (!res.ok || !res.body) {
    const msg = res.status === 429 ? "Slow down: too many questions at once." : res.status === 401 ? "Your session ended. Sign in again." : `Ask Chapt couldn't answer (HTTP ${res.status}).`;
    throw new ChatHttpError(res.status, msg);
  }
  for await (const f of frames(res.body as ReadableStream<Uint8Array>)) {
    if (!KNOWN.has(f.event)) continue;
    let data: unknown;
    try { data = JSON.parse(f.data); } catch { continue; }
    if (data == null || typeof data !== "object") continue;
    yield { event: f.event, data } as StreamEvent;
  }
}
