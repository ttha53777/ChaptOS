// Help centre index — the public, signed-out-readable answer to "how does this
// work", linked from the marketing footer and from inside the app.
//
// Content lives in ./content.ts and nowhere else; this page just arranges it.
// The search card, role filter and topic shelf are client-side (HelpIndex);
// the sticky-note doors and the term journey are static and render here.
import type { Metadata } from "next";
import Link from "next/link";

import { PaperIcon } from "../components/paper/PaperIcon";
import { HelpIndex } from "./HelpIndex";
import { ARTICLES, ARTICLES_BY_SLUG, JOURNEY, QUICK_PATHS } from "./content";
import { APP_NAME } from "@/lib/domains";

export const metadata: Metadata = {
  title: `Help centre — ${APP_NAME}`,
  description:
    "How to set up an org, get people in, run the money, take attendance and ask " +
    "the assistant — each with a picture of the real screen, plus the honest " +
    "limits. Searchable, and readable without an account.",
};

export default function HelpIndexPage() {
  return (
    <main className="hc-wrap">
      <div className="hc-kick">
        <span className="hc-chip">Help centre</span>
        {`${ARTICLES.length} articles · each one checked against the app`}
      </div>
      <h1 className="hc-greet">
        {"What are you "}<span className="hc-hi">trying to do</span>?
      </h1>
      <p className="hc-lede">
        Every article opens with a picture of the real screen it&apos;s about, with numbered
        pins that match the steps. Where something is half-built or has a sharp edge, it says
        so on a sticky note.
      </p>

      <HelpIndex
        between={
          <>
            <div className="hc-sec-h"><h2>Start here</h2><span className="hc-rule" /></div>
            <div className="hc-doors">
              {QUICK_PATHS.map(q => (
                <Link key={q.slug} className={`hc-door hc-t-${q.tint}`} href={`/help/${q.slug}`}>
                  <PaperIcon name={q.icon} className="hc-ic" />
                  <b>{q.label}</b>
                  <span>{q.hint}</span>
                  <i>Read it <PaperIcon name="arrow-r" className="hc-ic" /></i>
                </Link>
              ))}
            </div>

            <div className="hc-sec-h">
              <h2>Through a term</h2><span className="hc-rule" />
              <small>the articles you&apos;ll need, in roughly the order you&apos;ll need them</small>
            </div>
            <div className="hc-journey">
              {JOURNEY.map(stop => (
                <div key={stop.t} className={`hc-stop hc-t-${stop.tint}`}>
                  <h3>{stop.t}</h3>
                  <p>{stop.s}</p>
                  <ul>
                    {stop.items.map(slug => {
                      const a = ARTICLES_BY_SLUG.get(slug)!;
                      return (
                        <li key={slug}>
                          <Link href={`/help/${slug}`}><PaperIcon name={a.icon} className="hc-ic" />{a.title}</Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </>
        }
      />

      <div className="hc-stuck">
        <div>
          <h3>Still stuck?</h3>
          <p>
            There&apos;s no ticket queue and no bot on the other end — it&apos;s one person, and
            that person reads everything. Tell them what you were doing and what happened instead.
          </p>
        </div>
        <Link className="hc-btn" href="/contact">Talk to a human <PaperIcon name="arrow-r" className="hc-ic" /></Link>
      </div>
    </main>
  );
}
