// One blog post.
//
// Statically generated from /content/blog at build time (generateStaticParams
// enumerates every published slug). Drafts only resolve under `next dev` — see
// ./posts.ts.
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import "../../components/landing/landing.css";
import "../../components/landing/public-chrome.css";
import "../blog.css";

import { Doodle } from "../../components/landing/Doodle";
import { DoodleSprite } from "../../components/landing/DoodleSprite";
import { landingFontClass } from "../../components/landing/fonts";
import { PublicNav } from "../../components/landing/PublicChrome";
import { Footer } from "../../components/landing/sections/Footer";
import { formatDate, getPost, getPosts } from "../posts";
import { APP_NAME } from "@/lib/domains";

export function generateStaticParams() {
  return getPosts().map(p => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: `Blog — ${APP_NAME}` };
  return {
    title: `${post.title} — ${APP_NAME}`,
    description: post.summary,
    alternates: { types: { "application/rss+xml": "/blog/rss.xml" } },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.summary,
      publishedTime: post.date,
      tags: post.tags,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  // The two posts either side of this one, so a reader who finishes has
  // somewhere to go that isn't the back button.
  const posts = getPosts();
  const i = posts.findIndex(p => p.slug === post.slug);
  const newer = i > 0 ? posts[i - 1] : null;
  const older = i < posts.length - 1 ? posts[i + 1] : null;

  return (
    <div className={`lp pub bl bl--post ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav here="blog" />

      <main id="top">
        <article>
          <section className="pub__hero">
            <div className="wrap">
              <div className="pub__head">
                <nav className="pub__crumbs" aria-label="Breadcrumb">
                  <a href="/blog">Blog</a>
                  {post.tags[0] && <span>{post.tags[0]}</span>}
                </nav>
                <h1>{post.title}</h1>
                <p className="lede">{post.summary}</p>
                <p className="bl__meta bl__meta--post">
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                  {post.author && <span>{post.author}</span>}
                  <span>{`${post.readingMinutes} min read`}</span>
                  {post.draft && <span className="bl__draft">Draft — only visible in dev</span>}
                </p>
              </div>
            </div>
          </section>

          <section className="bl__artwrap">
            <div className="wrap">
              <div className="bl__prose" dangerouslySetInnerHTML={{ __html: post.html }} />
            </div>
          </section>
        </article>

        {(newer || older) && (
          <nav className="bl__next" aria-label="More posts">
            <div className="wrap bl__nextgrid">
              {older ? (
                <a className="bl__nextcard" href={`/blog/${older.slug}`}>
                  <span className="k">Older</span>
                  <span className="t">{older.title}</span>
                </a>
              ) : <span />}
              {newer ? (
                <a className="bl__nextcard bl__nextcard--r" href={`/blog/${newer.slug}`}>
                  <span className="k">Newer</span>
                  <span className="t">{newer.title}</span>
                </a>
              ) : <span />}
            </div>
          </nav>
        )}

        <section className="pub__ask">
          <div className="wrap">
            <div className="pub__askcard">
              <div className="t">
                <h3>Run an org?</h3>
                <p>
                  Dues, attendance, events and the minutes, in one place your whole
                  e-board can see. Setting one up takes a few minutes.
                </p>
              </div>
              <div className="a">
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
