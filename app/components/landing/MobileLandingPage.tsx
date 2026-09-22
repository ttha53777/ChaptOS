import { BrandMark } from "./DoodleSprite";
import { SignInLink } from "./SignInLink";
import { landingFontClass } from "./fonts";
import { BILLING_BANDS } from "@/lib/billing/tiers";
import {
  MobileAskDemo,
  MobileDemoTask,
  MobileDock,
  MobileFeatureTour,
  MobilePricing,
} from "./MobileLandingInteractions";
import "./mobile-landing.css";

const FREE_BAND = BILLING_BANDS[0];

// Server-rendered mobile story. CSS selects the layout before hydration; only
// the demos, price estimator, and scroll-aware CTA need client state.
export function MobileLandingPage() {
  return (
    <div className={`mlp ${landingFontClass}`}>
      <a className="skip" href="#mobile-main">
        Skip to content
      </a>
      <div className="page" id="mobile-top">
        <header className="topbar pad">
          <a href="#mobile-top" className="brand" aria-label="ChaptOS home">
            <BrandMark />
            ChaptOS
          </a>
          <SignInLink className="sign-in">Sign in ↗</SignInLink>
        </header>
        <main id="mobile-main">
          <section className="hero pad">
            <div className="eyebrow mono">
              <i></i>A little less admin. A lot more org.
            </div>
            <h1>
              Your whole org.
              <br />A little more
              <br />
              <mark>under control.</mark>
            </h1>
            <p className="intro">
              The dues, the plans, the “who’s doing that?” One home for
              everything your people have going on.
            </p>
            <a className="primary" id="mobile-hero-cta" href="/create">
              Set up your org — free <span aria-hidden="true">↗</span>
            </a>
            <p className="fine">
              Free for up to {FREE_BAND.upTo} people. No card needed.
            </p>
            <div className="hero-demo">
              <div className="tape" aria-hidden="true"></div>
              <article
                className="brief"
                aria-label="Interactive example organization briefing"
              >
                <div className="brief-top">
                  <span className="mono">Oozma Kappa / Today</span>
                  <span className="demo-label">DEMO</span>
                </div>
                <h3>Hey Priya, you’re on top of it.</h3>
                <p className="brief-sub">
                  Here’s what needs you. <strong>The rest can wait.</strong>
                </p>
                <div className="stats">
                  <div className="stat">
                    <small>Dues collected</small>
                    <strong>$4,820</strong>
                    <span>of $6,300 this semester</span>
                  </div>
                  <div className="stat">
                    <small>Attendance</small>
                    <strong>92%</strong>
                    <span>↑ 4.2 points this term</span>
                  </div>
                </div>
                <MobileDemoTask />
              </article>
              <p className="note">
                <span aria-hidden="true">↳</span> A little briefing. A much
                clearer day.
              </p>
            </div>
          </section>
          <div className="audience">
            <p className="mono">For people who bring people together</p>
            <div>
              <span>Chapters</span>
              <span>Clubs</span>
              <span>Teams</span>
              <span>Councils</span>
            </div>
          </div>
          <section className="section product" id="mobile-inside">
            <p className="section-label mono">01 / Everything has a home</p>
            <h2>
              Less chasing.
              <br />
              More doing.
            </h2>
            <p className="section-lede">
              Keep the details together, so your group can get back to being a
              group.
            </p>
            <MobileFeatureTour />
            <p className="all-tools">
              And the rest? Meetings, service hours, tasks, docs, and
              announcements all live here, too.
            </p>
          </section>
          <section className="section ask" id="mobile-ask">
            <span className="asterisk" aria-hidden="true">
              ✳
            </span>
            <p className="section-label mono">02 / Skip the digging</p>
            <h2>
              Big question.
              <br />
              <mark>Little effort.</mark>
            </h2>
            <p className="section-lede">
              Ask Chapt in your own words. Get an answer from your org’s actual
              records.
            </p>
            <MobileAskDemo />
            <p className="trust-note">
              <span aria-hidden="true">✓</span>It proposes. You approve. Your
              officers stay in control.
            </p>
          </section>
          <section className="section setup">
            <p className="section-label mono">03 / Make yourself at home</p>
            <h2>
              Your org.
              <br />
              Your way of doing it.
            </h2>
            <ol className="steps">
              <li>
                <span className="step-num">01</span>
                <div>
                  <h3>Tell us what you’re building.</h3>
                  <p>
                    A chapter, a club, a team. Start with the tools and language
                    that fit your people.
                  </p>
                </div>
              </li>
              <li>
                <span className="step-num">02</span>
                <div>
                  <h3>Bring your people in.</h3>
                  <p>
                    Share an invite link. Review join requests. Decide who gets
                    a seat at the table.
                  </p>
                </div>
              </li>
              <li>
                <span className="step-num">03</span>
                <div>
                  <h3>Make room for the good stuff.</h3>
                  <p>
                    Your roster, plans, and records are together. The next
                    officer starts with context.
                  </p>
                </div>
              </li>
            </ol>
          </section>
          <section className="section price" id="mobile-pricing">
            <p className="section-label mono">04 / A price that fits</p>
            <h2>
              Small start.
              <br />
              Room for everyone.
            </h2>
            <p className="section-lede">
              Start free. Your price follows your headcount, with one flat
              monthly bill.
            </p>
            <MobilePricing />
          </section>
          <section className="section faq">
            <h2>A few good questions.</h2>
            <details>
              <summary>Is this just for fraternities?</summary>
              <p>
                No. ChaptOS supports chapters, clubs, teams, councils, and
                volunteer groups, with vocabulary and tools that fit the
                organization.
              </p>
            </details>
            <details>
              <summary>Can the AI change things on its own?</summary>
              <p>
                Chapt proposes changes for an authorized officer to review.
                Actions follow your organization’s permissions, with a record of
                what happened.
              </p>
            </details>
            <details>
              <summary>Can we take our data with us?</summary>
              <p>Yes. Export your organization’s data whenever you need it.</p>
            </details>
          </section>
          <section className="closing" id="mobile-closing">
            <h2>
              Less “any updates?”
              <br />
              More <mark>“see you there.”</mark>
            </h2>
            <p>Give your people a home for what’s next.</p>
            <a className="primary" href="/create">
              Let’s set up your org <span aria-hidden="true">↗</span>
            </a>
            <p className="fine">Start free. Make it yours.</p>
          </section>
        </main>
        <footer>
          <a className="brand" href="#mobile-top">
            <BrandMark />
            ChaptOS
          </a>
          <p>A little order. A lot more together.</p>
          <div className="footer-links">
            <a href="#mobile-inside">Explore</a>
            <a href="/pricing">Pricing</a>
            <a href="/trust">Trust</a>
            <a href="/contact">Contact</a>
            <SignInLink className="sign-in">Sign in ↗</SignInLink>
          </div>
          <p className="mono">© {new Date().getFullYear()} ChaptOS</p>
        </footer>
      </div>
      <MobileDock />
    </div>
  );
}
