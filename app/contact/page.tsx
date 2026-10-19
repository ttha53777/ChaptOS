// "Talk to a human" — the contact page, linked from the marketing footer and
// from every help article that didn't answer the question.
//
// There is no ticket system behind this and the page doesn't pretend there is.
// It's an email address (the calling card, first thing on the page), a letter
// that pre-fills a good email, and an honest account of what happens after you
// press send. Built from _design/Contact Paper Mock.html.
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
import { AddressCard } from "./AddressCard";
import { ContactPicker } from "./ContactPicker";
import { ARTICLES_BY_SLUG } from "../help/content";
import { APP_NAME } from "@/lib/domains";

export const metadata: Metadata = {
  title: `Talk to a human — ${APP_NAME}`,
  description:
    "No ticket queue, no chatbot, no phone tree. One email address, a person who " +
    "reads it, and an honest account of how long a reply takes.",
};

/**
 * `?from=<help-article-slug>` — set by the "this didn't answer it" card on every
 * help article. The slug is resolved against the article registry rather than
 * echoed, so an arbitrary query string can never put attacker-chosen text into
 * the page or into the draft; an unknown slug just means no context.
 *
 * Read as a server prop rather than with useSearchParams(): that hook would make
 * everything up to the nearest Suspense boundary client-rendered, and the whole
 * point of the composer is that the draft is in the initial HTML.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const source = from ? ARTICLES_BY_SLUG.get(from) : undefined;
  const fromArticle = source ? { slug: source.slug, title: source.title } : null;

  return (
    <div className={`lp pub ct ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav />

      <main id="top">
        {/* ---- the address, before anything else ---- */}
        <section className="ct__hero">
          <div className="wrap ct__herogrid">
            <div>
              <span className="eyebrow" style={sx({ "--eb": "var(--peach)" })}>
                Talk to a human
              </span>
              <h1>
                Write to a person,{" "}
                <span className="hi" style={sx({ "--mark": "var(--peach)" })}>not a queue.</span>
              </h1>
              <p className="lede">
                No ticket number, no chatbot, no phone tree. One address, read by the people who
                built this — who also ran the meeting, took the minutes and chased the dues.
                Hours, not seconds, but a real answer.
              </p>
              <div className="ct__jump">
                <a className="btn" href="#write" style={sx({ "--btn-shadow": "var(--peach)" })}>
                  <Doodle id="pencil" size={17} viewBox="0 0 24 24" />
                  Help me write it
                </a>
                <a className="btn btn--ghost ct__soft" href="#faster">
                  Check the common fixes
                </a>
              </div>
            </div>
            <AddressCard />
          </div>
        </section>

        {/* ---- pick a stamp, write the letter, then what happens ---- */}
        <section className="ct__write" id="write">
          <div className="wrap">
            <div className="ct__sechead">
              <div>
                <span className="eyebrow" style={sx({ "--eb": "var(--lilac)" })}>
                  Write in
                </span>
                <h2>Pick a stamp. We&apos;ll start the letter.</h2>
              </div>
              <p>
                Each one loads a short template so the first reply can be the answer, not a
                question back. Fill it in here — every button sends what you actually wrote.
              </p>
            </div>
            <ContactPicker fromArticle={fromArticle} />
          </div>
        </section>

        {/* ---- faster than an email ---- */}
        <section className="ct__faster" id="faster">
          <div className="wrap">
            <div className="ct__sechead">
              <div>
                <span className="eyebrow" style={sx({ "--eb": "var(--butter)" })}>
                  Probably faster
                </span>
                <h2>Three that answer themselves.</h2>
              </div>
              <p>
                Not a brush-off — these are the questions that come in most, and each has a
                written answer more complete than a reply would be.
              </p>
            </div>
            <div className="ct__notes">
              {FASTER.map(n => (
                <a
                  key={n.href}
                  className="ct__qn"
                  href={n.href}
                  style={sx({ "--nt": `var(--${n.tint})`, "--r": n.rot })}
                >
                  <span className="ct__tape" aria-hidden="true" />
                  <h3>{n.t}</h3>
                  <p>{n.b}</p>
                  <span className="go">
                    {n.go} <Doodle id="arrow-r" size={14} viewBox="0 0 24 24" />
                  </span>
                </a>
              ))}
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
    </div>
  );
}

/** The three questions that come in most, each with a written answer. */
const FASTER = [
  {
    href: "/help/first-term",
    t: "It won't let me past a screen",
    b: "Almost always the term. The app blocks until an org has an active one, and an admin can fix it in about thirty seconds.",
    go: "Set the first term",
    tint: "butter",
    rot: "-1.8deg",
  },
  {
    href: "/help/signing-in",
    t: "I'm signed in but I can't see my org",
    b: "Usually a second Google account. Your personal and university addresses are two different people as far as the app is concerned.",
    go: "Signing in",
    tint: "sky",
    rot: "1.2deg",
  },
  {
    href: "/help/export-your-data",
    t: "I need everything out as a spreadsheet",
    b: "The ledger and the roster export themselves. Attendance and documents don't yet — for those, write in and we'll get them to you.",
    go: "Export your data",
    tint: "mint",
    rot: "-.8deg",
  },
];
