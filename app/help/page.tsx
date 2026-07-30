// Help centre index — the public, signed-out-readable answer to "how does this
// work", linked from the marketing footer.
//
// Content lives in ./content.ts and nowhere else; this page just arranges it.
// Search is client-side over an index built at module scope (see HelpBrowser),
// so there is no /api/help and no request per keystroke.
//
// Deliberately static and motionless — no LandingMotion, so no [data-reveal] /
// [data-para] hooks may appear in this tree or they'd stay invisible. See the
// header comment in ../components/landing/public-chrome.css.
import type { Metadata } from "next";

import "../components/landing/landing.css";
import "../components/landing/public-chrome.css";
import "./help.css";

import { Doodle, sx } from "../components/landing/Doodle";
import { DoodleSprite } from "../components/landing/DoodleSprite";
import { landingFontClass } from "../components/landing/fonts";
import { PublicNav } from "../components/landing/PublicChrome";
import { Footer } from "../components/landing/sections/Footer";
import { HelpBrowser, type BrowseCategory } from "./HelpBrowser";
import { ARTICLES, CATEGORIES, QUICK_PATHS, SEARCH_INDEX, articlesIn } from "./content";
import { APP_NAME } from "@/lib/domains";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: `Help centre — ${APP_NAME}`,
  description:
    "How to set up an org, get people in, run the money, take attendance and ask " +
    "the assistant — plus the honest limits of each. Searchable, and readable " +
    "without an account.",
};

const BROWSE: BrowseCategory[] = CATEGORIES.map(c => ({
  ...c,
  articles: articlesIn(c.id).map(a => ({ slug: a.slug, title: a.title, blurb: a.blurb })),
}));

export default function HelpIndexPage() {
  return (
    <div className={`lp pub hc ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav here="help" />

      <main id="top">
        <section className="pub__hero">
          <div className="wrap">
            <div className="pub__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--mint)" })}>
                Help centre
              </span>
              <h1>
                Everything it does, in the order you&apos;ll need it.
              </h1>
              <p className="lede">
                {/* The explicit {" "} is load-bearing: this build drops the space
                    between a {expression} and the text that follows it. */}
                {ARTICLES.length}{" "}articles, all of them about something that exists in the
                product today. Where a thing is half-built or has a sharp edge, the article
                says so — you should never go looking for a button that isn&apos;t there.
              </p>
            </div>

            <HelpBrowser
              categories={BROWSE}
              rows={SEARCH_INDEX}
              quickPaths={QUICK_PATHS}
            />
          </div>
        </section>

        {/* ---- the escalation, identical on every public page ---- */}
        <section className="pub__ask">
          <div className="wrap">
            <div className="pub__askcard">
              <div className="t">
                <h3>Still stuck?</h3>
                <p>
                  There&apos;s no ticket queue and no bot on the other end — it&apos;s one
                  person, and that person reads everything. Tell them what you were doing and
                  what happened instead.
                </p>
                {/* The address as plain text, not a second button. It used to be
                    a mailto: styled as one, which does nothing at all on a
                    browser with no mail handler — a button-shaped no-op. As copy
                    it still tells you where to write, and it can't fail. */}
                <p className="pub__askaddr">
                  Or write to <span className="m">{SUPPORT_EMAIL}</span>{" "}— /contact just
                  helps you say the useful parts.
                </p>
              </div>
              <div className="a">
                <a className="btn" href="/contact">
                  Talk to a human{" "}
                  <Doodle id="arrow-r" size={16} viewBox="0 0 24 24" />
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
