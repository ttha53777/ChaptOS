"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Doodle } from "../components/landing/Doodle";
import { CatIcon } from "./CatIcon";
import type { Category, SearchRow, Tint } from "./content";

/**
 * The searchable browse view on /help.
 *
 * Everything is client-side: the index is ~30KB of already-lowercased text
 * handed down from the server page, which is cheaper than a request per
 * keystroke, has no latency, and keeps working when the network doesn't. There
 * is no /api/help.
 *
 * Two states, not three — an empty query browses, a non-empty one searches, and
 * the transition is instantaneous. No "searching…" spinner, because there is
 * nothing to wait for.
 */

export interface BrowseArticle {
  slug: string;
  title: string;
  blurb: string;
}
export interface BrowseCategory extends Category {
  articles: BrowseArticle[];
}
export interface QuickPath {
  slug: string;
  label: string;
  hint: string;
  doodle: string;
  tint: Tint;
}

/**
 * Rank one row against the typed terms. Every term must hit somewhere or the
 * row is out — with a corpus this small, an OR-search returns the whole help
 * centre for "dues invite" and helps nobody.
 *
 * The weights encode one judgement: a word in the title almost always means the
 * article is about that word, and a word in the body almost never does.
 */
function score(row: SearchRow, terms: string[]): number {
  const title = row.title.toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (title.startsWith(term)) total += 14;
    else if (title.includes(term)) total += 9;
    else if (row.head.includes(term)) total += 5;
    else if (row.body.includes(term)) total += 1;
    else return 0; // a term nothing matched disqualifies the row
  }
  return total;
}

export function HelpBrowser({
  categories,
  rows,
  quickPaths,
}: {
  categories: BrowseCategory[];
  rows: SearchRow[];
  quickPaths: QuickPath[];
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses search from anywhere on the page, Escape clears and blurs — the
  // two shortcuts people try without being told. Ignored while typing in a
  // field so "/" stays a slash inside the search box itself.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable;
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && el === inputRef.current) {
        setQ("");
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const terms = useMemo(
    () => q.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [q],
  );

  const results = useMemo(() => {
    if (!terms.length) return [];
    return rows
      .map(r => ({ row: r, s: score(r, terms) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.row.title.localeCompare(b.row.title))
      .map(x => x.row);
  }, [rows, terms]);

  const searching = terms.length > 0;

  return (
    <>
      <div className="hc__searchwrap">
        <div className="hc__search">
          <Doodle
            id="key"
            size={19}
            viewBox="0 0 24 24"
            className="doodle doodle--thin hc__search-ic"
          />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search — dues, invite link, attendance, export…"
            aria-label="Search the help centre"
            autoComplete="off"
            spellCheck={false}
          />
          {q ? (
            <button type="button" className="hc__clear" onClick={() => setQ("")}>
              Clear
            </button>
          ) : (
            <kbd className="hc__kbd" aria-hidden="true">
              /
            </kbd>
          )}
        </div>
        <p className="hc__searchnote" role="status">
          {searching
            ? `${results.length} ${results.length === 1 ? "article" : "articles"} for “${q.trim()}”`
            : `${rows.length} articles. Every one of them describes something that exists today.`}
        </p>
      </div>

      {searching ? (
        results.length ? (
          <ul className="hc__results">
            {results.map(r => (
              <li key={r.slug}>
                <a href={`/help/${r.slug}`}>
                  <span className="hc__rcat">{r.categoryTitle}</span>
                  <span className="hc__rt">{r.title}</span>
                  <span className="hc__rb">{r.blurb}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="hc__empty">
            <h3>Nothing matched “{q.trim()}”.</h3>
            <p>
              Search covers the whole text of every article, so if it isn&apos;t here it
              probably isn&apos;t written yet — which is worth knowing about.
            </p>
            <a className="btn" href="/contact">
              Ask a human instead{" "}
              <Doodle id="arrow-r" size={16} viewBox="0 0 24 24" />
            </a>
          </div>
        )
      ) : (
        <>
          {/* ---- the three journeys people arrive on ---- */}
          <div className="hc__paths">
            {quickPaths.map(p => (
              <a key={p.slug} className="hc__path" href={`/help/${p.slug}`}>
                <CatIcon doodle={p.doodle} tint={p.tint} size={19} />
                <h4>{p.label}</h4>
                <p>{p.hint}</p>
                <span className="hc__go">
                  Read it <Doodle id="arrow-r" size={14} viewBox="0 0 24 24" />
                </span>
              </a>
            ))}
          </div>

          {/* ---- everything, by category ---- */}
          <div className="hc__cats">
            {categories.map(c => (
              <section key={c.id} className="hc__cat" id={c.id}>
                <div className="hc__cathead">
                  <CatIcon doodle={c.doodle} tint={c.tint} />
                  <div>
                    <h3>{c.title}</h3>
                    <p>{c.blurb}</p>
                  </div>
                </div>
                <ul className="hc__arts">
                  {c.articles.map(a => (
                    <li key={a.slug}>
                      <a href={`/help/${a.slug}`}>
                        <span className="t">{a.title}</span>
                        <span className="b">{a.blurb}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
