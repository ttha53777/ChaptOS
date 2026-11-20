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

export { kindOf, hostOf, KIND_LABEL, FOLDER_HUES, folderHue, type Kind, type FolderHue } from "@/lib/docs/library";
import { fmtDate as fmtDateAt, type Kind } from "@/lib/docs/library";

export const KIND_ICON: Record<Kind, ReactElement> = {
  doc: <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4a1 1 0 001 1h4M5 3h9l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />,
  sheet: <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14" />,
  form: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
  drive: <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  link: <path strokeLinecap="round" strokeLinejoin="round" d="M13.83 10.17a4 4 0 00-5.66 0l-4 4a4 4 0 105.66 5.66l1.1-1.1m-.76-4.9a4 4 0 005.66 0l4-4a4 4 0 00-5.66-5.66l-1.1 1.1" />,
};

/** "Jun 27" — with the year appended once the date falls outside the current year. */
export const fmtDate = (iso: string): string => fmtDateAt(iso, new Date());
