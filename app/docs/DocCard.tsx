"use client";

import { useMemo, useState } from "react";

export interface Doc {
  id: number;
  title: string;
  url: string;
  description: string | null;
  ogImage: string | null;
  ogTitle: string | null;
  faviconUrl: string | null;
  embedOk: boolean | null;
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
}

export function DocCard({
  doc,
  canManage,
  onEdit,
  onDelete,
}: {
  doc: Doc;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // The embedOk verdict comes from the server probe; fall back to true so we
  // at least *try* to iframe URLs we haven't probed yet. If the iframe stays
  // blank past load, the client-side onError flag flips us to the fallback.
  const [iframeFailed, setIframeFailed] = useState(false);
  const showIframe = doc.embedOk !== false && !iframeFailed;

  const hostname = useMemo(() => {
    try { return new URL(doc.url).hostname.replace(/^www\./, ""); }
    catch { return doc.url; }
  }, [doc.url]);

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  return (
    <div className="card-premium group relative flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#10121a] transition-all duration-200 hover:border-white/[0.12]">
      {/* The card itself is the link. Wrapping <a> covers the whole card and
          opens the URL in a new tab — the iframe pointer-events shim below
          guarantees clicks land here, not on the embedded page. */}
      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 flex-col"
      >
        {/* ── Header: favicon + title + hostname ────────────────────────── */}
        <div className="flex items-start gap-3 p-5 pb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-indigo-500/10">
            {doc.faviconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={doc.faviconUrl}
                alt=""
                className="h-5 w-5 object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold leading-tight text-white">{doc.title}</p>
            <p className="mt-0.5 truncate text-[11px] leading-snug text-slate-500">{hostname}</p>
          </div>
        </div>

        {/* ── Preview area (16:9) ───────────────────────────────────────── */}
        <div className="relative mx-5 aspect-video overflow-hidden rounded-lg border border-white/[0.04] bg-[#0a0d14]">
          {showIframe ? (
            <>
              <iframe
                src={doc.url}
                title={doc.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                // Sandbox WITHOUT allow-scripts/allow-forms/allow-same-origin
                // strips the iframe's ability to handle input — typing,
                // clicking, and focus inside the embed all become no-ops, so
                // the card behaves like a static preview that opens the real
                // doc in a new tab when clicked.
                sandbox=""
                tabIndex={-1}
                className="absolute left-0 top-0 origin-top-left"
                // Render the page at 2× the card and scale down 50% — gives a
                // "thumbnail" feel and lets more of the real layout fit.
                style={{ width: "200%", height: "200%", transform: "scale(0.5)", pointerEvents: "none" }}
                onError={() => setIframeFailed(true)}
              />
              {/* Belt-and-suspenders: pointer shim on top so any stray click
                  still hits the parent <a> instead of the iframe. */}
              <div className="absolute inset-0" aria-hidden="true" />
            </>
          ) : doc.ogImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.ogImage}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <p className="text-[11px] text-slate-500">Preview unavailable</p>
            </div>
          )}
        </div>

        {/* ── Description + open hint ───────────────────────────────────── */}
        <div className="flex flex-1 flex-col p-5 pt-3">
          <p className="line-clamp-2 min-h-[32px] flex-1 text-[12px] leading-snug text-slate-400">
            {doc.description || <span className="italic text-slate-600">No description</span>}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] text-slate-600">{fmtDate(doc.createdAt)}</span>
            <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <span className="text-[10px] text-slate-500">Open</span>
              <svg className="h-3 w-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </div>
        </div>
      </a>

      {/* ── Edit/delete menu — sits above the <a> via z-index ─────────── */}
      {canManage && (
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            onClick={(e) => { stop(e); setMenuOpen(v => !v); }}
            aria-label="Doc actions"
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-white/[0.06] hover:text-white"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
            </svg>
          </button>
          {menuOpen && (
            <>
              {/* Backdrop to dismiss; click-through is fine since menu is above. */}
              <div className="fixed inset-0 z-0" onClick={(e) => { stop(e); setMenuOpen(false); }} />
              <div className="absolute right-0 top-8 z-20 min-w-[120px] overflow-hidden rounded-lg border border-white/[0.08] bg-[#10121a] shadow-xl">
                <button
                  type="button"
                  onClick={(e) => { stop(e); setMenuOpen(false); onEdit(); }}
                  className="block w-full px-3 py-1.5 text-left text-[12px] text-slate-300 hover:bg-white/[0.06]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={(e) => { stop(e); setMenuOpen(false); onDelete(); }}
                  className="block w-full px-3 py-1.5 text-left text-[12px] text-red-400 hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}
