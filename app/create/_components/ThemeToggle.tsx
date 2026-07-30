/**
 * The ivory/dusk switch in the flow's top-right chrome.
 *
 * Deliberately NOT part of icons.tsx: that file's ICON_PATHS is typed
 * Record<PermAreaId, string> — one icon per ability area — so adding sun/moon
 * there would break its exhaustive typing. Same drawing idiom though (24-box,
 * 1.6 stroke, currentColor, hand-authored paths), since the repo ships no icon
 * library.
 *
 * Both glyphs are always in the DOM and CSS picks one, keyed on
 * html[data-crf-theme] — so the correct icon is in the FIRST painted frame,
 * before React has hydrated. `theme` is only used for the accessible pressed
 * state, and is null until the mount effect runs (see useCreateTheme).
 */

import type { CrfTheme } from "@/lib/onboarding/create-theme";

const SUN =
  '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>';

const MOON = '<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>';

function Glyph({ className, paths }: { className: string; paths: string }) {
  return (
    <span className={className}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        dangerouslySetInnerHTML={{ __html: paths }}
      />
    </span>
  );
}

export function ThemeToggle({ theme, onToggle }: { theme: CrfTheme | null; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="theme-btn"
      onClick={onToggle}
      // A stable name + aria-pressed, rather than a name that flips with state:
      // a toggle that changes both gets announced twice over.
      aria-label="Light theme"
      aria-pressed={theme === null ? undefined : theme === "ivory"}
      title={theme === "ivory" ? "Dark theme (T)" : "Light theme (T)"}
    >
      <Glyph className="ti i-sun" paths={SUN} />
      <Glyph className="ti i-moon" paths={MOON} />
    </button>
  );
}
