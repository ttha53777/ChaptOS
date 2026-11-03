import { BrandMark } from "../DoodleSprite";

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot__grid">
          <div className="foot__brand">
            <a className="brand" href="/">
              <BrandMark />
              ChaptOS
            </a>
            <p className="foot__blurb">
              The operating system for student orgs. The roster, the money, the week and the
              record — in one place you can just ask.
            </p>
          </div>
          <div>
            <h5>Product</h5>
            <ul>
              <li>
                <a href="/#ask">Ask Chapt</a>
              </li>
              <li>
                <a href="/#how">How it works</a>
              </li>
              <li>
                <a href="/#fit">Who it&apos;s for</a>
              </li>
              <li>
                <a href="/create">Start your org</a>
              </li>
            </ul>
          </div>
          <div>
            <h5>Resources</h5>
            <ul>
              <li>
                <a href="/help">Help center</a>
              </li>
              <li>
                <a href="/blog">Blog</a>
              </li>
              <li>
                <a href="/#faq">FAQ</a>
              </li>
              <li>
                <a href="/login">Sign in</a>
              </li>
            </ul>
          </div>
          <div>
            <h5>Company</h5>
            <ul>
              <li>
                <a href="/pricing">Pricing</a>
              </li>
              <li>
                <a href="/trust">Trust &amp; privacy</a>
              </li>
              <li>
                <a href="/contact">Talk to a human</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="foot__base">
          <span>© 2026 ChaptOS</span>
          <span className="sp" />
          <span>
            Made by people who ran the meeting, took the minutes, and chased the dues.
          </span>
        </div>
      </div>
    </footer>
  );
}
