import React, { useEffect, useId, useRef } from "react";
import type { BrotherStatus, TaskStatus } from "../../data";
import { BROTHER_STYLES, TASK_STYLES } from "./styles";

export function StatusBadge({ status }: { status: BrotherStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide ${BROTHER_STYLES[status].badge}`}>
      {status}
    </span>
  );
}

export function TaskBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide ${TASK_STYLES[status]}`}>
      {status}
    </span>
  );
}

export function Card({ children, className = "", id, onClick, style }: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div id={id} onClick={onClick} style={style} className={`card-premium rounded-2xl border border-white/[0.06] bg-[#10121a] ${className}`}>
      {children}
    </div>
  );
}

/** Selector matching every focusable element inside the modal. */
const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    // Save the previously-focused element so we can restore on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      // Focus trap: keep Tab / Shift-Tab inside the modal.
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => !el.hasAttribute("aria-hidden"));
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);

    // Move focus to the first focusable inside the modal on mount.
    // Fallback to the panel itself (which is tabIndex=-1) so focus is at least
    // inside the dialog for screen readers.
    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }

    return () => {
      document.removeEventListener("keydown", handler);
      // Restore focus to the trigger so keyboard users land where they were.
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="card-premium-elevated relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#10121a] outline-none"
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
          <h3 id={titleId} className="text-[15px] font-semibold text-white">{title}</h3>
          <button onClick={onClose} aria-label="Close dialog" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.08] hover:text-white transition-colors sm:h-7 sm:w-7">
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1 block text-[12px] font-medium text-slate-400">{children}</label>;
}

/**
 * Inline save-state indicator. Used next to autosave-driven editors
 * (e.g. chapter meeting notes). For one-shot mutations, prefer the toast
 * system via `useToast()` instead.
 */
export type SaveState = "idle" | "saving" | "saved" | "error";

export function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving") return (
    <span className="flex items-center gap-1 text-[11px] text-slate-500" role="status" aria-live="polite">
      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Saving…
    </span>
  );
  if (state === "saved") return (
    <span className="flex items-center gap-1 text-[11px] text-emerald-400" role="status" aria-live="polite">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Saved
    </span>
  );
  return <span className="text-[11px] text-red-400" role="status" aria-live="polite">Save failed</span>;
}

/**
 * Standard loading spinner. Use for full-section "fetching…" states.
 * For inline autosave indicators, use <SaveIndicator/>.
 * For tiny in-button busy states, hand-roll the SVG inline.
 *
 * Sizes map to the three usages we have today:
 *   - sm (h-4 w-4) for inline button text
 *   - md (h-8 w-8) for section-level loading
 *   - lg (h-12 w-12) for full-page initial loads
 */
export function LoadingSpinner({
  size = "md",
  label = "Loading",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  /** Visually hidden by default; pass `showLabel` to render it. */
  label?: string;
  /** Optional wrapper className for layout (e.g. centering). */
  className?: string;
}) {
  const dim = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-12 w-12" : "h-8 w-8";
  return (
    <div className={`flex items-center justify-center ${className}`} role="status" aria-live="polite">
      <svg className={`${dim} animate-spin text-slate-600`} fill="none" viewBox="0 0 24 24" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Delete", onConfirm, onCancel }: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-slate-300">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-red-500 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
