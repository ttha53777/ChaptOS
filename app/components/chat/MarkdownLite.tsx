import type { ReactNode } from "react";

import { isUiLabel } from "./ui-labels";
import { KindGlyph } from "./icons";
import { initialsOf, type EntityRef } from "./types";

/** A name in the reply that is a record this turn read (note_refs). */
export interface NoteRef { text: string; ref: EntityRef }

/**
 * Chips for the records a passage names: the first occurrence of each, once in
 * the whole reply (`used` is shared across blocks). Anything else stays text.
 */
function linkRefs(text: string, keyPrefix: string, refs: NoteRef[] | undefined, used: Set<string>, onRef?: (r: NoteRef) => void): ReactNode[] {
  if (!refs?.length || !onRef) return [text];
  let best: { at: number; r: NoteRef } | null = null;
  for (const r of refs) {
    if (used.has(r.text)) continue;
    const at = text.indexOf(r.text);
    if (at >= 0 && (!best || at < best.at)) best = { at, r };
  }
  if (!best) return [text];
  used.add(best.r.text);
  const { at, r } = best;
  return [
    text.slice(0, at),
    <button key={`${keyPrefix}-r${at}`} type="button" className="ent" onClick={() => onRef(r)}>
      {r.ref.type === "member" ? <span className="ent-av">{initialsOf(r.text)}</span> : <span className="ent-g"><KindGlyph kind={r.ref.type === "transaction" ? "money" : r.ref.type} size={10} /></span>}
      {r.text}
    </button>,
    ...linkRefs(text.slice(at + r.text.length), `${keyPrefix}-${at}`, refs, used, onRef),
  ];
}

// MarkdownLite — renders the small markdown subset the assistant emits on the
// plain-prose path (refusals, product how-to, fast-path answers): headings,
// bold/italic, inline code, bullet + numbered lists, paragraphs. Deliberately
// NOT a full markdown engine — answers are short and structured, so a
// dependency-free renderer keeps the bundle lean. Anything unrecognized falls
// through as plain text. Structured answers never pass through here; they
// render via AnswerBlock.
//
// Drawn as the answer system's Note (paper-chat-kit.css): headings as small
// kickers, bullets as diamonds, on a margin rule. An inline `code` span that
// names a real control (ui-labels.ts) is drawn as a keycap.

// Inline pass: split a line into bold / italic / code spans. Runs left-to-right
// so nested-ish cases degrade gracefully rather than mis-parsing.
function renderInline(text: string, keyPrefix: string, link: (t: string, k: string) => ReactNode[] = t => [t]): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Matches **bold** | __bold__ | *italic* | _italic_ | `code`
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(...link(text.slice(last, m.index), `${keyPrefix}-t${i}`));
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{m[2]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i${i}`}>{m[4]}</em>);
    } else if (m[5] !== undefined) {
      nodes.push(isUiLabel(m[5])
        ? <span key={`${keyPrefix}-c${i}`} className="kc">{m[5]}</span>
        : <code key={`${keyPrefix}-c${i}`}>{m[5]}</code>);
    }
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(...link(text.slice(last), `${keyPrefix}-tz`));
  return nodes;
}

export function MarkdownLite({ text, trailing, refs, onRef }: {
  text: string;
  trailing?: ReactNode;
  refs?: NoteRef[];
  onRef?: (r: NoteRef) => void;
}) {
  const used = new Set<string>();
  const link = (t: string, k: string) => linkRefs(t, k, refs, used, onRef);
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, idx) => (
      <li key={`li-${key}-${idx}`}>{renderInline(it, `li-${key}-${idx}`, link)}</li>
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
      blocks.push(<Tag key={`h-${key++}`}>{renderInline(heading[2], `h-${key}`, link)}</Tag>);
      continue;
    }
    blocks.push(<p key={`p-${key++}`}>{renderInline(line, `p-${key}`, link)}</p>);
  }
  flushList();

  // Attach the streaming caret to the final block so it trails the text.
  if (trailing) blocks.push(<span key="caret">{trailing}</span>);
  return <div className="note">{blocks}</div>;
}
