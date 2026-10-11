import { EditorSelection } from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";
import { lineKind, type LineKind } from "./notes-markdown";

/** The text each block kind stores in front of a line. */
const PREFIX: Record<Exclude<LineKind, "p" | "hr">, string> = { h: "## ", li: "- ", todo: "- [ ] " };

/** The caret's line becomes `kind`, or back to prose when it already is one. A divider goes below. */
export function setKind(view: EditorView, kind: LineKind) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const cur = lineKind(line.text);
  if (kind === "hr") {
    const blank = !line.text.slice(cur.marker).trim();
    const insert = blank ? "---\n" : "\n---\n";
    const from = blank ? line.from : line.to;
    view.dispatch({ changes: { from, to: line.to, insert }, selection: { anchor: from + insert.length }, userEvent: "input.format" });
    view.focus();
    return;
  }
  const insert = cur.kind === kind || kind === "p" ? "" : PREFIX[kind];
  const offset = state.selection.main.head - line.from - cur.marker;
  view.dispatch({
    changes: { from: line.from, to: line.from + cur.marker, insert },
    selection: { anchor: line.from + insert.length + Math.max(0, offset) },
    userEvent: "input.format",
  });
  view.focus();
}

/** Tick or untick the checklist on a line. */
export function toggleCheck(view: EditorView, lineFrom: number): boolean {
  const line = view.state.doc.lineAt(lineFrom);
  const m = /\[( |x|X)\]/.exec(line.text);
  if (!m || lineKind(line.text).kind !== "todo") return false;
  const at = line.from + m.index + 1;
  view.dispatch({ changes: { from: at, to: at + 1, insert: m[1] === " " ? "x" : " " }, userEvent: "input.toggle" });
  return true;
}

/** Wrap the selection in `mark` (or unwrap it); with no selection, drop an empty pair at the caret. */
export function wrap(view: EditorView, mark: string) {
  const { state } = view;
  view.dispatch(state.changeByRange(range => {
    const text = state.sliceDoc(range.from, range.to);
    const before = state.sliceDoc(range.from - mark.length, range.from), after = state.sliceDoc(range.to, range.to + mark.length);
    if (!range.empty && before === mark && after === mark) {
      return { changes: [{ from: range.from - mark.length, to: range.from }, { from: range.to, to: range.to + mark.length }],
        range: EditorSelection.range(range.from - mark.length, range.to - mark.length) };
    }
    return { changes: { from: range.from, to: range.to, insert: mark + text + mark },
      range: range.empty ? EditorSelection.cursor(range.from + mark.length) : EditorSelection.range(range.from + mark.length, range.to + mark.length) };
  }), { userEvent: "input.format" });
  view.focus();
  return true;
}

/** Enter on a bullet or checklist line continues the list; on an empty one it ends it. */
function continueList(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const k = lineKind(line.text);
  if (k.kind !== "li" && k.kind !== "todo") return false;
  if (sel.head < line.from + k.marker) return false;
  if (!line.text.slice(k.marker).trim()) {
    view.dispatch({ changes: { from: line.from, to: line.to }, selection: { anchor: line.from }, userEvent: "input.format" });
    return true;
  }
  const insert = "\n" + PREFIX[k.kind];
  view.dispatch({ changes: { from: sel.head, insert }, selection: { anchor: sel.head + insert.length }, scrollIntoView: true, userEvent: "input" });
  return true;
}

/** Backspace right after a line's marker turns the line back into prose. */
function dropMarker(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const k = lineKind(line.text);
  if (!k.marker || sel.head !== line.from + k.marker) return false;
  view.dispatch({ changes: { from: line.from, to: line.from + k.marker }, userEvent: "delete.format" });
  return true;
}

export const notesKeymap: KeyBinding[] = [
  { key: "Enter", run: continueList },
  { key: "Backspace", run: dropMarker },
  { key: "Mod-Enter", run: view => toggleCheck(view, view.state.selection.main.head) },
  { key: "Mod-b", run: view => wrap(view, "**") },
  { key: "Mod-i", run: view => wrap(view, "*") },
];
