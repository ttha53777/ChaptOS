import Link from "next/link";
import { PaperIcon } from "../components/paper/PaperIcon";
import { CATEGORIES, articlesIn } from "./content";

/**
 * The index hero's right half: the help centre as a spiral-bound field guide.
 * A divider tab per topic sticks out past the cover (hover pulls one out), the
 * cover carries the contents with each topic's article count, and a sticky
 * note says where search lives. Every tab and contents row opens that topic's
 * first article. Hidden below 980px, where the hero is a single column.
 */
export function FieldGuide() {
  const topics = CATEGORIES.map(c => ({ c, first: articlesIn(c.id)[0], n: articlesIn(c.id).length }));
  return (
    <div className="hc-guide">
      <div className="hc-g-book">
        <span className="hc-g-page hc-p2" />
        {/* the tabs repeat the contents below as a picture, so they stay out of the tab order and the a11y tree */}
        <nav className="hc-g-tabs" aria-hidden="true">
          {topics.map(({ c, first }) => (
            <Link key={c.id} className={`hc-g-tab hc-t-${c.tint}`} href={`/help/${first.slug}`} title={c.title} tabIndex={-1}>
              <PaperIcon name={c.icon} className="hc-ic" /><span>{c.title}</span>
            </Link>
          ))}
        </nav>
        <div className="hc-g-cover">
          <span className="hc-g-tape" aria-hidden="true" />
          <span className="hc-g-label"><i />FIELD GUIDE · VOL. 1</span>
          <h2>How ChaptOS <em>actually</em> works</h2>
          <p>The real screens, step by step.</p>
          <nav className="hc-g-idx" aria-label="Contents">
            <h3>Contents</h3>
            <ol>
              {topics.map(({ c, first, n }) => (
                <li key={c.id}>
                  <Link className={`hc-t-${c.tint}`} href={`/help/${first.slug}`}>
                    <i />{c.title}<span className="hc-ld" /><b>{n}</b>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <div className="hc-g-rings" aria-hidden="true">
          {Array.from({ length: 11 }, (_, i) => <i key={i} />)}
        </div>
      </div>
      <div className="hc-g-note"><b>Lost? Press <kbd>/</kbd></b>Search works from any page, not just this one.</div>
    </div>
  );
}
