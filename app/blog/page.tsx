// Blog index — every published post, newest first.
//
// Posts are Markdown files in /content/blog (see ./posts.ts for the format).
// Static and motionless like /help: no LandingMotion, so no [data-reveal] /
// [data-para] hooks may appear in this tree. See public-chrome.css.
import type { Metadata } from "next";

import "../components/landing/landing.css";
import "../components/landing/public-chrome.css";
import "./blog.css";

import { Doodle, sx } from "../components/landing/Doodle";
import { DoodleSprite } from "../components/landing/DoodleSprite";
import { landingFontClass } from "../components/landing/fonts";
import { PublicNav } from "../components/landing/PublicChrome";
import { Footer } from "../components/landing/sections/Footer";
import { CoverArt } from "./PostArt";
import { formatDate, getPosts } from "./posts";
import { tagAccent } from "./tags";
import { APP_NAME } from "@/lib/domains";

export const metadata: Metadata = {
  title: `Blog — ${APP_NAME}`,
  description: `Notes from the people building ${APP_NAME}: what we shipped, why, and what running an org taught us.`,
  alternates: { types: { "application/rss+xml": "/blog/rss.xml" } },
};

// Each archive card takes the next pastel, so a row never repeats a colour.
const ACCENTS = ["sky", "peach", "mint", "lilac", "butter", "rose"] as const;

const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");

/** "OCT 12" — the date as it's stamped on an index card. */
const stampDate = (iso: string) => formatDate(iso).replace(/,? \d{4}$/, "").toUpperCase();

export default function BlogIndexPage() {
  const posts = getPosts();
  const [lead, ...rest] = posts;

  // "Filed under" in the head: every tag, most-used first.
  const counts = new Map<string, number>();
  for (const p of posts) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const topics = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <div className={`lp pub bl ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav here="blog" />

      <main id="top">
        <section className="pub__hero bl__ixhero">
          <div className="wrap bl__ixgrid">
            <div className="pub__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--peach)" })}>
                Blog
              </span>
              <h1>
                Notes from the <span className="hi" style={sx({ "--mark": "var(--peach)" })}>build</span>.
              </h1>
              <p className="lede">
                What we shipped, why we shipped it, and what running a chapter taught us
                along the way.
              </p>
              {topics.length > 0 && (
                <div className="bl__filed">
                  <span className="k">Filed under</span>
                  {topics.map(([t, n]) => (
                    <span key={t} className="bl__topic" data-accent={tagAccent(t)}>
                      {t}
                      <b>{n}</b>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bl__desk">
              <a className="bl__ticket" href="/blog/rss.xml">
                <span className="bl__ticketmain">
                  <span className="k">Subscribe</span>
                  <span className="t">Every post, the day it lands.</span>
                  <span className="u">/blog/rss.xml</span>
                </span>
                <span className="bl__ticketstub">
                  <span>Admit one</span>
                  <b>RSS</b>
                </span>
              </a>
              <div className="sticky-note bl__desknote" style={sx({ "--note": "var(--mint)", "--rot": "-3deg" })}>
                <b>No email needed.</b> Point any feed reader at it.
              </div>
              <Doodle id="star" size={30} viewBox="0 0 24 24" className="bl__deskstar" style={sx({ color: "var(--peach-ink)" })} />
              <Doodle id="swirl" size={96} viewBox="0 0 120 46" className="bl__deskswirl" style={sx({ color: "var(--ink-3)" })} />
            </div>
          </div>
        </section>

        <section className="bl__ix">
          <div className="wrap">
            {!lead ? (
              <div className="bl__empty">
                <span className="bl__emptytape" aria-hidden />
                <Doodle id="pencil" size={28} viewBox="0 0 24 24" style={sx({ color: "var(--peach-ink)" })} />
                <h3>Nothing pinned up yet.</h3>
                <p>The first post is being written. Check back soon, or subscribe and it will come to you.</p>
              </div>
            ) : (
              <>
                <a className="bl__lead" href={`/blog/${lead.slug}`} data-accent="peach">
                  <span className="bl__leadtape" aria-hidden>Latest</span>
                  <span className="bl__leadtext">
                    <span className="bl__meta">
                      <time dateTime={lead.date}>{formatDate(lead.date)}</time>
                      <span>{`${lead.readingMinutes} min read`}</span>
                      {lead.draft && <span className="bl__draft">Draft</span>}
                    </span>
                    <span className="bl__leadt">{lead.title}</span>
                    <span className="bl__leads">{lead.summary}</span>
                    {lead.tags.length > 0 && (
                      <span className="bl__tags">
                        {lead.tags.map(t => (
                          <span key={t} className="bl__tag" data-accent={tagAccent(t)}>{t}</span>
                        ))}
                      </span>
                    )}
                    <span className="bl__leadfoot">
                      {lead.author && (
                        <span className="bl__leadby">
                          <span className="bl__av" aria-hidden>{initials(lead.author)}</span>
                          <b>{lead.author}</b>
                        </span>
                      )}
                      <span className="btn btn--sm bl__leadgo">
                        Read the post
                        <Doodle id="arrow-r" size={15} viewBox="0 0 24 24" />
                      </span>
                    </span>
                  </span>
                  <span className="bl__leadart">
                    <CoverArt post={lead} />
                  </span>
                </a>

                {rest.length > 0 && (
                  <>
                    <div className="bl__archhead">
                      <span className="eyebrow" style={sx({ "--eb": "var(--sky)" })}>
                        From the archive
                      </span>
                      <span className="bl__archn mono">
                        {`${rest.length} more ${rest.length === 1 ? "post" : "posts"}`}
                      </span>
                    </div>
                    <ol className="bl__cards">
                      {rest.map((p, i) => (
                        <li key={p.slug} data-accent={ACCENTS[i % ACCENTS.length]}>
                          <a className="bl__card" href={`/blog/${p.slug}`}>
                            <span className="bl__cardhd">
                              <time dateTime={p.date}>{stampDate(p.date)}</time>
                              <span>{`${p.readingMinutes} min`}</span>
                              {p.draft && <span className="bl__draft">Draft</span>}
                            </span>
                            <span className="bl__cardt">{p.title}</span>
                            <span className="bl__cardbd">
                              <span className="bl__cards-s">{p.summary}</span>
                            </span>
                            <span className="bl__cardft">
                              {p.tags.length > 0 && (
                                <span className="bl__tags">
                                  {p.tags.map(t => (
                                    <span key={t} className="bl__tag" data-accent={tagAccent(t)}>{t}</span>
                                  ))}
                                </span>
                              )}
                              <span className="bl__cardgo">
                                Read
                                <Doodle id="arrow-r" size={14} viewBox="0 0 24 24" />
                              </span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
