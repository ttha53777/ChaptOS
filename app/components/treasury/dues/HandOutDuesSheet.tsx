"use client";

/**
 * "Hand out dues": put one charge on some people's tabs.
 *
 * Three steps on the left (who, what, when) and a live receipt on the right that
 * folds into a sticky footer on phones. The receipt is resolveTargets() — the
 * same code the server runs on POST /api/dues/charges — over the roster this
 * page already has, so the total an officer reads before pressing Bill is, to
 * the cent, what gets written. The server still re-resolves against its own
 * roster and never trusts amounts from here; the toast reports what it wrote.
 *
 * Nothing hits the books: a charge is a receivable. Money moves when someone
 * pays (the drawer's Record payment).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DuesBoard, DuesChargeIssued } from "@/lib/api-types/dues";
import { daysBetween } from "@/lib/dues-ledger";
import { resolveTargets, type DuesTargetSpec, type ExistingCharge, type RateRow } from "@/lib/dues-targets";
import { apiErrorMessage } from "../../../lib/api";
import { BrotherAvatar } from "../../BrotherAvatar";
import { PaperIcon } from "../../paper/PaperIcon";
import type { DuesPerson } from "./DuesTab";
import { issueCharge, parseDollars, type DuesAudienceBody } from "./dues-api";
import { fmtDay, money, plural } from "./dues-ui";

export type SheetMode = "all" | "role" | "pick";
export type SheetStart =
  | { mode: "all" }
  | { mode: "role"; key?: number | "none" }
  | { mode: "pick"; brotherIds?: number[] };

type RateKey = number | "base" | "none";
type DueChoice = "2w" | "eom" | "custom" | "none";

export interface RoleOption { id: number; name: string; rank: number }

const rk = (k: RateKey) => String(k);

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The last day of today's month — or of next month, when today already is it. */
function endOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return last === iso ? new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10) : last;
}

/** Cents → "$140" or "$33.34". */
const cash = (cents: number) => money(cents / 100);

export function HandOutDuesSheet({
  start, people, roles, board, duesWord, selfId, avatarRevision, onClose, onIssued,
}: {
  start: SheetStart;
  /** The live roster, in the order the page shows it. */
  people: readonly DuesPerson[];
  /** Every role someone on the roster holds, highest rank first. */
  roles: readonly RoleOption[];
  board: DuesBoard;
  duesWord: string;
  selfId: number | null;
  avatarRevision: number;
  onClose: () => void;
  onIssued: (issued: DuesChargeIssued) => void;
}) {
  const today = board.today;
  const [who, setWho]       = useState<SheetMode>(start.mode);
  const [excl, setExcl]     = useState<number[]>([]);
  const [xq, setXq]         = useState("");
  const [rates, setRates]   = useState<Record<string, { on: boolean; amt: string }>>(() => {
    const out: Record<string, { on: boolean; amt: string }> = { base: { on: false, amt: "" }, none: { on: start.mode !== "role" || start.key === undefined || start.key === "none", amt: "" } };
    for (const r of roles) out[rk(r.id)] = { on: start.mode === "role" && start.key === r.id, amt: "" };
    return out;
  });
  const [picked, setPicked] = useState<number[]>(start.mode === "pick" ? start.brotherIds ?? [] : []);
  const [q, setQ]           = useState("");
  const [name, setName]     = useState("");
  const [amt, setAmt]       = useState("");
  const [split, setSplit]   = useState(false);
  const [total, setTotal]   = useState("");
  const [due, setDue]       = useState<DueChoice>("2w");
  const [custom, setCustom] = useState(() => addDays(today, 21));
  const [note, setNote]     = useState("");
  const [dup, setDup]       = useState<"skip" | "bill">("skip");
  const [phase, setPhase]   = useState<"edit" | "sending" | "stamped">("edit");
  const [error, setError]   = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Focus once, on open — not on every render.
  useEffect(() => { if (start.mode !== "pick") nameRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const standing = useMemo(() => new Map(board.members.map(m => [m.brotherId, m])), [board.members]);

  // Same-named live charges in this term, with who's on them — the duplicate check.
  const existing = useMemo<ExistingCharge[]>(() => board.charges.map(c => ({
    chargeId: c.id, name: c.name,
    brotherIds: new Set(board.members.filter(m => m.lines.some(l => l.chargeId === c.id)).map(m => m.brotherId)),
  })), [board]);

  const dueDate = due === "2w" ? addDays(today, 14) : due === "eom" ? endOfMonth(today) : due === "custom" ? custom : null;
  const customBad = due === "custom" && (!/^\d{4}-\d{2}-\d{2}$/.test(custom));

  const checkedRows = (["base", "none", ...roles.map(r => r.id)] as RateKey[]).filter(k => rates[rk(k)]?.on);
  const rowMissingAmt = who === "role" && checkedRows.some(k => parseDollars(rates[rk(k)].amt) === 0);

  const spec: DuesTargetSpec = who === "role"
    ? { kind: "role", rates: checkedRows.map((k): RateRow => ({ key: k, amountCents: Math.round(parseDollars(rates[rk(k)].amt) * 100) })) }
    : (() => {
        const amount = split
          ? { mode: "split" as const, totalCents: Math.round(parseDollars(total) * 100) }
          : { mode: "each" as const, cents: Math.round(parseDollars(amt) * 100) };
        return who === "all" ? { kind: "all", amount, exclude: excl } : { kind: "pick", amount, brotherIds: picked };
      })();

  const members = useMemo(() => people.map(p => ({ brotherId: p.id, name: p.name, roleIds: p.roleIds })), [people]);
  const res = resolveTargets(spec, members, { name, existing, onDuplicate: dup });
  // Everyone the audience selects, ignoring amounts and duplicates — for "split ÷ n" and the empty states.
  const selectedCount = who === "all" ? people.length - excl.length : who === "pick" ? picked.length : res.selected;
  const dupCharge = res.duplicateOf !== null ? board.charges.find(c => c.id === res.duplicateOf) ?? null : null;

  const ok = phase === "edit" && res.lines.length > 0 && res.totalCents > 0 && !!name.trim() && !rowMissingAmt && !customBad;
  const hint = !selectedCount ? "Pick at least one person."
    : !name.trim() ? "Give it a name."
    : rowMissingAmt ? "Set an amount for every checked row."
    : customBad ? "Pick a due date."
    : !res.lines.length && res.skipped.length ? "They all have this already."
    : "Set an amount.";

  async function submit() {
    if (!ok) return;
    setPhase("sending");
    setError(null);
    const amountBody = (): Extract<DuesAudienceBody, { kind: "all" }>["amount"] =>
      split ? { mode: "split", total: parseDollars(total) } : { mode: "each", amount: parseDollars(amt) };
    const audience: DuesAudienceBody = who === "role"
      ? { kind: "role", rates: checkedRows.map(k => ({ key: k, amount: parseDollars(rates[rk(k)].amt) })) }
      : who === "all" ? { kind: "all", exclude: excl, amount: amountBody() }
      : { kind: "pick", brotherIds: picked, amount: amountBody() };
    try {
      const issued = await issueCharge({
        name: name.trim(), dueDate, note: note.trim() || null, audience, onDuplicate: dup,
        ...(board.term ? { semester: board.term.label } : {}),
      });
      setPhase("stamped");
      window.setTimeout(() => onIssued(issued), 720);
    } catch (e) {
      setPhase("edit");
      setError(apiErrorMessage(e, "Couldn't hand that out. Nothing was billed — try again."));
    }
  }

  const togglePick = (id: number) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const suggestions = [`Fall ${duesWord.toLowerCase()}`, `Spring ${duesWord.toLowerCase()}`, "Formal ticket", "Late fine", "Chapter shirt", "Retreat"];
  const goLabel = res.lines.length && res.totalCents ? `Bill ${plural(res.lines.length, "person", "people")} · ${cash(res.totalCents)}` : `Hand out ${duesWord.toLowerCase()}`;

  // ── receipt lines ──
  let lines: React.ReactNode;
  if (!res.lines.length) {
    lines = <div className="du-zero">{res.skipped.length ? "Everyone picked already has this charge." : "Pick who’s paying and the bill shows up here."}</div>;
  } else if (who === "role") {
    lines = <>
      {checkedRows.map(k => {
        const xs = res.lines.filter(l => l.parts?.some(p => p.key === k));
        if (!xs.length) return null;
        const each = Math.round(parseDollars(rates[rk(k)].amt) * 100);
        const label = k === "base" ? "Everyone" : k === "none" ? "No role" : roles.find(r => r.id === k)?.name ?? "Role";
        return <Ln key={rk(k)} l={`${label} · ${xs.length} × ${cash(each)}`} v={cash(each * xs.length)} />;
      })}
      {res.stacked > 0 && <p className="du-rc-note">{plural(res.stacked, "person holds", "people hold")} 2+ rows · billed the sum</p>}
    </>;
  } else if (res.lines.length <= 6) {
    lines = res.lines.map(l => <Ln key={l.brotherId} l={byId.get(l.brotherId)?.name ?? "Member"} v={cash(l.amountCents)} />);
  } else {
    const same = res.lines.every(l => l.amountCents === res.lines[0].amountCents);
    lines = <>
      <Ln l={same ? `${plural(res.lines.length, "person", "people")} × ${cash(res.lines[0].amountCents)}` : `${plural(res.lines.length, "person", "people")} · split`} v={cash(res.totalCents)} />
      {who === "all" && excl.length > 0 && <Ln l="Left out" v={plural(excl.length, "person", "people")} />}
    </>;
  }

  const dupWarn = dupCharge && res.already.length > 0 ? (
    <div className="du-warn">
      <b>{plural(res.already.length, "person", "people")} already {res.already.length === 1 ? "has" : "have"} “{dupCharge.name}”</b> on their tab from {fmtDay(dupCharge.createdAt.slice(0, 10))}.
      <div className="du-r">
        <button type="button" className="du-sg" aria-pressed={dup === "skip"} onClick={() => setDup("skip")}>Skip them</button>
        <button type="button" className="du-sg" aria-pressed={dup === "bill"} onClick={() => setDup("bill")}>Bill them again</button>
      </div>
    </div>
  ) : null;

  const inRoster = people.filter(p => !excl.includes(p.id));
  const needle = q.trim().toLowerCase();
  const pickList = people.filter(p => !needle || p.name.toLowerCase().includes(needle) || p.title.toLowerCase().includes(needle));
  const xNeedle = xq.trim().toLowerCase();
  const xMatches = xNeedle ? inRoster.filter(p => p.name.toLowerCase().includes(xNeedle)).slice(0, 6) : [];
  const roleCount = (k: RateKey) => k === "base" ? people.length : k === "none" ? people.filter(p => p.roleIds.length === 0).length : people.filter(p => p.roleIds.includes(k)).length;
  const roleMembers = (k: RateKey) => k === "base" ? people : k === "none" ? people.filter(p => p.roleIds.length === 0) : people.filter(p => p.roleIds.includes(k));

  return (
    <>
      <div className="du-scrim" onClick={onClose} aria-hidden="true" />
      <section className="du-sheet" role="dialog" aria-modal="true" aria-label={`Hand out ${duesWord.toLowerCase()}`}>
        <div className="du-sh-h">
          <span className="du-g"><PaperIcon name="jar" /></span>
          <div><h3>Hand out {duesWord.toLowerCase()}</h3><p>Puts a charge on people’s tabs. Nothing hits the books until they pay.</p></div>
          <button type="button" className="du-x" onClick={onClose} aria-label="Close"><PaperIcon name="x" /></button>
        </div>

        <div className="du-sh-b">
          <div className="du-form">
            {/* 1 — who */}
            <div className="du-step">
              <span className="du-num">1</span><h4>Who’s paying?</h4><span className="du-rail" />
              <div className="du-body">
                <div className="du-modes">
                  <ModeB k="all" cur={who} set={setWho} icon="people" t="Everyone" s="The whole roster, one amount" c="sky" />
                  <ModeB k="role" cur={who} set={setWho} icon="star" t="By role" s="A rate for each role" c="lilac" />
                  <ModeB k="pick" cur={who} set={setWho} icon="hand" t="Pick people" s="Fines, shirts, one-offs" c="peach" />
                </div>
                <div className="du-who-panel">
                  {who === "all" && <>
                    <div className="du-everyone">
                      <Stack ps={inRoster} max={9} selfId={selfId} avatarRevision={avatarRevision} />
                      <div><b>{plural(inRoster.length, "member")}</b><small>Everyone on the roster{excl.length ? `, minus ${excl.length}` : ""}</small></div>
                    </div>
                    <div className="du-excl">
                      <span>Leave someone out:</span>
                      {excl.map(id => (
                        <button key={id} type="button" className="du-xchip" onClick={() => setExcl(e => e.filter(x => x !== id))} aria-label={`Put ${byId.get(id)?.name} back`}>
                          {byId.get(id)?.name ?? "Member"}<PaperIcon name="x" />
                        </button>
                      ))}
                      <span className="du-xsrch">
                        <label className="du-srch"><PaperIcon name="search" /><input value={xq} onChange={e => setXq(e.target.value)} placeholder="Type a name" aria-label="Leave someone out" /></label>
                        {xMatches.length > 0 && (
                          <span className="du-xpop" role="listbox">
                            {xMatches.map(p => <button key={p.id} type="button" role="option" aria-selected="false" onClick={() => { setExcl(e => [...e, p.id]); setXq(""); }}>{p.name}<small>{p.title}</small></button>)}
                          </span>
                        )}
                      </span>
                    </div>
                  </>}

                  {who === "role" && (
                    <div className="du-rates">
                      {([...roles.map(r => ({ k: r.id as RateKey, l: r.name })), { k: "none" as RateKey, l: "Members with no role" }, { k: "base" as RateKey, l: "Everyone (base)" }]).map(({ k, l }) => {
                        const r = rates[rk(k)];
                        const n = roleCount(k);
                        return (
                          <div key={rk(k)} className={`du-rate${r.on ? "" : " du-off"}`}>
                            <button type="button" className="du-cb" role="checkbox" aria-checked={r.on} aria-label={l} onClick={() => setRates(s => ({ ...s, [rk(k)]: { ...s[rk(k)], on: !s[rk(k)].on } }))}><PaperIcon name="check" /></button>
                            <div className="du-rn"><b>{l}</b><small>{plural(n, "person", "people")}{k === "base" ? " · added on top of any role" : ""}</small></div>
                            <Stack ps={roleMembers(k)} max={4} selfId={selfId} avatarRevision={avatarRevision} />
                            <label className={`du-money${r.on ? "" : " du-dis"}`}>
                              <span>$</span>
                              <input inputMode="decimal" value={r.amt} placeholder="0" aria-label={`${l} amount`}
                                onChange={e => setRates(s => ({ ...s, [rk(k)]: { ...s[rk(k)], amt: e.target.value } }))} />
                              <span className="du-ea">ea</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {who === "pick" && <>
                    <div className="du-pick-tools">
                      <label className="du-srch"><PaperIcon name="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${people.length} members`} aria-label="Search members" /></label>
                      <span className="du-picked"><b>{picked.length}</b> picked</span>
                      <button type="button" className="du-link" onClick={() => setPicked(p => [...p, ...people.filter(x => standing.get(x.id)?.standing === "overdue" && !p.includes(x.id)).map(x => x.id)])}>+ everyone overdue</button>
                      {picked.length > 0 && <button type="button" className="du-link" onClick={() => setPicked([])}>clear</button>}
                    </div>
                    <div className="du-pick">
                      {pickList.map(p => {
                        const s = standing.get(p.id);
                        return (
                          <button key={p.id} type="button" className="du-pk" aria-pressed={picked.includes(p.id)} onClick={() => togglePick(p.id)}>
                            <span className="du-tk"><PaperIcon name="check" /></span><span>{p.name}</span>
                            {s?.standing === "overdue" && <span className="du-ow" title={`Overdue · ${money(s.owes)}`} />}
                          </button>
                        );
                      })}
                    </div>
                  </>}
                </div>
              </div>
            </div>

            {/* 2 — what for, how much */}
            <div className="du-step">
              <span className="du-num">2</span><h4>What’s it for?</h4><span className="du-rail" />
              <div className="du-body">
                <div className="du-fld">
                  <input ref={nameRef} className="du-txt" value={name} onChange={e => setName(e.target.value)} maxLength={60}
                    placeholder="Name it, so people know what they’re paying for" aria-label="Charge name" />
                  <div className="du-sugg">
                    {suggestions.map(s => (
                      <button key={s} type="button" className="du-sg" aria-pressed={name === s}
                        onClick={() => { setName(n => n === s ? "" : s); if (s === "Late fine" && who === "all") setWho("pick"); }}>{s}</button>
                    ))}
                  </div>
                  <div className="du-mob-only">{dupWarn}</div>
                </div>
                {who === "role" ? (
                  <p className="du-hint">Amounts are set per row above.</p>
                ) : (
                  <div className="du-fld">
                    <span className="du-lb">How much?</span>
                    <div className="du-seg du-seg-txt">
                      <button type="button" aria-pressed={!split} onClick={() => setSplit(false)}>Each person pays</button>
                      <button type="button" aria-pressed={split} onClick={() => setSplit(true)}>Split a total</button>
                    </div>
                    <div className="du-amt-row">
                      <label className="du-money du-lg">
                        <span>$</span>
                        <input inputMode="decimal" placeholder="0" value={split ? total : amt} aria-label={split ? "Total to split" : "Amount each"}
                          onChange={e => (split ? setTotal : setAmt)(e.target.value)} />
                      </label>
                      {split ? (
                        <span className="du-split-note">{selectedCount && parseDollars(total)
                          ? <>{money(parseDollars(total))} ÷ {selectedCount} = <b>{cash(Math.floor(Math.round(parseDollars(total) * 100) / selectedCount))}</b>{Math.round(parseDollars(total) * 100) % selectedCount ? " each, a cent more for the first few" : " each"}</>
                          : "Pick who’s splitting it first"}</span>
                      ) : (
                        <div className="du-sugg du-m0">
                          {[25, 50, 90, 140].map(v => <button key={v} type="button" className="du-sg" aria-pressed={parseDollars(amt) === v} onClick={() => setAmt(String(v))}>${v}</button>)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3 — when */}
            <div className="du-step">
              <span className="du-num">3</span><h4>When’s it due?</h4><span />
              <div className="du-body">
                <div className="du-dates">
                  <DateB k="2w" cur={due} set={setDue} t="In two weeks" s={fmtDay(addDays(today, 14))} />
                  <DateB k="eom" cur={due} set={setDue} t="End of month" s={fmtDay(endOfMonth(today))} />
                  <div className="du-dt" role="button" tabIndex={0} aria-pressed={due === "custom"} onClick={() => setDue("custom")} onKeyDown={e => { if (e.key === "Enter") setDue("custom"); }}>
                    <b>Pick a date</b>
                    <input type="date" value={custom} min={today} aria-label="Due date" onChange={e => { setCustom(e.target.value); setDue("custom"); }} />
                  </div>
                  <DateB k="none" cur={due} set={setDue} t="No due date" s="never late" />
                </div>
                <div className="du-fld">
                  <label htmlFor="du-note" className="du-lb">Note for members <span className="du-opt">(optional)</span></label>
                  <textarea id="du-note" className="du-txt" value={note} onChange={e => setNote(e.target.value)} maxLength={500}
                    placeholder="Where to pay, e.g. Venmo @chapter · ask the treasurer about a payment plan" />
                </div>
              </div>
            </div>
          </div>

          <div className="du-side">
            <div className="du-rcpt">
              <div className="du-hd">
                <span>{duesWord} charge</span>
                <b>{name.trim() ? name : <span className="du-untitled">Untitled charge</span>}</b>
                <span>{dueDate ? `Due ${fmtDay(dueDate)} · ${plural(daysBetween(today, dueDate), "day")}` : "No due date"}</span>
              </div>
              <div className="du-lines">{lines}</div>
              <div className="du-tot"><span>To collect</span><b>{cash(res.totalCents)}</b></div>
              {res.lines.length > 0 && (
                <div className="du-who-row">
                  <Stack ps={res.lines.map(l => byId.get(l.brotherId)).filter((p): p is DuesPerson => !!p)} max={7} selfId={selfId} avatarRevision={avatarRevision} />
                  <span>{plural(res.lines.length, "tab")} go up</span>
                </div>
              )}
              <span className={`du-stamp${phase === "stamped" ? " du-on" : ""}`} aria-hidden="true">ISSUED</span>
            </div>
            {dupWarn}
            {error && <div className="du-err" role="alert">{error}</div>}
            <div className="du-go">
              <button type="button" className="du-btn du-lg-btn" disabled={!ok} onClick={submit}><PaperIcon name="send" />{phase === "sending" ? "Billing…" : goLabel}</button>
              <p>{ok ? "Shows up on each tab right away. Nobody is messaged." : phase === "edit" ? hint : " "}</p>
            </div>
          </div>
        </div>

        <div className="du-mob-sum">
          <div className="du-t">
            <b>{cash(res.totalCents)}</b>
            <small>{error ?? (res.lines.length ? `${plural(res.lines.length, "person", "people")}${name.trim() ? ` · ${name.trim()}` : ""}` : hint)}</small>
          </div>
          <button type="button" className="du-btn" disabled={!ok} onClick={submit}><PaperIcon name="send" />{phase === "sending" ? "Billing…" : "Bill them"}</button>
        </div>
      </section>
    </>
  );
}

function Ln({ l, v }: { l: string; v: string }) {
  return <div className="du-ln"><span className="du-l"><span>{l}</span></span><span className="du-v">{v}</span></div>;
}

function ModeB({ k, cur, set, icon, t, s, c }: { k: SheetMode; cur: SheetMode; set: (m: SheetMode) => void; icon: "people" | "star" | "hand"; t: string; s: string; c: string }) {
  return (
    <button type="button" className="du-mode" style={{ "--c": `var(--pp-${c})` } as React.CSSProperties} aria-pressed={cur === k} onClick={() => set(k)}>
      <span className="du-g"><PaperIcon name={icon} /></span>
      <div><b>{t}</b><small>{s}</small></div>
    </button>
  );
}

function DateB({ k, cur, set, t, s }: { k: DueChoice; cur: DueChoice; set: (d: DueChoice) => void; t: string; s: string }) {
  return <button type="button" className="du-dt" aria-pressed={cur === k} onClick={() => set(k)}><b>{t}</b><small>{s}</small></button>;
}

export function Stack({ ps, max, selfId, avatarRevision }: { ps: readonly DuesPerson[]; max: number; selfId: number | null; avatarRevision: number }) {
  return (
    <span className="du-stack">
      {ps.slice(0, max).map(p => (
        <BrotherAvatar key={p.id} brother={{ id: p.id, name: p.name, avatarUrl: p.avatarUrl }} selfId={selfId} avatarRevision={avatarRevision} size="xs" className="du-av" />
      ))}
      {ps.length > max && <span className="du-more">+{ps.length - max}</span>}
    </span>
  );
}
