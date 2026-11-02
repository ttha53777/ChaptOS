"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PaperIcon } from "../components/paper/PaperIcon";
import { FIND_ID } from "./HelpShell";
import { FindResults, useHelpSearch } from "./Search";
import { ARTICLES, CATEGORIES, articlesIn, type Audience } from "./content";

/**
 * The interactive half of /help: the ⌘K-style search card, the "Show me what's
 * for" filter, and the topic shelf it filters. The server renders the rest and
 * slots it in: `head` (kicker, title, lede) above the search in the hero's left
 * column, `aside` (the field guide) as the hero's right column, and `between`
 * (sticky-note doors, the term journey) between the hero and the shelf the
 * filter drives.
 */

type Who = "all" | Audience;
const WHO: [Who, string][] = [["all", "Everything"], ["member", "Members"], ["officer", "Officers"], ["admin", "Org admins"]];

export function HelpIndex({ head, aside, between }: { head: ReactNode; aside: ReactNode; between: ReactNode }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [who, setWho] = useState<Who>("all");

  // /help#find ("/" on a page with no search box of its own) asks for focus.
  useEffect(() => {
    function focusIfAsked() {
      if (window.location.hash === `#${FIND_ID}`) document.getElementById(FIND_ID)?.focus();
    }
    focusIfAsked();
    window.addEventListener("hashchange", focusIfAsked);
    return () => window.removeEventListener("hashchange", focusIfAsked);
  }, []);

  const hits = useHelpSearch(query);

  const shows = (aud: Audience[]) => who === "all" || aud.includes(who);

  return (
    <>
      <div className="hc-hero">
        <div>
          {head}
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
            {hits && <FindResults hits={hits} query={query} />}
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
        </div>
        {aside}
      </div>

      {between}

      <div className="hc-sec-h"><h2>Everything, by topic</h2><span className="hc-rule" /></div>
      <div className="hc-shelf">
        {CATEGORIES.map(c => {
          const all = articlesIn(c.id);
          const shown = all.filter(a => shows(a.aud));
          return (
            <section key={c.id} className={`hc-card hc-cat hc-t-${c.tint}`} id={c.id}>
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
