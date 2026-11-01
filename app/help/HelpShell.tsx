"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PaperIcon } from "../components/paper/PaperIcon";
import { ARTICLES, ARTICLES_BY_SLUG, CATEGORIES, articlesIn } from "./content";

/**
 * The sidebar every /help page sits inside — the app's own Paper sidebar,
 * repurposed: the brand mark, a search shortcut, every topic (the current
 * article's section expanded to its articles), and a foot with light/dark and
 * the way to a human. Below 1024px it becomes the app's drawer behind a menu bar.
 *
 * "/" anywhere focuses the index's search (navigating there first if needed),
 * matching the hint on both search boxes.
 */

const THEME_KEY = "chaptos-help-theme";
type Theme = "light" | "dark";

/** Inline, pre-paint: apply the reader's saved paper to the .hc root. */
export const HELP_THEME_BOOT =
  `try{if(localStorage.getItem(${JSON.stringify(THEME_KEY)})==="dark")` +
  `document.currentScript.parentElement.setAttribute("data-hc-theme","dark")}catch(e){}`;

/** The id of the index's search input — also the #hash that asks for focus. */
export const FIND_ID = "find";

function root(): HTMLElement | null {
  return document.querySelector(".hc");
}

/** The ChaptOS mark (components/landing/DoodleSprite.tsx BrandMark), tilted like an org logo. */
function BrandMark() {
  return (
    <svg className="hc-sb-brand" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="2.5" y="4.5" width="35" height="31" rx="9" fill="#FFE5A0" stroke="#26211B" strokeWidth="2.4" />
      <path d="M12 21.5c2.2 3.4 5 5 8.4 5 3.2 0 5.9-1.5 8-4.6" fill="none" stroke="#26211B" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="14.6" cy="16" r="1.9" fill="#26211B" />
      <circle cx="25.4" cy="16" r="1.9" fill="#26211B" />
    </svg>
  );
}

export function HelpShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const slug = pathname.startsWith("/help/") ? pathname.slice("/help/".length) : null;
  const current = slug ? ARTICLES_BY_SLUG.get(slug) : undefined;

  const [open, setOpen] = useState(false);
  // null until mounted: the boot script already applied the saved theme, and
  // writing "light" from a default here would undo it for a frame.
  const [theme, setTheme] = useState<Theme | null>(null);

  // The boot script only runs on a full page load; arriving by client-side
  // navigation skips it, so apply the saved choice here as well.
  useEffect(() => {
    let saved: Theme = "light";
    try { if (localStorage.getItem(THEME_KEY) === "dark") saved = "dark"; } catch { /* storage blocked */ }
    if (saved === "dark") root()?.setAttribute("data-hc-theme", "dark");
    setTheme(saved);
  }, []);

  function chooseTheme(next: Theme) {
    setTheme(next);
    const el = root();
    if (next === "dark") el?.setAttribute("data-hc-theme", "dark");
    else el?.removeAttribute("data-hc-theme");
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: this visit only */ }
  }

  // The drawer closes whenever the page changes underneath it.
  useEffect(() => { setOpen(false); }, [pathname]);

  const find = useCallback(() => {
    const input = document.getElementById(FIND_ID);
    if (input) { input.focus(); input.scrollIntoView({ block: "center" }); }
    else router.push(`/help#${FIND_ID}`);
  }, [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      e.preventDefault();
      find();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [find]);

  return (
    <div className="hc-app">
      <aside className={`hc-sb${open ? " hc-open" : ""}`} aria-label="Help navigation">
        <Link className="hc-sb-org" href="/help">
          <BrandMark />
          <span><b>Help centre</b><small>ChaptOS · field guide</small></span>
        </Link>

        <nav className="hc-sb-scroll">
          <button type="button" className="hc-sb-search" onClick={() => { setOpen(false); find(); }}>
            <PaperIcon name="search" className="hc-ic" />Search help<kbd>/</kbd>
          </button>

          <div className="hc-grp" style={{ "--eb": "var(--butter)" } as React.CSSProperties}>
            <div className="hc-grp-h"><span>Start here</span></div>
            <Link className="hc-item" href="/help" aria-current={pathname === "/help" ? "page" : undefined}>
              <PaperIcon name="home" className="hc-ic" /><span className="hc-lbl">All of it</span><span className="hc-n">{ARTICLES.length}</span>
            </Link>
          </div>

          <div className="hc-grp" style={{ "--eb": "var(--lilac)" } as React.CSSProperties}>
            <div className="hc-grp-h"><span>Topics</span></div>
            {CATEGORIES.map(c => {
              const list = articlesIn(c.id);
              const here = current?.categoryId === c.id;
              return (
                <div key={c.id}>
                  <Link className="hc-item" href={`/help/${list[0].slug}`} aria-current={here ? "page" : undefined}>
                    <PaperIcon name={c.icon} className="hc-ic" /><span className="hc-lbl">{c.title}</span><span className="hc-n">{list.length}</span>
                  </Link>
                  {here && (
                    <div className="hc-sub">
                      {list.map(a => (
                        <Link key={a.slug} href={`/help/${a.slug}`} aria-current={a.slug === slug ? "page" : undefined}>{a.title}</Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hc-grp" style={{ "--eb": "var(--mint)" } as React.CSSProperties}>
            <div className="hc-grp-h"><span>ChaptOS</span></div>
            <Link className="hc-item" href="/"><PaperIcon name="door" className="hc-ic" /><span className="hc-lbl">Back to chaptos.com</span></Link>
          </div>
        </nav>

        <div className="hc-sb-foot">
          <div className="hc-seg" role="group" aria-label="Appearance">
            <button type="button" aria-pressed={theme === "light"} title="Light" onClick={() => chooseTheme("light")}>
              <PaperIcon name="sun" className="hc-ic" /><span className="hc-sr-only">Light</span>
            </button>
            <button type="button" aria-pressed={theme === "dark"} title="Dark" onClick={() => chooseTheme("dark")}>
              <PaperIcon name="moon" className="hc-ic" /><span className="hc-sr-only">Dark</span>
            </button>
          </div>
          <Link className="hc-sb-human" href="/contact"><PaperIcon name="chat" className="hc-ic" />Talk to a human</Link>
        </div>
      </aside>
      <button type="button" className={`hc-shade${open ? " hc-open" : ""}`} aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />

      <div className="hc-main">
        <div className="hc-mbar">
          <button type="button" className="hc-iconbtn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <PaperIcon name="menu" className="hc-ic" />
          </button>
          <b>Help centre</b>
        </div>
        {children}
      </div>
    </div>
  );
}
