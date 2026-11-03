"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PaperIcon } from "../components/paper/PaperIcon";
import { ARTICLES_BY_SLUG, CATEGORIES, articlesIn } from "./content";
import { FindResults, RAIL_FIND_ID, useHelpSearch } from "./Search";

/**
 * What every /help page shares besides the site bar and footer: the "/"
 * shortcut, and the phone help sheet (search, every topic, a human). The sheet is opened from the chip + search button at the head of an
 * article on phones (MobileHead), through openHelpSheet().
 *
 * "/" focuses the index's big search when it's on the page, the help card's
 * search beside an article, or opens the sheet on a phone.
 */

/** The id of the index's search input — also the #hash that asks for focus. */
export const FIND_ID = "find";

const OPEN = "hc:sheet";

/** Opens the phone help sheet; `find` puts the cursor in its search box. */
export function openHelpSheet(find: boolean) {
  window.dispatchEvent(new CustomEvent(OPEN, { detail: { find } }));
}

export function HelpShell() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const hits = useHelpSearch(query);
  const input = useRef<HTMLInputElement>(null);

  const slug = pathname.startsWith("/help/") ? pathname.slice("/help/".length) : null;
  const current = slug ? ARTICLES_BY_SLUG.get(slug) : undefined;

  useEffect(() => {
    function onOpen(e: Event) {
      setQuery("");
      setOpen(true);
      if ((e as CustomEvent<{ find: boolean }>).detail?.find) setTimeout(() => input.current?.focus(), 60);
    }
    window.addEventListener(OPEN, onOpen);
    return () => window.removeEventListener(OPEN, onOpen);
  }, []);

  // The sheet closes whenever the page changes underneath it.
  useEffect(() => { setOpen(false); }, [pathname]);

  // The page behind doesn't scroll while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = before; };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); return; }
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      e.preventDefault();
      const big = document.getElementById(FIND_ID);
      if (big) { big.focus(); big.scrollIntoView({ block: "center" }); return; }
      if (window.matchMedia("(max-width: 900px)").matches) { openHelpSheet(true); return; }
      const rail = document.getElementById(RAIL_FIND_ID);
      if (rail) rail.focus();
      else router.push(`/help#${FIND_ID}`);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div
      className={`hc-hs${open ? " hc-on" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Help menu"
      aria-hidden={!open}
      onClick={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).closest("a")) setOpen(false); }}
    >
      <div className="hc-hs-p">
        <div className="hc-hs-grab" />
        <div className="hc-hs-top">
          <label className="hc-sbox">
            <PaperIcon name="search" className="hc-ic" />
            <input
              ref={input}
              type="search"
              autoComplete="off"
              placeholder="Search help"
              aria-label="Search the help centre"
              tabIndex={open ? 0 : -1}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && hits?.[0]) router.push(`/help/${hits[0].slug}`); }}
            />
          </label>
          <button type="button" className="hc-hs-x" aria-label="Close" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>
            <PaperIcon name="x" className="hc-ic" />
          </button>
        </div>
        <div className="hc-hs-b">
          {hits ? <FindResults hits={hits} query={query} /> : (
            <>
              <h5>Topics</h5>
              {CATEGORIES.map(c => {
                const list = articlesIn(c.id);
                return (
                  <Link
                    key={c.id}
                    className={`hc-hs-cat hc-t-${c.tint}`}
                    href={`/help/${list[0].slug}`}
                    aria-current={current?.categoryId === c.id ? "page" : undefined}
                    tabIndex={open ? 0 : -1}
                  >
                    <span className="hc-tile"><PaperIcon name={c.icon} className="hc-ic" /></span>
                    <b>{c.title}</b>
                    <span className="hc-n">{list.length}</span>
                  </Link>
                );
              })}
            </>
          )}
        </div>
        <div className="hc-hs-foot">
          <Link href="/help" tabIndex={open ? 0 : -1}><PaperIcon name="home" className="hc-ic" />All articles</Link>
          <Link href={slug ? `/contact?from=${encodeURIComponent(slug)}` : "/contact"} tabIndex={open ? 0 : -1}>
            <PaperIcon name="chat" className="hc-ic" />A human
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Phones: the article's head row — "Help / <topic>" and a search button, both opening the sheet. */
export function MobileHead({ tint, icon, title }: { tint: string; icon: React.ComponentProps<typeof PaperIcon>["name"]; title: string }) {
  return (
    <div className="hc-mhead">
      <button type="button" className={`hc-mchip hc-t-${tint}`} aria-label="Help topics" onClick={() => openHelpSheet(false)}>
        <span className="hc-hb-mark" aria-hidden="true">?</span>Help<i>/</i>
        <span className="hc-ct"><PaperIcon name={icon} className="hc-ic" /><span>{title}</span></span>
        <PaperIcon name="chev-d" className="hc-chev" />
      </button>
      <button type="button" className="hc-mfind" aria-label="Search help" onClick={() => openHelpSheet(true)}>
        <PaperIcon name="search" className="hc-ic" />
      </button>
    </div>
  );
}
