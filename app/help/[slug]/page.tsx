// One help article.
//
// Statically generated from ../content.ts at build time (generateStaticParams
// enumerates every slug), so an article is a static document with no runtime
// data access — which is also why it's readable signed out.
//
// Layout: where it lives + who can, then the figure (../figures.ts — a replica
// of the real screen with pins matching the steps), then the body, then
// previous/next. The rail holds "On this page", the rest of the section, and
// the way to a person with this article already named.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { inline } from "../../components/landing/inline";
import { PaperIcon } from "../../components/paper/PaperIcon";
import { Blocks, WherePath, headingId } from "../Blocks";
import { FIGURES } from "../figures";
import { ARTICLES, ARTICLES_BY_SLUG, CATEGORIES_BY_ID, articlesIn, type Article } from "../content";
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

/** The title with the highlighter behind its `hi` phrase. */
function Title({ article, tint }: { article: Article; tint: string }) {
  const at = article.hi ? article.title.lastIndexOf(article.hi) : -1;
  if (!article.hi || at < 0) return <h1>{article.title}</h1>;
  return (
    <h1>
      {article.title.slice(0, at)}
      <span className="hc-hi" style={{ "--mark": `var(--${tint})` } as React.CSSProperties}>{article.hi}</span>
      {article.title.slice(at + article.hi.length)}
    </h1>
  );
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
  const section = articlesIn(category.id);
  const at = ARTICLES.indexOf(article);
  const prev = ARTICLES[at - 1];
  const next = ARTICLES[at + 1];

  // A leading "where" block becomes the "Where it lives" fact instead.
  const [first, ...rest] = article.body;
  const where = first?.k === "where" ? first.path : null;
  const body = where ? rest : article.body;
  const headings = body.flatMap(b => (b.k === "h" ? [b.t] : []));

  // Carries the article the reader gave up on into the composer on /contact.
  const askHref = `/contact?from=${encodeURIComponent(article.slug)}`;

  return (
    <main className="hc-wrap">
      <div className="hc-art">
        <div className="hc-art-main" style={{ "--eb": `var(--${category.tint})` } as React.CSSProperties}>
          <nav className="hc-kick" aria-label="Breadcrumb">
            <Link href="/help">Help</Link><span>/</span>
            <Link href={`/help/${section[0].slug}`}>{category.title}</Link>
          </nav>
          <Title article={article} tint={category.tint} />
          <p className="hc-lede">{inline(article.lede)}</p>

          <div className="hc-facts" style={where ? undefined : { gridTemplateColumns: "1fr" }}>
            {where && (
              <div className="hc-fact">
                <span className="hc-k"><PaperIcon name="pin" className="hc-ic" />Where it lives</span>
                <div className="hc-v"><WherePath path={where} /></div>
              </div>
            )}
            <div className="hc-fact">
              <span className="hc-k"><PaperIcon name="key" className="hc-ic" />Who can</span>
              <div className="hc-v">{article.who}</div>
            </div>
          </div>

          <figure className="hc-fig">
            {/* Static, authored markup — see the note at the top of figures.ts. */}
            <div dangerouslySetInnerHTML={{ __html: FIGURES[article.slug]() }} />
            <figcaption className="hc-fig-cap"><b>FIG</b>{article.cap}</figcaption>
          </figure>

          <Blocks blocks={body} />

          <nav className="hc-pn" aria-label="More articles">
            {prev ? (
              <Link href={`/help/${prev.slug}`}><small>← Previous</small><b>{prev.title}</b></Link>
            ) : <span />}
            {next && (
              <Link className="hc-nx" href={`/help/${next.slug}`}><small>Next →</small><b>{next.title}</b></Link>
            )}
          </nav>
        </div>

        <aside className="hc-rail">
          {headings.length > 0 && (
            <div>
              <h5>On this page</h5>
              <div className="hc-toc">
                {headings.map(h => <a key={h} href={`#${headingId(h)}`}>{h}</a>)}
              </div>
            </div>
          )}
          <div>
            <h5>{`In ${category.title}`}</h5>
            <div className="hc-toc">
              {section.filter(a => a.slug !== article.slug).map(a => (
                <Link key={a.slug} href={`/help/${a.slug}`}>{a.title}</Link>
              ))}
            </div>
          </div>
          <div className="hc-note-s hc-t-lilac hc-tape">
            <b>This didn&apos;t answer it</b>
            Write to a person, with this page already named in the draft.
            <br />
            <Link href={askHref}>Talk to a human <PaperIcon name="arrow-r" className="hc-ic" /></Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
