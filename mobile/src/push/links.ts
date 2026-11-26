/**
 * A push's chaptos://org/<slug>/<path> → the app screen it opens. Pure, so it
 * can be read (and checked) without a phone. Paths come from the server
 * (lib/api-types/push.ts PushPayload); an unknown one opens Today.
 */
export interface PushTarget { slug: string; href: string }

export function pushTarget(url: unknown): PushTarget | null {
  if (typeof url !== "string") return null;
  const m = /^chaptos:\/\/org\/([^/?#]+)\/?([^?#]*)/.exec(url);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]!);
  const [head, id] = (m[2] ?? "").split("/");
  const n = id && /^\d+$/.test(id) ? id : null;
  switch (head) {
    case "checkin":  return { slug, href: "/checkin" };
    case "tasks":    return { slug, href: n ? `/more/tasks?open=${n}` : "/more/tasks" };
    case "polls":    return { slug, href: n ? `/more/tasks?poll=${n}` : "/more/tasks" };
    case "dues":     return { slug, href: "/more/dues" };
    case "excuses":  return { slug, href: "/more/excuses" };
    case "requests": return { slug, href: "/members" };
    default:         return { slug, href: "/today" };
  }
}
