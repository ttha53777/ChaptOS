"use client";

// The passage behind a citation chip: the extracted text of one page / section,
// or the cells of one sheet range, as the server stored it. Rides over the
// thread like the peek (same chrome), so Back is a return.
//
// File text is rendered as text nodes only — never as HTML.

import { useEffect, useState } from "react";
import { orgFetch } from "../../lib/api";
import { IcChev, IcFile, IcSheet } from "./icons";
import type { AnswerCitation, AttachmentUnit } from "./types";

export function ExcerptSheet({ citation, onBack }: { citation: AnswerCitation; onBack: () => void }) {
  const [unit, setUnit] = useState<AttachmentUnit | null>(null);
  const [failed, setFailed] = useState<"gone" | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUnit(null);
    setFailed(null);
    orgFetch(`/api/ai/attachments/${encodeURIComponent(citation.attachmentId)}/units/${encodeURIComponent(citation.unit)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: AttachmentUnit) => { if (!cancelled) setUnit(d); })
      .catch(status => { if (!cancelled) setFailed(status === 404 ? "gone" : "error"); });
    return () => { cancelled = true; };
  }, [citation.attachmentId, citation.unit]);

  const sheet = citation.kind === "xlsx" || citation.kind === "csv";
  return (
    <div className="cs-peek cs-excerpt" role="region" aria-label={`${citation.name} · ${citation.locator}`}>
      <div className="peek-hd">
        <button type="button" className="peek-back" onClick={onBack}><IcChev /> Back</button>
      </div>
      <div className="peek-body">
        <div className="peek-id">
          <span className="glyph">{sheet ? <IcSheet size={16} /> : <IcFile size={16} />}</span>
          <span className="peek-name">
            <span className="t">{citation.name}</span>
            <span className="s">{unit?.label ?? citation.locator}</span>
          </span>
        </div>
        {unit?.text != null && <pre className="ex-text in in-2">{unit.text}</pre>}
        {unit?.grid && (
          <div className="ex-grid in in-2">
            <table>
              <tbody>
                {unit.grid.map((row, i) => (
                  <tr key={i}>{row.map((cell, j) => <td key={j}>{cell === null ? "" : String(cell)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!unit && !failed && <div className="peek-wait">Opening the file…</div>}
        {failed === "gone" && <div className="peek-wait">This file was removed or has expired.</div>}
        {failed === "error" && <div className="peek-wait">Couldn&apos;t open this passage.</div>}
      </div>
    </div>
  );
}
