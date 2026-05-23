"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// Stack-style toast notifications. The provider is mounted globally in
// app/layout.tsx so every page can call useToast() without wiring its own
// container. Toasts auto-dismiss after their duration; errors stay longer.
//
// Designed to fill the audit-D1 gap: most mutations today have no success
// feedback, so users mash submit twice. Use this for one-shot saves; use
// the existing <SaveIndicator/> for autosave-style continuous editing.

export type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  /** ms before auto-dismiss. Errors default to 6s; others default to 3s. */
  duration: number;
}

interface ToastContextValue {
  /** Show a success toast (3s default). */
  success: (message: string, opts?: { duration?: number }) => void;
  /** Show an error toast (6s default). */
  error:   (message: string, opts?: { duration?: number }) => void;
  /** Show a neutral info toast (3s default). */
  info:    (message: string, opts?: { duration?: number }) => void;
  /** Dismiss a toast by id (rare — usually they expire). */
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const handle = timers.current[id];
    if (handle) {
      clearTimeout(handle);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback((message: string, variant: ToastVariant, duration: number) => {
    const id = newId();
    setToasts(prev => [...prev, { id, message, variant, duration }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  // Clear any pending timers on unmount (e.g. fast-refresh in dev).
  useEffect(() => {
    const handles = timers.current;
    return () => { Object.values(handles).forEach(clearTimeout); };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({
    success: (message, opts) => push(message, "success", opts?.duration ?? 3000),
    error:   (message, opts) => push(message, "error",   opts?.duration ?? 6000),
    info:    (message, opts) => push(message, "info",    opts?.duration ?? 3000),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ─── Container ────────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      // aria-live=polite so screen readers announce new toasts without interrupting.
      // role=region with aria-label so users can navigate to the toast area.
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{
        // Lift above iOS home indicator; below the chat widget if open.
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}

const VARIANT_CLS: Record<ToastVariant, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  error:   "border-red-500/30 bg-red-500/10 text-red-100",
  info:    "border-indigo-500/30 bg-indigo-500/10 text-indigo-100",
};

const ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>,
  error:   <svg className="h-4 w-4 text-red-400"     viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>,
  info:    <svg className="h-4 w-4 text-indigo-400"  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  return (
    <div
      className={`pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl border px-3 py-2.5 text-[13px] shadow-[0_8px_28px_-10px_rgba(0,0,0,0.6)] backdrop-blur-xl ${VARIANT_CLS[toast.variant]}`}
    >
      <span className="mt-0.5 shrink-0">{ICONS[toast.variant]}</span>
      <p className="flex-1 leading-relaxed">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-md p-1 text-current/70 transition-opacity hover:opacity-100"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
