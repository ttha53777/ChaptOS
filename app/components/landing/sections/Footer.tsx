import { BrandMark } from "../DoodleSprite";

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot__grid">
          <div className="foot__brand">
            <a className="brand" href="#top">
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
                <a href="#ask">Ask Chapt</a>
              </li>
              <li>
                <a href="#modules">Treasury &amp; dues</a>
              </li>
              <li>
                <a href="#modules">Roster &amp; standing</a>
              </li>
              <li>
                <a href="#day">Timeline &amp; meetings</a>
              </li>
              <li>
                <a href="#modules">Docs &amp; activity</a>
              </li>
            </ul>
          </div>
          <div>
            <h5>For</h5>
            <ul>
              <li>
                <a href="#setup">Fraternities &amp; sororities</a>
              </li>
              <li>
                <a href="#setup">Club &amp; intramural teams</a>
              </li>
              <li>
                <a href="#setup">Service &amp; volunteer orgs</a>
              </li>
              <li>
                <a href="#setup">Bands, choirs &amp; theatre</a>
              </li>
              <li>
                <a href="#setup">Student government</a>
              </li>
              <li>
                <a href="#setup">Advisors &amp; campus life</a>
              </li>
            </ul>
          </div>
          <div>
            <h5>Company</h5>
            <ul>
              <li>
                <a href="/trust">Trust &amp; privacy</a>
              </li>
              <li>
                <a href="#start">Pricing</a>
              </li>
              <li>
                <a href="#">Help center</a>
              </li>
              <li>
                <a href="#">Talk to a human</a>
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
