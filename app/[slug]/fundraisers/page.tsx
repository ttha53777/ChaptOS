"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingSpinner } from "../../components/dashboard/primitives";
import { PaperIcon } from "../../components/paper/PaperIcon";
import { useChapter } from "../../context/ChapterContext";
import { useOrgPath } from "../../hooks/useOrgPath";
import { useActiveSemester } from "../../hooks/useActiveSemester";
import { requestJson } from "../../lib/api";
import { localToday, stageOf } from "@/lib/fundraisers";
import type { Fundraiser } from "@/lib/api-types/fundraisers";
import { FundraiserShell } from "./FundraiserShell";
import { NewFundraiserDialog } from "./NewFundraiserDialog";
import { $m, Cal, CountUp, Dots, KindChip, MoneyJar, PriceTag, cap1, clock, rel } from "./parts";

const TILT = [6, -5, 4, -7, 5];

function Card({ f, i, today, href }: { f: Fundraiser; i: number; today: string; href: string }) {
  const st = stageOf({ date: f.date, wrapped: !!f.wrappedAt }, today);
  let foot: React.ReactNode;
  if (st === "wrapped") {
    const m = f.made ?? 0;
    foot = <>{<Dots f={f} />}<span>{m < 0 ? "Short " : "Made "}<b className="fz-mono">{$m(Math.abs(m))}</b> on {$m(f.spent)} of supplies</span></>;
  } else if (st === "ready") {
    foot = <><Dots f={f} /><span>Sale’s over · <b>count the money</b></span><span className="go">Wrap up<PaperIcon name="arrow-r" /></span></>;
  } else {
    foot = <><Dots f={f} /><span>{f.supplies.length ? <>{f.supplies.length} supplies · <b className="fz-mono">{$m(f.spent)}</b></> : "No shopping list yet"}</span><span className="go">Open<PaperIcon name="arrow-r" /></span></>;
  }
  return <Link className={`fz-card ${st}`} href={href}>
    <PriceTag made={f.made} rt={TILT[i % TILT.length]} />
    <div className="fz-card-top"><Cal date={f.date} /><div><h3>{f.name}</h3><div className="meta"><KindChip kind={f.kind} />
      {st !== "wrapped" && <span className="fz-chip"><PaperIcon name="cal" />{cap1(rel(f.date, today))}{f.startTime ? ` · ${clock(f.startTime)}` : ""}</span>}</div></div></div>
    <div className="fz-card-foot">{foot}</div>
  </Link>;
}

function DayOne({ canManage, onNew }: { canManage: boolean; onNew: () => void }) {
  return <>
    <section className="fz-d1">
      <figure><div><div className="fz-minipad"><div><span>Flour &amp; sugar</span><span>$18</span></div><div><span>Butter</span><span>$14</span></div><div><span>Boxes</span><span>$11</span></div><div><span>Supplies</span><span>$43</span></div></div></div>
        <figcaption><b>1 · List your supplies</b><span>What you’re buying, and what it cost.</span></figcaption></figure>
      <figure><div><MoneyJar sup={43} goal={null} inn={180} /></div><figcaption><b>2 · Count what came in</b><span>One total, once the sale’s over.</span></figcaption></figure>
      <figure><div><PriceTag made={137} rt={-4} /></div><figcaption><b>3 · See what you made</b><span>Came in, minus supplies. That’s it.</span></figcaption></figure>
    </section>
    {canManage
      ? <div className="fz-d1-cta"><button className="fz-btn" onClick={onNew}><PaperIcon name="plus" />Plan your first fundraiser</button></div>
      : <p className="fz-d1-note">Nothing planned yet. An officer can start the first one.</p>}
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
    <div className="fz-loading">{failed ? <><p role="alert">Couldn’t load fundraisers.</p><button className="fz-btn soft" onClick={() => setReload(n => n + 1)}>Try again</button></> : <LoadingSpinner label="Loading fundraisers" tone="dusk" />}</div>
  </FundraiserShell>;

  const inThisTerm = (f: Fundraiser) => !term || (f.date >= term.startDate && f.date <= term.endDate);
  const stage = (f: Fundraiser) => stageOf({ date: f.date, wrapped: !!f.wrappedAt }, today);
  const byDate = (a: Fundraiser, b: Fundraiser) => a.date.localeCompare(b.date);
  const ready = list.filter(f => stage(f) === "ready").sort(byDate);
  const upcoming = list.filter(f => stage(f) === "planning").sort(byDate);
  const wrappedAll = list.filter(f => stage(f) === "wrapped").sort((a, b) => b.date.localeCompare(a.date));
  const wrapped = wrappedAll.filter(inThisTerm), earlier = wrappedAll.filter(f => !inThisTerm(f));
  const termMade = wrapped.reduce((a, f) => a + (f.made ?? 0), 0);
  const bits: React.ReactNode[] = [];
  if (wrapped.length) bits.push(<span key="w"><b>{wrapped.length}</b> wrapped up</span>);
  if (ready.length) bits.push(<span key="r"><b>{ready.length}</b> waiting to be counted</span>);
  if (upcoming.length) bits.push(<span key="u"><b>{upcoming.length}</b> coming up</span>);
  const termChip = term && <span className="fz-k-chip">{term.label}</span>;

  return <FundraiserShell>
    <header className="fz-brief">
      <div>
        <span className="fz-kick">Fundraising {termChip}</span>
        {!list.length
          ? <h1 className="fz-greet">Fundraising, <span className="fz-hi">the easy way</span></h1>
          : <h1 className="fz-greet">{wrapped.length
            ? <>{termMade < 0 ? "Down " : "You’ve made "}<span className="fz-hi" style={{ ["--mark" as string]: termMade < 0 ? "var(--rose)" : "var(--mint)" }}><span className="amt"><CountUp to={Math.abs(termMade)} /></span></span> this term</>
            : "Nothing counted yet"}</h1>}
        <p className="fz-sub">{!list.length
          ? "Write down what you buy. After the sale, type in what came in. We do the subtraction and keep the score for the term."
          : <>{bits.map((b, i) => <span key={i}>{i > 0 && " · "}{b}</span>)}{bits.length ? ". " : ""}Every fundraiser is the same two steps: list what you bought, then count what came in.</>}</p>
      </div>
      {canManage && <div><button className="fz-btn" onClick={newOne}><PaperIcon name="plus" />New fundraiser</button></div>}
    </header>

    {!list.length ? <DayOne canManage={canManage} onNew={newOne} /> : <>
      {ready.map(f => <section key={f.id} className="fz-hero">
        <div><MoneyJar sup={f.spent} goal={f.goal} inn={null} /></div>
        <div><span className="tag">Ready to wrap up</span>
          <h2>{f.name} was {rel(f.date, today)}. How much came in?</h2>
          <p>You spent <b>{$m(f.spent)}</b> on supplies. {canManage ? "Type in the total that came in and we’ll tell you what you made." : "An officer types in what came in, and you’ll see what it made."}</p></div>
        <div className="acts"><Link className="fz-btn" href={`${open(f)}?wrap=1`}><PaperIcon name="jar" />{canManage ? "Wrap it up" : "Open"}</Link></div>
      </section>)}
      {upcoming.length > 0 && <><div className="fz-sec"><h2>Coming up</h2><span className="rule" /><span className="cnt">{upcoming.length}</span></div>
        <div className="fz-grid">{upcoming.map((f, i) => <Card key={f.id} f={f} i={i} today={today} href={open(f)} />)}</div></>}
      {wrapped.length > 0 && <><div className="fz-sec"><h2>Wrapped up</h2><span className="rule" /><span className="cnt">{wrapped.length} · {$m(termMade)} {termMade < 0 ? "short" : "made"}</span></div>
        <div className="fz-grid">{wrapped.map((f, i) => <Card key={f.id} f={f} i={i} today={today} href={open(f)} />)}</div></>}
      {earlier.length > 0 && <><div className="fz-sec"><h2>Earlier terms</h2><span className="rule" /><span className="cnt">{earlier.length}</span></div>
        <div className="fz-grid">{earlier.map((f, i) => <Card key={f.id} f={f} i={i} today={today} href={open(f)} />)}</div></>}
    </>}
    {composer}
  </FundraiserShell>;
}
