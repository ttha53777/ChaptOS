/**
 * Best-effort scraper for the metadata we need to render a Doc card when the
 * destination URL refuses iframe embedding.
 *
 * Network calls have a 5s timeout and a 256KB read cap — we only need the
 * <head>, so there's no value (and real risk) in pulling down megabytes from a
 * hostile URL. Every failure mode degrades gracefully to `embedOk: null`,
 * never throws.
 *
 * SSRF: the URL is user-supplied (any org member can add a Doc/programming
 * link), so before any fetch we resolve the hostname and reject private,
 * loopback, link-local, and other reserved IP ranges — blocking probes of
 * internal services and the cloud metadata endpoint (169.254.169.254). Redirects
 * are followed MANUALLY so each hop's resolved IP is re-validated; a public URL
 * can't bounce us to an internal one. Residual TOCTOU (DNS rebinding between
 * our resolution and fetch's own) is not closed here — Node's fetch can't pin a
 * socket to a pre-validated IP — but the window is narrow and the payoff small
 * given we only ever return OG tags / an embed verdict, never raw bytes.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 256 * 1024;
const MAX_REDIRECTS = 5;
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
    res = await safeFetch(url);
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

/**
 * Fetch that rejects any hop resolving to a non-public IP. Follows redirects
 * manually (fetch's own redirect:"follow" would chase a Location into a private
 * range without us seeing it) up to MAX_REDIRECTS, re-validating each target.
 * One shared timeout budget spans the whole chain. Throws on any block/failure;
 * the caller maps that to EMPTY.
 */
async function safeFetch(start: URL): Promise<Response> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let url = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);

    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.5" },
      redirect: "manual",
      signal,
    });

    // 3xx with a Location → validate the next hop ourselves before following.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res; // malformed redirect; hand back as-is
      let next: URL;
      try {
        next = new URL(loc, url);
      } catch {
        throw new Error("malformed redirect target");
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new Error("non-http(s) redirect target");
      }
      // Release the redirect response body before the next request.
      try { await res.body?.cancel(); } catch { /* ignore */ }
      url = next;
      continue;
    }

    return res;
  }
  throw new Error("too many redirects");
}

/** Reject hostnames that resolve to private, loopback, link-local, or other
 *  reserved IP space — the core SSRF guard. */
async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname;

  // Literal IP in the URL: validate directly, no DNS.
  const literal = isIP(host) ? host : stripBrackets(host);
  if (isIP(literal)) {
    if (isBlockedIp(literal)) throw new Error("blocked IP literal");
    return;
  }

  // Hostname: resolve ALL addresses and reject if any is non-public. `all:true`
  // returns every A/AAAA record so a multi-record host can't slip one private IP
  // past us. Resolution failure throws → caller maps to EMPTY.
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0) throw new Error("no DNS records");
  for (const { address } of addrs) {
    if (isBlockedIp(address)) throw new Error("resolves to blocked IP");
  }
}

function stripBrackets(host: string): string {
  // IPv6 literals arrive as "[::1]" in URL.hostname on some runtimes.
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** True for any IP we must never let the server connect to. */
function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedIpv4(ip);
  if (v === 6) return isBlockedIpv6(ip);
  return true; // unparseable → block
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;                          // 0.0.0.0/8 "this network"
  if (a === 10) return true;                         // 10.0.0.0/8 private
  if (a === 127) return true;                        // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;           // 169.254.0.0/16 link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true;             // 192.0.0.0/24 + 192.0.2.0/24 special-use
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true;                         // 224.0.0.0/4 multicast + 240/4 reserved
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;      // loopback / unspecified
  if (lower.startsWith("fe80")) return true;               // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique-local
  if (lower.startsWith("ff")) return true;                 // multicast
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible — validate the embedded v4.
  const mapped = /(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/i.exec(lower);
  if (mapped) return isBlockedIpv4(mapped[1]);
  return false;
}

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
