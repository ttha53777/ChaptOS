"use client";

// Dictation for the Ask Chapt composer: speak a question instead of typing it.
// This is the browser's own speech recognition (Web Speech API) — the audio
// goes to the browser vendor's recogniser (Google in Chrome, Apple in Safari),
// never to our server or to OpenAI. We only ever see the resulting text, and
// only once the user sends it like any typed question.
//
// Deliberately absent where it can't earn its place: Firefox has no
// SpeechRecognition, and on a touch device the OS keyboard already carries a
// dictation key that works better than the web one, so `supported` is false
// on both and the composer renders no button.

import { useCallback, useEffect, useRef, useState } from "react";

// lib.dom doesn't type SpeechRecognition on every TS version — the slice we use.
interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** What to tell the user for a recogniser error; null for the ones that aren't worth a word. */
function errorNote(code: string): string | null {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked for this site. Allow it in your browser to dictate.";
    case "audio-capture":
      return "No microphone found.";
    case "network":
      return "Dictation needs a connection.";
    case "no-speech":
    case "aborted":
      return null;
    default:
      return "Dictation stopped. Try again.";
  }
}

/**
 * `onText` receives the whole composer value on every result: whatever was in
 * the box when listening began, plus everything heard so far. Interim words
 * arrive live and may be revised until the speaker pauses.
 */
export function useDictation(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; });

  // Detected after mount so the server render and first client render agree.
  useEffect(() => {
    const touch = !!window.matchMedia?.("(pointer: coarse)").matches;
    setSupported(!!recognitionCtor() && !touch);
  }, []);

  /** Stop and discard: nothing heard after this reaches the composer. */
  const cancel = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    rec.onresult = rec.onerror = rec.onend = null;
    try { rec.abort(); } catch { /* already ended */ }
    setListening(false);
  }, []);

  /** Stop listening but let the recogniser deliver what it has already heard. */
  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already ended */ }
  }, []);

  const start = useCallback((base: string) => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    cancel();
    setError(null);

    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = false; // a pause ends it — questions are a sentence or two
    rec.interimResults = true;
    const lead = base && !/\s$/.test(base) ? `${base} ` : base;
    rec.onresult = e => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      onTextRef.current(lead + heard.trimStart());
    };
    rec.onerror = e => setError(errorNote(e.error));
    rec.onend = () => {
      if (recRef.current === rec) recRef.current = null;
      setListening(false);
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
      setError(errorNote("unknown"));
    }
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  return { supported, listening, error, start, stop, cancel };
}
