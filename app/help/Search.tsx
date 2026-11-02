"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PaperIcon } from "../components/paper/PaperIcon";
import { ARTICLES_BY_SLUG, CATEGORIES_BY_ID, SEARCH_INDEX, type Article, type SearchRow } from "./content";

/**
 * Help search, shared by the index's big card, the help card beside every
 * article, and the phone sheet. Client-side over SEARCH_INDEX — no /api/help,
 * no request per keystroke. Every typed word must hit somewhere or the article
 * is out; a title or keyword hit outranks a body hit.
 */

function score(row: SearchRow, words: string[]): number | null {
  let s = 0;
  for (const w of words) {
    if (row.head.includes(w)) s += 3;
    else if (row.body.includes(w)) s += 1;
    else return null;
  }
  return s;
}

/** Up to seven articles for `query`, best first; null while the box is empty. */
export function useHelpSearch(query: string): Article[] | null {
  return useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    return SEARCH_INDEX
      .map(row => ({ row, s: score(row, words) }))
      .filter((x): x is { row: SearchRow; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 7)
      .map(x => ARTICLES_BY_SLUG.get(x.row.slug)!);
  }, [query]);
}

/** The result list under any of the search boxes. */
export function FindResults({ hits, query, onPick }: { hits: Article[]; query: string; onPick?: () => void }) {
  return (
    <div className="hc-find-res" role="list">
      {hits.length ? hits.map((a, i) => {
        const c = CATEGORIES_BY_ID.get(a.categoryId)!;
        return (
          <Link key={a.slug} role="listitem" href={`/help/${a.slug}`} className={i === 0 ? "hc-on" : undefined} onClick={onPick}>
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
  );
}

/** The id of the help card's search input — what "/" focuses on an article. */
export const RAIL_FIND_ID = "hq";

/** The help card's search: a small box whose results drop over the article. */
export function RailSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const hits = useHelpSearch(query);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  function done() { setQuery(""); setOpen(false); }

  return (
    <div className="hc-lr-search" ref={box}>
      <label className="hc-sbox">
        <PaperIcon name="search" className="hc-ic" />
        <input
          id={RAIL_FIND_ID}
          type="search"
          autoComplete="off"
          placeholder="Search help"
          aria-label="Search the help centre"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === "Enter" && hits?.[0]) { router.push(`/help/${hits[0].slug}`); done(); }
            if (e.key === "Escape") { done(); e.currentTarget.blur(); }
          }}
        />
        <kbd>/</kbd>
      </label>
      {open && hits && (
        <div className="hc-lr-res"><FindResults hits={hits} query={query} onPick={done} /></div>
      )}
    </div>
  );
}
