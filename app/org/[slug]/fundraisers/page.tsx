"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingSpinner } from "../../../components/dashboard/primitives";
import { PaperIcon } from "../../../components/paper/PaperIcon";
import { useChapter } from "../../../context/ChapterContext";
import { useOrgPath } from "../../../hooks/useOrgPath";
import { useActiveSemester } from "../../../hooks/useActiveSemester";
import { requestJson } from "../../../lib/api";
import { localToday, stageOf } from "@/lib/fundraisers";
import { LIST, DAY_ONE, lists, briefBits, tiltAt } from "@/lib/fundraising/ledger";
import type { Fundraiser } from "@/lib/api-types/fundraisers";
import { FundraiserShell } from "./FundraiserShell";
import { NewFundraiserDialog } from "./NewFundraiserDialog";
import { $m, Cal, CountUp, Dots, KindChip, MoneyJar, PriceTag, cap1, clock, rel } from "./parts";

function Card({ f, i, today, href }: { f: Fundraiser; i: number; today: string; href: string }) {
  const st = stageOf({ date: f.date, wrapped: !!f.wrappedAt }, today);
  let foot: React.ReactNode;
  if (st === "wrapped") {
    const m = f.made ?? 0;
    foot = <>{<Dots f={f} />}<span>{LIST.cardMade(m)}<b className="fz-mono">{$m(Math.abs(m))}</b>{LIST.cardOn[0]}{$m(f.spent)}{LIST.cardOn[1]}</span></>;
  } else if (st === "ready") {
    foot = <><Dots f={f} /><span>{LIST.cardReady[0]}<b>{LIST.cardReady[1]}</b></span><span className="go">{LIST.cardWrap}<PaperIcon name="arrow-r" /></span></>;
  } else {
    foot = <><Dots f={f} /><span>{f.supplies.length ? <>{f.supplies.length}{LIST.cardSupplies}<b className="fz-mono">{$m(f.spent)}</b></> : LIST.cardNoList}</span><span className="go">{LIST.cardOpen}<PaperIcon name="arrow-r" /></span></>;
  }
  return <Link className={`fz-card ${st}`} href={href}>
    <PriceTag made={f.made} rt={tiltAt(i)} />
    <div className="fz-card-top"><Cal date={f.date} /><div><h3>{f.name}</h3><div className="meta"><KindChip kind={f.kind} />
      {st !== "wrapped" && <span className="fz-chip"><PaperIcon name="cal" />{cap1(rel(f.date, today))}{f.startTime ? ` · ${clock(f.startTime)}` : ""}</span>}</div></div></div>
    <div className="fz-card-foot">{foot}</div>
  </Link>;
}

function DayOne({ canManage, onNew }: { canManage: boolean; onNew: () => void }) {
  return <>
    <section className="fz-d1">
      <figure><div><div className="fz-minipad">{DAY_ONE.pad.map(([k, v]) => <div key={k}><span>{k}</span><span>{v}</span></div>)}</div></div>
        <figcaption><b>{DAY_ONE.steps[0][0]}</b><span>{DAY_ONE.steps[0][1]}</span></figcaption></figure>
      <figure><div><MoneyJar sup={DAY_ONE.jar.sup} goal={null} inn={DAY_ONE.jar.inn} /></div><figcaption><b>{DAY_ONE.steps[1][0]}</b><span>{DAY_ONE.steps[1][1]}</span></figcaption></figure>
      <figure><div><PriceTag made={DAY_ONE.tag} rt={-4} /></div><figcaption><b>{DAY_ONE.steps[2][0]}</b><span>{DAY_ONE.steps[2][1]}</span></figcaption></figure>
    </section>
    {canManage
      ? <div className="fz-d1-cta"><button className="fz-btn" onClick={onNew}><PaperIcon name="plus" />{DAY_ONE.cta}</button></div>
      : <p className="fz-d1-note">{DAY_ONE.member}</p>}
  </>;
}

export default function FundraisersPage() {
  const { can, currentUser } = useChapter();
  const canManage = can("MANAGE_FUNDRAISING");
  const orgPath = useOrgPath(), router = useRouter(), params = useSearchParams();
  const term = useActiveSemester();
  const [list, setList] = useState<Fundraiser[] | null>(null);
  const [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const [composing, setComposing] = useState(false);
  const [today] = useState(localToday);

  useEffect(() => {
    const ac = new AbortController(); setFailed(false);
    requestJson<Fundraiser[]>("/api/fundraisers", { signal: ac.signal }).then(setList).catch(() => { if (!ac.signal.aborted) setFailed(true); });
    return () => ac.abort();
  }, [currentUser?.orgId, reload]);

  // The Timeline's "Open in Fundraisers" names the calendar event; land on its fundraiser.
  const fromEvent = Number(params.get("event"));
  useEffect(() => {
    if (!fromEvent || !list) return;
    const hit = list.find(f => f.calendarEventId === fromEvent);
    if (hit) router.replace(orgPath(`/fundraisers/${hit.id}`));
  }, [fromEvent, list, orgPath, router]);

  const open = (f: Fundraiser) => orgPath(`/fundraisers/${f.id}`);
  const newOne = () => setComposing(true);
  const composer = composing && <NewFundraiserDialog defaultDate={today} onClose={() => setComposing(false)}
    onSaved={f => { setComposing(false); router.push(`${open(f)}?created=1`); }} />;

  if (!list) return <FundraiserShell>
    <div className="fz-loading">{failed ? <><p role="alert">{LIST.loadFailed}</p><button className="fz-btn soft" onClick={() => setReload(n => n + 1)}>{LIST.retry}</button></> : <LoadingSpinner label="Loading fundraisers" tone="dusk" />}</div>
  </FundraiserShell>;

  const { ready, upcoming, wrapped, earlier, termMade } = lists(list, today, term);
  const bits: React.ReactNode[] = briefBits({ ready, upcoming, wrapped, earlier, termMade }).map(([n, w], i) => <span key={"wru"[i]}><b>{n}</b>{w}</span>);
  const termChip = term && <span className="fz-k-chip">{term.label}</span>;

  return <FundraiserShell>
    <header className="fz-brief">
      <div>
        <span className="fz-kick">{LIST.kick} {termChip}</span>
        {!list.length
          ? <h1 className="fz-greet">{LIST.greetEmpty[0]}<span className="fz-hi">{LIST.greetEmpty[1]}</span></h1>
          : <h1 className="fz-greet">{wrapped.length
            ? <>{LIST.made(termMade)}<span className="fz-hi" style={{ ["--mark" as string]: termMade < 0 ? "var(--rose)" : "var(--mint)" }}><span className="amt"><CountUp to={Math.abs(termMade)} /></span></span>{LIST.thisTerm}</>
            : LIST.nothing}</h1>}
        <p className="fz-sub">{!list.length
          ? LIST.subEmpty
          : <>{bits.map((b, i) => <span key={i}>{i > 0 && " · "}{b}</span>)}{bits.length ? ". " : ""}{LIST.subTail}</>}</p>
      </div>
      {canManage && <div><button className="fz-btn" onClick={newOne}><PaperIcon name="plus" />{LIST.newOne}</button></div>}
    </header>

    {!list.length ? <DayOne canManage={canManage} onNew={newOne} /> : <>
      {ready.map(f => <section key={f.id} className="fz-hero">
        <div><MoneyJar sup={f.spent} goal={f.goal} inn={null} /></div>
        <div><span className="tag">{LIST.heroTag}</span>
          <h2>{f.name} was {rel(f.date, today)}. How much came in?</h2>
          <p>{LIST.heroSpent[0]}<b>{$m(f.spent)}</b>{LIST.heroSpent[1]}{canManage ? LIST.heroOfficer : LIST.heroMember}</p></div>
        <div className="acts"><Link className="fz-btn" href={`${open(f)}?wrap=1`}><PaperIcon name="jar" />{LIST.heroAct(canManage)}</Link></div>
      </section>)}
      {upcoming.length > 0 && <><div className="fz-sec"><h2>{LIST.upcoming}</h2><span className="rule" /><span className="cnt">{upcoming.length}</span></div>
        <div className="fz-grid">{upcoming.map((f, i) => <Card key={f.id} f={f} i={i} today={today} href={open(f)} />)}</div></>}
      {wrapped.length > 0 && <><div className="fz-sec"><h2>{LIST.wrapped}</h2><span className="rule" /><span className="cnt">{wrapped.length} · {$m(termMade)} {termMade < 0 ? "short" : "made"}</span></div>
        <div className="fz-grid">{wrapped.map((f, i) => <Card key={f.id} f={f} i={i} today={today} href={open(f)} />)}</div></>}
      {earlier.length > 0 && <><div className="fz-sec"><h2>{LIST.earlier}</h2><span className="rule" /><span className="cnt">{earlier.length}</span></div>
        <div className="fz-grid">{earlier.map((f, i) => <Card key={f.id} f={f} i={i} today={today} href={open(f)} />)}</div></>}
    </>}
    {composer}
  </FundraiserShell>;
}
