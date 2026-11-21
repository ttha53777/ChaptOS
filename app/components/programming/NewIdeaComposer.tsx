"use client";

/**
 * The two-field way onto the board.
 *
 * Idea's whole entry rule is title + category (see REQUIRED_FIELDS), so this asks
 * for exactly that and nothing else. The full event form exists beside it and
 * collects date, location, time and the rest — but requiring all of that to write
 * down "speaker series?" is what keeps ideas in a group chat instead of on the
 * board, which is the one thing the Idea lane is for.
 *
 * Built on the same Modal shell as the fix-step and the wrap-up so the three read
 * as one family of moment rather than three different features.
 */

import { useEffect, useRef, useState } from "react";
import { Modal } from "../dashboard/primitives";
import { IDEA, ideaRemain } from "@/lib/programme/board";
import { btnDuskActionCls } from "../dashboard/styles";
import type { CategoryOption } from "../timeline/CalendarEventForm";

export function NewIdeaComposer({
  categoryOptions,
  initial,
  onCancel,
  onCommit,
}: {
  categoryOptions: CategoryOption[];
  /** Pre-fill, from a starter idea on the empty board. */
  initial?: { title: string; category: string };
  onCancel: () => void;
  onCommit: (input: { title: string; category: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState<string>(initial?.category ?? "");
  const [saving, setSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const trimmed = title.trim();
  const ready = trimmed.length > 0 && category !== "";

  async function commit() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      await onCommit({ title: trimmed, category });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal tone="dusk" title={IDEA.title} onClose={onCancel} maxWidthClass="max-w-lg">
      <div className="space-y-3">
        <p className="ev-ni-sub">
          {/* The space after </b> is an explicit {" "}: this vendored Next drops a
              literal trailing space after a closing tag, so "Idea — nobody" would
              render as "Idea— nobody". */}
          {IDEA.subParts[0]}<b>{IDEA.subParts[1]}</b>{" "}
          {IDEA.subParts[2]}
        </p>

        <div className="ev-ni-field">
          <label className="ev-ni-lbl" htmlFor="ev-ni-title">{IDEA.titleK}</label>
          <input
            id="ev-ni-title"
            ref={inputRef}
            type="text"
            value={title}
            maxLength={120}
            placeholder={IDEA.titlePh}
            onChange={e => setTitle(e.target.value)}
            // Enter commits from the title, which is where the cursor already is
            // once a category has been picked.
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void commit(); } }}
            className="ev-ni-input"
          />
        </div>

        <div className="ev-ni-field">
          <span className="ev-ni-lbl">{IDEA.categoryK}</span>
          <div className="ev-ni-cats">
            {categoryOptions.map(opt => (
              <button
                key={opt.slug}
                type="button"
                aria-pressed={category === opt.slug}
                onClick={() => setCategory(opt.slug)}
                className={`ev-ni-cat${category === opt.slug ? " on" : ""}`}
                // color is optional on CategoryOption; fall back to the neutral
                // token rather than emitting "undefined29" as a colour.
                style={{
                  ["--c" as string]: opt.color ?? "var(--faint)",
                  ["--cbg" as string]: opt.color ? `${opt.color}29` : "var(--line-soft)",
                }}
              >
                <span className="cdot" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Paper only: the sticky note this will become on the board. */}
        <div className="ev-ni-prev" aria-hidden>
          <div
            className="ev-card"
            data-stage="idea"
            style={{
              ["--tc" as string]: categoryOptions.find(o => o.slug === category)?.color ?? "var(--faint)",
              ["--rot" as string]: "-1.1deg",
            }}
          >
            <div className="ec-t">{trimmed || IDEA.preview}</div>
            <div className="ec-meta"><span className="ec-when nodate">{IDEA.noDate}</span></div>
            <div className="ec-block gold"><span>{IDEA.needsOwner}</span></div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className={`ev-ni-remain${ready ? " ready" : ""}`}>
            {ideaRemain(trimmed, category)}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} className="ev-ni-cancel">
              {IDEA.cancel}
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={!ready || saving}
              className={btnDuskActionCls}
            >
              {saving ? IDEA.adding : IDEA.go}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
