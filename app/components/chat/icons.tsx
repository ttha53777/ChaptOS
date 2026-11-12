// Outlined, heroicons-style icon set for the Spotlight — mirrors the mock's
// `ic` map (_design/Ask Chapt Spotlight v3.html) so the rendered widget and
// the design stay glyph-for-glyph. All decorative: aria-hidden throughout.

interface IconProps { size?: number; className?: string }

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IcSpark({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} stroke="none">
      <path d="M12 3l1.5 5L18 9.5 13.5 11 12 16l-1.5-5L6 9.5 10.5 8 12 3z" fill="currentColor" />
    </svg>
  );
}

export function IcChev({ size = 13, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={2}><path d="M9 6l6 6-6 6" /></svg>;
}

/** Leaving-for-a-screen affordance on an advisory row — distinct from IcChev,
 *  which means "opens a record here". */
export function IcArrow({ size = 13, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={2}><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

export function IcTick({ size = 14, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={2.4}><path d="M5 13l4 4L19 7" /></svg>;
}

export function IcCoin({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.7}>
      <circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 10.2h3.2a1.8 1.8 0 010 3.6H9.5" />
    </svg>
  );
}

export function IcUsers({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.7}>
      <path d="M16 20v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 18.5V20M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM20 20v-1.5a3.5 3.5 0 00-2.6-3.4M15 4.2a3.5 3.5 0 010 6.6" />
    </svg>
  );
}

export function IcCal({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.7}>
      <rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  );
}

export function IcClock({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.7}>
      <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IcFlag({ size = 15, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={1.7}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>;
}

export function IcAlert({ size = 15, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={1.9}><path d="M12 4l9 15.4H3L12 4zM12 10v4.2M12 16.9v.1" /></svg>;
}

export function IcCompass({ size = 15, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={1.9}><circle cx="12" cy="12" r="8.6" /><path d="M15.4 8.6l-2 4.8-4.8 2 2-4.8 4.8-2z" /></svg>;
}

export function IcRedo({ size = 14, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={2}><path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.3M19.6 4.4v4.2h-4.2" /></svg>;
}

export function IcDot({ size = 15, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={1.7}><circle cx="12" cy="12" r="8.5" /><path d="M12 12h.01" /></svg>;
}

export function IcLock({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.8}>
      <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

export function IcThumbUp({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.8}>
      <path d="M7 11v9M7 11l4-8a2 2 0 012 1.4l-.8 4.6H19a2 2 0 012 2.3l-1.2 6A2 2 0 0117.8 20H7" />
    </svg>
  );
}

export function IcThumbDown({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.8}>
      <path d="M17 13V4M17 13l-4 8a2 2 0 01-2-1.4l.8-4.6H5a2 2 0 01-2-2.3l1.2-6A2 2 0 016.2 4H17" />
    </svg>
  );
}

export function IcStop({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} stroke="none">
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
    </svg>
  );
}

export function IcSend({ size = 17, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={2}><path d="M12 19V5M12 5l-6 6M12 5l6 6" /></svg>;
}

/** "Draft this here" affordance on a suggested-event row — a plus, not an arrow:
 *  the row adds something rather than going somewhere. */
export function IcPlus({ size = 13, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>;
}

export function IcPin({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.7}>
      <path d="M12 21s6.5-6.2 6.5-11a6.5 6.5 0 10-13 0C5.5 14.8 12 21 12 21z" /><circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

export function IcText({ size = 15, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={1.7}><path d="M5 7h14M5 12h14M5 17h9" /></svg>;
}

/** Glyph for a result/approval row by its kind. */
/** Attach a file — the composer's paperclip. */
export function IcClip({ size = 17, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={1.8}><path d="M20 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.6-8.6a3.4 3.4 0 014.8 4.8l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" /></svg>;
}

/** Dictate — the composer's microphone. */
export function IcMic({ size = 17, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={1.8}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" /></svg>;
}

/** A document — an attached file's chip and citation. */
export function IcFile({ size = 14, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={1.8}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>;
}

/** A spreadsheet — the grid variant of IcFile. */
export function IcSheet({ size = 14, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={1.8}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M4 15h16M10 4v16" /></svg>;
}

export function IcX({ size = 12, className }: IconProps) {
  return <svg {...base(size)} className={className} strokeWidth={2.2}><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

export function KindGlyph({ kind, size = 15 }: { kind: string; size?: number }) {
  switch (kind) {
    case "money":
    case "dues":
    case "treasury":    return <IcCoin size={size} />;
    case "event":
    case "events":
    case "parties":
    case "programming": return <IcFlag size={size} />;
    case "task":
    case "tasks":
    case "timeline":
    case "attendance":  return <IcCal size={size} />;
    case "instagram":   return <IcClock size={size} />;
    case "person":
    case "roster":
    case "service":     return <IcUsers size={size} />;
    // Advisory rows resolve their glyph from a screen label (see glyphKind in
    // AnswerBlock), so the screens with no natural icon land on the tick — a
    // settled/configured mark — rather than an anonymous dot.
    case "dashboard":
    case "settings":
    case "docs":        return <IcTick size={size} />;
    default:            return <IcDot size={size} />;
  }
}
