// The help centre's frame: the app's Paper sidebar (topics, the current
// article's section, search, light/dark) around every /help page. A layout
// rather than per-page chrome so the sidebar — and its scroll position — stays
// put while you move between articles.
//
// Public and signed-out readable: no data access anywhere in this tree.
import type { ReactNode } from "react";

import "./help.css";

import { landingFontClass } from "../components/landing/fonts";
import { HelpShell, HELP_THEME_BOOT } from "./HelpShell";

export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the boot script below stamps data-hc-theme
    // before hydration, so the server's markup never carries it.
    <div className={`hc ${landingFontClass}`} suppressHydrationWarning>
      {/* Runs during parse, before paint, so a dark-paper reader never sees a
          flash of light paper. Keyed to this root, not <html> (see help.css). */}
      <script dangerouslySetInnerHTML={{ __html: HELP_THEME_BOOT }} />
      <HelpShell>{children}</HelpShell>
    </div>
  );
}
