import { Fragment } from "react";
import { AGENDA_FIELDS, bulletOf, checkOf, headingOf, isAgendaField, type AgendaValues } from "@/lib/agenda-template";

/** Category → the tone family it's drawn in (Meetings sky · Leadership lilac · Committees mint). */
export const AGENDA_CATEGORY: Record<string, { label: string; tone: "sky" | "lilac" | "mint" }> = {
  meetings:   { label: "Meetings",   tone: "sky" },
  leadership: { label: "Leadership", tone: "lilac" },
  committees: { label: "Committees", tone: "mint" },
};
export const categoryOf = (slug: string) => AGENDA_CATEGORY[slug] ?? AGENDA_CATEGORY.meetings;

const FIELD_SPLIT = /(\{\{\s*[\w-]+\s*\}\})/g;
const BOLD_SPLIT = /(\*\*[^*\n]+\*\*)/g;

/** `**bold**` inside a stretch of plain text. */
function Bold({ text }: { text: string }) {
  return <>{text.split(BOLD_SPLIT).map((part, i) => /^\*\*[^*\n]+\*\*$/.test(part) ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>)}</>;
}

/**
 * One line's text with its {{blanks}} drawn as labeled chips — or, given
 * `values`, as the highlighted text a meeting would write there. A blank the
 * form can't fill renders as written, flagged.
 */
function Inline({ text, values }: { text: string; values?: AgendaValues | null }) {
  return (
    <>
      {text.split(FIELD_SPLIT).map((part, i) => {
        const key = /^\{\{\s*([\w-]+)\s*\}\}$/.exec(part)?.[1];
        if (!key) return <Bold key={i} text={part} />;
        if (!isAgendaField(key)) return <span key={i} className="at-chip bad" title="Not a blank the meeting form can fill">{part}</span>;
        const label = AGENDA_FIELDS[key];
        return values
          ? <mark key={i} className="at-fill" title={`${label}, from the meeting form`}>{values[key]?.trim() || `[${label}]`}</mark>
          : <span key={i} className="at-chip" title="Fills in from the meeting form">{label}</span>;
      })}
    </>
  );
}

function Line({ line, values }: { line: string; values?: AgendaValues | null }) {
  const check = checkOf(line);
  if (check) return <div className="at-ln at-check"><span className={`at-box${check.done ? " on" : ""}`} aria-hidden /><span><Inline text={check.text} values={values} /></span></div>;
  const bullet = bulletOf(line);
  if (bullet) return <div className="at-ln at-bullet"><span><Inline text={bullet.text} values={values} /></span></div>;
  return <div className={`at-ln${line.trim() ? "" : " gap"}`}><Inline text={line} values={values} /></div>;
}

/**
 * Agenda or minutes text as the minutes book reads it: headings (`#`–`###`,
 * "##Prez:" too) numbered down the margin, `[ ]`/`- [x]` lines as boxes,
 * `•`/`-`/`*` lines as bullets, `**bold**`.
 */
export function AgendaBody({ body, values }: { body: string; values?: AgendaValues | null }) {
  // Sections start at each heading line (`#`–`###`, space optional); anything
  // before the first heading is an unnumbered preamble.
  const sections: { heading: string; lines: string[] }[] = [];
  for (const line of body.split("\n")) {
    const h = headingOf(line);
    if (h) sections.push({ heading: h.text, lines: [] });
    else (sections.at(-1) ?? (sections.push({ heading: "", lines: [] }), sections[0])).lines.push(line);
  }
  const shown = sections.filter(s => s.heading || s.lines.join("").trim());
  if (!shown.length) {
    return <p className="at-ln at-muted">Nothing written yet. Start with a heading — <b>## Roll call</b>, say.</p>;
  }
  let n = 0;
  return (
    <>
      {shown.map((section, i) => {
        const rest = section.lines.join("\n").trim();
        return (
          <section key={i} className="at-ps">
            {section.heading && <h3><span className="n">{String(++n).padStart(2, "0")}</span><Inline text={section.heading} values={values} /></h3>}
            {rest && rest.split("\n").map((l, j) => <Line key={j} line={l} values={values} />)}
          </section>
        );
      })}
    </>
  );
}
