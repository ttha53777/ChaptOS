"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { LoadingSpinner } from "../../../../components/dashboard/primitives";
import { PaperIcon } from "../../../../components/paper/PaperIcon";
import { useToast } from "../../../../components/dashboard/Toast";
import { useChapter } from "../../../../context/ChapterContext";
import { useOrgPath } from "../../../../hooks/useOrgPath";
import { requestJson } from "../../../../lib/api";
import { FUNDRAISER_KINDS, localToday, stageOf } from "@/lib/fundraisers";
import type { Fundraiser } from "@/lib/api-types/fundraisers";
import { FundraiserShell } from "../FundraiserShell";
import { NewFundraiserDialog } from "../NewFundraiserDialog";
import { $m, Cal, CountUp, KindChip, MoneyJar, burst, errorText, fmtD, hours } from "../parts";
import { DETAIL, SAY, steps as stepsOf, suggestionsFor, num, inV, spentOf, dateRel, copyText, goalLine } from "@/lib/fundraising/ledger";

const JSON_HEADERS = { "Content-Type": "application/json" };

type Row = { id: number; name: string; cost: string };

function Steps({ f, spent, count, today }: { f: Fundraiser; spent: number; count: number; today: string }) {
  const [a, b, c] = stepsOf(f, spent, count, today);
  const w = !!f.wrappedAt;
  return <ol className="fz-steps">
    <li className={a!.state}><span className="n">{count ? <PaperIcon name="check" /> : "1"}</span><div><b>{a!.title}</b><small>{a!.sub}</small></div></li>
    <li className={b!.state}><span className="n">{w ? <PaperIcon name="check" /> : "2"}</span><div><b>{b!.title}</b><small>{b!.sub}</small></div></li>
    <li className={c!.state}><span className="n">{w ? <PaperIcon name="star" /> : "3"}</span><div><b>{c!.title}</b><small>{c!.sub}</small></div></li>
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
    if (params.get("created")) { toast.success(SAY.created); setTimeout(() => addName.current?.focus({ preventScroll: true }), 300); }
    else if (params.get("wrap") || (stageOf({ date: f.date, wrapped: !!f.wrappedAt }, today) === "ready" && canManage)) setTimeout(() => totalRef.current?.focus({ preventScroll: true }), 400);
  }, [f, params, toast, today, canManage]);
  useEffect(() => { if (fresh == null) return; const t = setTimeout(() => setFresh(null), 1800); return () => clearTimeout(t); }, [fresh]);
  useEffect(() => { if (!confirmDelete) return; const t = setTimeout(() => setConfirmDelete(false), 4000); return () => clearTimeout(t); }, [confirmDelete]);

  // The list total moves while you type; the server total takes over on save.
  const spent = useMemo(() => spentOf(rows.map(r => r.cost)), [rows]);

  if (!f) return <FundraiserShell>
    <div className="fz-loading">{failed === "missing" ? <><p>{DETAIL.missing}</p><Link className="fz-btn soft" href={orgPath("/fundraisers")}>{DETAIL.back}</Link></>
      : failed ? <><p role="alert">{DETAIL.loadFailed}</p><button className="fz-btn soft" onClick={() => setReload(n => n + 1)}>{DETAIL.retry}</button></>
      : <LoadingSpinner label="Loading fundraiser" tone="dusk" />}</div>
  </FundraiserShell>;

  const fund = f;
  const wrapped = !!fund.wrappedAt, locked = wrapped || !canManage;
  const st = stageOf({ date: fund.date, wrapped }, today);
  const K = FUNDRAISER_KINDS[fund.kind];
  const sugg = suggestionsFor(fund.kind, rows.map(r => r.name));

  async function call(url: string, init: RequestInit, fail: string): Promise<Fundraiser | null> {
    setBusy(true);
    try { const next = await requestJson<Fundraiser>(url, init); adopt(next, fund); return next; }
    catch (e) { toast.error(errorText(e, fail)); return null; }
    finally { setBusy(false); }
  }
  async function add(name: string, cost: number, viaChip = false) {
    name = name.trim(); if (!name) return;
    const next = await call(`/api/fundraisers/${fund.id}/supplies`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name, cost }) }, SAY.addFailed);
    if (!next) return;
    const made = next.supplies[next.supplies.length - 1];
    if (made) setFresh(made.id);
    if (viaChip) toast.success(SAY.added(name));
    else { if (addName.current) addName.current.value = ""; if (addCost.current) addCost.current.value = ""; addName.current?.focus({ preventScroll: true }); }
  }
  async function saveRow(r: Row) {
    const was = fund.supplies.find(s => s.id === r.id); if (!was) return;
    const name = r.name.trim(), cost = num(r.cost);
    if (!name) { setRows(rs => rs.map(x => x.id === r.id ? { ...x, name: was.name } : x)); return; }
    if (name === was.name && cost === was.cost) return;
    await call(`/api/fundraisers/${fund.id}/supplies/${r.id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ name, cost }) }, SAY.lineFailed);
  }
  async function remove(r: Row) {
    const next = await call(`/api/fundraisers/${fund.id}/supplies/${r.id}`, { method: "DELETE" }, SAY.removeFailed);
    if (next) toast.success(SAY.removed(r.name));
  }
  async function wrapUp() {
    const cameIn = num(total); if (!cameIn || busy) return;
    const next = await call(`/api/fundraisers/${fund.id}/wrap`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ cameIn }) }, SAY.wrapFailed);
    if (!next) return;
    setSlam(true);
    const m = next.made ?? 0;
    toast.success(SAY.wrapped(m));
    setTimeout(() => burst(bigRef.current), 350);
  }
  async function reopen() {
    const keep = fund.cameIn;
    const next = await call(`/api/fundraisers/${fund.id}/wrap`, { method: "DELETE" }, SAY.reopenFailed);
    if (!next) return;
    setSlam(false); setTotal(inV(keep ?? 0));
    setTimeout(() => totalRef.current?.focus({ preventScroll: true }), 50);
  }
  async function del() {
    setBusy(true);
    try {
      await requestJson(`/api/fundraisers/${fund.id}`, { method: "DELETE" });
      toast.success(SAY.deleted(fund.name));
      router.push(orgPath("/fundraisers"));
    } catch (e) { toast.error(errorText(e, SAY.deleteFailed)); setBusy(false); }
  }
  function copy() {
    navigator.clipboard?.writeText(copyText(fund)).then(() => toast.success(SAY.copied), () => toast.error(SAY.copyFailed));
  }

  const inn = num(total), m = Math.round((inn - spent) * 100) / 100;

  return <FundraiserShell>
    <Link className="fz-back" href={orgPath("/fundraisers")}><PaperIcon name="arrow-r" />{DETAIL.back}</Link>
    <header className="fz-dhead">
      <Cal date={fund.date} />
      <div><h1>{fund.name}</h1><div className="meta"><KindChip kind={fund.kind} />
        <span className="fz-chip"><PaperIcon name="cal" />{fmtD(fund.date)}{dateRel(fund.date, wrapped, today)}</span>
        {fund.startTime && <span className="fz-chip"><PaperIcon name="clock" />{hours(fund)}</span>}
        {fund.place && <span className="fz-chip"><PaperIcon name="pin" />{fund.place}</span>}
        {fund.goal != null && <span className="fz-chip fz-t-lilac"><PaperIcon name="flag" />{DETAIL.goalK}{$m(fund.goal)}</span>}
      </div></div>
      {canManage && <div className="acts">
        <button className="fz-btn ghost sm" disabled={busy} onClick={() => setEditing(true)}><PaperIcon name="pencil" />{DETAIL.edit}</button>
        <button className={`fz-link danger`} disabled={busy} onClick={() => confirmDelete ? void del() : setConfirmDelete(true)}>{DETAIL.del(confirmDelete)}</button>
      </div>}
    </header>

    <Steps f={fund} spent={spent} count={rows.length} today={today} />

    <div className="fz-dgrid">
      <section className={`fz-pad${locked ? " locked" : ""}`}>
        <div className="fz-pad-h"><span className="fz-tile fz-t-butter"><PaperIcon name="bag" /></span><div><h2>{DETAIL.padTitle}</h2>
          <p>{DETAIL.padSub(wrapped, canManage)}</p></div></div>
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
            <input ref={addName} className="nm" placeholder={DETAIL.addPh} aria-label="New supply" maxLength={120} />
            <span className="cost"><input ref={addCost} inputMode="decimal" placeholder="0" aria-label="Cost" /></span>
            <button className="x" aria-label="Add supply" disabled={busy}><PaperIcon name="plus" /></button>
          </form>}
        </div>
        {!rows.length && !locked && <p className="fz-pad-empty">{DETAIL.empty[0]}{sugg.length ? DETAIL.empty[1] : ""}{DETAIL.empty[2]}</p>}
        {!rows.length && locked && <p className="fz-pad-empty">{DETAIL.emptyLocked}</p>}
        {sugg.length > 0 && !locked && <div className="fz-sugg"><span>Usually on a {K.label.toLowerCase()} list:</span>
          {sugg.map(([n, c]) => <button type="button" key={n} disabled={busy} onClick={() => void add(n, c, true)}><PaperIcon name="plus" />{n} <i>~${c}</i></button>)}</div>}
        <div className="fz-pad-total"><b>{DETAIL.supplies}</b><small>{rows.length} item{rows.length === 1 ? "" : "s"}</small><span className="fz-mono">{$m(spent)}</span></div>
      </section>

      {!wrapped ? <section className="fz-jarcard">
        <h2>{DETAIL.jarTitle(st === "ready")}</h2>
        <p className="lede">{DETAIL.lede(canManage, st === "ready", fund.date)}</p>
        <div className="fz-jar-row"><div><MoneyJar sup={spent} goal={fund.goal} inn={inn || null} /></div>
          <ul className="fz-legend">
            <li><i style={{ background: "var(--butter)" }} />{DETAIL.legend[0]}<span className="fz-mono">{$m(Math.min(inn, spent))}</span></li>
            <li><i style={{ background: "var(--mint)" }} />{DETAIL.legend[1]}<span className="fz-mono">{$m(Math.max(m, 0))}</span></li>
            {fund.goal != null && <li><i style={{ background: "none", borderStyle: "dashed", borderColor: "var(--lilac-ink)" }} />{DETAIL.legend[2]}<span className="fz-mono">{$m(fund.goal)}</span></li>}
          </ul></div>
        {canManage && <>
          <label className="fz-fld"><span><PaperIcon name="cash" />{DETAIL.total}</span>
            <span className="fz-amt"><input ref={totalRef} className="fz-inp" inputMode="decimal" placeholder="0" value={total}
              onChange={e => setTotal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void wrapUp(); }} /></span></label>
          <p className="fz-math" aria-live="polite">{!inn
            ? <>Type what came in and we’ll subtract the <span className="fz-mono">{$m(spent)}</span> of supplies. <span className="res none">= ?</span></>
            : <><span className="fz-mono">{$m(inn)}</span> came in <span className="eq">−</span> <span className="fz-mono">{$m(spent)}</span> on supplies <span className="eq">=</span> <span className={`res${m < 0 ? " loss" : ""}`}><span className="fz-mono">{$m(Math.abs(m))}</span> {m < 0 ? "short" : "made"}</span></>}</p>
          <div className="fz-wrap-f"><button className="fz-btn" disabled={!inn || busy} onClick={() => void wrapUp()}><PaperIcon name="check" />{DETAIL.wrap}</button>
            <span className="note">{DETAIL.wrapNote}</span></div>
        </>}
      </section> : (() => {
        const made = fund.made ?? 0, loss = made < 0, g = fund.goal;
        return <section className={`fz-jarcard ${loss ? "lost" : "won"}`}>
          <span className={`fz-kick ${loss ? "lost" : "won"}`}>{DETAIL.kick(loss)}</span>
          <div className="fz-res-big" ref={bigRef}><span className="fz-hi"><CountUp to={Math.abs(made)} /></span></div>
          <div className="fz-jar-row"><div><MoneyJar sup={fund.spent} goal={g} inn={fund.cameIn} stamp={loss ? "SHORT" : "WRAPPED"} slam={slam} /></div>
            <ul className="fz-rcpt">
              <li><span>{DETAIL.rcpt(loss)[0]}</span><span>{$m(fund.cameIn ?? 0)}</span></li>
              <li><span>{DETAIL.rcpt(loss)[1]}</span><span>−{$m(fund.spent)}</span></li>
              <li className="tot"><span>{DETAIL.rcpt(loss)[2]}</span><span>{$m(made)}</span></li>
            </ul></div>
          {g != null && <p className="fz-goalbar"><PaperIcon name="flag" /><span>{made >= g
            ? <>Goal was <b>{$m(g)}</b>. You beat it by <b>{$m(made - g)}</b>.</>
            : made > 0 ? <>Goal was <b>{$m(g)}</b>. <b>{$m(g - made)}</b> short of it.</>
            : <>Goal was <b>{$m(g)}</b>. Not this time.</>}</span></p>}
          {loss && <p className="fz-goalbar"><PaperIcon name="receipt" /><span>{DETAIL.lossLine}</span></p>}
          <div className="fz-after">
            <button className="fz-btn ghost sm" onClick={copy}><PaperIcon name="copy" />{DETAIL.copy}</button>
            {canManage && <button className="fz-link" disabled={busy} onClick={() => void reopen()}>{DETAIL.reopen}</button>}
          </div>
        </section>;
      })()}
    </div>
    {editing && <NewFundraiserDialog defaultDate={fund.date} editing={fund} onClose={() => setEditing(false)}
      onSaved={next => { setEditing(false); adopt(next); toast.success(SAY.saved); }} />}
  </FundraiserShell>;
}
