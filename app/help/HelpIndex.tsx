"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PaperIcon } from "../components/paper/PaperIcon";
import { FIND_ID } from "./HelpShell";
import {
  ARTICLES, ARTICLES_BY_SLUG, CATEGORIES, CATEGORIES_BY_ID, SEARCH_INDEX, articlesIn,
  type Audience, type SearchRow,
} from "./content";

/**
 * The interactive half of /help: the ⌘K-style search card, the "Show me what's
 * for" filter, and the topic shelf it filters. `between` is the server-rendered
 * middle of the page (sticky-note doors, the term journey), slotted between the
 * filter and the shelf it drives.
 *
 * Search is client-side over SEARCH_INDEX — no /api/help, no request per
 * keystroke. Every typed word must hit somewhere or the article is out; a title
 * or keyword hit outranks a body hit.
 */

type Who = "all" | Audience;
const WHO: [Who, string][] = [["all", "Everything"], ["member", "Members"], ["officer", "Officers"], ["admin", "Org admins"]];

function score(row: SearchRow, words: string[]): number | null {
  let s = 0;
  for (const w of words) {
    if (row.head.includes(w)) s += 3;
    else if (row.body.includes(w)) s += 1;
    else return null;
  }
  return s;
}

export function HelpIndex({ between }: { between: ReactNode }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [who, setWho] = useState<Who>("all");

  // /help#find (the sidebar's search button, or "/" from an article) asks for focus.
  useEffect(() => {
    function focusIfAsked() {
      if (window.location.hash === `#${FIND_ID}`) document.getElementById(FIND_ID)?.focus();
    }
    focusIfAsked();
    window.addEventListener("hashchange", focusIfAsked);
    return () => window.removeEventListener("hashchange", focusIfAsked);
  }, []);

  const hits = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    return SEARCH_INDEX
      .map(row => ({ row, s: score(row, words) }))
      .filter((x): x is { row: SearchRow; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 7)
      .map(x => ARTICLES_BY_SLUG.get(x.row.slug)!);
  }, [query]);

  const shows = (aud: Audience[]) => who === "all" || aud.includes(who);

  return (
    <>
      <div className="hc-find">
        <label className="hc-find-box">
          <PaperIcon name="search" className="hc-ic" />
          <input
            id={FIND_ID}
            type="search"
            autoComplete="off"
            placeholder="Try “dues”, “join request”, “check-in”, “receipt”…"
            aria-label="Search the help centre"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && hits?.[0]) router.push(`/help/${hits[0].slug}`);
              if (e.key === "Escape") setQuery("");
            }}
          />
          <kbd>/</kbd>
        </label>
        {hits && (
          <div className="hc-find-res" role="list">
            {hits.length ? hits.map((a, i) => {
              const c = CATEGORIES_BY_ID.get(a.categoryId)!;
              return (
                <Link key={a.slug} role="listitem" href={`/help/${a.slug}`} className={i === 0 ? "hc-on" : undefined}>
                  <span className={`hc-tile hc-t-${c.tint}`}><PaperIcon name={a.icon} className="hc-ic" /></span>
                  <span>
                    <span className="hc-t">{a.title}</span>
                    <span className="hc-b" style={{ display: "block" }}>{a.blurb}</span>
                  </span>
                </Link>
              );
            }) : (
              <div className="hc-find-none">
                {`Nothing matches “${query}”. If it isn't here, it probably isn't written yet — and that's worth telling us.`}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="hc-who">
        <span>Show me what&apos;s for</span>
        <div className="hc-tabs" role="group" aria-label="Filter by role">
          {WHO.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={who === k} onClick={() => setWho(k)}>
              {label}
              <span className="hc-n">{k === "all" ? ARTICLES.length : ARTICLES.filter(a => a.aud.includes(k)).length}</span>
            </button>
          ))}
        </div>
      </div>

      {between}

      <div className="hc-sec-h"><h2>Everything, by topic</h2><span className="hc-rule" /></div>
      <div className="hc-shelf">
        {CATEGORIES.map(c => {
          const all = articlesIn(c.id);
          const shown = all.filter(a => shows(a.aud));
          return (
            <section key={c.id} className="hc-card hc-cat" id={c.id}>
              <div className="hc-cat-h">
                <span className={`hc-tile hc-t-${c.tint}`}><PaperIcon name={c.icon} className="hc-ic" /></span>
                <h3>{c.title}</h3>
                <span className="hc-n">{`${shown.length}/${all.length}`}</span>
              </div>
              <p>{c.blurb}</p>
              {shown.length ? (
                <ul>
                  {shown.map(a => (
                    <li key={a.slug}>
                      <Link href={`/help/${a.slug}`}>
                        <PaperIcon name={a.icon} className="hc-ic" />
                        <span>{a.title}</span>
                        {a.aud.length === 1 && a.aud[0] === "admin" && (
                          <span className="hc-lk" title="Org admin"><PaperIcon name="lock" className="hc-ic" /></span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hc-cat-empty">Nothing here is specific to this role.</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
