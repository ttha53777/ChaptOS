/**
 * Best-effort scraper for the metadata we need to render a Doc card when the
 * destination URL refuses iframe embedding.
 *
 * Network calls have a 5s timeout and a 256KB read cap — we only need the
 * <head>, so there's no value (and real risk) in pulling down megabytes from a
 * hostile URL. Every failure mode degrades gracefully to `embedOk: null`,
 * never throws.
 */

const FETCH_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 256 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (compatible; ChaptOS-Docs/1.0; +https://github.com/anthropics/claude-code)";

interface ScrapedMetadata {
  ogImage: string | null;
  ogTitle: string | null;
  faviconUrl: string | null;
  /** True = headers permit embedding, false = blocked, null = couldn't tell */
  embedOk: boolean | null;
}

const EMPTY: ScrapedMetadata = { ogImage: null, ogTitle: null, faviconUrl: null, embedOk: null };

export async function scrapeMetadata(rawUrl: string): Promise<ScrapedMetadata> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return EMPTY;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return EMPTY;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return EMPTY;
  }

  const embedOk = canEmbed(res.headers);
  const ct = res.headers.get("content-type") ?? "";
  // If it isn't HTML there are no OG tags to parse, but the embed verdict is
  // still useful (an image/* URL embeds fine; a PDF usually does not).
  if (!ct.toLowerCase().includes("text/html")) {
    return { ...EMPTY, embedOk, faviconUrl: defaultFavicon(url) };
  }

  const html = await readCapped(res, MAX_HTML_BYTES);
  return {
    ogImage: absolutize(extractMeta(html, "og:image") ?? extractMeta(html, "twitter:image"), url),
    ogTitle: extractMeta(html, "og:title") ?? extractTitle(html),
    faviconUrl: absolutize(extractFavicon(html), url) ?? defaultFavicon(url),
    embedOk,
  };
}

// ─── helpers ───────────────────────────────────────────────────────────────

async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let out = "";
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (read >= max) {
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
    }
  } catch {
    /* ignore — return whatever we managed to read */
  }
  return out;
}

function canEmbed(h: Headers): boolean | null {
  const xfo = h.get("x-frame-options");
  if (xfo) {
    const v = xfo.toLowerCase();
    if (v.includes("deny") || v.includes("sameorigin")) return false;
  }
  const csp = h.get("content-security-policy");
  if (csp) {
    // Look for `frame-ancestors` directive — if it's anything other than * or a
    // permissive scheme, assume our origin isn't whitelisted.
    const match = /frame-ancestors\s+([^;]+)/i.exec(csp);
    if (match) {
      const sources = match[1].trim().toLowerCase();
      if (sources === "'none'") return false;
      if (!sources.includes("*") && !sources.includes("http")) return false;
    }
  }
  return xfo || h.get("content-security-policy") ? true : null;
}

// Parses the *first* matching meta tag — that's always the authoritative one.
function extractMeta(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${escapeRe(property)}["'][^>]*>`,
    "i",
  );
  const tag = re.exec(html)?.[0];
  if (!tag) return null;
  return /\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? null;
}

function extractTitle(html: string): string | null {
  return /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
}

function extractFavicon(html: string): string | null {
  const tag = /<link[^>]+rel\s*=\s*["'](?:shortcut\s+)?icon["'][^>]*>/i.exec(html)?.[0];
  if (!tag) return null;
  return /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? null;
}

function defaultFavicon(url: URL): string {
  return `${url.origin}/favicon.ico`;
}

function absolutize(href: string | null, base: URL): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
