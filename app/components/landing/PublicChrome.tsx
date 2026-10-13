// The site's top bar: the landing page and every public page (/blog, /for,
// /pricing, /help, /contact, /trust) render this one component, so the links,
// the buttons and the scroll behaviour can't drift apart.
//
// On the landing page the links are in-page anchors and LandingMotion also
// drives `.is-stuck`; everywhere else they point back at the landing page and
// <NavStick> drives it. Either way the bar is clear over the page head and
// frosted once you scroll.
import { BrandMark } from "./DoodleSprite";
import { NavStick } from "./NavStick";
import { SignInLink } from "./SignInLink";
import { APP_NAME } from "@/lib/domains";

/** Which nav link renders as "you are here". */
export type PublicNavHere = "for" | "help" | "pricing" | "blog" | null;

export function PublicNav({ here = null, onLanding = false }: { here?: PublicNavHere; onLanding?: boolean }) {
  const mark = (id: Exclude<PublicNavHere, null>) =>
    here === id
      ? { className: "is-here", "aria-current": "page" as const }
      : {};
  const home = onLanding ? "" : "/";

  return (
    <header className="nav" data-nav>
      {!onLanding && <NavStick />}
      <div className="wrap nav__in">
        <a className="brand" href={onLanding ? "#top" : "/"}>
          <BrandMark />
          {APP_NAME}
        </a>
        <nav className="nav__links">
          <a href={`${home}#ask`}>Just ask</a>
          <a href={`${home}#day`}>A Tuesday</a>
          <a href="/blog" {...mark("blog")}>
            Blog
          </a>
          {/* In-page on the landing page: the section answers it in five
              seconds and links through, so a visitor asking the price doesn't
              leave the funnel to find out. Elsewhere, the pricing page. */}
          <a href={onLanding ? "#price" : "/pricing"} {...mark("pricing")}>
            Pricing
          </a>
        </nav>
        <div className="nav__cta">
          <SignInLink className="btn btn--ghost btn--sm">Sign in</SignInLink>
          {/* Two labels rather than one with a trailing span: .btn is an
              inline-flex with gap:9px, so a split label renders the gap AND the
              space. CSS picks one at the 900px breakpoint. */}
          <a className="btn btn--sm" href="/create">
            <span className="nav__long">Set up your org</span>
            <span className="nav__short">Set up</span>
          </a>
        </div>
      </div>
    </header>
  );
}
