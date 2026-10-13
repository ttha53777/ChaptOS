"use client";
// The nav's scrolled state, for pages without LandingMotion: clear over the
// page head, frosted with a hairline once you scroll (`.lp .nav.is-stuck` in
// landing.css). Same 18px threshold LandingMotion uses on the landing page.
import { useEffect, useRef } from "react";

export function NavStick() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const nav = ref.current?.closest(".nav");
    if (!nav) return;
    const tick = () => nav.classList.toggle("is-stuck", scrollY > 18);
    tick();
    addEventListener("scroll", tick, { passive: true });
    return () => removeEventListener("scroll", tick);
  }, []);
  return <span ref={ref} hidden />;
}
