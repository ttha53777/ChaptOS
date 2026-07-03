"use client";

import { useEffect, useRef, useState } from "react";
import type { Doc } from "@/app/[slug]/docs/lib";
import { inputDuskCls } from "../dashboard/styles";

function hostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

export function AttachmentField({
  attachmentUrl,
  attachmentDocId,
  docs,
  canManage,
  onUrlCommit,
  onDocPick,
  onClear,
}: {
  attachmentUrl: string | null;
  attachmentDocId: number | null;
  docs: Doc[];
  canManage: boolean;
  onUrlCommit: (url: string) => void;
  onDocPick: (docId: number) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!canManage) {
    if (attachmentDocId) {
      const doc = docs.find(d => d.id === attachmentDocId);
      return (
        <a
          href={doc?.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[12px] text-[#c4b5fd] hover:underline truncate"
        >
          <DocIcon />
          {doc?.title ?? "Open attachment"}
        </a>
      );
    }
    if (attachmentUrl) {
      return (
        <a
          href={attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[12px] text-[#c4b5fd] hover:underline truncate"
        >
          <PaperclipIcon />
          Open attachment
        </a>
      );
    }
    return <span className="text-[12px] text-[#6b6354]">—</span>;
  }

  // Editing mode: show current value as a dismissible chip, or an input.
  if (attachmentDocId || attachmentUrl) {
    const doc = attachmentDocId ? docs.find(d => d.id === attachmentDocId) : null;
    const label = doc ? doc.title : attachmentUrl ?? "";
    const href = doc ? doc.url : attachmentUrl ?? "#";
    return (
      <div className="flex items-center gap-2">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 items-center gap-1.5 truncate text-[12px] text-[#c4b5fd] hover:underline"
        >
          {doc ? <DocIcon /> : <PaperclipIcon />}
          <span className="truncate">{label}</span>
        </a>
        <button
          onClick={onClear}
          className="shrink-0 text-[11px] text-[#6b6354] hover:text-[#d98ba3]"
          title="Remove attachment"
        >
          ×
        </button>
      </div>
    );
  }

  const pickerQuery = query.startsWith("/") ? query.slice(1).toLowerCase() : "";
  const filtered = open
    ? docs.filter(d => d.title.toLowerCase().includes(pickerQuery))
    : [];

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setOpen(val.startsWith("/"));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
    if (e.key === "Enter" && !open) commitUrl();
  }

  function handleBlur() {
    // Delay so a click on a dropdown item fires before blur clears it.
    setTimeout(() => {
      if (!open) commitUrl();
    }, 150);
  }

  function commitUrl() {
    const val = query.trim();
    if (!val || val.startsWith("/")) return;
    if (val.startsWith("http://") || val.startsWith("https://")) {
      onUrlCommit(val);
      setQuery("");
    }
  }

  function pickDoc(doc: Doc) {
    setOpen(false);
    setQuery("");
    onDocPick(doc.id);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className={inputDuskCls}
        value={query}
        placeholder="https://… or type / to pick a doc"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-[rgba(236,231,221,0.12)] bg-[#0f0d0a] py-1 shadow-xl">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-[#6b6354]">No docs match — add one in Resources first.</p>
          ) : (
            filtered.map(doc => (
              <button
                key={doc.id}
                onMouseDown={() => pickDoc(doc)}
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-[rgba(236,231,221,0.06)]"
              >
                <span className="truncate text-[12px] text-[#c9c2b4]">{doc.title}</span>
                <span className="truncate text-[11px] text-[#6b6354]">{hostname(doc.url)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PaperclipIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  );
}

function DocIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M9 8h2M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
    </svg>
  );
}
