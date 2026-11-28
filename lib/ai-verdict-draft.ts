/**
 * The verdict, read out of a compose_answer call that is still streaming.
 *
 * WHY. A structured answer used to reach the user all at once: the client got
 * nothing until the model had written the whole compose_answer call — verdict,
 * every row, follows, shape — and the server had checked it. The verdict is the
 * schema's first field and done after ~50 tokens; the rest can be several
 * hundred more. Pulling the verdict out the moment its string closes lets the
 * client show the headline while the rows are still being written.
 *
 * It is a DRAFT. The server still validates the finished call, and can send it
 * back (a miscounted verdict, a file answer with no citations, a verdict the
 * drawn shape contradicts) or replace the verdict with its own sentence. So the
 * client shows it provisionally and the `answer` event is what's final; a draft
 * that never becomes an answer is retracted with `verdict_drop`.
 *
 * Pure: takes the arguments buffer so far, returns the verdict once its JSON
 * string is complete, else null. Only a TOP-LEVEL "verdict" key counts, so a
 * row or ask-back field that happened to share the name can't be mistaken for it.
 */

/** Index of the quote closing the JSON string opening at `start`, or -1 if it hasn't arrived. */
function stringEnd(buf: string, start: number): number {
  for (let i = start + 1; i < buf.length; i++) {
    const c = buf[i];
    if (c === "\\") { i++; continue; }
    if (c === '"') return i;
  }
  return -1;
}

export function draftVerdict(buf: string): string | null {
  let depth = 0;
  // At depth 1, the next string is a key (after `{` or `,`), not a value.
  let keyNext = false;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === "{" || c === "[") {
      depth++;
      keyNext = depth === 1 && c === "{";
    } else if (c === "}" || c === "]") {
      depth--;
      keyNext = false;
    } else if (c === ",") {
      keyNext = depth === 1;
    } else if (c === '"') {
      const end = stringEnd(buf, i);
      if (end < 0) return null;
      const isKey = depth === 1 && keyNext;
      keyNext = false;
      if (isKey && buf.slice(i, end + 1) === '"verdict"') {
        // Key found: expect `:` then a string value.
        let j = end + 1;
        while (j < buf.length && /\s/.test(buf[j])) j++;
        if (j >= buf.length) return null;
        if (buf[j] !== ":") return null;
        j++;
        while (j < buf.length && /\s/.test(buf[j])) j++;
        if (j >= buf.length) return null;
        if (buf[j] !== '"') return null; // not a string — parseComposeAnswer will reject it
        const vEnd = stringEnd(buf, j);
        if (vEnd < 0) return null;
        try {
          const v = (JSON.parse(buf.slice(j, vEnd + 1)) as string).trim();
          return v || null;
        } catch {
          return null;
        }
      }
      i = end;
    }
  }
  return null;
}
