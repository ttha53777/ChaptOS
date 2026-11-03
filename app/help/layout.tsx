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

export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    // Light paper only, like every other public page.
    <div className={`hc ${landingFontClass}`}>
      <PublicNav here="help" />
      {children}
      <Footer />
      <HelpShell />
    </div>
  );
}
