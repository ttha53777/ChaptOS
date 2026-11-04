import type { ReactElement } from "react";

export interface Doc {
  id: number;
  title: string;
  url: string;
  description: string | null;
  ogImage: string | null;
  ogTitle: string | null;
  faviconUrl: string | null;
  embedOk: boolean | null;
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
  createdByName: string | null;
  folderId: number | null;
  pinnedAt: string | null;
  // Manual drag-order within its section; null until hand-ordered. Only honored
  // under the "manual" library sort.
  position: number | null;
}

export interface Folder {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
  pinnedAt: string | null;
  // Manual drag-order among unpinned folders; null until hand-ordered.
  position: number | null;
}

/** A small, recognizable "source" type inferred from the URL. We lead with this
 *  instead of a live iframe thumbnail — faster, calmer, and never broken. */
export type Kind = "doc" | "sheet" | "form" | "drive" | "link";

export function kindOf(url: string): Kind {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    path = u.pathname;
  } catch {
    return "link";
  }
  if (host === "forms.gle" || /\/forms\//.test(path) || /forms\.google/.test(host)) return "form";
  if (/\/spreadsheets\//.test(path) || host.includes("sheets.google")) return "sheet";
  if (host.includes("drive.google")) return "drive";
  if (/\/document\//.test(path) || host.includes("docs.google")) return "doc";
  return "link";
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

export const KIND_LABEL: Record<Kind, string> = { doc: "Doc", sheet: "Sheet", form: "Form", drive: "Drive", link: "Link" };

export const KIND_ICON: Record<Kind, ReactElement> = {
  doc: <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4a1 1 0 001 1h4M5 3h9l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />,
  sheet: <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14" />,
  form: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
  drive: <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  link: <path strokeLinecap="round" strokeLinejoin="round" d="M13.83 10.17a4 4 0 00-5.66 0l-4 4a4 4 0 105.66 5.66l1.1-1.1m-.76-4.9a4 4 0 005.66 0l4-4a4 4 0 00-5.66-5.66l-1.1 1.1" />,
};

/** "Jun 27" — with the year appended once the date falls outside the current year. */
export function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString("en-US", opts);
  } catch {
    return "";
  }
}
