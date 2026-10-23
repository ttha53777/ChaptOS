"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { Brother, InstagramTask, Transaction } from "../../../data";
import { requestJson } from "../../../lib/api";
import { fmt$ } from "../../../data";
import type { MemberDuesStanding } from "@/lib/api-types/dues";
import type { MetricSnapshot } from "@/lib/metrics";
import { BrotherAvatar } from "../../BrotherAvatar";
import { SectionError } from "./SectionError";
import { PaperIcon, PaperTile, type PaperIconName, type PaperTone } from "../../paper/PaperIcon";
import "../track-cards.css";

/*
 * The opt-in cards: what an org tracks beyond the basics. Each one draws only
 * what the app stores. No balance history, no follower counts, no group goals,
 * no "best week": there is no record behind any of those.
 */

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const stamp = (iso: string) => { const d = utc(iso); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const short = (iso: string) => { const d = utc(iso); return `${MON[d.getUTCMonth()][0]}${MON[d.getUTCMonth()].slice(1).toLowerCase()} ${d.getUTCDate()}`; };
const n1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function Shell({
  label, icon, tone, sub, onOpen, error, onRetry, what, children,
}: {
  label: string; icon: PaperIconName; tone: PaperTone; sub?: string;
  onOpen?: () => void; error?: boolean; onRetry?: () => void; what: string; children: React.ReactNode;
}) {
  return (
    <section className="card tk" aria-label={label}>
      <div className="card-h">
        <PaperTile icon={icon} tone={tone} />
        <h2>{label}</h2>
        <div className="right">
          {sub && <span className="sub">{sub}</span>}
          {onOpen && !error && <button type="button" className="rd-all" onClick={onOpen}>Open <PaperIcon name="arrow-r" /></button>}
        </div>
      </div>
      {error ? <SectionError what={what} onRetry={onRetry} /> : <div className="cc-b">{children}</div>}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="un-empty"><p>{children}</p></div>;
}

function Skel() {
  return <div className="tk-skel" aria-hidden="true"><i /><i /><i /></div>;
}

// ── Money ──────────────────────────────────────────────────────────────────

/**
 * The balance, this month's money in against money out, and the last three
 * entries. Fetches the ledger itself: the dashboard doesn't otherwise load it,
 * and this card only mounts while an org has it on the page.
 */
export function MoneyCard({ balance, today, loading: balanceLoading, error: balanceError, onRetry, onOpen }: {
  balance: number | null; today: string;
  loading: boolean; error: boolean; onRetry?: () => void; onOpen?: () => void;
}) {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    requestJson<Transaction[]>("/api/transactions").then(setTransactions).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);
  const loading = balanceLoading || (!transactions && !failed);
  const error = balanceError || failed;
  const retry = () => { onRetry?.(); load(); };
  const month = today.slice(0, 7);
  const live = (transactions ?? []).filter(t => !t.deletedAt);
  const inM = live.filter(t => t.type === "income" && t.date.startsWith(month)).reduce((a, t) => a + t.amount, 0);
  const outM = live.filter(t => t.type === "expense" && t.date.startsWith(month)).reduce((a, t) => a + t.amount, 0);
  const top = Math.max(inM, outM, 1);
  const latest = [...live].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 3);
  const mon = MON[utc(today).getUTCMonth()];
  return (
    <Shell label="Money" icon="wallet" tone="mint" sub={`${mon[0]}${mon.slice(1).toLowerCase()}`} onOpen={onOpen} error={error} onRetry={retry} what="the books">
      {loading ? <Skel /> : (
        <>
          <div className="tk-big">{balance != null ? fmt$(balance) : "—"}</div>
          <p className="tk-subl">{balance != null ? "In the account" : "No opening balance yet"}</p>
          <div className="tk-io">
            <small className="tk-cap">This month</small>
            {([["in", "Money in", inM], ["out", "Money out", outM]] as const).map(([c, l, v]) => (
              <div key={c}>
                <span>{l}</span>
                <i className={c} style={{ "--w": `${(v / top) * 100}%` } as React.CSSProperties} />
                <b>{v > 0 ? (c === "in" ? "+" : "−") : ""}{fmt$(v)}</b>
              </div>
            ))}
          </div>
          {latest.length ? (
            <div className="tk-ledger">
              {latest.map(t => (
                <div key={t.id}>
                  <span className="d">{stamp(t.date)}</span>
                  <span className="m">{t.description || t.category}</span>
                  <span className={`a${t.type === "income" ? " pos" : ""}`}>{t.type === "income" ? "+" : "−"}{fmt$(t.amount)}</span>
                </div>
              ))}
            </div>
          ) : <p className="tk-subl tk-gap">Nothing logged yet.</p>}
        </>
      )}
    </Shell>
  );
}

// ── Dues ───────────────────────────────────────────────────────────────────

const COIN_CAP = 60;

/** One coin per member who was charged: filled once they've paid. Who still owes, and by when. */
export function DuesCard({ label, brothers, standings, selfId, selfAvatarUrl, avatarRevision, onOpen }: {
  label: string; brothers: Brother[]; standings: ReadonlyMap<number, MemberDuesStanding> | null;
  selfId: number | null; selfAvatarUrl?: string | null; avatarRevision?: number; onOpen?: () => void;
}) {
  const billed = standings ? brothers.filter(b => (standings.get(b.id)?.billed ?? 0) > 0) : [];
  const owers = billed.filter(b => (standings!.get(b.id)!.owes) > 0).sort((a, b) => standings!.get(b.id)!.owes - standings!.get(a.id)!.owes);
  const paid = billed.length - owers.length;
  const out = owers.reduce((a, b) => a + standings!.get(b.id)!.owes, 0);
  const due = owers.map(b => standings!.get(b.id)!.nextDueDate).filter((d): d is string => !!d).sort()[0];
  const coins = billed.slice(0, COIN_CAP);
  return (
    <Shell label={label} icon="jar" tone="butter" onOpen={onOpen} what={label.toLowerCase()}>
      {!standings ? <Skel /> : billed.length === 0 ? <Empty>No {label.toLowerCase()} charged yet.</Empty> : (
        <>
          <div className="tk-top">
            <div className="tk-big">{paid}<small>of {billed.length} paid</small></div>
            {out > 0 && <span className="tk-chip">{fmt$(out)} still out</span>}
          </div>
          <div className="tk-coins" role="img" aria-label={`${paid} of ${billed.length} paid`}>
            {[...coins].sort((a, b) => Number(standings.get(a.id)!.owes > 0) - Number(standings.get(b.id)!.owes > 0)).map((b, i) => (
              <i key={b.id} className={standings.get(b.id)!.owes > 0 ? "" : "p"} style={{ "--d": `${i * 14}ms` } as React.CSSProperties} title={b.name} />
            ))}
            {billed.length > COIN_CAP && <em>+{billed.length - COIN_CAP}</em>}
          </div>
          <div className="tk-foot">
            {owers.length > 0 && (
              <span className="tk-faces">
                {owers.slice(0, 4).map(b => (
                  <BrotherAvatar key={b.id} brother={b} selfId={selfId} selfAvatarUrl={selfAvatarUrl} avatarRevision={avatarRevision} size="sm" className="tk-face" />
                ))}
                {owers.length > 4 && <span className="tk-face more">+{owers.length - 4}</span>}
              </span>
            )}
            <span className="tk-note">{owers.length ? `${owers.length} still owe${due ? ` · due ${short(due)}` : ""}` : "Everyone's paid up."}</span>
          </div>
        </>
      )}
    </Shell>
  );
}

// ── Service ────────────────────────────────────────────────────────────────

/** One bar per member, tallest first, against the per-member goal. */
export function ServiceCard({ label, brothers, goal, loading, error, onRetry, onOpen }: {
  label: string; brothers: Brother[]; goal: number; loading: boolean; error: boolean; onRetry?: () => void; onOpen?: () => void;
}) {
  const ranked = [...brothers].sort((a, b) => b.serviceHours - a.serviceHours);
  const total = ranked.reduce((a, b) => a + b.serviceHours, 0);
  const met = ranked.filter(b => b.serviceHours >= goal).length;
  const max = Math.max(ranked[0]?.serviceHours ?? 0, goal, 1);
  const best = ranked.filter(b => b.serviceHours > 0).slice(0, 3);
  return (
    <Shell label={`${label} hours`} icon="heart" tone="rose" onOpen={onOpen} error={error} onRetry={onRetry} what={`${label.toLowerCase()} hours`}>
      {loading ? <Skel /> : total === 0 ? <Empty>No {label.toLowerCase()} hours logged yet.</Empty> : (
        <>
          <div className="tk-top">
            <div className="tk-big">{met}<small>of {ranked.length} hit {n1(goal)} hrs</small></div>
            <span className="tk-tot">{n1(total)} hrs logged</span>
          </div>
          <div className="tk-sky" role="img" aria-label={`${met} of ${ranked.length} members at or above ${goal} hours`}>
            {ranked.map(b => (
              <i
                key={b.id}
                className={`${b.serviceHours >= goal ? "met" : ""}${b.serviceHours === 0 ? " zero" : ""}`}
                style={{ height: `${Math.max((b.serviceHours / max) * 100, 2)}%` }}
                title={`${b.name}: ${n1(b.serviceHours)} hrs`}
              />
            ))}
            <span className="tk-goal" style={{ bottom: `${(goal / max) * 100}%` }}><em>{n1(goal)} hr goal</em></span>
          </div>
          {best.length > 0 && (
            <div className="tk-top3">
              <small className="tk-cap">Most hours</small>
              {best.map(b => (
                <div key={b.id}>
                  <span>{b.name}</span>
                  <i style={{ "--w": `${(b.serviceHours / best[0].serviceHours) * 100}%` } as React.CSSProperties} />
                  <b>{n1(b.serviceHours)}</b>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

// ── Grades ─────────────────────────────────────────────────────────────────

/** How the roster's GPAs spread, in quarter-point bands, against the at-risk line. */
export function GradesCard({ brothers, atRisk, loading, error, onRetry, onOpen }: {
  brothers: Brother[]; atRisk: number; loading: boolean; error: boolean; onRetry?: () => void; onOpen?: () => void;
}) {
  const gpas = brothers.map(b => b.gpa).filter(g => g > 0);
  const lo = Math.min(2, Math.floor(Math.min(...gpas, 4) * 4) / 4);
  const nBands = Math.round((4 - lo) * 4);
  const bands = Array.from({ length: nBands }, (_, i) => lo + i * 0.25);
  const counts = bands.map((b, i) => gpas.filter(g => (i === nBands - 1 ? g >= b : g >= b && g < b + 0.25)).length);
  const top = Math.max(...counts, 1);
  const avg = gpas.length ? gpas.reduce((a, b) => a + b, 0) / gpas.length : 0;
  const below = gpas.filter(g => g < atRisk).length;
  const pos = (g: number) => `${((Math.min(Math.max(g, lo), 4) - lo) / (4 - lo)) * 100}%`;
  return (
    <Shell label="Grades" icon="star" tone="lilac" onOpen={onOpen} error={error} onRetry={onRetry} what="grades">
      {loading ? <Skel /> : gpas.length === 0 ? <Empty>No grades on file yet.</Empty> : (
        <>
          <div className="tk-top">
            <div className="tk-big">{avg.toFixed(2)}<small>average</small></div>
            {below > 0 && <span className="tk-chip">{below} below {atRisk.toFixed(2)}</span>}
          </div>
          <div className="tk-hist" role="img" aria-label={`Average GPA ${avg.toFixed(2)}; ${below} below ${atRisk}`}>
            {bands.map((b, i) => (
              <div key={b} className={b + 0.25 <= atRisk ? "lo" : ""}>
                {counts[i] > 0 && <em>{counts[i]}</em>}
                <i style={{ height: `${(counts[i] / top) * 100}%` }} />
              </div>
            ))}
            <span className="tk-cut" style={{ left: pos(atRisk) }}><em>{atRisk.toFixed(2)} at risk</em></span>
            <span className="tk-avg" style={{ left: pos(avg) }} />
          </div>
          <div className="tk-hist-x">
            {bands.filter((_, i) => i % 2 === 0).map(b => <span key={b}>{b.toFixed(b * 4 % 2 ? 2 : 1)}</span>)}
            <span>4.0</span>
          </div>
          <div className="tk-key">
            <span><i className="dot" />average</span>
            <span><i className="ln" />at-risk line</span>
            <span><i className="sq" />members per band</span>
          </div>
        </>
      )}
    </Shell>
  );
}

// ── Instagram ──────────────────────────────────────────────────────────────

const POLA_TONES: PaperTone[] = ["peach", "sky", "mint"];
const TILT = [-2.5, 1.5, -1];

/** The org's planned posts: the last three that went up, and what's next. */
export function InstagramCard({ tasks, today, loading, error, onRetry, onOpen }: {
  tasks: InstagramTask[]; today: string; loading: boolean; error: boolean; onRetry?: () => void; onOpen?: () => void;
}) {
  const month = today.slice(0, 7);
  const posted = tasks.filter(t => t.status === "posted").map(t => ({ t, on: t.postedDate ?? t.dueDate })).sort((a, b) => b.on.localeCompare(a.on));
  const thisMonth = posted.filter(p => p.on.startsWith(month)).length;
  const planned = tasks.filter(t => t.status !== "posted" && t.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next = planned[0];
  const days = next ? Math.round((utc(next.dueDate).getTime() - utc(today).getTime()) / 86_400_000) : 0;
  const nextWhen = !next ? "" : days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 7 ? WD[utc(next.dueDate).getUTCDay()] : short(next.dueDate);
  return (
    <Shell label="Instagram" icon="camera" tone="peach" onOpen={onOpen} error={error} onRetry={onRetry} what="Instagram posts">
      {loading ? <Skel /> : tasks.length === 0 ? <Empty>No posts planned yet.</Empty> : (
        <>
          <p className="tk-ig-top"><b>{thisMonth}</b> posted this month · <b>{planned.length}</b> planned</p>
          {posted.length ? (
            <div className="tk-polas">
              {posted.slice(0, 3).map(({ t, on }, i) => (
                <figure key={t.id} className={`tk-pola pp-t-${POLA_TONES[i]}`} style={{ "--r": `${TILT[i]}deg` } as React.CSSProperties}>
                  <div className="ph"><PaperIcon name="camera" /></div>
                  <figcaption>{t.title}<span>Posted {stamp(on)}</span></figcaption>
                </figure>
              ))}
            </div>
          ) : <p className="tk-subl tk-gap">Nothing posted yet.</p>}
          {next && (
            <div className="tk-ig-next"><span className="tape" aria-hidden="true" />Next up <b>{nextWhen}</b> · {next.title}</div>
          )}
        </>
      )}
    </Shell>
  );
}

// ── A custom metric ────────────────────────────────────────────────────────

/** Every member as a dot, on the behind / close / on-track bands the org set for it. */
export function MetricCard({ snap, onOpen }: { snap: MetricSnapshot; onOpen?: () => void }) {
  const { goal, atRiskBelow: risk } = snap;
  const values = snap.values ?? [];
  const unit = snap.unit ? ` ${snap.unit}` : "";
  const max = Math.ceil(Math.max(values[0] ?? 0, goal * 1.25, 1));
  const on = values.filter(v => v >= goal).length;
  const close = values.filter(v => v >= risk && v < goal).length;
  const behind = values.length - on - close;
  const seen = new Map<number, number>();
  const pct = (v: number) => (Math.min(v, max) / max) * 100;
  return (
    <Shell label={snap.name} icon="bars" tone="sky" onOpen={onOpen} what={snap.name}>
      {values.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
        <>
          <div className="tk-top">
            <div className="tk-big">{on}<small>of {values.length} on track</small></div>
            <span className="tk-tot">goal {n1(goal)}{unit} each</span>
          </div>
          <div className="tk-strip" role="img" aria-label={`${on} on track, ${close} close, ${behind} behind`}>
            <span className="zone r" style={{ width: `${pct(risk)}%` }} />
            <span className="zone w" style={{ left: `${pct(risk)}%`, width: `${pct(goal) - pct(risk)}%` }} />
            <span className="zone on" style={{ left: `${pct(goal)}%`, right: 0 }} />
            {values.map((v, i) => {
              const key = Math.round(pct(v) / 2.5);
              const n = (seen.get(key) ?? 0) + 1;
              seen.set(key, n);
              return <i key={i} className={v >= goal ? "on" : v >= risk ? "w" : "r"} style={{ left: `${pct(v)}%`, bottom: `${Math.min(n - 1, 5) * 12 + 4}px` }} title={`${n1(v)}${unit}`} />;
            })}
          </div>
          <div className="tk-ticks">
            <span style={{ left: 0 }}>0</span>
            {risk > 0 && <span style={{ left: `${pct(risk)}%` }}>{n1(risk)}</span>}
            <span style={{ left: `${pct(goal)}%` }}>{n1(goal)}</span>
            <span style={{ left: "100%" }}>{max}</span>
          </div>
          <div className="tk-legend">
            <span style={{ "--c": "var(--pp-mint-ink)" } as React.CSSProperties}>{on} on track</span>
            <span style={{ "--c": "var(--pp-butter-ink)" } as React.CSSProperties}>{close} close</span>
            <span style={{ "--c": "var(--pp-peach-ink)" } as React.CSSProperties}>{behind} behind</span>
          </div>
        </>
      )}
    </Shell>
  );
}
