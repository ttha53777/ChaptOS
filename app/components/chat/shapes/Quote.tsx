"use client";

// Quote (_design/Ask Chapt Answer System Mock.html#quote) — what the minutes
// say, word for word, on a legal-pad strip with its meeting and date. "Decided"
// is stamped only for one of the meeting's summarized decisions (no vote counts
// exist, so none are drawn). The meeting's action items sit underneath and tick
// through the same route the minutes page uses; the owner or an officer may.

import { useState } from "react";

import { orgFetch } from "../../../lib/api";
import { IcTick } from "../icons";
import type { AnswerRow, QuoteShape } from "../types";
import { fmtDay, iv, type RowHandlers } from "./common";

export function QuoteSheet({ shape, rows, h }: { shape: QuoteShape; rows: AnswerRow[]; h: RowHandlers }) {
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(shape.items.map(a => [a.id, a.done])));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const meetingRow = rows[0];
  const today = new Date().toISOString().slice(0, 10);

  async function tick(id: string) {
    const next = !done[id];
    setBusy(id); setErr(null);
    setDone(d => ({ ...d, [id]: next }));
    try {
      const res = await orgFetch(`/api/calendar/${shape.meeting.id}/action-items`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: id, done: next }),
      });
      if (!res.ok) throw new Error(res.status === 403 ? "Only the owner or an officer can tick that." : "Couldn't save that.");
    } catch (e) {
      setDone(d => ({ ...d, [id]: !next }));
      setErr(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="qt-wrap in in-3">
      <div className="qt">
        <button type="button" className="qt-src" onClick={() => meetingRow && h.act(meetingRow)}>
          <b>{shape.meeting.title}</b> · {fmtDay(shape.meeting.date)} · Minutes
        </button>
        <blockquote>“{shape.text}”</blockquote>
        {shape.decided && <span className="qt-stamp">Decided<small>{fmtDay(shape.meeting.date)}</small></span>}
      </div>
      {shape.items.length > 0 && (
        <div className="qt-items">
          <span className="shp-kicker">Action items from this meeting</span>
          {shape.items.map((a, i) => {
            const isDone = done[a.id];
            const late = !isDone && a.due != null && a.due < today;
            return (
              <div key={a.id} className={`ai-row${late ? " late" : ""}`} style={iv(i)}>
                <button
                  type="button"
                  className={`box${isDone ? " on" : ""}`}
                  aria-pressed={isDone}
                  aria-label={isDone ? `Mark "${a.text}" not done` : `Mark "${a.text}" done`}
                  disabled={busy === a.id}
                  onClick={() => void tick(a.id)}
                >
                  {isDone && <IcTick size={11} />}
                </button>
                <span className="ai-t"><b>{a.text}</b>{a.owner && <span>{a.owner}</span>}</span>
                <span className="ai-d">{isDone ? "Done" : a.due ? (late ? `Due ${fmtDay(a.due)} · late` : `Due ${fmtDay(a.due)}`) : ""}</span>
              </div>
            );
          })}
          {err && <p className="qt-err" role="status">{err}</p>}
        </div>
      )}
    </div>
  );
}
