// "Who it's for" — the hub for the six audience pages linked from the marketing
// footer's "For" column.
//
// Content lives in ./content.ts and nowhere else; this page just arranges it.
// Deliberately short: it exists so the six have a home, a breadcrumb parent and
// a place to land when someone types /for — the argument is on the pages
// themselves.
//
// Motionless like every other public page — no LandingMotion in this tree, so no
// [data-reveal] hooks may appear or they'd stay invisible. See the header
// comment in ../components/landing/public-chrome.css.
import type { Metadata } from "next";

import "../components/landing/landing.css";
import "../components/landing/public-chrome.css";
import "./for.css";

import { Doodle, sx } from "../components/landing/Doodle";
import { DoodleSprite } from "../components/landing/DoodleSprite";
import { landingFontClass } from "../components/landing/fonts";
import { PublicNav } from "../components/landing/PublicChrome";
import { Footer } from "../components/landing/sections/Footer";
import { AudienceIcon } from "./AudienceIcon";
import { AUDIENCES } from "./content";
import { APP_NAME } from "@/lib/domains";

export const metadata: Metadata = {
  title: `Who it's for — ${APP_NAME}`,
  description:
    "The setup a chapter, a club team, a service org, an ensemble or a student " +
    "government should start from — plus how the same workspace is rebuilt from " +
    "scratch for any other kind of org.",
};

export default function ForIndexPage() {
  return (
    <div className={`lp pub fr ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav here="for" />

      <main id="top">
        <section className="pub__hero">
          <div className="wrap">
            <div className="pub__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--peach)" })}>
                Who it&apos;s for
              </span>
              <h1>Five kinds of org, and one page for everything else.</h1>
              <p className="lede">
                A club team and a chapter need almost nothing in common: one tracks a single
                number across a season, the other runs money, standing and a meeting every
                week. So they don&apos;t get the same workspace. Each page below is the
                setup that org actually starts from — the pages, the seats, the words, the
                first term. And if none of the five is you, the last one shows how the same
                workspace gets built to fit whatever you run.
              </p>
            </div>

            <div className="fr__cards">
              {AUDIENCES.map(a => (
                <a className="fr__card" href={`/for/${a.slug}`} key={a.slug}>
                  <AudienceIcon doodle={a.doodle} tint={a.tint} />
                  <h3>{a.label}</h3>
                  <p>{a.blurb}</p>
                  <span className="fr__go">
                    {a.go ?? "The setup, and the limits"}{" "}
                    <Doodle id="arrow-r" size={15} viewBox="0 0 24 24" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="pub__ask">
          <div className="wrap">
            <div className="pub__askcard">
              <div className="t">
                <h3>None of these is quite your org?</h3>
                <p>
                  That&apos;s normal, and the setup interview doesn&apos;t work from this
                  list — it asks what you actually do in a normal month and builds the
                  workspace from your answers. You can run the whole thing signed out and
                  look at the result before anything is created.
                </p>
              </div>
              <div className="a">
                <a className="btn btn--ghost" href="/contact">
                  Ask a human
                </a>
                <a className="btn" href="/create">
                  Set up your org{" "}
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
