import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { Range } from "@codemirror/state";

/**
 * Formatting for the minutes as you type. Decorations only — the shared
 * document stays plain text (the notes protocol rejects anything else), so
 * every block is the markdown the pad has always stored:
 *
 *   ## heading · - bullet · - [ ] checklist · --- divider · **bold** · *italic* · @Name / @Role
 *
 * Line markers (`## `, `- `, `- [ ] `) are swapped for a section number in the
 * margin, a dot or a real checkbox, and are atomic, so the caret steps over
 * them; Backspace right after one turns the line back into prose
 * (notes-commands.ts). Bold and italic keep their asterisks, just quieter.
 */

export type MentionTarget = {
  kind: "person" | "role";
  /** What the text stores after the @ — a full name or a role name. */
  name: string;
  /** What the chip shows: a first name, or the role. */
  label: string;
  initials: string;
  /** Index into the chip palette. */
  tone: number;
  /** Second line in the picker: a person's role, or a role's holders. */
  sub: string;
};

/** The block a line is, and how many leading characters are its marker. */
export type LineKind = "p" | "h" | "li" | "todo" | "hr";
const HEAD = /^(\s*)#{1,3}[ \t]+/;
const TODO = /^(?:[-*•][ \t]+)?\[( |x|X)\][ \t]?/;
const BULLET = /^[-*•][ \t]+/;
const RULE = /^\s*-{3,}\s*$/;
export function lineKind(text: string): { kind: LineKind; marker: number; done?: boolean } {
  if (RULE.test(text)) return { kind: "hr", marker: 0 };
  let m = HEAD.exec(text);
  if (m) return { kind: "h", marker: m[0].length };
  m = TODO.exec(text);
  if (m) return { kind: "todo", marker: m[0].length, done: m[1] !== " " };
  m = BULLET.exec(text);
  if (m) return { kind: "li", marker: m[0].length };
  return { kind: "p", marker: 0 };
}

const byLength = new WeakMap<MentionTarget[], MentionTarget[]>();
/** Every `@Name` in a line that names someone (or a role) we know. Longest name wins. */
export function mentionsIn(text: string, targets: MentionTarget[]): { from: number; to: number; target: MentionTarget }[] {
  const out: { from: number; to: number; target: MentionTarget }[] = [];
  if (!targets.length) return out;
  let longest = byLength.get(targets);
  if (!longest) byLength.set(targets, longest = [...targets].sort((x, y) => y.name.length - x.name.length));
  for (let i = text.indexOf("@"); i !== -1; i = text.indexOf("@", i + 1)) {
    if (i > 0 && /[\w@]/.test(text[i - 1])) continue;
    const rest = text.slice(i + 1).toLowerCase();
    const hit = longest.find(t => rest.startsWith(t.name.toLowerCase()) && !/\w/.test(rest[t.name.length] ?? ""));
    if (hit) { out.push({ from: i, to: i + 1 + hit.name.length, target: hit }); i += hit.name.length; }
  }
  return out;
}

class CheckWidget extends WidgetType {
  constructor(readonly done: boolean) { super(); }
  eq(other: CheckWidget) { return other.done === this.done; }
  toDOM() {
    const el = document.createElement("span");
    el.className = `cm-md-cb${this.done ? " on" : ""}`;
    el.setAttribute("role", "checkbox");
    el.setAttribute("aria-checked", String(this.done));
    el.setAttribute("aria-label", this.done ? "Done — click to untick" : "Click to tick off");
    return el;
  }
  ignoreEvent() { return false; }
}
class DotWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const el = document.createElement("span"); el.className = "cm-md-dot"; el.setAttribute("aria-hidden", "true"); return el; }
}
const PEOPLE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8.5" r="3.2"/><path d="M3 19c.7-3.2 3-5 6-5s5.3 1.8 6 5"/><path d="M16 5.6a3 3 0 010 5.8M17.5 14.3c1.8.6 3 2.2 3.5 4.7"/></svg>';
class MentionWidget extends WidgetType {
  constructor(readonly t: MentionTarget) { super(); }
  eq(other: MentionWidget) { return other.t.name === this.t.name && other.t.kind === this.t.kind && other.t.label === this.t.label; }
  toDOM() {
    const el = document.createElement("span");
    el.className = `cm-mention ${this.t.kind} tone-${this.t.tone}`;
    el.title = `@${this.t.name}`;
    const i = document.createElement("i");
    if (this.t.kind === "role") i.innerHTML = PEOPLE_ICON; else i.textContent = this.t.initials;
    el.append(i, document.createTextNode(this.t.label));
    return el;
  }
}

const dot = Decoration.replace({ widget: new DotWidget() });
const hidden = Decoration.replace({});
const bold = Decoration.mark({ class: "cm-md-b" });
const ital = Decoration.mark({ class: "cm-md-i" });
const quiet = Decoration.mark({ class: "cm-md-mark" });
const hrLine = Decoration.line({ class: "cm-md-hr" });
const hrText = Decoration.mark({ class: "cm-md-hr-tx" });

function build(view: EditorView, targets: MentionTarget[]): { all: DecorationSet; atomic: DecorationSet } {
  const decos: Range<Decoration>[] = [];
  const atoms: Range<Decoration>[] = [];
  const doc = view.state.doc;
  // Sections are numbered from the top of the document, not the viewport.
  const first = view.visibleRanges[0]?.from ?? 0;
  let section = 0;
  for (let n = 1, top = doc.lineAt(first).number; n < top; n++) if (lineKind(doc.line(n).text).kind === "h") section++;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = doc.lineAt(pos);
      const text = line.text;
      const k = lineKind(text);
      if (k.kind === "hr") {
        decos.push(hrLine.range(line.from), hrText.range(line.from, line.to));
      } else {
        if (k.kind === "h") {
          section++;
          decos.push(Decoration.line({ class: "cm-md-h", attributes: { "data-sec": String(section) } }).range(line.from));
          const r = hidden.range(line.from, line.from + k.marker); decos.push(r); atoms.push(r);
        } else if (k.kind === "todo") {
          decos.push(Decoration.line({ class: `cm-md-check${k.done ? " cm-md-done" : ""}` }).range(line.from));
          const r = Decoration.replace({ widget: new CheckWidget(!!k.done) }).range(line.from, line.from + k.marker);
          decos.push(r); atoms.push(r);
        } else if (k.kind === "li") {
          decos.push(Decoration.line({ class: "cm-md-li" }).range(line.from));
          const r = dot.range(line.from, line.from + k.marker); decos.push(r); atoms.push(r);
        }
        const body = text.slice(k.marker);
        for (const m of body.matchAll(/\*\*[^*\n]+\*\*/g)) {
          const s = line.from + k.marker + m.index!, e = s + m[0].length;
          decos.push(bold.range(s, e), quiet.range(s, s + 2), quiet.range(e - 2, e));
        }
        for (const m of body.matchAll(/(?<![*\w])\*(?!\s)[^*\n]+?\*(?![*\w])/g)) {
          const s = line.from + k.marker + m.index!, e = s + m[0].length;
          decos.push(ital.range(s, e), quiet.range(s, s + 1), quiet.range(e - 1, e));
        }
        for (const m of mentionsIn(text, targets)) {
          if (m.from < k.marker) continue;
          const r = Decoration.replace({ widget: new MentionWidget(m.target) }).range(line.from + m.from, line.from + m.to);
          decos.push(r); atoms.push(r);
        }
      }
      pos = line.to + 1;
    }
  }
  return { all: Decoration.set(decos, true), atomic: Decoration.set(atoms, true) };
}

/** The formatting plugin. `targets` is read on every rebuild, so the roster can arrive late. */
export function notesMarkdown(targets: () => MentionTarget[]) {
  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    atomic: DecorationSet;
    count = -1;
    constructor(view: EditorView) { ({ all: this.decorations, atomic: this.atomic } = build(view, targets())); this.count = targets().length; }
    update(u: ViewUpdate) {
      const n = targets().length;
      if (u.docChanged || u.viewportChanged || n !== this.count) { ({ all: this.decorations, atomic: this.atomic } = build(u.view, targets())); this.count = n; }
    }
  }, { decorations: v => v.decorations });
  return [plugin, EditorView.atomicRanges.of(view => view.plugin(plugin)?.atomic ?? Decoration.none)];
}
