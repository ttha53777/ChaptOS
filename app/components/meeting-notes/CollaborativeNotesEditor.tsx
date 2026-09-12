"use client";
import { useEffect, useRef, useState, useImperativeHandle, type Ref } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { NotesSession, type NotesStatus, type Collaborator } from "@/app/lib/collaboration/notes-session";
import { NOTES_TEXT_LIMIT, type NotesSnapshot } from "@/lib/collaboration/notes-protocol";
import { NotesTyping } from "./NotesCollaborators";
import "./notes-editor.css";

export interface NotesEditorHandle { flush(): Promise<NotesSnapshot>; }
export default function CollaborativeNotesEditor({ eventId, slug, ref, onSaved, onState, onPeers }: {
  eventId: number; slug: string; ref?: Ref<NotesEditorHandle>;
  onSaved: (value: NotesSnapshot) => void;
  onState: (state: NotesStatus) => void;
  onPeers: (peers: Collaborator[]) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<NotesSession | null>(null);
  const callbacks = useRef({ onSaved, onState, onPeers }); callbacks.current = { onSaved, onState, onPeers };
  const [status, setStatus] = useState<NotesStatus>({ saving: "loading", connection: "Connecting…" });
  const [peers, setPeers] = useState<Collaborator[]>([]);
  const [limitError, setLimitError] = useState("");
  useImperativeHandle(ref, () => ({ flush: async () => {
    if (!sessionRef.current) throw new Error("Notes are still loading.");
    return sessionRef.current.flush();
  } }), []);

  useEffect(() => {
    let cancelled = false;
    let view: EditorView | undefined;
    const session = new NotesSession(eventId, slug, value => callbacks.current.onSaved(value));
    sessionRef.current = session;
    const unsubscribe = session.subscribe(() => {
      if (cancelled) return;
      const nextPeers = session.collaborators();
      setPeers(nextPeers); callbacks.current.onPeers(nextPeers);
      setStatus(session.status); callbacks.current.onState(session.status);
      if (view && !session.editable) { view.destroy(); view = undefined; }
    });
    void session.start().then(() => {
      if (cancelled || !host.current) return;
      view = new EditorView({ parent: host.current, state: EditorState.create({
        doc: session.doc.getText("notes").toString(),
        extensions: [EditorView.lineWrapping, placeholder("Start typing meeting minutes…"), keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
          yCollab(session.doc.getText("notes"), session.awareness),
          EditorView.contentAttributes.of({ "aria-label": "Meeting minutes", spellcheck: "true", autocapitalize: "sentences" }),
          EditorState.changeFilter.of(transaction => {
            if (transaction.newDoc.length <= NOTES_TEXT_LIMIT || transaction.newDoc.length < transaction.startState.doc.length) return true;
            setLimitError("Notes are limited to 50,000 characters. Remove some text before adding more.");
            return false;
          }),
          EditorView.domEventHandlers({ blur: () => { session.stopTyping(); return false; } }),
        ],
      }) });
      view.focus();
    }).catch(error => {
      if (!cancelled) { const next: NotesStatus = { saving: "error", connection: "Unavailable", error: error instanceof Error ? error.message : "Couldn't open notes." }; setStatus(next); callbacks.current.onState(next); }
    });
    return () => { cancelled = true; unsubscribe(); view?.destroy(); sessionRef.current = null; void session.close(); };
  }, [eventId, slug]);

  const hasError = !!status.error || !!limitError;
  return <div className="collaborative-notes">
    <div className="notes-label-row"><p>Meeting Minutes</p><NotesTyping peers={peers} /></div>
    {status.saving === "loading" && <p role="status" className="notes-status">Opening shared notes…</p>}
    <div ref={host} className="notes-editor-host" />
    <div className="notes-status" role="status" aria-live="polite">
      {status.connection !== "Live" && <span>{status.connection} · </span>}
      {status.error ?? (status.saving === "saved" ? "Saved" : status.saving === "loading" ? "" : status.saving === "error" ? "Not saved" : "Saving…")}
      {limitError && <span> {limitError}</span>}
      {hasError && <><button onClick={() => { setLimitError(""); void sessionRef.current?.flush().catch(() => {}); }}>Retry</button><button onClick={() => { const text = sessionRef.current?.doc.getText("notes").toString(); if (text !== undefined) void navigator.clipboard.writeText(text); }}>Copy notes</button></>}
    </div>
  </div>;
}
