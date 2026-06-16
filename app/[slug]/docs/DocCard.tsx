"use client";

import { useMemo, useState, type ReactElement } from "react";

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

/** A small, recognizable "source" type inferred from the URL. We lead with this
 *  instead of a live iframe thumbnail — faster, calmer, and never broken. */
type Kind = "doc" | "sheet" | "form" | "drive" | "link";

export function kindOf(url: string): Kind {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    path = u.pathname;
  } catch {
    return "link";
  }
  if (host === "forms.gle" || /\/forms\//.test(path) || /forms\.google/.test(host)) return "form";
  if (/\/spreadsheets\//.test(path) || host.includes("sheets.google")) return "sheet";
  if (host.includes("drive.google")) return "drive";
  if (/\/document\//.test(path) || host.includes("docs.google")) return "doc";
  return "link";
}

const KIND_LABEL: Record<Kind, string> = { doc: "Doc", sheet: "Sheet", form: "Form", drive: "Drive", link: "Link" };

const KIND_ICON: Record<Kind, ReactElement> = {
  doc: <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4a1 1 0 001 1h4M5 3h9l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />,
  sheet: <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14" />,
  form: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
  drive: <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  link: <path strokeLinecap="round" strokeLinejoin="round" d="M13.83 10.17a4 4 0 00-5.66 0l-4 4a4 4 0 105.66 5.66l1.1-1.1m-.76-4.9a4 4 0 005.66 0l4-4a4 4 0 00-5.66-5.66l-1.1 1.1" />,
};

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
  const [favFailed, setFavFailed] = useState(false);

  const kind = useMemo(() => kindOf(doc.url), [doc.url]);
  const hostname = useMemo(() => {
    try { return new URL(doc.url).hostname.replace(/^www\./, ""); }
    catch { return doc.url; }
  }, [doc.url]);

  const showFavicon = doc.faviconUrl && !favFailed;

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  return (
    <a
      href={doc.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`dx-card k-${kind}`}
      style={{ ["--kc" as string]: `var(--k-${kind})` }}
    >
      {/* ── Source: favicon (or kind glyph) + title + host ── */}
      <div className="top">
        <div className="fav">
          {showFavicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={doc.faviconUrl!} alt="" onError={() => setFavFailed(true)} />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>{KIND_ICON[kind]}</svg>
          )}
        </div>
        <div className="meta">
          <div className="t">{doc.title}</div>
          <div className="h">{hostname}</div>
        </div>
      </div>

      <span className="kind">{KIND_LABEL[kind]}</span>

      <p className={`desc${doc.description ? "" : " none"}`}>
        {doc.description || "No description"}
      </p>

      <div className="foot">
        <span className="added">Added {fmtDate(doc.createdAt)}</span>
        <span className="open">
          Open
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </span>
      </div>

      {/* ── Manage menu ── */}
      {canManage && (
        <>
          <button
            type="button"
            className="dx-menu-btn"
            aria-label="Doc actions"
            aria-expanded={menuOpen}
            onClick={(e) => { stop(e); setMenuOpen(v => !v); }}
          >
            <svg fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { stop(e); setMenuOpen(false); }} />
              <div className="dx-menu">
                <button type="button" onClick={(e) => { stop(e); setMenuOpen(false); onEdit(); }}>Edit</button>
                <button type="button" className="del" onClick={(e) => { stop(e); setMenuOpen(false); onDelete(); }}>Delete</button>
              </div>
            </>
          )}
        </>
      )}
    </a>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
