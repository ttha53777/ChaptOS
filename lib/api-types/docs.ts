// Docs library wire shapes (read-only for the app). Type-only: see lib/api-types/index.ts for the rules.

/** GET /api/docs — a link in the library, newest first. Docs attached to a
 *  programming event are not listed. */
export interface Doc {
  id: number;
  organizationId: number;
  title: string;
  url: string;
  description: string | null;
  /** Cached link preview; any of these may be null until the probe ran. */
  ogImage: string | null;
  ogTitle: string | null;
  faviconUrl: string | null;
  /** null = not probed yet; false = the site refuses to be framed. */
  embedOk: boolean | null;
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
  /** null = the library root. */
  folderId: number | null;
  /** Set when pinned; pinned docs float to the top, newest pin first. */
  pinnedAt: string | null;
  /** Manual order within a section; null = never hand-ordered. */
  position: number | null;
  /** The contributor's name in this org; null when they've left it. */
  createdByName: string | null;
}

/** GET /api/docs/folders — by name. */
export interface DocFolder {
  id: number;
  organizationId: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
  pinnedAt: string | null;
  position: number | null;
}

/** POST /api/docs, PATCH /api/docs/[id] (and /move, /pin), POST /api/docs/refresh-metadata:
 *  the saved row, without the contributor's name (only the list joins it; carry it over). */
export type DocSaved = Omit<Doc, "createdByName">;
