/**
 * Blog posts — one Markdown file per post in /content/blog.
 *
 *   content/blog/why-we-built-chaptos.md   →   /blog/why-we-built-chaptos
 *
 * The filename (minus .md) is the slug, so renaming a file breaks its URL.
 * Each file opens with a frontmatter block:
 *
 *   ---
 *   title: Why we built ChaptOS
 *   date: 2026-10-12
 *   summary: One or two sentences. Shown on the index, as the standfirst, and as
 *            the meta description — so write it to stand on its own.
 *   tags: [product, dues]
 *   author: Thalha
 *   draft: true
 *   ---
 *
 * `title`, `date` and `summary` are required; a post missing one throws at build
 * rather than shipping with a hole in it. `draft: true` shows the post in
 * `next dev` (with a Draft badge) and hides it everywhere else — index, page,
 * RSS — so you can preview before you publish.
 *
 * Server-only (it reads the filesystem). Pages are statically generated, so in
 * production the files are read once, at build. The Markdown is trusted (it's
 * committed to this repo), so raw HTML inside it is passed through unsanitised.
 */
import fs from "node:fs";
import path from "node:path";
import { Marked } from "marked";

const DIR = path.join(process.cwd(), "content", "blog");
const SHOW_DRAFTS = process.env.NODE_ENV === "development";

export interface PostMeta {
  slug: string;
  title: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  summary: string;
  tags: string[];
  author: string | null;
  draft: boolean;
  readingMinutes: number;
}

export interface Post extends PostMeta {
  html: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Frontmatter — a deliberately tiny YAML subset: `key: value` lines, plus
// `[a, b]` lists. Enough for the fields above without pulling in a YAML parser.
// ─────────────────────────────────────────────────────────────────────────────

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function unquote(v: string): string {
  return /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v;
}

function parseFrontmatter(src: string, file: string): { data: Record<string, string | string[]>; body: string } {
  const m = FENCE.exec(src);
  if (!m) throw new Error(`content/blog/${file}: missing --- frontmatter --- block`);

  const data: Record<string, string | string[]> = {};
  let lastKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) {
      const [, key, raw] = kv;
      const v = raw.trim();
      data[key] = v.startsWith("[") && v.endsWith("]")
        ? v.slice(1, -1).split(",").map(s => unquote(s.trim())).filter(Boolean)
        : unquote(v);
      lastKey = key;
    } else if (lastKey && /^\s+\S/.test(line) && typeof data[lastKey] === "string") {
      // Indented continuation line — lets a long summary wrap in the file.
      data[lastKey] = `${data[lastKey]} ${line.trim()}`;
    } else {
      throw new Error(`content/blog/${file}: can't read frontmatter line "${line}"`);
    }
  }
  return { data, body: src.slice(m[0].length) };
}

function required(data: Record<string, string | string[]>, key: string, file: string): string {
  const v = data[key];
  if (typeof v !== "string" || !v) throw new Error(`content/blog/${file}: frontmatter needs "${key}"`);
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown
// ─────────────────────────────────────────────────────────────────────────────

const md = new Marked({
  gfm: true,
  renderer: {
    // External links open in a new tab, same rule as components/landing/inline.tsx.
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const t = title ? ` title="${title}"` : "";
      const ext = /^https?:\/\//.test(href) ? ` target="_blank" rel="noreferrer noopener"` : "";
      return `<a href="${href}"${t}${ext}>${text}</a>`;
    },
  },
  hooks: {
    // Wide tables scroll inside their own box rather than pushing the page.
    postprocess: html =>
      html.replace(/<table>/g, '<div class="bl__tw"><table>').replace(/<\/table>/g, "</table></div>"),
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

function load(file: string): Post {
  const src = fs.readFileSync(path.join(DIR, file), "utf8");
  const { data, body } = parseFrontmatter(src, file);

  const date = required(data, "date", file);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`content/blog/${file}: date must be YYYY-MM-DD, got "${date}"`);
  }
  const tags = data.tags ?? [];
  const words = body.split(/\s+/).filter(Boolean).length;

  return {
    slug: file.replace(/\.md$/, ""),
    title: required(data, "title", file),
    date,
    summary: required(data, "summary", file),
    tags: Array.isArray(tags) ? tags : [tags],
    author: typeof data.author === "string" && data.author ? data.author : null,
    draft: data.draft === "true",
    readingMinutes: Math.max(1, Math.round(words / 230)),
    html: md.parse(body, { async: false }),
  };
}

function all(): Post[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter(f => f.endsWith(".md") && !f.startsWith("_"))
    .map(load)
    .filter(p => SHOW_DRAFTS || !p.draft)
    // Newest first; slug breaks same-day ties so the order is stable.
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

/** Every visible post, newest first, without bodies. */
export function getPosts(): PostMeta[] {
  return all().map(({ html: _html, ...meta }) => meta);
}

/** One visible post, or null (unknown slug, or a draft outside dev). */
export function getPost(slug: string): Post | null {
  return all().find(p => p.slug === slug) ?? null;
}

/** Every visible post with its rendered body — for the RSS feed. */
export function getPostsWithBodies(): Post[] {
  return all();
}

/** "Oct 12, 2026". Formatted in UTC so a YYYY-MM-DD never slips a day. */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
