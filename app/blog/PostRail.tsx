"use client";
// The post's reading aids: a progress bar along the top of the window, and on
// wide screens a contents rail in the left margin that follows the section
// you're reading. The rail steps aside whenever a demo band scrolls past it,
// since the demos take the full width.
import { useEffect, useRef, useState } from "react";
import type { TocEntry } from "./layout-post";

export function PostRail({ toc }: { toc: TocEntry[] }) {
  const [active, setActive] = useState(toc[0]?.id);
  const [hidden, setHidden] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const rail = useRef<HTMLElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = 0;
      let cur = toc[0]?.id;
      for (const t of toc) {
        const el = document.getElementById(t.id);
        if (el && el.getBoundingClientRect().top < innerHeight * 0.4) cur = t.id;
      }
      setActive(cur);

      const body = document.querySelector(".bl__body");
      if (body && bar.current) {
        const r = body.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (innerHeight * 0.5 - r.top) / r.height));
        bar.current.style.width = `${p * 100}%`;
      }

      const rr = rail.current?.getBoundingClientRect();
      if (rr && rr.height) {
        setHidden([...document.querySelectorAll(".bl__stage")].some(s => {
          const b = s.getBoundingClientRect();
          return b.top < rr.bottom + 28 && b.bottom > rr.top - 28;
        }));
      }
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    tick();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", on);
      removeEventListener("resize", on);
    };
  }, [toc]);

  return (
    <>
      <div className="progress" aria-hidden><i ref={bar} /></div>
      {toc.length > 2 && (
        <aside className="bl__rail" aria-label="In this post">
          <nav ref={rail} className={`bl__railin${hidden ? " is-hidden" : ""}`}>
            <span className="bl__railk">In this post</span>
            <ol>
              {toc.map(t => (
                <li key={t.id} data-accent={t.accent} className={t.id === active ? "is-on" : undefined}>
                  <a href={`#${t.id}`}>
                    <b>{String(t.n).padStart(2, "0")}</b>
                    <span>{t.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      )}
    </>
  );
}
