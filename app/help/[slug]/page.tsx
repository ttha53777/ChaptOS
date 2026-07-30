// One help article.
//
// Statically generated from ./content.ts at build time (generateStaticParams
// enumerates every slug), so an article is a static document with no runtime
// data access — which is also why it's readable signed out.
//
// Motionless for the same reason as the index: no LandingMotion in this tree,
// so no [data-reveal] hooks anywhere.
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import "../../components/landing/landing.css";
import "../../components/landing/public-chrome.css";
import "../help.css";

import { Doodle, sx } from "../../components/landing/Doodle";
import { DoodleSprite } from "../../components/landing/DoodleSprite";
import { landingFontClass } from "../../components/landing/fonts";
import { PublicNav } from "../../components/landing/PublicChrome";
import { Footer } from "../../components/landing/sections/Footer";
import { Blocks } from "../Blocks";
import { CatIcon } from "../CatIcon";
import { inline } from "../../components/landing/inline";
import { ARTICLES, ARTICLES_BY_SLUG, CATEGORIES_BY_ID, articlesIn } from "../content";
import { APP_NAME } from "@/lib/domains";

export function generateStaticParams() {
  return ARTICLES.map(a => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = ARTICLES_BY_SLUG.get(slug);
  if (!article) return { title: `Help centre — ${APP_NAME}` };
  return {
    title: `${article.title} — ${APP_NAME} help`,
    description: article.blurb,
  };
}

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = ARTICLES_BY_SLUG.get(slug);
  if (!article) notFound();

  const category = CATEGORIES_BY_ID.get(article.categoryId)!;
  // Siblings minus self — "more in this category", which is nearly always what
  // someone wants next and is cheaper to scan than a global list.
  const siblings = articlesIn(category.id).filter(a => a.slug !== article.slug);

  // Carries the article the reader gave up on into the composer on /contact,
  // which opens with it named in the subject and the draft. Deliberately NOT a
  // mailto: — a mailto: does nothing at all on a browser with no mail handler,
  // and a whole card that silently no-ops is worse than one that navigates.
  const askHref = `/contact?from=${encodeURIComponent(article.slug)}`;

  return (
    <div className={`lp pub hc hc--art ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav here="help" />

      <main id="top">
        <section className="pub__hero">
          <div className="wrap">
            <div className="pub__head">
              <nav className="pub__crumbs" aria-label="Breadcrumb">
                <a href="/help">Help centre</a>
                <a href={`/help#${category.id}`}>{category.title}</a>
              </nav>
              <h1>{article.title}</h1>
              <p className="lede">{inline(article.lede)}</p>
            </div>
          </div>
        </section>

        <section className="hc__artwrap">
          <div className="wrap hc__artgrid">
            <article className="hc__body">
              <Blocks blocks={article.body} />
            </article>

            {/* The rail: where you are, what else is here, and the way out. */}
            <aside className="hc__rail">
              <div className="hc__railcat">
                <CatIcon doodle={category.doodle} tint={category.tint} size={18} />
                <span>{category.title}</span>
              </div>

              {siblings.length > 0 && (
                <>
                  <h5>More in this section</h5>
                  <ul className="hc__railnav">
                    {siblings.map(s => (
                      <li key={s.slug}>
                        <a href={`/help/${s.slug}`}>{s.title}</a>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <a className="hc__railask" href={askHref}>
                <Doodle
                  id="chat"
                  size={17}
                  viewBox="0 0 24 24"
                  className="doodle doodle--thin"
                  style={sx({ color: "var(--lilac-ink)" })}
                />
                <span>
                  <b>This didn&apos;t answer it</b>
                  Write to a person, with this page already named in the draft.
                </span>
              </a>
            </aside>
          </div>
        </section>

        <section className="pub__ask">
          <div className="wrap">
            <div className="pub__askcard">
              <div className="t">
                <h3>Didn&apos;t find it?</h3>
                <p>
                  Search covers the full text of every article — if it isn&apos;t there, it
                  probably isn&apos;t written yet, and that&apos;s worth telling us.
                </p>
              </div>
              <div className="a">
                <a className="btn btn--ghost" href="/help">
                  Back to help
                </a>
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
