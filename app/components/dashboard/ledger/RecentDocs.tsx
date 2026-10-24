"use client";

import React, { useCallback, useEffect, useState } from "react";
import { requestJson } from "../../../lib/api";
import { SectionError } from "./SectionError";
import { PaperIcon, PaperTile, type PaperTone } from "../../paper/PaperIcon";
import { relativeTime } from "../AnnouncementCard";
import { hostOf, kindOf, KIND_LABEL, type Doc, type Kind } from "../../../[slug]/docs/lib";
import "../core-cards.css";

const TONE: Record<Kind, PaperTone> = { doc: "sky", sheet: "mint", form: "lilac", drive: "butter", link: "peach" };
const SHOW = 4;

/**
 * The newest docs in the library, as little folded-corner pages. "Recently
 * added", not "recently opened": the app records who added a doc and when, and
 * nothing about who opened it.
 *
 * Fetches its own list (GET /api/docs) because only this card needs it on the
 * dashboard, and it only mounts while the card is on the page.
 */
// The phone dashboard shows this card twice over: a glance tile and, on a tap,
// the card itself in a sheet. Both mount together, so they share one request.
let pending: { at: number; req: Promise<Doc[]> } | null = null;
function fetchRecent(fresh: boolean): Promise<Doc[]> {
  if (fresh || !pending || Date.now() - pending.at > 5000) {
    pending = {
      at: Date.now(),
      req: requestJson<Doc[]>("/api/docs").then(d => [...d].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, SHOW)),
    };
    pending.req.catch(() => { pending = null; });
  }
  return pending.req;
}

/** The newest docs (null while loading), whether the fetch failed, and a retry. */
export function useRecentDocs() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const run = useCallback((fresh: boolean) => {
    setFailed(false);
    let live = true;
    fetchRecent(fresh).then(d => { if (live) setDocs(d); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  useEffect(() => run(false), [run]);
  return { docs, failed, retry: () => { run(true); } };
}

export function RecentDocs({ onAll, onAdd }: { onAll: () => void; onAdd?: () => void }) {
  const { docs, failed, retry: load } = useRecentDocs();

  return (
    <section className="card rd" aria-label="Recently added docs">
      <div className="card-h">
        <PaperTile icon="doc" tone="sky" />
        <h2>Recent docs</h2>
        <div className="right">
          {docs && docs.length > 0 && <button type="button" className="rd-all" onClick={onAll}>All <PaperIcon name="arrow-r" /></button>}
        </div>
      </div>
      {failed ? (
        <SectionError what="recent docs" onRetry={load} />
      ) : (
        <div className="cc-b">
          {!docs ? (
            <div className="rd-rows" aria-hidden="true">
              {[0, 1, 2].map(i => <div key={i} className="rd-row rd-skel"><span className="rd-page" /><p><i /><i /></p></div>)}
            </div>
          ) : docs.length === 0 ? (
            <div className="un-empty">
              <p>No docs in the library yet.</p>
              {onAdd && <button type="button" className="un-btn" onClick={onAdd}><PaperIcon name="plus" /> Add a doc</button>}
            </div>
          ) : (
            <div className="rd-rows">
              {docs.map(d => {
                const k = kindOf(d.url);
                return (
                  <a key={d.id} className="rd-row" href={d.url} target="_blank" rel="noopener noreferrer">
                    <span className={`rd-page pp-t-${TONE[k]}`} aria-hidden="true" />
                    <p>
                      <b>{d.title}</b>
                      <span>{d.createdByName ? `${KIND_LABEL[k]} · added by ${d.createdByName.split(" ")[0]}` : `${KIND_LABEL[k]} · ${hostOf(d.url)}`}</span>
                    </p>
                    <small>{relativeTime(d.createdAt)}</small>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
