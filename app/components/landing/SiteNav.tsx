// The site's top bar, from _design/Landing Motion Mock.html. The landing page
// and every public page render this one component (public pages through
// <PublicNav>), so the links, the buttons and the motion can't drift apart.
//
// On the landing page How it works and Features are in-page anchors, and the
// hand-drawn squiggle follows the section you're reading; elsewhere they point
// back into the landing page and the squiggle marks the page you're on.
import "./site-nav.css";

import { sx } from "./Doodle";
import { hand } from "./hand-font";
import { SignInLink } from "./SignInLink";
import { SiteNavMotion } from "./SiteNavMotion";
import { APP_NAME } from "@/lib/domains";

/** Which page link reads as "you are here". */
export type SiteNavHere = "pricing" | "blog" | null;

const SQUIGGLE = "M1 4.2C9 1.6 15 5.4 23 3.4S38 1.2 45 3.6 55 4.6 59 2.4";

export function SiteNav({ here = null, onLanding = false }: { here?: SiteNavHere; onLanding?: boolean }) {
  const home = onLanding ? "" : "/";
  const links = [
    { href: `${home}#how`, label: "How it works", c: "sky" },
    { href: `${home}#fit`, label: "Features", c: "lilac" },
    { href: "/pricing", label: "Pricing", c: "mint", id: "pricing" },
    { href: "/blog", label: "Blog", c: "peach", id: "blog", tag: "new" },
  ];
  const cur = (id?: string) => (id && id === here ? { "aria-current": "page" as const } : {});

  return (
    <header className={`sn ${hand.variable}`}>
      <div className="nav-in">
        <a className="sn-brand" href={onLanding ? "#top" : "/"}>
          <svg className="logo" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="2.5" y="4.5" width="35" height="31" rx="9" fill="var(--butter)" stroke="var(--note-ink)" strokeWidth="2.4" />
            <path d="M12 21.5c2.2 3.4 5 5 8.4 5 3.2 0 5.9-1.5 8-4.6" fill="none" stroke="var(--note-ink)" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="14.6" cy="16" r="1.9" fill="var(--note-ink)" />
            <circle cx="25.4" cy="16" r="1.9" fill="var(--note-ink)" />
          </svg>
          {APP_NAME}
        </a>
        <nav className="nav-links" aria-label="Primary">
          <span className="nl-ink" aria-hidden="true" />
          {links.map(l => (
            <a key={l.label} className={`nl${l.id && l.id === here ? " on" : ""}`} href={l.href} {...cur(l.id)}
              style={sx({ "--c": `var(--${l.c})`, "--ci": `var(--${l.c}-ink)` })}>
              <i />
              {l.label}
              {l.tag && <b className="nl-tag">{l.tag}</b>}
              <svg className="nl-u" viewBox="0 0 60 6" preserveAspectRatio="none" aria-hidden="true"><path pathLength={1} d={SQUIGGLE} /></svg>
            </a>
          ))}
        </nav>
        <div className="nav-r">
          <SignInLink className="nav-login">Log in</SignInLink>
          <a className="sn-btn sn-btn--sm" href="/create">Start your org</a>
          <button className="nav-menu" aria-label="Menu" aria-expanded={false} aria-controls="navSheet"><span /></button>
        </div>
      </div>
      <nav className="nav-sheet" id="navSheet" aria-label="Primary (mobile)">
        {links.map((l, i) => (
          <a key={l.label} className="ns-l" href={l.href} {...cur(l.id)} style={sx({ "--c": `var(--${l.c})`, "--i": i })}>
            <span className="sn-num">{String(i + 1).padStart(2, "0")}</span>
            <b>{l.label}</b>
            {l.tag && <b className="nl-tag">{l.tag}</b>}
            <i />
          </a>
        ))}
        <div className="ns-f">
          <SignInLink className="sn-btn sn-btn--ghost">Log in</SignInLink>
          <a className="sn-btn" href="/create">Start your org</a>
        </div>
      </nav>
      <SiteNavMotion />
    </header>
  );
}
