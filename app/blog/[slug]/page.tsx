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
import { PostDemo } from "../demos";
import { layoutPost } from "../layout-post";
import { MinutesArt } from "../PostArt";
import { PostRail } from "../PostRail";
import { tagAccent } from "../tags";
import { APP_NAME } from "@/lib/domains";

const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");

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
  const { parts, toc } = layoutPost(post.html);

  return (
    <div className={`lp pub bl bl--post ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav here="blog" />

      <main id="top">
        <article>
          <section className="pub__hero bl__hero">
            <div className="wrap bl__herogrid">
              <div className="pub__head">
                <nav className="pub__crumbs" aria-label="Breadcrumb">
                  <a href="/blog">Blog</a>
                  {post.tags[0] && <span>{post.tags[0]}</span>}
                </nav>
                <h1>{post.title}</h1>
                <p className="lede">{post.summary}</p>
                <div className="bl__by">
                  {post.author && <span className="bl__av" aria-hidden>{initials(post.author)}</span>}
                  <div>
                    {post.author && <b>{post.author}</b>}
                    <p className="bl__meta">
                      <time dateTime={post.date}>{formatDate(post.date)}</time>
                      <span>{`${post.readingMinutes} min read`}</span>
                      {post.draft && <span className="bl__draft">Draft — only visible in dev</span>}
                    </p>
                  </div>
                </div>
              </div>
              {post.tags.includes("meetings") && <MinutesArt />}
            </div>
          </section>

          <section className="bl__artwrap">
            <div className="wrap">
              <div className="bl__body">
                <PostRail toc={toc} />
                {parts.map((part, i) => part.kind === "stage" ? (
                  <section key={i} className="bl__stage" data-accent={part.accent}>
                    {part.cue && (
                      <div className="bl__cue">
                        <span className="bl__try"><Doodle id="pencil" size={14} viewBox="0 0 24 24" />Try it</span>
                        <p dangerouslySetInnerHTML={{ __html: part.cue }} />
                      </div>
                    )}
                    <div className="bl__demo"><PostDemo name={part.demo} /></div>
                  </section>
                ) : (
                  <div
                    key={i}
                    className={`bl__prose${part.intro ? " bl__prose--intro" : ""}`}
                    data-accent={part.accent}
                    dangerouslySetInnerHTML={{ __html: part.html }}
                  />
                ))}
                {post.author && (
                  <footer className="bl__sign">
                    <span className="bl__av" aria-hidden>{initials(post.author)}</span>
                    <div>
                      <span className="k">Written by</span>
                      <b>{post.author}</b>
                    </div>
                    {post.tags.length > 0 && (
                      <ul className="bl__tags">{post.tags.map(t => <li key={t} className="bl__tag" data-accent={tagAccent(t)}>{t}</li>)}</ul>
                    )}
                  </footer>
                )}
              </div>
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
