// "Talk to a human" — the contact page, linked from the marketing footer and
// from every help article that didn't answer the question.
//
// There is no ticket system behind this and the page doesn't pretend there is.
// It's an email address, a picker that pre-fills a good email, and an honest
// account of what happens after you press send.
//
// Deliberately static and motionless — no LandingMotion in this tree, so no
// [data-reveal] hooks. See ../components/landing/public-chrome.css.
import type { Metadata } from "next";

import "../components/landing/landing.css";
import "../components/landing/public-chrome.css";
import "./contact.css";

import { Doodle, sx } from "../components/landing/Doodle";
import { DoodleSprite } from "../components/landing/DoodleSprite";
import { landingFontClass } from "../components/landing/fonts";
import { PublicNav } from "../components/landing/PublicChrome";
import { Footer } from "../components/landing/sections/Footer";
import { ContactPicker } from "./ContactPicker";
import { APP_NAME } from "@/lib/domains";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: `Talk to a human — ${APP_NAME}`,
  description:
    "No ticket queue, no chatbot, no phone tree. One email address, a person who " +
    "reads it, and an honest account of how long a reply takes.",
};

export default function ContactPage() {
  return (
    <div className={`lp pub ct ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav />

      <main id="top">
        <section className="pub__hero">
          <div className="wrap">
            <div className="pub__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--peach)" })}>
                Talk to a human
              </span>
              <h1>No queue, no bot, no phone tree. One address, and someone who reads it.</h1>
              <p className="lede">
                This is a small thing made by people who ran the meeting, took the minutes and
                chased the dues. When you write in, one of them answers — which is the good
                news and also the reason a reply takes hours rather than seconds.
              </p>
            </div>

            {/* The three things worth knowing before you write, in the order
                they'd change what you do next. */}
            <div className="ct__facts">
              <div className="ct__fact">
                <span className="ct__fic" style={sx({ "--g": "var(--mint-soft)", "--gb": "var(--mint)" })}>
                  <Doodle
                    id="chat"
                    className="doodle doodle--thin"
                    size={19}
                    viewBox="0 0 24 24"
                    style={sx({ color: "var(--mint-ink)" })}
                  />
                </span>
                <h4>A person, not a form</h4>
                <p>
                  Nothing here is triaged by a bot or answered by a macro. You get a reply from
                  someone who can actually change the product.
                </p>
              </div>
              <div className="ct__fact">
                <span className="ct__fic" style={sx({ "--g": "var(--butter-soft)", "--gb": "var(--butter)" })}>
                  <Doodle
                    id="clock"
                    className="doodle doodle--thin"
                    size={19}
                    viewBox="0 0 24 24"
                    style={sx({ color: "var(--butter-ink)" })}
                  />
                </span>
                <h4>Usually within a day</h4>
                <p>
                  If it&apos;s been three business days and you&apos;ve heard nothing, send it
                  again. It means the email was missed, not that it was ignored.
                </p>
              </div>
              <div className="ct__fact">
                <span className="ct__fic" style={sx({ "--g": "var(--sky-soft)", "--gb": "var(--sky)" })}>
                  <Doodle
                    id="shield"
                    className="doodle doodle--thin"
                    size={19}
                    viewBox="0 0 24 24"
                    style={sx({ color: "var(--sky-ink)" })}
                  />
                </span>
                <h4>Never send a password</h4>
                <p>
                  We will never ask for one, and there isn&apos;t one to ask for — signing in
                  goes through Google. Nobody legitimate needs your credentials.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- the picker ---- */}
        <section className="ct__main">
          <div className="wrap">
            <div className="ct__mainhead">
              <h2>Write in</h2>
              <p className="lede">
                Pick what it&apos;s about and we&apos;ll start the email for you — with a
                subject line and the handful of details that let the first reply be the answer
                instead of a question.
              </p>
            </div>
            <ContactPicker />
          </div>
        </section>

        {/* ---- faster than an email ---- */}
        <section className="ct__faster">
          <div className="wrap">
            <div className="ct__fastgrid">
              <div className="ct__fasthead">
                <span className="eyebrow" style={sx({ "--eb": "var(--lilac)" })}>
                  Probably faster
                </span>
                <h3>Three things that answer themselves</h3>
                <p>
                  Not a brush-off — these are the questions that come in most, and each one has
                  a written answer that&apos;s more complete than a reply would be.
                </p>
              </div>
              <ul className="ct__fastlist">
                <li>
                  <a href="/help/first-term">
                    <span className="t">It won&apos;t let me past a screen</span>
                    <span className="b">
                      Almost always the term. The app blocks until an org has an active one, and
                      an admin can fix it in about thirty seconds.
                    </span>
                  </a>
                </li>
                <li>
                  <a href="/help/signing-in">
                    <span className="t">I&apos;m signed in but I can&apos;t see my org</span>
                    <span className="b">
                      Usually a second Google account. Your personal and university addresses are
                      two different people as far as the app is concerned.
                    </span>
                  </a>
                </li>
                <li>
                  <a href="/help/export-your-data">
                    <span className="t">I need everything out as a spreadsheet</span>
                    <span className="b">
                      The ledger and the roster export themselves. Attendance and documents
                      don&apos;t yet — for those, write in and we&apos;ll get them to you.
                    </span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ---- the escalation, inverted: here it's the reassurance ---- */}
        <section className="pub__ask">
          <div className="wrap">
            <div className="pub__askcard">
              <div className="t">
                <h3>Rather read first?</h3>
                <p>
                  The help centre covers setup, money, attendance and the assistant — including
                  the parts that aren&apos;t built yet. Trust &amp; privacy covers what happens
                  to your org&apos;s records, in the same spirit.
                </p>
              </div>
              <div className="a">
                <a className="btn" href="/help">
                  Help centre <Doodle id="arrow-r" size={16} viewBox="0 0 24 24" />
                </a>
                <a className="btn btn--ghost" href="/trust">
                  Trust &amp; privacy
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      {/* The address in plain, machine-readable markup — for anyone whose way of
          finding it is Cmd+F or a screen reader rather than the picker above. */}
      <div className="ct__sr">
        Contact address: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </div>
    </div>
  );
}
