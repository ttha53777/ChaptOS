import Link from "next/link";
import { PaperIcon } from "../components/paper/PaperIcon";
import { ARTICLES, CATEGORIES, articlesIn, type Article, type Category } from "./content";
import { RailSearch } from "./Search";
import { ThemeSeg } from "./ThemeSeg";

/**
 * The help card beside every article — the sidebar's jobs, now that /help wears
 * the site's top bar instead: home, search, this topic's articles (the one
 * you're reading highlighted), the other topics, light/dark and a human.
 * Taped on in the topic's colour; sticky while the article scrolls. Below
 * 900px it's hidden and the article's MobileHead opens the sheet instead.
 */
export function HelpCard({ article, category, askHref }: { article: Article; category: Category; askHref: string }) {
  const section = articlesIn(category.id);
  return (
    <aside className={`hc-lrail hc-t-${category.tint}`} aria-label="Help navigation">
      <div className="hc-lr-head">
        <Link className="hc-lr-home" href="/help">
          <span className="hc-hb-mark" aria-hidden="true">?</span>
          <span><b>Help centre</b><small>{`${ARTICLES.length} articles`}</small></span>
        </Link>
        <RailSearch />
      </div>
      <div className="hc-lr-body">
        <div>
          <div className={`hc-lr-cat hc-t-${category.tint}`}>
            <span className="hc-tile"><PaperIcon name={category.icon} className="hc-ic" /></span>
            <span><b>{category.title}</b><small>{`${section.length} articles`}</small></span>
          </div>
          <nav className={`hc-lr-list hc-t-${category.tint}`} aria-label={category.title}>
            {section.map(a => (
              <Link key={a.slug} href={`/help/${a.slug}`} aria-current={a.slug === article.slug ? "page" : undefined}>{a.title}</Link>
            ))}
          </nav>
        </div>
        <div>
          <h5>Other topics</h5>
          <nav className="hc-lr-other" aria-label="Other topics">
            {CATEGORIES.filter(c => c.id !== category.id).map(c => {
              const list = articlesIn(c.id);
              return (
                <Link key={c.id} className={`hc-t-${c.tint}`} href={`/help/${list[0].slug}`}>
                  <PaperIcon name={c.icon} className="hc-ic" /><span>{c.title}</span><span className="hc-n">{list.length}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="hc-lr-foot">
        <ThemeSeg />
        <Link className="hc-human" href={askHref}><PaperIcon name="chat" className="hc-ic" />Talk to a human</Link>
      </div>
    </aside>
  );
}
