// A post's rendered HTML, cut into the pieces the post page lays out.
//
//   - Prose runs, held to the reading measure.
//   - Stages: a live demo (`<div data-demo="name">…</div>`, see ./demos) on a
//     full-bleed tinted band. A paragraph that is all italics right before a
//     demo ("*Try `/` …*") moves onto the band as the demo's "Try it" cue.
//   - A table of contents from the h2s. "Before the meeting: start with …"
//     becomes a kicker ("Before the meeting") over the heading.
//
// Each h2 starts a section with its own accent colour, which the section's
// heading, highlights and demo bands share. Only markup is added: every word of
// the post renders as written.

export const ACCENTS = ["peach", "sky", "mint", "butter", "lilac", "rose"] as const;
export type Accent = (typeof ACCENTS)[number];

export type PostPart =
  | { kind: "prose"; html: string; accent: Accent; intro: boolean }
  | { kind: "stage"; demo: string; cue: string | null; accent: Accent };

export type TocEntry = { id: string; n: number; title: string; accent: Accent };

const accentOf = (section: number) => ACCENTS[section % ACCENTS.length];
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
const slugify = (s: string) =>
  stripTags(s).toLowerCase().replace(/&[#\w]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function layoutPost(source: string): { parts: PostPart[]; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const html = source
    .replace(/<h2>([\s\S]*?)<\/h2>/g, (_, inner: string) => {
      const n = toc.length + 1;
      const id = slugify(inner);
      const accent = accentOf(n);
      // A short plain-text lead before a colon is the section's phase.
      const m = /^([^<:]{3,40}):\s+([\s\S]+)$/.exec(inner);
      const title = m ? m[2] : inner;
      const plain = stripTags(title);
      toc.push({ id, n, title: plain.charAt(0).toUpperCase() + plain.slice(1), accent });
      const kick = `<span class="bl__kick"><b>${String(n).padStart(2, "0")}</b>${m ? `<span>${m[1]}</span>` : ""}</span>`;
      return `<h2 id="${id}" data-accent="${accent}">${kick}<span class="bl__ht">${title}</span></h2>`;
    })
    // `/` and `@` read as keys you press.
    .replace(/<code>([^<]{1,2})<\/code>/g, '<code class="bl__key">$1</code>');

  const parts: PostPart[] = [];
  const sectionAt = (i: number) => (html.slice(0, i).match(/<h2 /g) ?? []).length;
  const prose = (from: number, to: number) => {
    let chunk = html.slice(from, to);
    let cue: string | null = null;
    const c = /<p><em>([\s\S]*?)<\/em><\/p>\s*$/.exec(chunk);
    if (to < html.length && c) { cue = c[1]; chunk = chunk.slice(0, c.index); }
    if (chunk.trim()) parts.push({ kind: "prose", html: chunk, accent: accentOf(sectionAt(from)), intro: from === 0 });
    return cue;
  };

  let last = 0;
  for (const m of html.matchAll(/<div data-demo="([\w-]+)"[^>]*>[\s\S]*?<\/div>/g)) {
    const cue = prose(last, m.index!);
    parts.push({ kind: "stage", demo: m[1], cue, accent: accentOf(sectionAt(m.index!)) });
    last = m.index! + m[0].length;
  }
  prose(last, html.length);
  return { parts, toc };
}
