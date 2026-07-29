import { BrandMark } from "../DoodleSprite";
import { SignInLink } from "../SignInLink";

export function Nav() {
  return (
    <header className="nav" data-nav>
      <div className="wrap nav__in">
        <a className="brand" href="#top">
          <BrandMark />
          ChaptOS
        </a>
        <nav className="nav__links">
          <a href="#ask">Just ask</a>
          <a href="#day">A Tuesday</a>
          <a href="#modules">What&apos;s in it</a>
          <a href="#setup">Setup</a>
          <a href="#trust">Trust</a>
        </nav>
        <div className="nav__cta">
          <SignInLink className="btn btn--ghost btn--sm">Sign in</SignInLink>
          {/* Two labels rather than one with a trailing span: .btn is an
              inline-flex with gap:9px, so a split label renders the gap AND the
              space. CSS picks one at the 900px breakpoint, where the mock hid
              the ghost button outright — it can't here, that's Sign in now. */}
          <a className="btn btn--sm" href="/create">
            <span className="nav__long">Set up your org</span>
            <span className="nav__short">Set up</span>
          </a>
        </div>
      </div>
    </header>
  );
}
