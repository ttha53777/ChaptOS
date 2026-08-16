"use client";

/**
 * Shared programming chips: the type badge/dot and the wrap-up star rating.
 *
 * Was PrepStatusPill.tsx, whose namesake export — a dropdown for the room-booking
 * status — went away with the prep booleans in the v3 field model. Room status was
 * one org's ops form applied to every org, and self-attested besides.
 */

/**
 * A type's dot, coloured from the org's own event-type row.
 *
 * The four hardcoded label→class maps this replaced ("Program", "Social", …)
 * meant any renamed or org-defined type rendered grey. Colour now arrives as an
 * inline custom property so the palette is the org's, not the platform's.
 */
export function TypeDot({ hex, className = "" }: { hex: string; className?: string }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${className}`}
      style={{ background: hex }}
    />
  );
}

export function TypeBadge({ label, hex }: { label: string; hex: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset"
      // 14%/30% alpha over the type's own hue keeps every chip legible on dusk
      // without needing a hand-picked class per type.
      style={{ background: `${hex}14`, color: hex, boxShadow: `inset 0 0 0 1px ${hex}30` }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: hex }} />
      {label}
    </span>
  );
}

export function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange?.(value === n ? null : n)}
          className={`text-[14px] leading-none transition-colors ${disabled ? "cursor-default" : "cursor-pointer hover:scale-110"} ${value != null && n <= value ? "text-[#d9b08b]" : "text-[#4a4439]"}`}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
