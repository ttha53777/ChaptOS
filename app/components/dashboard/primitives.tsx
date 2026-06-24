import React, { useEffect, useId, useRef } from "react";
import type { BrotherStatus, TaskStatus, Task } from "../../data";
import { BROTHER_STYLES, TASK_STYLES, TASK_URGENCY_STYLES } from "./styles";
import { taskUrgency } from "@/lib/tasks/urgency";

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

// Badge for the unified Task model: "done" tasks read Done; open tasks read their
// computed urgency (overdue/urgent/due soon/upcoming/open).
export function TaskUrgencyBadge({ task }: { task: Pick<Task, "status" | "dueDate"> }) {
  const key = task.status === "done" ? "done" : taskUrgency(task.dueDate);
  const { label, cls } = TASK_URGENCY_STYLES[key];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide ${cls}`}>
      {label}
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

export function Modal({ title, onClose, children, tone = "slate", dismissable = true, maxWidthClass = "max-w-md" }: {
  /** Header text. When omitted/empty the header bar is dropped entirely (body-only
   *  modal) — but the ✕ button rides along in the header, so a dismissable modal
   *  with no title still gets a minimal header bar carrying just the close button. */
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Panel palette. "slate" (default) is the operations theme; "dusk" matches the
   *  warm dashboard/timeline surface (dashboard-ledger.css) — use it for modals
   *  whose body is themed dusk so the panel and header don't read as old colors. */
  tone?: "slate" | "dusk";
  /** When false, the modal is a hard block: no ✕ button, backdrop clicks are
   *  inert, and Escape is ignored. The only way out is whatever action the body
   *  provides. Used by the no-active-semester gate. Default true (normal modal). */
  dismissable?: boolean;
  /** Tailwind max-width class for the panel. Defaults to "max-w-md" (28rem); pass
   *  e.g. "max-w-lg" for a slightly roomier dialog. */
  maxWidthClass?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dusk = tone === "dusk";

  useEffect(() => {
    // Save the previously-focused element so we can restore on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) {
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
  }, [onClose, dismissable]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={dismissable ? onClose : undefined} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`card-premium-elevated relative w-full ${maxWidthClass} rounded-2xl border outline-none ${
          dusk ? "border-[rgba(236,231,221,0.1)] bg-[#0f0d0a]" : "border-white/[0.08] bg-[#10121a]"
        }`}
      >
        {(title || dismissable) && (
          <div className={`flex items-center justify-between border-b px-6 py-4 ${dusk ? "border-[rgba(236,231,221,0.07)]" : "border-white/[0.07]"}`}>
            <h3 id={titleId} className={`text-[15px] font-semibold ${dusk ? "text-[#ece7dd]" : "text-white"}`}>{title}</h3>
            {dismissable && (
              <button onClick={onClose} aria-label="Close dialog" className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors sm:h-7 sm:w-7 ${dusk ? "text-[#958d7c] hover:bg-[rgba(236,231,221,0.08)] hover:text-[#ece7dd]" : "text-slate-500 hover:bg-white/[0.08] hover:text-white"}`}>
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function FieldLabel({ children, htmlFor, tone = "slate" }: { children: React.ReactNode; htmlFor?: string; tone?: "slate" | "dusk" }) {
  return <label htmlFor={htmlFor} className={`mb-1 block text-[12px] font-medium ${tone === "dusk" ? "text-[#958d7c]" : "text-slate-400"}`}>{children}</label>;
}

/**
 * Inline save-state indicator. Used next to autosave-driven editors
 * (e.g. chapter meeting notes). For one-shot mutations, prefer the toast
 * system via `useToast()` instead.
 */
export type SaveState = "idle" | "saving" | "saved" | "error";

export function SaveIndicator({ state, tone = "slate" }: { state: SaveState; tone?: "slate" | "dusk" }) {
  const dusk = tone === "dusk";
  if (state === "idle") return null;
  if (state === "saving") return (
    <span className={`flex items-center gap-1 text-[11px] ${dusk ? "text-[#958d7c]" : "text-slate-500"}`} role="status" aria-live="polite">
      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Saving…
    </span>
  );
  if (state === "saved") return (
    <span className={`flex items-center gap-1 text-[11px] ${dusk ? "text-[#7fb08a]" : "text-emerald-400"}`} role="status" aria-live="polite">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Saved
    </span>
  );
  return <span className={`text-[11px] ${dusk ? "text-[#d98ba3]" : "text-red-400"}`} role="status" aria-live="polite">Save failed</span>;
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
  tone = "slate",
}: {
  size?: "sm" | "md" | "lg";
  /** Visually hidden by default; pass `showLabel` to render it. */
  label?: string;
  /** Optional wrapper className for layout (e.g. centering). */
  className?: string;
  /** "dusk" matches the Chapter Ledger redesign; "slate" (default) is operations. */
  tone?: "slate" | "dusk";
}) {
  const dim = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-12 w-12" : "h-8 w-8";
  return (
    <div className={`flex items-center justify-center ${className}`} role="status" aria-live="polite">
      <svg className={`${dim} animate-spin ${tone === "dusk" ? "text-[#6b6354]" : "text-slate-600"}`} fill="none" viewBox="0 0 24 24" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Delete", onConfirm, onCancel, tone = "slate" }: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Panel palette. "dusk" matches the Chapter Ledger redesign (warm paper,
   *  rose semantics); "slate" (default) keeps the operations theme. */
  tone?: "slate" | "dusk";
}) {
  const dusk = tone === "dusk";
  return (
    <Modal title={title} tone={tone} onClose={onCancel}>
      <div className="space-y-4">
        <p className={`text-[13px] leading-relaxed ${dusk ? "text-[#c9c2b4]" : "text-slate-300"}`}>{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className={
              dusk
                ? "rounded-lg border border-[rgba(236,231,221,0.12)] px-4 py-1.5 text-[13px] text-[#958d7c] hover:border-[rgba(236,231,221,0.24)] hover:text-[#ece7dd] transition-colors"
                : "rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors"
            }
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={
              dusk
                ? "rounded-lg bg-[#d98ba3] px-4 py-1.5 text-[13px] font-semibold text-[#0f0d0a] hover:bg-[#e8b0c2] transition-colors"
                : "rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-red-500 transition-colors"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
