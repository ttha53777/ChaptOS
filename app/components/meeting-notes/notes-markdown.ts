import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import { bulletOf, checkOf, headingOf } from "@/lib/agenda-template";

/**
 * Formatting for the minutes as you type: headings, checklist boxes, bullets
 * and **bold** are styled in place. Decorations only — the shared document
 * stays plain text (the notes protocol rejects anything else), and the `#`,
 * `[ ]` and `**` markers stay visible, just quieter, so editing never hides
 * characters from the cursor.
 */
const heading = Decoration.line({ class: "cm-md-h" });
const checkLine = Decoration.line({ class: "cm-md-check" });
const checkDone = Decoration.line({ class: "cm-md-check cm-md-done" });
const mark = Decoration.mark({ class: "cm-md-mark" });
const box = Decoration.mark({ class: "cm-md-box" });
const bold = Decoration.mark({ class: "cm-md-b" });

function build(view: EditorView): DecorationSet {
  const out = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      // Line decorations first, then marks in document order (RangeSetBuilder needs sorted input).
      const h = headingOf(text);
      const c = h ? null : checkOf(text);
      const b = h || c ? null : bulletOf(text);
      if (h) out.add(line.from, line.from, heading);
      else if (c) out.add(line.from, line.from, c.done ? checkDone : checkLine);
      const lead = text.length - text.trimStart().length;
      if (h) out.add(line.from + lead, line.from + h.marker, mark);
      else if (c) out.add(line.from, line.from + c.box.length, box);
      else if (b) out.add(line.from + lead, line.from + lead + b.marker.length, mark);
      for (const m of text.matchAll(/\*\*[^*\n]+\*\*/g)) {
        const start = line.from + m.index!;
        if (start >= line.from + (h ? h.marker : c ? c.box.length : 0)) out.add(start, start + m[0].length, bold);
      }
      pos = line.to + 1;
    }
  }
  return out.finish();
}

export const notesMarkdown = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = build(view); }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = build(u.view); }
}, { decorations: v => v.decorations });
