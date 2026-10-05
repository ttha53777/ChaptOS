import React, { useEffect, useId, useRef } from "react";
import type { BrotherStatus, TaskStatus, Task } from "../../data";
import { BROTHER_STYLES, TASK_STYLES, TASK_URGENCY_STYLES } from "./styles";
import { taskUrgency } from "@/lib/tasks/urgency";
import { PaperTile, type PaperIconName, type PaperTone } from "../paper/PaperIcon";

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
    <div id={id} onClick={onClick} style={style} className={`card-premium rounded-2xl border border-[rgba(var(--ink-rgb),0.06)] bg-[color:var(--card)] ${className}`}>
      {children}
    </div>
  );
}

/** Selector matching every focusable element inside the modal. */
const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

/** Paper's header tile when a caller doesn't pick one: read off the title, so
 *  every existing modal gets the mock's composer header without a per-site edit.
 *  First match wins; anything unmatched gets the plain lilac pencil. */
const PAPER_HEADS: [RegExp, PaperIconName, PaperTone][] = [
  [/delete|leave|cancel|remove/i,                      "door",    "rose"],
  [/expense|revenue|payment|budget|dues|transaction|reimburse|txn|plan/i, "wallet", "butter"],
  [/attendance|check-?in|excuse/i,                     "check",   "mint"],
  [/task|deadline|poll/i,                              "box",     "peach"],
  [/instagram|post/i,                                  "camera",  "rose"],
  [/service|hours/i,                                   "heart",   "rose"],
  [/doc|folder|move/i,                                 "folder",  "sky"],
  [/idea|wrap|board|fix/i,                             "board",   "lilac"],
  [/announcement/i,                                    "pin",     "lilac"],
  [/approve|join|member|organization/i,                "people",  "lilac"],
  [/event|meeting|semester|party|calendar/i,           "cal",     "sky"],
];
function paperHeadFor(title: string | undefined): [PaperIconName, PaperTone] {
  for (const [re, icon, tone] of PAPER_HEADS) if (title && re.test(title)) return [icon, tone];
  return ["pencil", "lilac"];
}

export function Modal({ title, ariaLabel, onClose, children, tone = "slate", dismissable = true, maxWidthClass = "max-w-md", hideHeader = false, icon, accent }: {
  /** Header text. When omitted/empty the header bar is dropped entirely (body-only
   *  modal) — but the ✕ button rides along in the header, so a dismissable modal
   *  with no title still gets a minimal header bar carrying just the close button. */
  title?: string;
  /** Accessible name for a modal whose body owns its own heading (`hideHeader`, or
   *  no `title`). Without it such a dialog is announced unnamed — which matters most
   *  for non-dismissable ones, where the focus trap gives no way out. Ignored when
   *  a rendered `title` is already providing the name. */
  ariaLabel?: string;
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
  /** Drop the header bar entirely so the body sits flush at the top; a dismissable
   *  modal keeps a subtle ✕ floating in the top-right corner. Use when the body
   *  owns its own title treatment (e.g. the poll ballot's serif question). */
  hideHeader?: boolean;
  /** Paper aesthetic only: the tilted icon tile that leads the header, as on the
   *  mock's composer sheets. Defaults from the title (see PAPER_HEADS). Ignored
   *  under Ledger. */
  icon?: PaperIconName;
  /** Paper aesthetic only: the pastel the tile and the panel's hard shadow take. */
  accent?: PaperTone;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dusk = tone === "dusk";
  // The <h3 id={titleId}> only renders when the header bar does, so pointing
  // aria-labelledby at it otherwise would dangle. Fall back to aria-label.
  const titleRendered = !hideHeader && !!title;
  const [autoIcon, autoAccent] = paperHeadFor(title ?? ariaLabel);
  const headIcon = icon ?? autoIcon;
  const headAccent = accent ?? (icon ? "lilac" : autoAccent);

  // Callers pass an inline arrow for onClose, so its identity changes on every
  // parent render. Read it through a ref: an effect that depended on it would
  // tear down and re-run on each keystroke in a modal input, and its focus
  // handling would yank focus out of the field being typed into.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Remember the trigger so focus can return to it on close. Captured during the
  // first render — by the time effects run, React has already applied a child's
  // autoFocus during commit, so activeElement would be that child, not the trigger.
  const triggerRef = useRef<HTMLElement | null>(null);
  if (triggerRef.current === null && typeof document !== "undefined") {
    triggerRef.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) {
        e.stopPropagation();
        onCloseRef.current();
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
    return () => document.removeEventListener("keydown", handler);
  }, [dismissable]);

  useEffect(() => {
    // Move focus into the modal. Prefer the first focusable in the body: the ✕
    // button lives in the header and would otherwise win, since it precedes the
    // body in DOM order. Fall back to the panel itself (tabIndex=-1) so focus is
    // at least inside the dialog for screen readers.
    const panel = panelRef.current;
    const target = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      ?? panel?.querySelector<HTMLElement>(FOCUSABLE)
      ?? panel;
    target?.focus();

    return () => {
      // Restore focus to the trigger so keyboard users land where they were.
      const trigger = triggerRef.current;
      if (trigger?.isConnected) trigger.focus?.();
    };
  }, []);

  return (
    <div className="ui-modal fixed inset-0 z-50 flex items-center justify-center p-4" data-accent={headAccent}>
      <div className="ui-modal-scrim absolute inset-0 bg-[color:var(--scrim)] backdrop-blur-md" onClick={dismissable ? onClose : undefined} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleRendered ? titleId : undefined}
        aria-label={titleRendered ? undefined : (ariaLabel ?? title)}
        tabIndex={-1}
        className={`ui-modal-panel card-premium-elevated relative flex max-h-[calc(100dvh-2rem)] w-full flex-col ${maxWidthClass} rounded-2xl border outline-none ${
          dusk ? "border-[rgba(var(--ink-rgb),0.1)] bg-[color:var(--paper)]" : "border-[rgba(var(--ink-rgb),0.08)] bg-[color:var(--card)]"
        }`}
      >
        {!hideHeader && (title || dismissable) && (
          <div className={`ui-modal-head flex shrink-0 items-center justify-between gap-3 border-b px-6 py-4 ${dusk ? "border-[rgba(var(--ink-rgb),0.07)]" : "border-[rgba(var(--ink-rgb),0.07)]"}`}>
            {title && <PaperTile icon={headIcon} tone={headAccent} />}
            <h3 id={titleId} className={`ui-modal-title text-[15px] font-semibold ${dusk ? "text-[color:var(--ink)]" : "text-[color:var(--ink)]"}`}>{title}</h3>
            {dismissable && (
              <button type="button" onClick={onClose} aria-label="Close dialog" className={`ui-modal-x flex h-10 w-10 items-center justify-center rounded-lg transition-colors sm:h-7 sm:w-7 ${dusk ? "text-[color:var(--muted)] hover:bg-[rgba(var(--ink-rgb),0.08)] hover:text-[color:var(--ink)]" : "text-[color:var(--faint)] hover:bg-[rgba(var(--ink-rgb),0.08)] hover:text-white"}`}>
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        {hideHeader && dismissable && (
          <button type="button" onClick={onClose} aria-label="Close dialog" className={`ui-modal-x absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${dusk ? "text-[color:var(--muted)] hover:bg-[rgba(var(--ink-rgb),0.08)] hover:text-[color:var(--ink)]" : "text-[color:var(--faint)] hover:bg-[rgba(var(--ink-rgb),0.08)] hover:text-white"}`}>
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <div ref={bodyRef} className="ui-modal-body min-h-0 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function FieldLabel({ children, htmlFor, tone = "slate" }: { children: React.ReactNode; htmlFor?: string; tone?: "slate" | "dusk" }) {
  return <label htmlFor={htmlFor} className={`ui-label mb-1 block text-[12px] font-medium ${tone === "dusk" ? "text-[color:var(--muted)]" : "text-[color:var(--muted)]"}`}>{children}</label>;
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
    <span className={`flex items-center gap-1 text-[11px] ${dusk ? "text-[color:var(--muted)]" : "text-[color:var(--faint)]"}`} role="status" aria-live="polite">
      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Saving…
    </span>
  );
  if (state === "saved") return (
    <span className={`flex items-center gap-1 text-[11px] ${dusk ? "text-[color:var(--ok)]" : "text-emerald-400"}`} role="status" aria-live="polite">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Saved
    </span>
  );
  return <span className={`text-[11px] ${dusk ? "text-[color:var(--rose)]" : "text-red-400"}`} role="status" aria-live="polite">Save failed</span>;
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
      <svg className={`${dim} animate-spin ${tone === "dusk" ? "text-[color:var(--faint)]" : "text-[color:var(--faint)]"}`} fill="none" viewBox="0 0 24 24" aria-hidden>
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
        <p className={`text-[13px] leading-relaxed ${dusk ? "text-[color:var(--ink-soft)]" : "text-[color:var(--ink-soft)]"}`}>{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className={"ui-btn-ghost " + (
              dusk
                ? "rounded-lg border border-[rgba(var(--ink-rgb),0.12)] px-4 py-1.5 text-[13px] text-[color:var(--muted)] hover:border-[rgba(var(--ink-rgb),0.24)] hover:text-[color:var(--ink)] transition-colors"
                : "rounded-lg border border-[rgba(var(--ink-rgb),0.08)] px-4 py-1.5 text-[13px] text-[color:var(--muted)] hover:border-[rgba(var(--ink-rgb),0.16)] hover:text-[color:var(--ink)] transition-colors"
            )}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={"ui-btn-danger " + (
              dusk
                ? "rounded-lg bg-[color:var(--rose)] px-4 py-1.5 text-[13px] font-semibold text-[color:var(--paper)] hover:bg-[color:var(--rose)]/85 transition-colors"
                : "rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-red-500 transition-colors"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
