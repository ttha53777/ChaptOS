import type { ReactNode } from "react";

// MarkdownLite — renders the small markdown subset the assistant emits on the
// plain-prose path (refusals, product how-to, fast-path answers): headings,
// bold/italic, inline code, bullet + numbered lists, paragraphs. Deliberately
// NOT a full markdown engine — answers are short and structured, so a
// dependency-free renderer keeps the bundle lean. Anything unrecognized falls
// through as plain text. Structured answers never pass through here; they
// render via AnswerBlock.

// Inline pass: split a line into bold / italic / code spans. Runs left-to-right
// so nested-ish cases degrade gracefully rather than mis-parsing.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Matches **bold** | __bold__ | *italic* | _italic_ | `code`
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{m[2]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i${i}`}>{m[4]}</em>);
    } else if (m[5] !== undefined) {
      nodes.push(<code key={`${keyPrefix}-c${i}`}>{m[5]}</code>);
    }
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownLite({ text, trailing }: { text: string; trailing?: ReactNode }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, idx) => (
      <li key={`li-${key}-${idx}`}>{renderInline(it, `li-${key}-${idx}`)}</li>
    ));
    blocks.push(list.ordered
      ? <ol key={`ol-${key}`}>{items}</ol>
      : <ul key={`ul-${key}`}>{items}</ul>);
    key++;
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    // Match both "1." and "1)" — the model uses either for ordered lists.
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (bullet) {
      if (list && list.ordered) flushList();
      list = list ?? { ordered: false, items: [] };
      list.items.push(bullet[1]);
      continue;
    }
    if (numbered) {
      if (list && !list.ordered) flushList();
      list = list ?? { ordered: true, items: [] };
      list.items.push(numbered[1]);
      continue;
    }
    flushList();

    if (line === "") continue; // blank line = block separator
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      const Tag = (`h${level}` as "h1" | "h2" | "h3");
      blocks.push(<Tag key={`h-${key++}`}>{renderInline(heading[2], `h-${key}`)}</Tag>);
      continue;
    }
    blocks.push(<p key={`p-${key++}`}>{renderInline(line, `p-${key}`)}</p>);
  }
  flushList();

  // Attach the streaming caret to the final block so it trails the text.
  if (trailing) blocks.push(<span key="caret">{trailing}</span>);
  return <div className="note">{blocks}</div>;
}
