// Shared chrome for the public, non-marketing pages (/help, /help/*, /contact,
// /for, /for/*).
//
// The landing page's own <Nav> is animated: LandingMotion adds `.is-stuck` on
// scroll. These pages never mount LandingMotion, so they get the stuck treatment
// baked in by `.lp.pub .nav` in ./public-chrome.css and this component instead —
// a sticky-but-transparent bar would let text scroll underneath it.
//
// /trust predates this and keeps its own copy in trust.css (its header comment
// explains why); it's the same six declarations. If a fourth public page ever
// appears, fold /trust in here rather than adding a third copy.
import { BrandMark } from "./DoodleSprite";
import { SignInLink } from "./SignInLink";
import { APP_NAME } from "@/lib/domains";

/** Which nav link renders as "you are here". */
export type PublicNavHere = "for" | "help" | "trust" | "pricing" | null;

export function PublicNav({ here = null }: { here?: PublicNavHere }) {
  const mark = (id: Exclude<PublicNavHere, null>) =>
    here === id
      ? { className: "is-here", "aria-current": "page" as const }
      : {};

  return (
    <header className="nav">
      <div className="wrap nav__in">
        <a className="brand" href="/">
          <BrandMark />
          {APP_NAME}
        </a>
        <nav className="nav__links">
          <a href="/#ask">Just ask</a>
          <a href="/#modules">What&apos;s in it</a>
          <a href="/#setup">Setup</a>
          <a href="/for" {...mark("for")}>
            Who it&apos;s for
          </a>
          <a href="/pricing" {...mark("pricing")}>
            Pricing
          </a>
          <a href="/help" {...mark("help")}>
            Help
          </a>
          <a href="/trust" {...mark("trust")}>
            Trust
          </a>
        </nav>
        <div className="nav__cta">
          <SignInLink className="btn btn--ghost btn--sm">Sign in</SignInLink>
          <a className="btn btn--sm" href="/create">
            <span className="nav__long">Set up your org</span>
            <span className="nav__short">Set up</span>
          </a>
        </div>
      </div>
    </header>
  );
}
