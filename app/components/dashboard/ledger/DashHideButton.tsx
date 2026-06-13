import React from "react";

/**
 * Warm-theme "hide this widget" affordance for the redesigned dashboard pane.
 * Mirrors widgets.tsx `WidgetHideButton` (admin-gated by the caller, stops
 * propagation so it doesn't trigger a clickable widget) but styled via the
 * scoped `.widget-hide` class. Reveals on hover of a `.dash-group` (or `.measure`)
 * ancestor.
 */
export function DashHideButton({ label, onHide }: { label: string; onHide: () => void }) {
  return (
    <button
      type="button"
      className="widget-hide"
      aria-label={`Hide ${label}`}
      title={`Hide ${label}`}
      onClick={(e) => { e.stopPropagation(); onHide(); }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      </svg>
    </button>
  );
}
