// The help centre's frame: the site's own top bar and footer — the same ones
// /pricing, /blog and /contact wear — around every /help page, so it reads as
// part of the site rather than a standalone app. Help's own navigation lives in
// the pages (the index hero, the help card beside each article); what they
// share (the "/" shortcut, the phone help sheet) is HelpShell.
//
// Public and signed-out readable: no data access anywhere in this tree.
import type { ReactNode } from "react";

import "./help.css";

import { landingFontClass } from "../components/landing/fonts";
import { PublicNav } from "../components/landing/PublicChrome";
import { Footer } from "../components/landing/sections/Footer";
import { HelpShell } from "./HelpShell";
import { HELP_THEME_BOOT } from "./ThemeSeg";

export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the boot script below stamps data-hc-theme
    // before hydration, so the server's markup never carries it.
    <div className={`hc ${landingFontClass}`} suppressHydrationWarning>
      {/* Runs during parse, before paint, so a dark-paper reader never sees a
          flash of light paper. Keyed to this root, not <html> (see help.css). */}
      <script dangerouslySetInnerHTML={{ __html: HELP_THEME_BOOT }} />
      <PublicNav here="help" />
      {children}
      <Footer />
      <HelpShell />
    </div>
  );
}
