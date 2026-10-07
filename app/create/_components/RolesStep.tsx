"use client";

/**
 * Step 3 — WHO CAN DO WHAT. Seats are name badges: a pastel header with an
 * editable title, ability stickers (plain-language areas, never bitfields), the
 * auto-written "Can …" line, and who holds it. Seats aren't people yet — they
 * are handed out once members join.
 *
 * Abilities only appear for pages the org is using (lib/onboarding/perm-areas'
 * gates), so turning Treasury on is what makes "Money" grantable.
 */

import { useEffect, useState } from "react";
import type { Draft } from "@/lib/onboarding/draft";
import { KIND_LABEL, KIND_TO_TYPE } from "@/lib/onboarding/kinds";
import { PERM_LABELS, activeAreas, areaState, type PermArea } from "@/lib/onboarding/perm-areas";
import { ROLE_COLORS, SEAT_POOL, type Seat } from "@/lib/onboarding/seats";
import { wfSet, type FlowAction } from "./flow-state";
import { AREA_META, Ic, initials, listy, orgName, seatTone } from "./paper";

const NOUN: Record<string, string> = {
  fraternity: "chapters", sorority: "chapters", club: "clubs", team: "teams",
  service: "orgs", honor: "societies", arts: "companies", other: "orgs",
};
const ROT = [-0.8, 0.6, -0.4, 0.9, -0.6];

function canLine(seat: Seat, areas: PermArea[]): string | null {
  const on = areas.filter(a => areaState(seat.permissions, a) !== "off").map(a => AREA_META[a.id].can);
  if (!on.length) return null;
  return `Can ${listy(on)}.`;
}

/** A title input that keeps its own text while it's being retyped — the reducer
    refuses an empty title, which would otherwise make the field un-clearable. */
function TitleInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className={`bd-title${text.length > 16 ? " long" : ""}`}
      value={text}
      maxLength={60}
      aria-label="Seat title"
      placeholder="Name this seat"
      onChange={e => {
        setText(e.target.value);
        if (e.target.value.trim()) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (!text.trim()) setText(value);
      }}
    />
  );
}

export function RolesStep({
  draft,
  dispatch,
  founderFallback,
  onContinue,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  founderFallback: string | null;
  onContinue: () => void;
}) {
  const [own, setOwn] = useState("");
  const kind = draft.kind ?? "other";
  const areas = activeAreas(wfSet(draft));
  const used = new Set(draft.seats.map(s => s.title.toLowerCase()));
  const pool = (SEAT_POOL[KIND_TO_TYPE[kind]] ?? []).filter(p => !used.has(p.title.toLowerCase()));
  const founder = draft.founderName.trim() || founderFallback || "";
  const full = draft.seats.length >= 16;

  function addOwn() {
    const title = own.trim().slice(0, 60);
    if (!title || full) return;
    dispatch({ type: "addSeat", seat: { title, color: ROLE_COLORS[draft.seats.length % ROLE_COLORS.length]!, permissions: [] } });
    setOwn("");
  }

  return (
    <>
      <div className="ask">
        <p className="kick">
          Step 3 · Who can do what <span className="chip">{draft.seats.length} seats</span>
        </p>
        <h1 className="q q--sm">
          Who can do what at{" "}
          <span className="hi" style={{ ["--mark" as string]: "var(--sky)" }}>
            {orgName(draft)}
          </span>
          ?
        </h1>
        <p className="lede">
          I set these up for {KIND_LABEL[kind].toLowerCase()} — each one already does its job. Tap a sticker to add or
          take away an ability, rename a seat, or just leave them. <b>Seats aren’t people yet:</b> you hand them out after
          everyone joins.
        </p>
      </div>

      <div className="seats">
        {draft.seats.map((s, i) => {
          const cl = s.all ? null : canLine(s, areas);
          const granted = s.all ? areas : areas.filter(a => areaState(s.permissions, a) !== "off");
          const fine = granted.flatMap(a => a.perms.filter(p => s.all || s.permissions.includes(p)).map(p => PERM_LABELS[p]));
          return (
            <article
              key={i}
              className="badge"
              style={{ ["--sc" as string]: `var(--${seatTone(s.color, i)})`, ["--rot" as string]: `${ROT[i % ROT.length]}deg` }}
            >
              <div className="bd-top">
                <p className="k">
                  {s.all ? "Founder’s seat" : `Seat ${String(i + 1).padStart(2, "0")}`}
                  {!s.all && (
                    <button type="button" className="del" aria-label={`Remove ${s.title}`} onClick={() => dispatch({ type: "removeSeat", index: i })}>
                      <Ic name="trash" />
                    </button>
                  )}
                </p>
                <TitleInput value={s.title} onCommit={title => dispatch({ type: "renameSeat", index: i, title })} />
              </div>
              <div className="bd-b">
                <p className="k2">Can handle</p>
                <div className="abs">
                  {areas.map(a => {
                    const meta = AREA_META[a.id];
                    const pressed = !!s.all || areaState(s.permissions, a) !== "off";
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className={`ab t-${meta.tone}`}
                        style={{ ["--p-hs" as string]: `var(--${meta.tone})` }}
                        aria-pressed={pressed}
                        disabled={!!s.all}
                        onClick={() => dispatch({ type: "toggleSeatArea", index: i, areaId: a.id })}
                      >
                        <Ic name={pressed ? "check" : meta.icon} />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
                <p className={`can${s.all || cl ? "" : " none"}`}>
                  {s.all ? (
                    <>
                      <b>Everything.</b> Full authority — it’s the founder’s seat, and it’s yours.
                    </>
                  ) : (
                    cl ?? "No abilities yet — this seat would be a title only."
                  )}
                </p>
                {fine.length > 0 && (
                  <details className="fine">
                    <summary>
                      <Ic name="chev-r" />
                      Exactly what that means
                    </summary>
                    <ul>
                      {fine.map(f => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <div className="bd-f">
                {s.all ? (
                  <>
                    <span className="avatar" style={{ ["--av" as string]: "var(--peach)" }}>
                      {initials(founder) || "★"}
                    </span>
                    <span>
                      Held by <b>you</b>
                      {founder ? ` — ${founder}` : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="avatar avatar--ghost">?</span>
                    Open — you’ll hand it out once people join
                  </>
                )}
              </div>
            </article>
          );
        })}

        <article className="badge badge--add">
          <h4>
            <Ic name="plus" />
            Add a seat
          </h4>
          <p>Offices {NOUN[kind]} like yours often add.</p>
          <div className="pool">
            {!full &&
              pool.map((p, i) => (
                <button
                  key={p.title}
                  type="button"
                  style={{ ["--sc" as string]: `var(--${seatTone(p.color, draft.seats.length + i)})` }}
                  onClick={() => dispatch({ type: "addSeat", seat: { title: p.title, color: p.color, permissions: [...p.permissions] } })}
                >
                  <i />
                  <span>
                    <b>{p.title}</b> <small>{p.able}</small>
                  </span>
                  <Ic name="plus" />
                </button>
              ))}
            <form
              className="own"
              onSubmit={e => {
                e.preventDefault();
                addOwn();
              }}
            >
              <input
                placeholder={full ? "That’s the most seats for now" : "Or name your own…"}
                aria-label="New seat title"
                value={own}
                maxLength={60}
                disabled={full}
                onChange={e => setOwn(e.target.value)}
              />
              <button className="mini" type="submit" disabled={full || !own.trim()}>
                <Ic name="plus" />
                Add
              </button>
            </form>
          </div>
        </article>
      </div>

      <div className="foot">
        <button type="button" className="btn btn--lg" onClick={onContinue}>
          Looks right
          <Ic name="arrow-r" />
        </button>
        <span className="note">Abilities only appear for pages you’re using — turn on Treasury and “Money” shows up.</span>
      </div>
    </>
  );
}
