"use client";

/**
 * Step 4 — BLUEPRINT. The full-screen review sheet: editable chapter URL with
 * a live slug check, workflow toggle rows with a "why it's here" rationale
 * (plus the locked Core row), the three high-signal vocab words with derived
 * plurals, and the Leadership seat list. The mock's "This term" card was cut
 * with the term question.
 */

import { useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/onboarding/draft";
import { KIND_LABEL } from "@/lib/onboarding/kinds";
import { roleSummary } from "@/lib/onboarding/perm-areas";
import type { WorkflowId } from "@/lib/org-types";
import type { VocabKey } from "@/lib/vocab";
import {
  DISPLAY_HOST,
  draftSlug,
  draftVocab,
  slugify,
  wfSet,
  type FlowAction,
} from "./flow-state";

/* ─── Slug editor ────────────────────────────────────────────────────────── */

type SlugState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "bad"; message: string }
  | { kind: "taken"; suggestions: string[] };

export function SlugEditor({
  draft,
  dispatch,
  invalidNotice,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  /** Set when a create attempt bounced back here (409) — shown once. */
  invalidNotice?: string | null;
}) {
  const slug = draftSlug(draft);
  const [state, setState] = useState<SlugState>({ kind: "idle" });
  const [focus, setFocus] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced live check against the real availability endpoint.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!slug || slug.length < 3) {
      setState({ kind: "bad", message: "3 characters or more." });
      return;
    }
    setState({ kind: "checking" });
    const controller = new AbortController();
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orgs/slug-check?slug=${encodeURIComponent(slug)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setState({ kind: "idle" });
          return;
        }
        const data = await res.json();
        if (data.ok) setState({ kind: "ok" });
        else if (data.reason === "taken") setState({ kind: "taken", suggestions: data.suggestions ?? [] });
        else setState({ kind: "bad", message: data.message ?? "That URL won't work." });
      } catch {
        setState({ kind: "idle" }); // network hiccup — stay quiet, POST re-checks anyway
      }
    }, 350);
    return () => {
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [slug]);

  const bad = state.kind === "taken" || state.kind === "bad";
  return (
    <div className="bp-url">
      <div className={`url-field${focus ? " focus" : ""}${bad ? " taken" : ""}${state.kind === "ok" ? " ok" : ""}`}>
        <span className="url-host">{DISPLAY_HOST}/</span>
        <input
          className="url-slug"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-label="Chapter URL slug"
          placeholder="your-chapter"
          value={slug}
          onFocus={() => setFocus(true)}
          onBlur={e => {
            setFocus(false);
            const cleaned = slugify(e.target.value);
            dispatch({ type: "setSlug", slug: cleaned || null });
          }}
          onChange={e => {
            const cleaned = slugify(e.target.value);
            dispatch({ type: "setSlug", slug: cleaned || null });
          }}
          onKeyDown={e => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span className="url-state" aria-live="polite">
          <span className="ic">{state.kind === "ok" ? "✓" : bad ? "✕" : ""}</span>
          <span>
            {state.kind === "ok"
              ? "available"
              : state.kind === "taken"
                ? "taken"
                : state.kind === "bad"
                  ? "too short"
                  : state.kind === "checking"
                    ? "…"
                    : ""}
          </span>
        </span>
      </div>
      <p className="url-note">
        {invalidNotice ? (
          <>{invalidNotice} </>
        ) : null}
        {state.kind === "taken" && state.suggestions.length > 0 && (
          <>
            Try{" "}
            <button
              className="suggest"
              onClick={() => dispatch({ type: "setSlug", slug: state.suggestions[0]! })}
            >
              {state.suggestions[0]}
            </button>{" "}
            instead
          </>
        )}
        {state.kind === "bad" && !invalidNotice && state.message}
      </p>
    </div>
  );
}

/* ─── Workflow rows ──────────────────────────────────────────────────────── */

/** Toggle rows with their "why it's here" rationale (cadence/term variants cut). */
function wfRows(draft: Draft): { key: WorkflowId; name: string; why: React.ReactNode }[] {
  const v = (key: VocabKey, plural = false) => draftVocab(draft, key, plural);
  const isTeam = draft.kind === "team";
  return [
    {
      key: "meetings",
      name: v("Meetings"),
      why: isTeam
        ? "off by default — flip on if you hold formal meetings with minutes."
        : `minutes, agendas & records for ${v("Meetings")} — flip off if you don't meet formally.`,
    },
    {
      key: "members",
      name: v("Member", true),
      why: `your roster — ${v("Member").toLowerCase()} profiles, attendance, and dues, all in one place.`,
    },
    {
      key: "finance",
      name: `${v("Dues")} & Treasury`,
      why:
        draft.pain === "dues" ? (
          <>because you said <q>chasing dues</q> eats your time.</>
        ) : (
          `${v("Dues").toLowerCase()}, budgets and who owes what — one tap away.`
        ),
    },
    {
      key: "attendance",
      name: "Attendance",
      why:
        draft.pain === "attendance" ? (
          <>because you said <q>tracking attendance</q> is the drain.</>
        ) : (
          "meetings worth counting."
        ),
    },
    {
      key: "events",
      name: "Events",
      why:
        draft.pain === "events" ? (
          <>because you said <q>planning events</q> takes the most time.</>
        ) : (
          "you meet on a rhythm; socials live here too."
        ),
    },
    {
      key: "parties",
      name: "Parties",
      why: "socials with a guest list, budget and door — separate from plain events.",
    },
    {
      key: "service",
      name: "Service",
      why:
        draft.kind === "service"
          ? "service hours are the point — this leads."
          : "flip it on if you track service hours.",
    },
    { key: "docs", name: "Docs", why: "bylaws, minutes and links — pinned, not lost in the chat." },
    {
      key: "communications",
      name: "Announcements",
      why:
        draft.pain === "comms" ? (
          <>because you said <q>keeping everyone informed</q> is the struggle.</>
        ) : (
          "start light — turn on when the group chat stops scaling."
        ),
    },
    { key: "tasks", name: "Tasks", why: "start light — turn on when exec needs assignments." },
  ];
}

/* ─── Vocab chip ─────────────────────────────────────────────────────────── */

function VocabChip({
  draft,
  dispatch,
  vk,
  showPlural,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  vk: VocabKey;
  showPlural?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const value = draftVocab(draft, vk);
  return (
    <span className="vocab-chip" title="Click to edit" onClick={() => setEditing(true)}>
      <span className="vl">{vk.toLowerCase()}</span>
      {editing ? (
        <input
          defaultValue={value}
          autoFocus
          onFocus={e => e.target.select()}
          onBlur={e => {
            const val = e.target.value.trim();
            dispatch({ type: "setVocab", key: vk, value: val || null });
            setEditing(false);
          }}
          onKeyDown={e => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          aria-label={`Your word for ${vk}`}
        />
      ) : (
        <span className="vv">
          {value}
          {showPlural && <span className="vv-plural"> / {draftVocab(draft, vk, true)}</span>}
        </span>
      )}
    </span>
  );
}

/* ─── The step ───────────────────────────────────────────────────────────── */

export function BlueprintStep({
  draft,
  dispatch,
  slugNotice,
  onBackToRoles,
  onBuild,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  slugNotice?: string | null;
  onBackToRoles: () => void;
  onBuild: () => void;
}) {
  const enabled = wfSet(draft);
  const name = draft.name.trim() || "your organization";

  return (
    <div className="bp">
      <div className="bp-head">
        <p className="kicker">Your blueprint — the sheet you watched assemble</p>
        <h1 className="q-serif">
          Here&rsquo;s the workspace I&rsquo;d build for <em>{name}</em>.
        </h1>
        <p className="bp-sub">
          Everything below came from your answers. Tap anything to change it — nothing is locked in.
        </p>
      </div>

      <SlugEditor draft={draft} dispatch={dispatch} invalidNotice={slugNotice} />

      <div className="bp-grid">
        <div className="bp-col">
          <div className="bp-card">
            <h3>
              Pages <span className="why">why it&rsquo;s here</span>
            </h3>
            <div>
              <div className="wf-row locked">
                <span className="wf-name">Core</span>
                <span className="wf-why">
                  Dashboard &amp; Timeline — every org gets these, so you always have a home.
                </span>
                <button className="wf-tgl locked" disabled>
                  ALWAYS
                </button>
              </div>
              {wfRows(draft).map(row => {
                const on = enabled.has(row.key);
                return (
                  <div key={row.key} className={`wf-row${on ? "" : " off"}`}>
                    <span className="wf-name">{row.name}</span>
                    <span className="wf-why">{row.why}</span>
                    <button
                      className="wf-tgl"
                      onClick={() => dispatch({ type: "toggleWorkflow", workflow: row.key })}
                      aria-pressed={on}
                    >
                      {on ? "ON" : "OFF"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bp-card">
            <h3>Your words</h3>
            <div className="vocab-row">
              <VocabChip draft={draft} dispatch={dispatch} vk="Member" showPlural />
              <VocabChip draft={draft} dispatch={dispatch} vk="Meetings" />
              <VocabChip draft={draft} dispatch={dispatch} vk="Period" />
            </div>
            <p className="vocab-note">
              {draft.kind && <>You said {KIND_LABEL[draft.kind].toLowerCase()} — so </>}I&rsquo;ll use{" "}
              <b>your</b> words everywhere. Click any to change it; the plural is figured out for you.
            </p>
          </div>
        </div>
        <div className="bp-col">
          <div className="bp-card">
            <h3>
              Leadership <span className="why">titles &amp; abilities are yours to change</span>
            </h3>
            <div>
              {draft.seats.map((seat, i) => {
                const summary = roleSummary(seat.permissions, enabled, seat.all);
                const able = seat.all
                  ? "everything — that's you"
                  : summary.startsWith("Can ")
                    ? summary.slice(4, -1).toLowerCase()
                    : "along for the ride — no abilities yet";
                return (
                  <div key={`${i}-${seat.title}`} className="seat">
                    <span className="seat-dot" style={{ background: seat.color }} />
                    <span className="seat-title">{seat.title}</span>
                    <span className="seat-able">{able}</span>
                    {seat.all ? <span className="seat-you">YOU</span> : <span />}
                  </div>
                );
              })}
            </div>
            <p className="seat-note">
              Everyone joins through one link after the build — then you seat them in a tap.
              <button className="add-seat" style={{ display: "block", margin: "6px 0 0" }} onClick={onBackToRoles}>
                ← Back to roles &amp; abilities
              </button>
            </p>
          </div>
        </div>
      </div>
      <div className="bp-cta-row">
        <button className="cta big" onClick={onBuild}>
          Looks right — build it<span>→</span>
        </button>
      </div>
      <p className="bp-foot">
        This exact sheet is what gets created — atomically, in one step. Every line still has a home
        in Settings later; a fast path, not a lock-in.
      </p>
    </div>
  );
}
