"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { LoadingSpinner } from "../../../components/dashboard/primitives";
import { PaperIcon } from "../../../components/paper/PaperIcon";
import { useToast } from "../../../components/dashboard/Toast";
import { useChapter } from "../../../context/ChapterContext";
import { useOrgPath } from "../../../hooks/useOrgPath";
import { requestJson } from "../../../lib/api";
import { FUNDRAISER_KINDS, localToday, stageOf } from "@/lib/fundraisers";
import type { Fundraiser } from "@/lib/api-types/fundraisers";
import { FundraiserShell } from "../FundraiserShell";
import { NewFundraiserDialog } from "../NewFundraiserDialog";
import { $m, Cal, CountUp, KindChip, MoneyJar, burst, cap1, errorText, fmtD, hours, rel } from "../parts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const num = (s: string) => { const v = parseFloat(s.replace(/[^0-9.]/g, "")); return isNaN(v) ? 0 : Math.round(v * 100) / 100; };
const inV = (v: number) => (v ? (v % 1 ? v.toFixed(2) : String(v)) : "");

type Row = { id: number; name: string; cost: string };

function Steps({ f, spent, count, today }: { f: Fundraiser; spent: number; count: number; today: string }) {
  const w = !!f.wrappedAt, m = f.made ?? 0, st = stageOf({ date: f.date, wrapped: w }, today);
  const s1 = count ? "done" : "now", s2 = w ? "done" : count || st === "ready" ? "now" : "", s3 = w ? (m < 0 ? "miss" : "win") : "";
  return <ol className="fz-steps">
    <li className={s1}><span className="n">{count ? <PaperIcon name="check" /> : "1"}</span><div><b>Shopping list</b><small>{count ? `${count} item${count > 1 ? "s" : ""} · ${$m(spent)}` : "Add what you’ll buy"}</small></div></li>
    <li className={s2}><span className="n">{w ? <PaperIcon name="check" /> : "2"}</span><div><b>Wrap up</b><small>{w ? `${$m(f.cameIn ?? 0)} came in` : st === "ready" ? "Count the money" : `After the sale, ${fmtD(f.date)}`}</small></div></li>
    <li className={s3}><span className="n">{w ? <PaperIcon name="star" /> : "3"}</span><div><b>{w && m < 0 ? "Came up short" : "What you made"}</b><small>{w ? $m(Math.abs(m)) : "—"}</small></div></li>
  </ol>;
}

export default function FundraiserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams(), router = useRouter(), orgPath = useOrgPath(), toast = useToast();
  const { can } = useChapter();
  const canManage = can("MANAGE_FUNDRAISING");
  const [f, setF] = useState<Fundraiser | null>(null);
  const [failed, setFailed] = useState<"missing" | "error" | null>(null), [reload, setReload] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [fresh, setFresh] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState("");
  const [slam, setSlam] = useState(false);
  const [editing, setEditing] = useState(false), [confirmDelete, setConfirmDelete] = useState(false);
  const [today] = useState(localToday);
  const addName = useRef<HTMLInputElement>(null), addCost = useRef<HTMLInputElement>(null), totalRef = useRef<HTMLInputElement>(null);
  const bigRef = useRef<HTMLDivElement>(null);

  // Take the server's copy, except a line someone is still mid-edit on (it differs
  // from what the server last said), so a save on one line can't wipe another.
  const adopt = (next: Fundraiser, prev?: Fundraiser) => {
    setF(next);
    setRows(rs => next.supplies.map(s => {
      const local = rs.find(r => r.id === s.id), old = prev?.supplies.find(o => o.id === s.id);
      const dirty = local && old && (local.name !== old.name || num(local.cost) !== old.cost);
      return dirty ? local : { id: s.id, name: s.name, cost: inV(s.cost) };
    }));
  };

  useEffect(() => {
    const ac = new AbortController(); setFailed(null);
    requestJson<Fundraiser>(`/api/fundraisers/${id}`, { signal: ac.signal }).then(next => adopt(next))
      .catch(e => { if (!ac.signal.aborted) setFailed((e as { status?: number }).status === 404 ? "missing" : "error"); });
    return () => ac.abort();
  }, [id, reload]);

  // Arrivals: from the composer (focus the list) or a "Wrap it up" button (focus the total).
  const arrived = useRef(false);
  useEffect(() => {
    if (!f || arrived.current) return; arrived.current = true;
    if (params.get("created")) { toast.success("Created. Now, what are you buying?"); setTimeout(() => addName.current?.focus({ preventScroll: true }), 300); }
    else if (params.get("wrap") || (stageOf({ date: f.date, wrapped: !!f.wrappedAt }, today) === "ready" && canManage)) setTimeout(() => totalRef.current?.focus({ preventScroll: true }), 400);
  }, [f, params, toast, today, canManage]);
  useEffect(() => { if (fresh == null) return; const t = setTimeout(() => setFresh(null), 1800); return () => clearTimeout(t); }, [fresh]);
  useEffect(() => { if (!confirmDelete) return; const t = setTimeout(() => setConfirmDelete(false), 4000); return () => clearTimeout(t); }, [confirmDelete]);

  // The list total moves while you type; the server total takes over on save.
  const spent = useMemo(() => Math.round(rows.reduce((a, r) => a + num(r.cost), 0) * 100) / 100, [rows]);

  if (!f) return <FundraiserShell>
    <div className="fz-loading">{failed === "missing" ? <><p>That fundraiser isn’t here anymore.</p><Link className="fz-btn soft" href={orgPath("/fundraisers")}>All fundraisers</Link></>
      : failed ? <><p role="alert">Couldn’t load this fundraiser.</p><button className="fz-btn soft" onClick={() => setReload(n => n + 1)}>Try again</button></>
      : <LoadingSpinner label="Loading fundraiser" tone="dusk" />}</div>
  </FundraiserShell>;

  const fund = f;
  const wrapped = !!fund.wrappedAt, locked = wrapped || !canManage;
  const st = stageOf({ date: fund.date, wrapped }, today);
  const K = FUNDRAISER_KINDS[fund.kind];
  const have = new Set(rows.map(r => r.name.trim().toLowerCase()));
  const sugg = K.suggestions.filter(([n]) => !have.has(n.toLowerCase()));

  async function call(url: string, init: RequestInit, fail: string): Promise<Fundraiser | null> {
    setBusy(true);
    try { const next = await requestJson<Fundraiser>(url, init); adopt(next, fund); return next; }
    catch (e) { toast.error(errorText(e, fail)); return null; }
    finally { setBusy(false); }
  }
  async function add(name: string, cost: number, viaChip = false) {
    name = name.trim(); if (!name) return;
    const next = await call(`/api/fundraisers/${fund.id}/supplies`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name, cost }) }, "Couldn’t add that supply.");
    if (!next) return;
    const made = next.supplies[next.supplies.length - 1];
    if (made) setFresh(made.id);
    if (viaChip) toast.success(`Added ${name}. Change the price if it’s off.`);
    else { if (addName.current) addName.current.value = ""; if (addCost.current) addCost.current.value = ""; addName.current?.focus({ preventScroll: true }); }
  }
  async function saveRow(r: Row) {
    const was = fund.supplies.find(s => s.id === r.id); if (!was) return;
    const name = r.name.trim(), cost = num(r.cost);
    if (!name) { setRows(rs => rs.map(x => x.id === r.id ? { ...x, name: was.name } : x)); return; }
    if (name === was.name && cost === was.cost) return;
    await call(`/api/fundraisers/${fund.id}/supplies/${r.id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ name, cost }) }, "Couldn’t save that line.");
  }
  async function remove(r: Row) {
    const next = await call(`/api/fundraisers/${fund.id}/supplies/${r.id}`, { method: "DELETE" }, "Couldn’t remove that supply.");
    if (next) toast.success(`Removed ${r.name}`);
  }
  async function wrapUp() {
    const cameIn = num(total); if (!cameIn || busy) return;
    const next = await call(`/api/fundraisers/${fund.id}/wrap`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ cameIn }) }, "Couldn’t wrap it up.");
    if (!next) return;
    setSlam(true);
    const m = next.made ?? 0;
    toast.success(m < 0 ? "Wrapped up. Came in a little short." : `Wrapped up: ${$m(m)} made`);
    setTimeout(() => burst(bigRef.current), 350);
  }
  async function reopen() {
    const keep = fund.cameIn;
    const next = await call(`/api/fundraisers/${fund.id}/wrap`, { method: "DELETE" }, "Couldn’t reopen it.");
    if (!next) return;
    setSlam(false); setTotal(inV(keep ?? 0));
    setTimeout(() => totalRef.current?.focus({ preventScroll: true }), 50);
  }
  async function del() {
    setBusy(true);
    try {
      await requestJson(`/api/fundraisers/${fund.id}`, { method: "DELETE" });
      toast.success(`Deleted ${fund.name}`);
      router.push(orgPath("/fundraisers"));
    } catch (e) { toast.error(errorText(e, "Couldn’t delete it.")); setBusy(false); }
  }
  function copy() {
    const m = fund.made ?? 0;
    const txt = `${fund.name} wrap-up: ${$m(fund.cameIn ?? 0)} came in, ${$m(fund.spent)} on supplies, ${m < 0 ? `${$m(-m)} short` : `${$m(m)} made`}.`;
    navigator.clipboard?.writeText(txt).then(() => toast.success("Copied for the group chat"), () => toast.error("Couldn’t copy. Select the numbers instead."));
  }

  const inn = num(total), m = Math.round((inn - spent) * 100) / 100;
  const relDay = rel(fund.date, today);

  return <FundraiserShell>
    <Link className="fz-back" href={orgPath("/fundraisers")}><PaperIcon name="arrow-r" />All fundraisers</Link>
    <header className="fz-dhead">
      <Cal date={fund.date} />
      <div><h1>{fund.name}</h1><div className="meta"><KindChip kind={fund.kind} />
        <span className="fz-chip"><PaperIcon name="cal" />{fmtD(fund.date)}{wrapped || relDay === fmtD(fund.date) ? "" : ` · ${cap1(relDay)}`}</span>
        {fund.startTime && <span className="fz-chip"><PaperIcon name="clock" />{hours(fund)}</span>}
        {fund.place && <span className="fz-chip"><PaperIcon name="pin" />{fund.place}</span>}
        {fund.goal != null && <span className="fz-chip fz-t-lilac"><PaperIcon name="flag" />Goal {$m(fund.goal)}</span>}
      </div></div>
      {canManage && <div className="acts">
        <button className="fz-btn ghost sm" disabled={busy} onClick={() => setEditing(true)}><PaperIcon name="pencil" />Edit</button>
        <button className={`fz-link danger`} disabled={busy} onClick={() => confirmDelete ? void del() : setConfirmDelete(true)}>{confirmDelete ? "Delete for good?" : "Delete"}</button>
      </div>}
    </header>

    <Steps f={fund} spent={spent} count={rows.length} today={today} />

    <div className="fz-dgrid">
      <section className={`fz-pad${locked ? " locked" : ""}`}>
        <div className="fz-pad-h"><span className="fz-tile fz-t-butter"><PaperIcon name="bag" /></span><div><h2>Shopping list</h2>
          <p>{wrapped ? "Locked when you wrapped up." : canManage ? "Everything you’re buying for this, and what it cost." : "What the chapter is buying for this."}</p></div></div>
        <div className="fz-lines">
          {rows.map((r, i) => <div key={r.id} className={`fz-it${fresh === r.id ? " new" : ""}`}>
            <span className="no">{i + 1}</span>
            <input className="nm" aria-label="Supply" value={r.name} readOnly={locked} maxLength={120}
              onChange={e => setRows(rs => rs.map(x => x.id === r.id ? { ...x, name: e.target.value } : x))}
              onBlur={() => !locked && void saveRow(rows.find(x => x.id === r.id)!)}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            <span className="cost"><input inputMode="decimal" aria-label={`Cost of ${r.name}`} placeholder="0" value={r.cost} readOnly={locked}
              onChange={e => setRows(rs => rs.map(x => x.id === r.id ? { ...x, cost: e.target.value } : x))}
              onBlur={() => !locked && void saveRow(rows.find(x => x.id === r.id)!)}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /></span>
            {!locked && <button className="x" aria-label={`Remove ${r.name}`} disabled={busy} onClick={() => void remove(r)}><PaperIcon name="x" /></button>}
          </div>)}
          {!locked && <form className="fz-it add" onSubmit={e => { e.preventDefault(); void add(addName.current?.value ?? "", num(addCost.current?.value ?? "")); }}>
            <span className="no"><PaperIcon name="plus" /></span>
            <input ref={addName} className="nm" placeholder="Add a supply…" aria-label="New supply" maxLength={120} />
            <span className="cost"><input ref={addCost} inputMode="decimal" placeholder="0" aria-label="Cost" /></span>
            <button className="x" aria-label="Add supply" disabled={busy}><PaperIcon name="plus" /></button>
          </form>}
        </div>
        {!rows.length && !locked && <p className="fz-pad-empty">Nothing yet. Type one above{sugg.length ? ", or tap a usual one below" : ""}.</p>}
        {!rows.length && locked && <p className="fz-pad-empty">Nothing on the list.</p>}
        {sugg.length > 0 && !locked && <div className="fz-sugg"><span>Usually on a {K.label.toLowerCase()} list:</span>
          {sugg.map(([n, c]) => <button type="button" key={n} disabled={busy} onClick={() => void add(n, c, true)}><PaperIcon name="plus" />{n} <i>~${c}</i></button>)}</div>}
        <div className="fz-pad-total"><b>Supplies</b><small>{rows.length} item{rows.length === 1 ? "" : "s"}</small><span className="fz-mono">{$m(spent)}</span></div>
      </section>

      {!wrapped ? <section className="fz-jarcard">
        <h2>{st === "ready" ? "How much came in?" : "After the sale: count it up"}</h2>
        <p className="lede">{!canManage ? "Waiting for an officer to count it." : st === "ready" ? "Everything together: cash, Venmo, card. Rough is fine." : `Come back after ${fmtD(fund.date)} and type in what came in.`}</p>
        <div className="fz-jar-row"><div><MoneyJar sup={spent} goal={fund.goal} inn={inn || null} /></div>
          <ul className="fz-legend">
            <li><i style={{ background: "var(--butter)" }} />Pays back supplies<span className="fz-mono">{$m(Math.min(inn, spent))}</span></li>
            <li><i style={{ background: "var(--mint)" }} />What you made<span className="fz-mono">{$m(Math.max(m, 0))}</span></li>
            {fund.goal != null && <li><i style={{ background: "none", borderStyle: "dashed", borderColor: "var(--lilac-ink)" }} />Goal<span className="fz-mono">{$m(fund.goal)}</span></li>}
          </ul></div>
        {canManage && <>
          <label className="fz-fld"><span><PaperIcon name="cash" />Total that came in</span>
            <span className="fz-amt"><input ref={totalRef} className="fz-inp" inputMode="decimal" placeholder="0" value={total}
              onChange={e => setTotal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void wrapUp(); }} /></span></label>
          <p className="fz-math" aria-live="polite">{!inn
            ? <>Type what came in and we’ll subtract the <span className="fz-mono">{$m(spent)}</span> of supplies. <span className="res none">= ?</span></>
            : <><span className="fz-mono">{$m(inn)}</span> came in <span className="eq">−</span> <span className="fz-mono">{$m(spent)}</span> on supplies <span className="eq">=</span> <span className={`res${m < 0 ? " loss" : ""}`}><span className="fz-mono">{$m(Math.abs(m))}</span> {m < 0 ? "short" : "made"}</span></>}</p>
          <div className="fz-wrap-f"><button className="fz-btn" disabled={!inn || busy} onClick={() => void wrapUp()}><PaperIcon name="check" />Wrap it up</button>
            <span className="note">Take out any starting change before you count the cash.</span></div>
        </>}
      </section> : (() => {
        const made = fund.made ?? 0, loss = made < 0, g = fund.goal;
        return <section className={`fz-jarcard ${loss ? "lost" : "won"}`}>
          <span className={`fz-kick ${loss ? "lost" : "won"}`}>{loss ? "Came up short" : "We made"}</span>
          <div className="fz-res-big" ref={bigRef}><span className="fz-hi"><CountUp to={Math.abs(made)} /></span></div>
          <div className="fz-jar-row"><div><MoneyJar sup={fund.spent} goal={g} inn={fund.cameIn} stamp={loss ? "SHORT" : "WRAPPED"} slam={slam} /></div>
            <ul className="fz-rcpt">
              <li><span>Came in</span><span>{$m(fund.cameIn ?? 0)}</span></li>
              <li><span>Supplies</span><span>−{$m(fund.spent)}</span></li>
              <li className="tot"><span>{loss ? "Short" : "Made"}</span><span>{$m(made)}</span></li>
            </ul></div>
          {g != null && <p className="fz-goalbar"><PaperIcon name="flag" /><span>{made >= g
            ? <>Goal was <b>{$m(g)}</b>. You beat it by <b>{$m(made - g)}</b>.</>
            : made > 0 ? <>Goal was <b>{$m(g)}</b>. <b>{$m(g - made)}</b> short of it.</>
            : <>Goal was <b>{$m(g)}</b>. Not this time.</>}</span></p>}
          {loss && <p className="fz-goalbar"><PaperIcon name="receipt" /><span>Supplies cost more than came in. The list on the left shows where it went.</span></p>}
          <div className="fz-after">
            <button className="fz-btn ghost sm" onClick={copy}><PaperIcon name="copy" />Copy for the group chat</button>
            {canManage && <button className="fz-link" disabled={busy} onClick={() => void reopen()}>Reopen</button>}
          </div>
        </section>;
      })()}
    </div>
    {editing && <NewFundraiserDialog defaultDate={fund.date} editing={fund} onClose={() => setEditing(false)}
      onSaved={next => { setEditing(false); adopt(next); toast.success("Saved"); }} />}
  </FundraiserShell>;
}
