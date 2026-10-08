import { Fragment } from "react";
import { AGENDA_FIELDS, isAgendaField, type AgendaValues } from "@/lib/agenda-template";

/** Category → the tone family it's drawn in (Meetings sky · Leadership lilac · Committees mint). */
export const AGENDA_CATEGORY: Record<string, { label: string; tone: "sky" | "lilac" | "mint" }> = {
  meetings:   { label: "Meetings",   tone: "sky" },
  leadership: { label: "Leadership", tone: "lilac" },
  committees: { label: "Committees", tone: "mint" },
};
export const categoryOf = (slug: string) => AGENDA_CATEGORY[slug] ?? AGENDA_CATEGORY.meetings;

const FIELD_SPLIT = /(\{\{\s*[\w-]+\s*\}\})/g;

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
        if (!key) return <Fragment key={i}>{part}</Fragment>;
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
  const check = /^\[( |x)\]\s?(.*)$/i.exec(line);
  if (check) return <div className="at-ln at-check"><span className={`at-box${check[1] === " " ? "" : " on"}`} aria-hidden /><span><Inline text={check[2]} values={values} /></span></div>;
  const bullet = /^[•-]\s(.*)$/.exec(line);
  if (bullet) return <div className="at-ln at-bullet"><span><Inline text={bullet[1]} values={values} /></span></div>;
  return <div className={`at-ln${line.trim() ? "" : " gap"}`}><Inline text={line} values={values} /></div>;
}

/**
 * A template body as the minutes book reads it: `## ` headings numbered down
 * the margin, `[ ] ` lines as boxes, `• `/`- ` lines as bullets.
 */
export function AgendaBody({ body, values }: { body: string; values?: AgendaValues | null }) {
  const sections = body.split(/(?=^## )/m).filter(s => s.trim());
  if (!sections.length) {
    return <p className="at-ln at-muted">Nothing written yet. Start with a heading — <b>## Roll call</b>, say.</p>;
  }
  let n = 0;
  return (
    <>
      {sections.map((section, i) => {
        const lines = section.trim().split("\n");
        const heading = lines[0].startsWith("## ") ? lines.shift()!.slice(3) : "";
        const rest = lines.join("\n").trim();
        return (
          <section key={i} className="at-ps">
            {heading && <h3><span className="n">{String(++n).padStart(2, "0")}</span>{heading}</h3>}
            {rest && rest.split("\n").map((l, j) => <Line key={j} line={l} values={values} />)}
          </section>
        );
      })}
    </>
  );
}
