"use client";

import { useEffect, useState } from "react";
import { PaperIcon } from "../components/paper/PaperIcon";

/**
 * Light / night paper for the help centre. The page shows this switch in up to
 * three places (the index kicker, the help card, the phone sheet), so each one
 * listens for the others' changes rather than holding its own truth.
 */

const THEME_KEY = "chaptos-help-theme";
const CHANGED = "hc:theme";
type Theme = "light" | "dark";

/** Inline, pre-paint: apply the reader's saved paper to the .hc root. */
export const HELP_THEME_BOOT =
  `try{if(localStorage.getItem(${JSON.stringify(THEME_KEY)})==="dark")` +
  `document.currentScript.parentElement.setAttribute("data-hc-theme","dark")}catch(e){}`;

function root(): HTMLElement | null {
  return document.querySelector(".hc");
}

function current(): Theme {
  return root()?.getAttribute("data-hc-theme") === "dark" ? "dark" : "light";
}

/** Re-applies the saved choice: the boot script only runs on a full page load. */
export function applySavedHelpTheme() {
  let saved: Theme = "light";
  try { if (localStorage.getItem(THEME_KEY) === "dark") saved = "dark"; } catch { /* storage blocked */ }
  if (saved === "dark") root()?.setAttribute("data-hc-theme", "dark");
}

export function ThemeSeg() {
  // null until mounted: the boot script already applied the saved theme, and
  // rendering "light" from a default would flash the wrong button pressed.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(current());
    const sync = () => setTheme(current());
    window.addEventListener(CHANGED, sync);
    return () => window.removeEventListener(CHANGED, sync);
  }, []);

  function choose(next: Theme) {
    const el = root();
    if (next === "dark") el?.setAttribute("data-hc-theme", "dark");
    else el?.removeAttribute("data-hc-theme");
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: this visit only */ }
    window.dispatchEvent(new Event(CHANGED));
  }

  return (
    <div className="hc-seg" role="group" aria-label="Appearance">
      <button type="button" aria-pressed={theme === "light"} title="Light" onClick={() => choose("light")}>
        <PaperIcon name="sun" className="hc-ic" /><span className="hc-sr-only">Light</span>
      </button>
      <button type="button" aria-pressed={theme === "dark"} title="Dark" onClick={() => choose("dark")}>
        <PaperIcon name="moon" className="hc-ic" /><span className="hc-sr-only">Dark</span>
      </button>
    </div>
  );
}
