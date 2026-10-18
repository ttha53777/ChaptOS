"use client";

/**
 * The top bar's motion, from the mock's script: the bar tightens and frosts
 * once you scroll, a paper tab follows the pointer between the links, the
 * phone menu drops a sheet out of the bar, and on the landing page the
 * squiggle follows the section you're reading. Renders nothing.
 */

import { useEffect, useRef } from "react";

export function SiteNavMotion() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const nav = ref.current?.closest<HTMLElement>(".sn");
    if (!nav) return;
    const ac = new AbortController();
    const on = { signal: ac.signal };
    const links = nav.querySelector<HTMLElement>(".nav-links")!, ink = nav.querySelector<HTMLElement>(".nl-ink")!;
    const nls = [...links.querySelectorAll<HTMLAnchorElement>(".nl")];
    const menu = nav.querySelector<HTMLElement>(".nav-menu")!;

    const inkTo = (a: HTMLElement) => {
      ink.style.setProperty("--x", a.offsetLeft + "px");
      ink.style.width = a.offsetWidth + "px";
      ink.style.setProperty("--ink-c", getComputedStyle(a).getPropertyValue("--c"));
    };
    nls.forEach(a => {
      a.addEventListener("pointerenter", () => {
        // arriving from outside the links, the tab appears under this one rather than sliding in from the last
        if (!links.classList.contains("hov")) { ink.style.transition = "none"; inkTo(a); void ink.offsetWidth; ink.style.transition = ""; }
        inkTo(a); links.classList.add("hov");
      }, on);
      a.addEventListener("focus", () => { inkTo(a); links.classList.add("hov"); }, on);
      a.addEventListener("blur", () => links.classList.remove("hov"), on);
    });
    links.addEventListener("pointerleave", () => links.classList.remove("hov"), on);

    const setMenu = (open: boolean) => { nav.classList.toggle("open", open); menu.setAttribute("aria-expanded", String(open)); };
    menu.addEventListener("click", () => setMenu(!nav.classList.contains("open")), on);
    nav.querySelectorAll(".nav-sheet a").forEach(a => a.addEventListener("click", () => setMenu(false), on));
    addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); }, on);

    // in-page links only: the squiggle marks the section on screen
    const docTop = (el: HTMLElement) => { let t = 0; for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) t += e.offsetTop; return t; };
    const spy = nls.flatMap(a => {
      const h = a.getAttribute("href") ?? "";
      const sec = h.length > 1 && h[0] === "#" ? document.querySelector<HTMLElement>(h) : null;
      return sec ? [[a, sec] as const] : [];
    });
    const tick = () => {
      nav.classList.toggle("scrolled", scrollY > 30);
      const y = scrollY + innerHeight * .4;
      spy.forEach(([a, sec]) => { const t = docTop(sec); a.classList.toggle("on", y >= t && y < t + sec.offsetHeight); });
    };
    tick();
    addEventListener("scroll", tick, { passive: true, signal: ac.signal });
    addEventListener("resize", tick, on);
    return () => ac.abort();
  }, []);
  return <span ref={ref} hidden />;
}
