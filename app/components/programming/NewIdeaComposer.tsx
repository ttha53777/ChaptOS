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
    <Modal tone="dusk" title="New idea" onClose={onCancel} maxWidthClass="max-w-lg">
      <div className="space-y-3">
        <p className="ev-ni-sub">
          {/* The space after </b> is an explicit {" "}: this vendored Next drops a
              literal trailing space after a closing tag, so "Idea — nobody" would
              render as "Idea— nobody". */}
          Lands in <b>Idea</b>{" "}
          — nobody owns it yet, so it won&apos;t publish to the Timeline or the
          calendar. Just enough to hold the thought.
        </p>

        <div className="ev-ni-field">
          <label className="ev-ni-lbl" htmlFor="ev-ni-title">Title</label>
          <input
            id="ev-ni-title"
            ref={inputRef}
            type="text"
            value={title}
            maxLength={120}
            placeholder="Speaker series, beach cleanup, rush info night…"
            onChange={e => setTitle(e.target.value)}
            // Enter commits from the title, which is where the cursor already is
            // once a category has been picked.
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void commit(); } }}
            className="ev-ni-input"
          />
        </div>

        <div className="ev-ni-field">
          <span className="ev-ni-lbl">Category</span>
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
        <div className="ev-ni-prev pp-only" aria-hidden>
          <div
            className="ev-card"
            data-stage="idea"
            style={{
              ["--tc" as string]: categoryOptions.find(o => o.slug === category)?.color ?? "var(--faint)",
              ["--rot" as string]: "-1.1deg",
            }}
          >
            <div className="ec-t">{trimmed || "Your idea"}</div>
            <div className="ec-meta"><span className="ec-when nodate">No date yet</span></div>
            <div className="ec-block gold"><span>Needs an owner</span></div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className={`ev-ni-remain${ready ? " ready" : ""}`}>
            {ready ? "Ready" : !trimmed && !category ? "Needs a title + a category" : !trimmed ? "Needs a title" : "Needs a category"}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} className="ev-ni-cancel">
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={!ready || saving}
              className={btnDuskActionCls}
            >
              {saving ? "Adding…" : "Add idea"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
