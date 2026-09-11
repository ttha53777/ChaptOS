import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import { IndexeddbPersistence } from "y-indexeddb";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { NOTES_VERSION, NOTES_WIRE_LIMIT, type NotesSession as Bootstrap, type NotesSnapshot } from "@/lib/collaboration/notes-protocol";
import { NotesSaveQueue } from "./notes-save-queue";
import { applyPeerUpdate } from "./notes-peer-update";

const REMOTE = "notes:remote", SERVER = "notes:server";
const COLORS = ["#a78bfa", "#6ec8b3", "#e8b66c", "#df93ac", "#7fb3e5"];
export function noteColor(id: number) { return COLORS[Math.abs(id) % COLORS.length]; }
export function bytes64(bytes: Uint8Array): string {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
export function from64(value: string): Uint8Array { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }

export type NotesStatus = { connection: string; saving: "loading" | "pending" | "saving" | "saved" | "error"; error?: string };
export type Collaborator = { clientId: number; actorId: number; name: string; color: string; typing: boolean };

export class NotesSession {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  readonly queue: NotesSaveQueue;
  bootstrap!: Bootstrap;
  status: NotesStatus = { connection: "Connecting…", saving: "loading" };
  private persistence?: IndexeddbPersistence;
  private channel?: RealtimeChannel;
  private listeners = new Set<() => void>();
  private updates: Uint8Array[] = [];
  private bufferedBytes = 0;
  private wireTimer?: ReturnType<typeof setTimeout>;
  private typingTimer?: ReturnType<typeof setTimeout>;
  private poll?: ReturnType<typeof setInterval>;
  private peopleTimer?: ReturnType<typeof setInterval>;
  private latestTyping = new Map<number, { pulse: number; received: number }>();
  private ready = false;
  private destroyed = false;
  private connected = false;
  private awarenessDirty = false;
  private fetching: Promise<void> | null = null;
  private lastSnapshot?: NotesSnapshot;
  private client = createClient();
  private authSubscription?: { unsubscribe(): void };

  constructor(readonly eventId: number, readonly slug: string, private onSaved: (value: NotesSnapshot) => void) {
    this.doc.getText("notes");
    this.queue = new NotesSaveQueue(async generation => {
      this.setStatus({ saving: "saving", error: undefined });
      const response = await this.request<NotesSnapshot>("", { method: "PATCH", body: JSON.stringify({
        protocolVersion: NOTES_VERSION, notesDoc: bytes64(Y.encodeStateAsUpdate(this.doc)), generation,
        lastSeenSeq: this.bootstrap.notesDocSeq,
      }) });
      if (this.destroyed) return;
      this.applyServer(response);
      this.setStatus({ saving: this.queue.generation === generation ? "saved" : "pending", error: undefined });
      this.send({ v: 1, event: "saved", seq: response.notesDocSeq });
    }, error => {
      const status = (error as { status?: number }).status;
      this.setStatus({ saving: "error", error: error instanceof Error ? error.message : "Couldn't save. Retry." });
      if (status === 401 || status === 403 || status === 404) {
        this.ready = false; this.disconnect();
        this.setStatus({ connection: "Access unavailable" });
      }
    });
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify() { for (const listener of this.listeners) listener(); }
  private setStatus(value: Partial<NotesStatus>) { this.status = { ...this.status, ...value }; this.notify(); }
  get editable() { return this.ready && !this.destroyed; }

  private async request<T>(suffix: string, init?: RequestInit): Promise<T> {
    // Capture org at construction: queued saves must not follow a later URL.
    const response = await fetch(`/api/calendar/${this.eventId}/notes${suffix}`, { ...init, credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", "x-org-slug": this.slug }, signal: AbortSignal.timeout(15_000) });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error ?? "Couldn't save meeting notes."), { status: response.status, retryAfter: Number(response.headers.get("Retry-After") ?? 0) * 1000 });
    return body as T;
  }

  async start() {
    this.bootstrap = await this.request<Bootstrap>("/session", { method: "POST" });
    if (this.destroyed) return;
    Y.applyUpdate(this.doc, from64(this.bootstrap.notesDoc), SERVER);
    const baseline = bytes64(Y.encodeStateAsUpdate(this.doc));
    // Authorization happens before recovering or showing local data.
    try {
      this.persistence = new IndexeddbPersistence(`notes:${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host}:${this.bootstrap.actor.authUserId}:${this.bootstrap.organizationId}:${this.eventId}:v1`, this.doc);
      await Promise.race([this.persistence.whenSynced, new Promise((_, reject) => setTimeout(() => reject(new Error("Local recovery timed out")), 5000))]);
    } catch {
      this.setStatus({ error: "Local recovery unavailable. Keep this tab open until saved." });
    }
    if (this.destroyed) return;
    this.ready = true;
    this.awareness.setLocalStateField("user", { name: this.bootstrap.actor.name.slice(0, 80), actorId: this.bootstrap.actor.id,
      color: noteColor(this.bootstrap.actor.id), colorLight: `${noteColor(this.bootstrap.actor.id)}33` });
    this.doc.on("update", this.onUpdate);
    this.awareness.on("update", this.onAwareness);
    this.setStatus({ saving: "saved", connection: this.bootstrap.realtime ? "Connecting…" : "Live updates unavailable" });
    if (baseline !== bytes64(Y.encodeStateAsUpdate(this.doc))) { this.queue.changed(); this.setStatus({ saving: "pending" }); }
    if (this.bootstrap.realtime) await this.connect();
    this.poll = setInterval(() => { if (!document.hidden) void this.reconcile().catch(() => {}); }, 30_000);
    this.peopleTimer = setInterval(() => this.notify(), 1000);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    // Never continue using a recovered document after an account change.
    this.authSubscription = this.client.auth.onAuthStateChange((_event, session) => {
      if (session && session.user.id === this.bootstrap.actor.authUserId) return;
      if (_event === "INITIAL_SESSION") return; // dev impersonation has no Auth session
      this.ready = false; this.queue.dispose(); this.disconnect();
      this.setStatus({ saving: "error", connection: "Access unavailable", error: "Sign in again to reopen these notes." });
    }).data.subscription;
  }

  private onUpdate = (update: Uint8Array, origin: unknown) => {
    if (!this.ready || origin === SERVER) return;
    this.setStatus({ saving: "pending" });
    this.queue.changed(origin === REMOTE ? 10_000 + Math.random() * 1000 : 2000);
    if (origin === REMOTE || origin === this.persistence) return;
    // HTTP saves carry the complete state. Do not retain an unbounded offline
    // Broadcast queue; join synchronization will recover missed live messages.
    if (this.connected) {
      if (this.bufferedBytes + update.byteLength < NOTES_WIRE_LIMIT / 2) {
        this.updates.push(update); this.bufferedBytes += update.byteLength;
      } else { this.updates = []; this.bufferedBytes = 0; void this.queue.flush().catch(() => {}); }
    }
    this.awareness.setLocalStateField("typingPulse", Date.now());
    this.awareness.setLocalStateField("typing", true);
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTyping(), 2000);
    this.scheduleWire();
  };
  stopTyping() { this.awareness.setLocalStateField("typing", false); }
  private onAwareness = (_change: unknown, origin: unknown) => {
    if (origin !== REMOTE) { this.awarenessDirty = true; this.scheduleWire(); }
    this.notify();
  };

  private scheduleWire() {
    if (this.wireTimer || !this.connected) return;
    const peers = this.awareness.getStates().size;
    this.wireTimer = setTimeout(() => {
      this.wireTimer = undefined;
      const update = this.updates.length ? bytes64(Y.mergeUpdates(this.updates)) : undefined;
      this.updates = [];
      this.bufferedBytes = 0;
      const awareness = this.awarenessDirty ? bytes64(encodeAwarenessUpdate(this.awareness, [this.doc.clientID])) : undefined;
      this.awarenessDirty = false;
      this.send({ v: 1, event: "update", update, awareness });
    }, peers <= 3 ? 200 : Math.min(2000, peers * peers * 20));
  }

  private send(payload: Record<string, unknown>) {
    if (!this.connected || !this.channel) return;
    if (JSON.stringify(payload).length > NOTES_WIRE_LIMIT) { void this.queue.flush().catch(() => {}); return; }
    void this.channel.send({ type: "broadcast", event: "notes", payload }).then(result => {
      if (result !== "ok") this.setStatus({ connection: "Live updates unavailable" });
    }).catch(() => { this.setStatus({ connection: "Reconnecting…" }); });
  }

  private receive = ({ payload }: { payload: unknown }) => {
    if (!payload || typeof payload !== "object" || JSON.stringify(payload).length > NOTES_WIRE_LIMIT) return;
    const message = payload as Record<string, unknown>;
    if (message.v !== 1) return;
    try {
      if (message.event === "saved") { if (typeof message.seq === "number" && message.seq > this.bootstrap.notesDocSeq) void this.reconcile().catch(() => {}); return; }
      if (message.event === "sync" && typeof message.vector === "string" && message.vector.length < 8192 && typeof message.sender === "number") {
        this.send({ v: 1, event: "update", recipient: message.sender, update: bytes64(Y.encodeStateAsUpdate(this.doc, from64(message.vector))), awareness: bytes64(encodeAwarenessUpdate(this.awareness, [this.doc.clientID])) });
        return;
      }
      if (message.recipient !== undefined && message.recipient !== this.doc.clientID) return;
      if (typeof message.update === "string") applyPeerUpdate(this.doc, from64(message.update), REMOTE);
      if (typeof message.awareness === "string" && message.awareness.length <= 5500) {
        // Validate in an isolated Awareness before it reaches editor decorations.
        const scratch = new Y.Doc();
        const probe = new Awareness(scratch);
        try {
          applyAwarenessUpdate(probe, from64(message.awareness), REMOTE);
          for (const [id, state] of probe.getStates()) {
            if (id === scratch.clientID) continue;
            const user = state.user;
            if (!user || typeof user.name !== "string" || user.name.length > 80 || !Number.isSafeInteger(user.actorId)
              || user.color !== noteColor(user.actorId) || user.colorLight !== `${noteColor(user.actorId)}33`) return;
            if (state.cursor != null) {
              for (const relative of [state.cursor.anchor, state.cursor.head]) {
                if (!relative || typeof relative !== "object") return;
                // Resolve once before the binding constructs selection widgets.
                Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(relative), this.doc);
              }
            }
          }
        } finally { probe.destroy(); scratch.destroy(); }
        applyAwarenessUpdate(this.awareness, from64(message.awareness), REMOTE);
        for (const [id, state] of this.awareness.getStates()) {
          const old = this.latestTyping.get(id);
          if (typeof state.typingPulse === "number" && old?.pulse !== state.typingPulse) this.latestTyping.set(id, { pulse: state.typingPulse, received: Date.now() });
        }
      }
    } catch { /* Invalid cooperative peer payloads are ignored, never rendered. */ }
  };

  private async connect() {
    if (this.channel || this.destroyed || !this.bootstrap.realtime) return;
    await this.client.realtime.setAuth();
    if (this.destroyed) return;
    this.channel = this.client.channel(this.bootstrap.topic, { config: { private: true, broadcast: { self: false } } });
    this.channel.on("broadcast", { event: "notes" }, this.receive).subscribe(status => {
      if (this.destroyed) return;
      this.connected = status === "SUBSCRIBED";
      this.setStatus({ connection: this.connected ? "Live" : "Live updates unavailable" });
      if (this.connected) {
        this.awarenessDirty = true; this.scheduleWire();
        void this.reconcile().catch(() => {});
        this.send({ v: 1, event: "sync", sender: this.doc.clientID, vector: bytes64(Y.encodeStateVector(this.doc)) });
      }
    });
  }

  private disconnect() {
    this.connected = false;
    if (this.channel) void this.client.removeChannel(this.channel);
    this.channel = undefined;
    this.updates = [];
    this.bufferedBytes = 0;
  }

  private applyServer(value: NotesSnapshot) {
    // Responses may be reordered between polling and saving.
    Y.applyUpdate(this.doc, from64(value.notesDoc), SERVER);
    if (value.notesDocSeq >= this.bootstrap.notesDocSeq) {
      this.bootstrap = { ...this.bootstrap, ...value }; this.lastSnapshot = value; this.onSaved(value);
    }
  }

  reconcile(): Promise<void> {
    if (this.fetching) return this.fetching;
    this.fetching = this.request<NotesSnapshot | { unchanged: true }>(`?afterSeq=${this.bootstrap.notesDocSeq}`).then(value => {
      if (!this.destroyed && !("unchanged" in value)) this.applyServer(value);
    }).catch(error => {
      if ([401, 403, 404].includes((error as { status?: number }).status ?? 0)) {
        this.ready = false; this.queue.dispose(); this.disconnect(); this.setStatus({ connection: "Access unavailable", error: "Reopen the meeting to check access." });
      }
      throw error;
    }).finally(() => { this.fetching = null; });
    return this.fetching;
  }

  collaborators(): Collaborator[] {
    return [...this.awareness.getStates()].filter(([id]) => id !== this.doc.clientID).flatMap(([clientId, state]) => {
      if (!state.user) return [];
      return [{ clientId, actorId: state.user.actorId as number, name: String(state.user.name).slice(0, 80), color: noteColor(state.user.actorId),
        typing: !!state.typing && Date.now() - (this.latestTyping.get(clientId)?.received ?? 0) < 4000 }];
    });
  }

  private onVisibility = () => {
    if (document.hidden) { this.stopTyping(); void this.queue.flush().catch(() => {}); this.disconnect(); }
    else this.onOnline();
  };
  private onOnline = () => { if (this.ready) { void this.connect().catch(() => {}); void this.reconcile().catch(() => {}); void this.queue.flush().catch(() => {}); } };
  private onOffline = () => { this.stopTyping(); this.disconnect(); this.setStatus({ connection: "Offline" }); };

  async flush() { if (!this.ready) throw new Error("Notes are not ready to save."); await this.queue.flush(); return this.lastSnapshot ?? this.bootstrap; }

  /** Finish the captured session independently of a later URL or mounted editor. */
  async close() {
    this.stopTyping();
    try { await Promise.race([this.queue.flush(), new Promise(resolve => setTimeout(resolve, 15_000))]); }
    catch { /* IndexedDB retains the document for authorized recovery next open. */ }
    this.destroy();
  }

  destroy() {
    this.destroyed = true; this.ready = false; this.queue.dispose();
    clearTimeout(this.wireTimer); clearTimeout(this.typingTimer); clearInterval(this.poll); clearInterval(this.peopleTimer);
    this.awareness.setLocalState(null);
    this.send({ v: 1, event: "update", awareness: bytes64(encodeAwarenessUpdate(this.awareness, [this.doc.clientID])) });
    this.disconnect(); this.authSubscription?.unsubscribe();
    document.removeEventListener("visibilitychange", this.onVisibility); window.removeEventListener("online", this.onOnline); window.removeEventListener("offline", this.onOffline);
    this.doc.off("update", this.onUpdate); this.awareness.off("update", this.onAwareness);
    this.awareness.destroy(); void this.persistence?.destroy(); this.doc.destroy(); this.listeners.clear();
  }
}
