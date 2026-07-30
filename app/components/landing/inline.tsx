import type { ReactNode } from "react";

/**
 * The four inline marks public-page content is allowed to use. Shared by the
 * help centre (app/help/content.ts) and the audience pages (app/for/content.ts).
 *
 * Deliberately tiny — this is not a Markdown implementation and shouldn't grow
 * into one. Content lives in typed modules precisely so the markup surface can
 * stay this small; anything a paragraph can't express is a block type, not a
 * new mark.
 *
 *   **bold**      strong
 *   *italic*      em
 *   `code`        inline code
 *   [label](/url) link
 *
 * Note the output is an ARRAY built programmatically, not authored JSX. That
 * sidesteps the whitespace-collapsing this renderer's JSX siblings suffer from:
 * every space here lives inside a string literal in the array, where nothing
 * can drop it.
 */

// Order matters: `**` must be tried before `*` or bold parses as two empty ems.
const MARK = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;

/** External links get the usual safety attributes; internal ones stay plain. */
function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href) || href.startsWith("mailto:");
}

export function inline(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  // exec-loop rather than matchAll so `last` and the lastIndex stay in step.
  MARK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARK.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [, linkLabel, linkHref, bold, em, code] = m;

    if (linkLabel !== undefined && linkHref !== undefined) {
      out.push(
        isExternal(linkHref) ? (
          <a key={key++} href={linkHref} target="_blank" rel="noreferrer noopener">
            {linkLabel}
          </a>
        ) : (
          <a key={key++} href={linkHref}>
            {linkLabel}
          </a>
        ),
      );
    } else if (bold !== undefined) {
      out.push(<strong key={key++}>{bold}</strong>);
    } else if (em !== undefined) {
      out.push(<em key={key++}>{em}</em>);
    } else if (code !== undefined) {
      out.push(<code key={key++}>{code}</code>);
    }

    last = m.index + m[0].length;
  }

  if (last < text.length) out.push(text.slice(last));
  // A string is a valid ReactNode; returning it unwrapped keeps the common case
  // from allocating a fragment per paragraph.
  return out.length === 1 && typeof out[0] === "string" ? out[0] : out;
}
