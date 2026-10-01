/**
 * The sidebar's collapsed "rail" state — a per-viewer layout preference, not org
 * config. Same trick as lib/theme.ts: it lives on <html data-sb="rail">, stamped
 * by a blocking inline script, and app/components/sidebar.css keys the 60px width
 * off that attribute. The sidebar remounts on every page (each page renders its
 * own <Sidebar>), so keeping this in React state would flash 240 → 60 on reloads.
 */

export const SIDEBAR_RAIL_STORAGE_KEY = "chaptos:sidebar-rail:v1";

export const SIDEBAR_RAIL_BOOT = `try{if(localStorage.getItem(${JSON.stringify(SIDEBAR_RAIL_STORAGE_KEY)})==="1")document.documentElement.dataset.sb="rail"}catch(e){}`;
