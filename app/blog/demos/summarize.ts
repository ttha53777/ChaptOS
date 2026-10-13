// A stand-in for Summarize that runs in the reader's browser. The app sends
// the minutes to a model (lib/services/meeting-summary-service.ts); here a few
// rules over the note's shape do the same job well enough for a demo: a
// checklist line with an @owner is an action item, a line about a vote or an
// approval is a decision. Owners resolve against the demo roster the way the
// app resolves them against the real one.
import { lineKind, mentionsIn, type MentionTarget } from "@/app/components/meeting-notes/notes-markdown";

export type ActionItem = { key: string; text: string; owner: string | null; role: boolean; due: string | null; done: boolean };
export type Summary = { gist: string; decisions: string[]; actions: ActionItem[]; lines: number };

const DECISION = /\b(vot(?:e|ed|es)|pass(?:es|ed)|approv(?:e|ed|es)|decid(?:e|ed)|agreed|moves? to|adopted)\b/i;
const DUE = /[,;]?\s+by\s+((?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?|tomorrow|tonight|next week|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2})\s*\.?\s*$/i;

const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;
const tidy = (s: string) => s.replace(/\*\*|\*/g, "").replace(/\s+/g, " ").trim().replace(/[.;,]$/, "");
export const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** A line's words with each @mention read as the name it stands for. */
function readable(body: string, targets: MentionTarget[]) {
  let out = "", last = 0;
  for (const m of mentionsIn(body, targets)) { out += body.slice(last, m.from) + m.target.name; last = m.to; }
  return out + body.slice(last);
}

export function summarize(text: string, targets: MentionTarget[], ticked: Set<string>): Summary {
  const decisions: string[] = [];
  const actions: ActionItem[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const k = lineKind(line);
    if (k.kind === "h" || k.kind === "hr") continue;
    const body = line.slice(k.marker);
    const ms = mentionsIn(body, targets);
    // Outside a checklist, only "@Owner to do the thing" is a to-do (not "by @President").
    const isAction = k.kind === "todo" || (ms.length > 0 && /^\s+to\s+\w/.test(body.slice(ms[0].to)));
    if (isAction && ms.length) {
      const owner = ms[0].target;
      let rest = (body.slice(0, ms[0].from) + body.slice(ms[0].to)).trim();
      const due = DUE.exec(rest);
      if (due) rest = rest.slice(0, due.index);
      rest = tidy(readable(rest.replace(/^to\s+/i, ""), targets));
      if (!rest) continue;
      const key = keyOf(rest);
      actions.push({ key, text: cap(rest), owner: owner.name, role: owner.kind === "role", due: due ? cap(due[1]) : null, done: !!k.done || ticked.has(key) });
    } else if (DECISION.test(body) && !/:\s*$/.test(body)) {
      const d = tidy(readable(body, targets));
      if (d.length > 3) decisions.push(cap(d) + ".");
    }
  }
  const owners = [...new Set(actions.map(a => a.role ? `the ${a.owner}` : a.owner!.split(" ")[0]))];
  const list = (xs: string[]) => xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const gist = !decisions.length && !actions.length
    ? "Nothing to pull out yet. Add a vote, or a to-do with an @owner."
    : `${cap(n(decisions.length, "decision"))} and ${n(actions.length, "to-do")}${owners.length ? `, owned by ${list(owners)}` : ""}.`;
  return { gist, decisions, actions, lines: lines.filter(l => l.trim()).length };
}
