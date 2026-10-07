"use client";

/**
 * Step 5 — THE CHARTER. The sheet that assembled during the interview, now a
 * full document where everything is editable in place: the web address (live
 * availability check — the one thing that can block the build), this term,
 * pages, the org's words, per-member tracking, and summaries of leadership and
 * the timeline that link back to their steps. Signed at the foot.
 */

import { useEffect, useState } from "react";
import type { Draft } from "@/lib/onboarding/draft";
import { BUILTIN_METRIC_IDS, BUILTIN_METRIC_LABEL } from "@/lib/onboarding/kinds";
import { activeAreas, areaState } from "@/lib/onboarding/perm-areas";
import { TERM_MODELS, TERM_MODEL_LABEL, suggestTerms } from "@/lib/onboarding/terms";
import { todayISO } from "@/lib/dates";
import type { VocabKey } from "@/lib/vocab";
import { periodWord } from "./Charter";
import { DISPLAY_HOST, draftEventTypes, draftSlug, draftVocab, slugify, wfSet, type FlowAction } from "./flow-state";
import { Mark } from "./Mark";
import { AREA_META, Ic, fmtDay, orgName, pageOn, pageRows, pagesOn, seatTone } from "./paper";
import { slugBlocks, type SlugState } from "./useSlugCheck";
import { defaultTermModel } from "@/lib/onboarding/answers";

const PAGE_SHADOW = ["var(--peach)", "var(--sky)", "var(--mint)"];

/** A fill-in-the-blank word. Keeps its own text while retyped, so clearing it to
    type a new word doesn't snap back to the default mid-edit. */
function Blank({ value, onCommit }: { value: string; onCommit: (v: string | null) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className="blank"
      value={text}
      maxLength={40}
      size={Math.max(4, text.length)}
      onChange={e => {
        setText(e.target.value);
        if (e.target.value.trim()) onCommit(e.target.value.trim());
      }}
      onBlur={() => {
        if (!text.trim()) setText(value);
      }}
    />
  );
}

function slugPill(state: SlugState): { cls: string; text: string; ok: boolean } {
  switch (state.kind) {
    case "ok":       return { cls: "t-mint", text: "Available", ok: true };
    case "checking": return { cls: "", text: "Checking…", ok: false };
    case "taken":    return { cls: "t-rose", text: "Taken", ok: false };
    case "bad":      return { cls: "t-rose", text: state.label, ok: false };
    default:         return { cls: "", text: "—", ok: false };
  }
}

export function CharterStep({
  draft,
  dispatch,
  slugState,
  slugNotice,
  signedIn,
  founderFallback,
  onGo,
  onBuild,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  slugState: SlugState;
  /** Why the build bounced back here (address claimed during sign-in, etc.). */
  slugNotice: string | null;
  signedIn: boolean;
  founderFallback: string | null;
  onGo: (step: "name" | "roles" | "timeline") => void;
  onBuild: () => void;
}) {
  const slug = draftSlug(draft);
  const pill = slugPill(slugState);
  const blocked = slugBlocks(slugState);
  const finance = draft.enabledWorkflows.includes("finance");
  const model = draft.term?.model ?? defaultTermModel(draft.kind);
  const sugs = suggestTerms(model);
  const today = todayISO();
  const member = draftVocab(draft, "Member");
  const areas = activeAreas(wfSet(draft));
  const types = draftEventTypes(draft).filter(t => t.active);
  const founder = draft.founderName.trim() || founderFallback || "";
  const founderSeat = draft.seats.find(s => s.all);
  const setVocab = (key: VocabKey) => (v: string | null) => dispatch({ type: "setVocab", key, value: v });

  return (
    <>
      <div className="ask">
        <p className="kick">
          Step 5 · Your charter <span className="chip">the sheet you watched assemble</span>
        </p>
        <h1 className="q q--sm">
          Here’s the workspace I’d build for <span className="hi">{orgName(draft)}</span>.
        </h1>
        <p className="lede">
          Everything below came from your answers. Tap anything to change it — nothing is locked in, and all of it lives in
          Settings afterwards.
        </p>
      </div>

      <div className="doc">
        <div className="doc-hd">
          <Mark name={draft.name} logoUrl={draft.logoDataUrl} />
          <div>
            <p className="ch-k">Charter · draft</p>
            <h2>{orgName(draft)}</h2>
          </div>
          <button type="button" className="btn btn--soft btn--sm" onClick={() => onGo("name")}>
            <Ic name="pencil" />
            Rename
          </button>
        </div>

        <div className="doc-grid">
          <section className="dsec">
            <div className="dsec-h">
              <h3>Address</h3>
              <span className="n">ONE PER ORG</span>
            </div>
            <label className={`addr${pill.cls === "t-rose" || slugNotice ? " bad" : ""}`}>
              <span className="host">{DISPLAY_HOST}/</span>
              <input
                value={slug}
                spellCheck={false}
                aria-label="Web address"
                maxLength={40}
                onChange={e =>
                  dispatch({
                    type: "setSlug",
                    slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40),
                  })
                }
                onBlur={e => dispatch({ type: "setSlug", slug: slugify(e.target.value) })}
              />
              <span className={`pill st ${pill.cls}`}>
                {pill.ok && <span className="dot" />}
                {pill.text}
              </span>
            </label>
            {slugNotice && (
              <p className="claimed">
                <Ic name="alert" />
                <span>{slugNotice}</span>
              </p>
            )}
            {slugState.kind === "taken" && slugState.suggestions.length > 0 ? (
              <div className="sugs">
                {slugState.suggestions.slice(0, 3).map(s => (
                  <button key={s} type="button" onClick={() => dispatch({ type: "setSlug", slug: s })}>
                    {s}
                  </button>
                ))}
              </div>
            ) : slugState.kind === "bad" ? (
              <p className="hint warn">{slugState.message}</p>
            ) : (
              <p className="hint">Members open this link to find you. Lowercase, numbers and dashes.</p>
            )}
          </section>

          <section className="dsec r">
            <div className="dsec-h">
              <h3>This term</h3>
              <span className="n">STARTS ACTIVE</span>
            </div>
            <div className="segs" role="group" aria-label="How your year runs">
              {TERM_MODELS.map(m => (
                <button key={m} type="button" aria-pressed={model === m} onClick={() => dispatch({ type: "setTerm", model: m, pick: 0 })}>
                  {TERM_MODEL_LABEL[m]}
                </button>
              ))}
            </div>
            <div className="terms">
              {sugs.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  className="term"
                  aria-pressed={draft.term?.model === model && draft.term.pick === i}
                  onClick={() => dispatch({ type: "setTerm", model, pick: i })}
                >
                  {today >= s.startDate && today <= s.endDate && <span className="now">Now</span>}
                  <b>{s.label}</b>
                  <small>
                    {fmtDay(s.startDate)} – {fmtDay(s.endDate)}
                  </small>
                </button>
              ))}
            </div>
            {draft.term && (
              <div className="dates">
                <input
                  type="date"
                  value={draft.term.startDate}
                  aria-label="Term starts"
                  onChange={e => dispatch({ type: "setTermDates", startDate: e.target.value, endDate: draft.term!.endDate })}
                />
                to
                <input
                  type="date"
                  value={draft.term.endDate}
                  min={draft.term.startDate}
                  aria-label="Term ends"
                  onChange={e => dispatch({ type: "setTermDates", startDate: draft.term!.startDate, endDate: e.target.value })}
                />
              </div>
            )}
            <p className="hint">
              You land on a working {periodWord(draft).toLowerCase()}, not a setup wall — attendance, dues and the timeline
              all hang off it.
            </p>
          </section>

          <section className="dsec wide">
            <div className="dsec-h">
              <h3>Pages</h3>
              <span className="n">{pagesOn(draft).length} IN THE SIDEBAR</span>
            </div>
            <div className="pgs">
              {pageRows(draft).map(p =>
                p.lock ? (
                  <span key={p.id} className="pg lock">
                    <Ic name={p.icon} />
                    {p.label}
                    <Ic name="lock" />
                  </span>
                ) : (
                  <button
                    key={p.id}
                    type="button"
                    className="pg"
                    style={{ ["--hs" as string]: PAGE_SHADOW[p.group] }}
                    aria-pressed={pageOn(draft, p)}
                    onClick={() => dispatch({ type: "togglePage", workflow: p.id as never })}
                  >
                    <Ic name={pageOn(draft, p) ? p.icon : "plus"} />
                    {p.label}
                  </button>
                ),
              )}
            </div>
            <p className="hint">
              Dashboard, Timeline and {pageRows(draft)[2]!.label} are always there. Everything else is one switch in Settings
              → Workflows.
            </p>
          </section>

          <section className="dsec">
            <div className="dsec-h">
              <h3>Your words</h3>
            </div>
            <p className="vsent">
              One of us is a <Blank value={member} onCommit={setVocab("Member")} />. We meet as{" "}
              <Blank value={draftVocab(draft, "Meetings")} onCommit={setVocab("Meetings")} />
              {finance && (
                <>
                  . What members owe is <Blank value={draftVocab(draft, "Dues")} onCommit={setVocab("Dues")} />
                </>
              )}
              .
            </p>
            <p className="hint">Used everywhere — page names, emails, Ask Chapt’s answers.</p>
          </section>

          <section className="dsec r">
            <div className="dsec-h">
              <h3>Tracking</h3>
              <span className="n">PER {member.toUpperCase()}</span>
            </div>
            <div className="mets">
              {BUILTIN_METRIC_IDS.filter(id => id !== "duesOwed" || finance).map(id => (
                <button
                  key={id}
                  type="button"
                  className="pg"
                  style={{ ["--hs" as string]: "var(--lilac)" }}
                  aria-pressed={draft.metrics[id]}
                  onClick={() => dispatch({ type: "setBuiltinMetric", metric: id, on: !draft.metrics[id] })}
                >
                  <Ic name={draft.metrics[id] ? "bars" : "plus"} />
                  {id === "duesOwed" ? `${draftVocab(draft, "Dues")} owed` : BUILTIN_METRIC_LABEL[id]}
                </button>
              ))}
              {draft.metrics.custom.map((c, i) => (
                <button
                  key={`${c.name}-${i}`}
                  type="button"
                  className="pg"
                  style={{ ["--hs" as string]: "var(--lilac)" }}
                  aria-pressed="true"
                  title="Remove"
                  onClick={() => dispatch({ type: "removeCustomMetric", index: i })}
                >
                  <Ic name="bars" />
                  {c.name}
                </button>
              ))}
            </div>
            <p className="hint">Off means no column and no dashboard measure — never a fake zero.</p>
          </section>

          <section className="dsec">
            <div className="dsec-h">
              <h3>Leadership</h3>
              <span className="n">{draft.seats.length} SEATS</span>
              <button type="button" className="go" onClick={() => onGo("roles")}>
                Edit roles
              </button>
            </div>
            {draft.seats.map((s, i) => (
              <div key={i} className="seatln" style={{ ["--sc" as string]: `var(--${seatTone(s.color, i)})` }}>
                <span className="sw2" />
                <b>{s.title}</b>
                <small>
                  {s.all
                    ? "you · everything"
                    : areas
                        .filter(a => areaState(s.permissions, a) !== "off")
                        .map(a => AREA_META[a.id].label)
                        .join(" · ") || "title only"}
                </small>
              </div>
            ))}
          </section>

          <section className="dsec r">
            <div className="dsec-h">
              <h3>Timeline</h3>
              <span className="n">{types.length} CATEGORIES</span>
              <button type="button" className="go" onClick={() => onGo("timeline")}>
                Edit
              </button>
            </div>
            <div className="chips">
              {types.map(t => (
                <span key={t.slug} className="chip tp" style={{ ["--tcl" as string]: t.color, ["--tcd" as string]: t.colorDark }}>
                  {t.label}
                </span>
              ))}
            </div>
          </section>
        </div>

        <div className="doc-ft">
          <div className="sig">
            <span className={`ln${founder ? "" : " empty"}`}>{founder || "signs with your Google name"}</span>
            <small>Founder · {founderSeat?.title ?? ""}</small>
          </div>
          <div className="sp">
            {blocked && <span className="blocked">Pick an available address first</span>}
            <button type="button" className="btn btn--lg" disabled={blocked || !slug} onClick={onBuild}>
              {signedIn ? `Build ${orgName(draft)}` : "Sign & build"}
              <Ic name="arrow-r" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
