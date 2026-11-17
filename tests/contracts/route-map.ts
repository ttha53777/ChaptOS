/**
 * The member-facing route map, read from the doc comment in lib/api-types/index.ts
 * so the list the app is promised and the list the bearer tests check can't
 * drift. Runtime code, so it lives here rather than in the type-only api-types.
 *
 * Only an entry's leading METHOD + path is parsed; extra verbs mentioned in the
 * notes column ("DELETE undoes") are not separate entries.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RouteEntry {
  method: Method;
  /** As written, e.g. /api/tasks/[id]. */
  path: string;
  /** Query the entry names inline (`?threadId=`), without the `?`. */
  query: string | null;
  /** The route handler file this resolves to. */
  file: string;
}

const ENTRY = /^ \*\s{3}(GET|POST|PATCH|PUT|DELETE)\s+(\/api\/\S+)/;

export function readRouteMap(root = process.cwd()): RouteEntry[] {
  const src = readFileSync(path.join(root, "lib/api-types/index.ts"), "utf8");
  const out: RouteEntry[] = [];
  for (const line of src.split("\n")) {
    const m = ENTRY.exec(line);
    if (!m) continue;
    const [p, q] = m[2].split("?");
    out.push({ method: m[1] as Method, path: p, query: q ?? null, file: path.join(root, "app", p, "route.ts") });
  }
  return out;
}
