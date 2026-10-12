// Blog index — every published post, newest first.
//
// Posts are Markdown files in /content/blog (see ./posts.ts for the format).
// Static and motionless like /help: no LandingMotion, so no [data-reveal] /
// [data-para] hooks may appear in this tree. See public-chrome.css.
import type { Metadata } from "next";

import "../components/landing/landing.css";
import "../components/landing/public-chrome.css";
import "./blog.css";

import { sx } from "../components/landing/Doodle";
import { DoodleSprite } from "../components/landing/DoodleSprite";
import { landingFontClass } from "../components/landing/fonts";
import { PublicNav } from "../components/landing/PublicChrome";
import { Footer } from "../components/landing/sections/Footer";
import { formatDate, getPosts } from "./posts";
import { APP_NAME } from "@/lib/domains";

export const metadata: Metadata = {
  title: `Blog — ${APP_NAME}`,
  description: `Notes from the people building ${APP_NAME}: what we shipped, why, and what running an org taught us.`,
  alternates: { types: { "application/rss+xml": "/blog/rss.xml" } },
};

export default function BlogIndexPage() {
  const posts = getPosts();

  return (
    <div className={`lp pub bl ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav here="blog" />

      <main id="top">
        <section className="pub__hero">
          <div className="wrap">
            <div className="pub__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--peach)" })}>
                Blog
              </span>
              <h1>Notes from the build.</h1>
              <p className="lede">
                What we shipped, why we shipped it, and what running a chapter taught us
                along the way.
              </p>
            </div>

            {posts.length === 0 ? (
              <div className="bl__empty">
                <h3>Nothing here yet.</h3>
                <p>The first post is being written. Check back soon.</p>
              </div>
            ) : (
              <ol className="bl__list">
                {posts.map(p => (
                  <li key={p.slug}>
                    <a className="bl__item" href={`/blog/${p.slug}`}>
                      <span className="bl__meta">
                        <time dateTime={p.date}>{formatDate(p.date)}</time>
                        <span>{`${p.readingMinutes} min read`}</span>
                        {p.draft && <span className="bl__draft">Draft</span>}
                      </span>
                      <span className="bl__t">{p.title}</span>
                      <span className="bl__s">{p.summary}</span>
                      {p.tags.length > 0 && (
                        <span className="bl__tags">
                          {p.tags.map(t => (
                            <span key={t} className="bl__tag">
                              {t}
                            </span>
                          ))}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ol>
            )}

            <p className="bl__rss">
              <a href="/blog/rss.xml">Subscribe via RSS</a>
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
