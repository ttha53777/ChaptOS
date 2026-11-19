/**
 * The opt-in cards (web ledger/TrackCards.tsx + track-cards.css): what an org tracks
 * beyond the basics, each on the dashboard only once an admin brings it in from the
 * Arrange tray. Same rule as the web: draw only what the app stores (no balance
 * history, no follower counts, no group goals).
 *
 *   Money     balance, this month in vs out, the last three entries
 *   Dues      one coin per member charged (filled once paid), who still owes, by when
 *   Service   one bar per member, tallest first, against the per-member goal
 *   Grades    the GPA spread in quarter-point bands against the at-risk line
 *   Media     posted this month · planned, the last three posts, next up
 *   Metric    every member as a dot on the behind / close / on-track bands
 *
 * Every header opens what the web's "Open →" opens.
 */
import type { Brother, DashboardMetric, MemberDuesStanding } from "@/lib/api-types";
import { fmtUsd } from "@/lib/money";
import { StyleSheet, View } from "react-native";
import { useTransactions } from "~/data/money";
import { Icon } from "~/icons/Icon";
import { Avatar } from "~/paper/bits";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { DashCard, HeadSub } from "./Card";

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const stamp = (iso: string) => { const d = utc(iso); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const short = (iso: string) => { const m = MON[utc(iso).getUTCMonth()]!; return `${m[0]}${m.slice(1).toLowerCase()} ${utc(iso).getUTCDate()}`; };
const n1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/* ── shared bits ──────────────────────────────────────────────────────────────── */

function Big({ value, small }: { value: string; small?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.bigRow}>
      <T v="measure" size={32} color={c.ink}>{value}</T>
      {small ? <T v="callout" size={14} color={c.ink3}>{small}</T> : null}
    </View>
  );
}

function Chip({ label }: { label: string }) {
  const { c } = useTheme();
  const p = c.pastel.peach;
  return (
    <View style={[styles.chip, { backgroundColor: p.soft, borderColor: p.border }]}>
      <T v="pill" color={p.ink}>{label}</T>
    </View>
  );
}

function Empty({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: c.line2 }]}>
      <T v="meta" color={c.ink3} align="center">{children}</T>
    </View>
  );
}

function Cap({ children }: { children: string }) {
  const { c } = useTheme();
  return <T v="kicker" size={9.9} color={c.ink3} style={{ marginBottom: 6 }}>{children}</T>;
}

function Skel() {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10 }} accessibilityLabel="Loading">
      <View style={[styles.sk, { width: "40%", height: 26, backgroundColor: c.paper3 }]} />
      <View style={[styles.sk, { backgroundColor: c.paper3 }]} />
      <View style={[styles.sk, { width: "70%", backgroundColor: c.paper3 }]} />
    </View>
  );
}

/* ── Money ────────────────────────────────────────────────────────────────────── */

export function MoneyCard({ balance, today, onOpen, i }: { balance: number | null; today: string; onOpen: () => void; i: number }) {
  const { c } = useTheme();
  const q = useTransactions(true);
  const month = today.slice(0, 7);
  const live = (q.data ?? []).filter(t => !t.deletedAt);
  const inM = live.filter(t => t.type === "income" && t.date.startsWith(month)).reduce((a, t) => a + t.amount, 0);
  const outM = live.filter(t => t.type === "expense" && t.date.startsWith(month)).reduce((a, t) => a + t.amount, 0);
  const top = Math.max(inM, outM, 1);
  const latest = [...live].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 3);
  const mon = MON[utc(today).getUTCMonth()]!;
  return (
    <DashCard icon="wallet" tone="mint" title="Money" right={<View style={{ flexDirection: "row", gap: 8 }}><HeadSub label={`${mon[0]}${mon.slice(1).toLowerCase()}`} /><HeadSub label="Open" arrow /></View>} onHead={onOpen} i={i}>
      {q.isPending ? <Skel /> : q.isError ? <Empty>Couldn't load the books.</Empty> : (
        <>
          <View>
            <Big value={balance != null ? fmtUsd(balance) : "—"} />
            <T v="meta" color={c.ink2} style={{ marginTop: 6 }}>{balance != null ? "In the account" : "No opening balance yet"}</T>
          </View>
          <View style={{ marginTop: 4 }}>
            <Cap>This month</Cap>
            {([["in", "Money in", inM], ["out", "Money out", outM]] as const).map(([k, l, v]) => (
              <View key={k} style={styles.io}>
                <T v="meta" color={c.ink2} style={{ width: 84 }}>{l}</T>
                <View style={{ flex: 1 }}>
                  <View style={[styles.ioBar, { width: `${(v / top) * 100}%`, backgroundColor: k === "in" ? c.pastel.mint.ink : c.line2 }]} />
                </View>
                <T v="mono" size={12.8} align="right" style={{ width: 76 }}>{`${v > 0 ? (k === "in" ? "+" : "−") : ""}${fmtUsd(v)}`}</T>
              </View>
            ))}
          </View>
          {latest.length ? (
            <View style={[styles.ledger, { borderTopColor: c.ink }]}>
              {latest.map(t => (
                <View key={t.id} style={[styles.ledRow, { borderBottomColor: c.lineSoft }]}>
                  <T v="mono" size={10.2} color={c.ink3} style={{ width: 52 }}>{stamp(t.date)}</T>
                  <T v="meta" color={c.ink2} numberOfLines={1} style={[styles.ledM, { borderLeftColor: c.pastel.rose.ink }]}>{t.description || t.category}</T>
                  <T v="mono" size={13.1} color={t.type === "income" ? c.pastel.mint.ink : c.ink2}>{`${t.type === "income" ? "+" : "−"}${fmtUsd(t.amount)}`}</T>
                </View>
              ))}
            </View>
          ) : <T v="meta" color={c.ink2} style={{ marginTop: 6 }}>Nothing logged yet.</T>}
        </>
      )}
    </DashCard>
  );
}

/* ── Dues ─────────────────────────────────────────────────────────────────────── */

const COIN_CAP = 60;

export function DuesCard({ label, brothers, standings, onOpen, i }: {
  label: string; brothers: Brother[]; standings: MemberDuesStanding[]; onOpen: () => void; i: number;
}) {
  const { c } = useTheme();
  const by = new Map(standings.map(s => [s.brotherId, s] as const));
  const billed = brothers.filter(b => (by.get(b.id)?.billed ?? 0) > 0);
  const owes = (b: Brother) => by.get(b.id)!.owes;
  const owers = billed.filter(b => owes(b) > 0).sort((a, b) => owes(b) - owes(a));
  const paid = billed.length - owers.length;
  const out = owers.reduce((a, b) => a + owes(b), 0);
  const due = owers.map(b => by.get(b.id)!.nextDueDate).filter((d): d is string => !!d).sort()[0];
  const coins = [...billed.slice(0, COIN_CAP)].sort((a, b) => Number(owes(a) > 0) - Number(owes(b) > 0));
  const gold = c.pastel.butter;
  return (
    <DashCard icon="jar" tone="butter" title={label} onHead={onOpen} right={<HeadSub label="Open" arrow />} i={i}>
      {billed.length === 0 ? <Empty>{`No ${label.toLowerCase()} charged yet.`}</Empty> : (
        <>
          <View style={styles.top}>
            <Big value={String(paid)} small={`of ${billed.length} paid`} />
            {out > 0 ? <Chip label={`${fmtUsd(out)} still out`} /> : null}
          </View>
          <View style={styles.coins} accessible accessibilityLabel={`${paid} of ${billed.length} paid`}>
            {coins.map(b => {
              const p = owes(b) === 0;
              return <View key={b.id} style={[styles.coin, p ? { backgroundColor: gold.fill, borderColor: gold.ink, borderStyle: "solid" } : { borderColor: c.line2 }]} />;
            })}
            {billed.length > COIN_CAP ? <T v="mono" size={10.6} color={c.ink3}>{`+${billed.length - COIN_CAP}`}</T> : null}
          </View>
          <View style={[styles.foot, { borderTopColor: c.line2 }]}>
            {owers.length ? (
              <View style={styles.faces}>
                {owers.slice(0, 4).map((b, k) => (
                  <View key={b.id} style={{ marginLeft: k ? -6 : 0 }}><Avatar name={b.name} uri={b.avatarUrl} px={26} /></View>
                ))}
                {owers.length > 4 ? (
                  <View style={[styles.more, { backgroundColor: c.card2, borderColor: c.line2 }]}><T v="mono" size={9.6} color={c.ink3}>{`+${owers.length - 4}`}</T></View>
                ) : null}
              </View>
            ) : null}
            <T v="meta" color={c.ink2} style={{ flex: 1 }}>{owers.length ? `${owers.length} still owe${due ? ` · due ${short(due)}` : ""}` : "Everyone's paid up."}</T>
          </View>
        </>
      )}
    </DashCard>
  );
}

/* ── Service ──────────────────────────────────────────────────────────────────── */

export function ServiceCard({ label, brothers, goal, onOpen, i }: { label: string; brothers: Brother[]; goal: number; onOpen: () => void; i: number }) {
  const { c } = useTheme();
  const ranked = [...brothers].sort((a, b) => b.serviceHours - a.serviceHours);
  const total = ranked.reduce((a, b) => a + b.serviceHours, 0);
  const met = ranked.filter(b => b.serviceHours >= goal).length;
  const max = Math.max(ranked[0]?.serviceHours ?? 0, goal, 1);
  const best = ranked.filter(b => b.serviceHours > 0).slice(0, 3);
  const rose = c.pastel.rose;
  return (
    <DashCard icon="heart" tone="rose" title={`${label} hours`} onHead={onOpen} right={<HeadSub label="Open" arrow />} i={i}>
      {total === 0 ? <Empty>{`No ${label.toLowerCase()} hours logged yet.`}</Empty> : (
        <>
          <View style={styles.top}>
            <Big value={String(met)} small={`of ${ranked.length} hit ${n1(goal)} hrs`} />
            <T v="mono" size={11.5} color={c.ink3}>{`${n1(total)} hrs logged`}</T>
          </View>
          <View style={[styles.sky, { borderBottomColor: c.ink }]} accessible accessibilityLabel={`${met} of ${ranked.length} members at or above ${goal} hours`}>
            {ranked.map(b => {
              const hit = b.serviceHours >= goal;
              return (
                <View key={b.id} style={[styles.skyBar, {
                  height: `${Math.max((b.serviceHours / max) * 100, 2)}%`,
                  backgroundColor: hit ? rose.fill : c.card, borderColor: hit ? rose.ink : c.line2,
                  borderStyle: b.serviceHours === 0 ? "dashed" : "solid",
                }]} />
              );
            })}
            <View style={[styles.goal, { bottom: `${(goal / max) * 100}%`, borderTopColor: c.ink }]}>
              <View style={[styles.goalTag, { backgroundColor: c.card }]}><T v="mono" size={9.6} color={c.ink}>{`${n1(goal)} hr goal`}</T></View>
            </View>
          </View>
          {best.length ? (
            <View style={[styles.top3, { borderTopColor: c.line2 }]}>
              <Cap>Most hours</Cap>
              {best.map(b => (
                <View key={b.id} style={styles.io}>
                  <T v="meta" color={c.ink2} numberOfLines={1} style={{ width: 120 }}>{b.name}</T>
                  <View style={{ flex: 1 }}><View style={[styles.topBar, { width: `${(b.serviceHours / best[0]!.serviceHours) * 100}%`, backgroundColor: rose.ink }]} /></View>
                  <T v="mono" size={11.8} align="right" style={{ width: 32 }}>{n1(b.serviceHours)}</T>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </DashCard>
  );
}

/* ── Grades ───────────────────────────────────────────────────────────────────── */

export function GradesCard({ brothers, atRisk, onOpen, i }: { brothers: Brother[]; atRisk: number; onOpen: () => void; i: number }) {
  const { c } = useTheme();
  const gpas = brothers.map(b => b.gpa).filter(g => g > 0);
  const lo = Math.min(2, Math.floor(Math.min(...gpas, 4) * 4) / 4);
  const nBands = Math.round((4 - lo) * 4);
  const bands = Array.from({ length: nBands }, (_, k) => lo + k * 0.25);
  const counts = bands.map((b, k) => gpas.filter(g => (k === nBands - 1 ? g >= b : g >= b && g < b + 0.25)).length);
  const top = Math.max(...counts, 1);
  const avg = gpas.length ? gpas.reduce((a, b) => a + b, 0) / gpas.length : 0;
  const below = gpas.filter(g => g < atRisk).length;
  const pos = (g: number) => `${((Math.min(Math.max(g, lo), 4) - lo) / (4 - lo)) * 100}%` as const;
  const lil = c.pastel.lilac, pea = c.pastel.peach;
  return (
    <DashCard icon="star" tone="lilac" title="Grades" onHead={onOpen} right={<HeadSub label="Open" arrow />} i={i}>
      {gpas.length === 0 ? <Empty>No grades on file yet.</Empty> : (
        <>
          <View style={styles.top}>
            <Big value={avg.toFixed(2)} small="average" />
            {below > 0 ? <Chip label={`${below} below ${atRisk.toFixed(2)}`} /> : null}
          </View>
          <View style={[styles.hist, { borderBottomColor: c.ink }]} accessible accessibilityLabel={`Average GPA ${avg.toFixed(2)}; ${below} below ${atRisk}`}>
            {bands.map((b, k) => {
              const low = b + 0.25 <= atRisk;
              return (
                <View key={b} style={styles.histCol}>
                  {counts[k]! > 0 ? <T v="mono" size={9.6} color={c.ink3}>{String(counts[k])}</T> : null}
                  <View style={[styles.histBar, { height: `${(counts[k]! / top) * 100}%`, backgroundColor: low ? pea.fill : lil.fill, borderColor: low ? pea.ink : lil.ink, borderWidth: counts[k] ? 1.5 : 0 }]} />
                </View>
              );
            })}
            <View style={[styles.cut, { left: pos(atRisk), borderLeftColor: c.ink2 }]} />
            <View style={[styles.cutTag, { left: pos(atRisk) }]} pointerEvents="none">
              <T v="mono" size={9.6} color={c.ink2} numberOfLines={1}>{`${atRisk.toFixed(2)} at risk`}</T>
            </View>
            <View style={[styles.avg, { left: pos(avg), backgroundColor: c.ink, borderColor: c.card }]} />
          </View>
          <View style={styles.histX}>
            {bands.filter((_, k) => k % 2 === 0).map(b => <T key={b} v="mono" size={9.6} color={c.ink3}>{b.toFixed((b * 4) % 2 ? 2 : 1)}</T>)}
            <T v="mono" size={9.6} color={c.ink3}>4.0</T>
          </View>
          <View style={styles.key}>
            <View style={styles.keyIt}><View style={[styles.keyDot, { backgroundColor: c.ink }]} /><T v="meta" size={11.8} color={c.ink3}>average</T></View>
            <View style={styles.keyIt}><View style={[styles.keyLn, { borderLeftColor: c.ink2 }]} /><T v="meta" size={11.8} color={c.ink3}>at-risk line</T></View>
            <View style={styles.keyIt}><View style={[styles.keySq, { backgroundColor: lil.fill, borderColor: lil.ink }]} /><T v="meta" size={11.8} color={c.ink3}>members per band</T></View>
          </View>
        </>
      )}
    </DashCard>
  );
}

/* ── Media ────────────────────────────────────────────────────────────────────── */

const POLA = ["peach", "sky", "mint"] as const;
const TILT = [-2.5, 1.5, -1];

export function MediaCard({ tasks, today, onOpen, i }: { tasks: { id: number; title: string; status: string; dueDate: string; postedDate: string | null }[]; today: string; onOpen: () => void; i: number }) {
  const { c } = useTheme();
  const month = today.slice(0, 7);
  const posted = tasks.filter(t => t.status === "posted").map(t => ({ t, on: t.postedDate ?? t.dueDate })).sort((a, b) => b.on.localeCompare(a.on));
  const thisMonth = posted.filter(p => p.on.startsWith(month)).length;
  const planned = tasks.filter(t => t.status !== "posted" && t.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next = planned[0];
  const days = next ? Math.round((utc(next.dueDate).getTime() - utc(today).getTime()) / 86_400_000) : 0;
  const nextWhen = !next ? "" : days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 7 ? WD[utc(next.dueDate).getUTCDay()]! : short(next.dueDate);
  return (
    <DashCard icon="camera" tone="peach" title="Media" onHead={onOpen} right={<HeadSub label="Open" arrow />} i={i}>
      {tasks.length === 0 ? <Empty>No posts planned yet.</Empty> : (
        <>
          <T v="meta" color={c.ink2}>
            <T v="meta" color={c.ink} style={{ fontWeight: "700" }}>{String(thisMonth)}</T>{" posted this month · "}
            <T v="meta" color={c.ink} style={{ fontWeight: "700" }}>{String(planned.length)}</T>{" planned"}
          </T>
          {posted.length ? (
            <View style={styles.polas}>
              {posted.slice(0, 3).map(({ t, on }, k) => {
                const p = c.pastel[POLA[k]!];
                return (
                  <View key={t.id} style={[styles.pola, { backgroundColor: c.card, borderColor: c.line, transform: [{ rotate: `${TILT[k]}deg` }] }]}>
                    <View style={[styles.ph, { backgroundColor: p.soft }]}><Icon name="camera" size={24} color={p.ink} /></View>
                    <T v="meta" size={10.9} lh={1.25} color={c.ink2} numberOfLines={2}>{t.title}</T>
                    <T v="mono" size={9.6} color={c.pastel.rose.ink}>{`Posted ${stamp(on)}`}</T>
                  </View>
                );
              })}
            </View>
          ) : <T v="meta" color={c.ink2} style={{ marginTop: 6 }}>Nothing posted yet.</T>}
          {next ? (
            <View style={[styles.next, { backgroundColor: c.card2, borderColor: c.line2 }]}>
              <View style={[styles.tape, { backgroundColor: c.pastel.butter.fill }]} />
              <T v="meta" color={c.ink2}>{"Next up "}<T v="meta" color={c.ink} style={{ fontWeight: "700" }}>{nextWhen}</T>{` · ${next.title}`}</T>
            </View>
          ) : null}
        </>
      )}
    </DashCard>
  );
}

/* ── a custom metric ──────────────────────────────────────────────────────────── */

export function MetricCard({ snap, onOpen, i }: { snap: DashboardMetric; onOpen: () => void; i: number }) {
  const { c } = useTheme();
  const { goal, atRiskBelow: risk } = snap;
  const values = snap.values ?? [];
  const unit = snap.unit ? ` ${snap.unit}` : "";
  const max = Math.ceil(Math.max(values[0] ?? 0, goal * 1.25, 1));
  const on = values.filter(v => v >= goal).length;
  const close = values.filter(v => v >= risk && v < goal).length;
  const behind = values.length - on - close;
  const pct = (v: number) => (Math.min(v, max) / max) * 100;
  const seen = new Map<number, number>();
  const P = c.pastel;
  return (
    <DashCard icon="bars" tone="sky" title={snap.name} onHead={onOpen} right={<HeadSub label="Open" arrow />} i={i}>
      {values.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
        <>
          <View style={styles.top}>
            <Big value={String(on)} small={`of ${values.length} on track`} />
            <T v="mono" size={11.5} color={c.ink3}>{`goal ${n1(goal)}${unit} each`}</T>
          </View>
          <View style={[styles.strip, { borderBottomColor: c.ink }]} accessible accessibilityLabel={`${on} on track, ${close} close, ${behind} behind`}>
            <View style={[styles.zone, { left: 0, width: `${pct(risk)}%`, backgroundColor: P.peach.fill }]} />
            <View style={[styles.zone, { left: `${pct(risk)}%`, width: `${pct(goal) - pct(risk)}%`, backgroundColor: P.butter.fill }]} />
            <View style={[styles.zone, { left: `${pct(goal)}%`, right: 0, backgroundColor: P.mint.fill }]} />
            {values.map((v, k) => {
              const key = Math.round(pct(v) / 2.5);
              const n = (seen.get(key) ?? 0) + 1;
              seen.set(key, n);
              const col = v >= goal ? P.mint.ink : v >= risk ? P.butter.ink : P.peach.ink;
              return <View key={k} style={[styles.mDot, { left: `${pct(v)}%`, bottom: Math.min(n - 1, 5) * 12 + 4, backgroundColor: col, borderColor: c.card }]} />;
            })}
          </View>
          <View style={styles.ticks}>
            <T v="mono" size={9.6} color={c.ink3} style={[styles.tick, { left: 0 }]}>0</T>
            {risk > 0 ? <T v="mono" size={9.6} color={c.ink3} style={[styles.tick, { left: `${pct(risk)}%` }]}>{n1(risk)}</T> : null}
            <T v="mono" size={9.6} color={c.ink3} style={[styles.tick, { left: `${pct(goal)}%` }]}>{n1(goal)}</T>
            <T v="mono" size={9.6} color={c.ink3} style={[styles.tick, { right: 0 }]}>{String(max)}</T>
          </View>
          <View style={styles.key}>
            {([[on, "on track", P.mint.ink], [close, "close", P.butter.ink], [behind, "behind", P.peach.ink]] as const).map(([n, l, col]) => (
              <View key={l} style={styles.keyIt}><View style={[styles.keyDot, { backgroundColor: col }]} /><T v="meta" size={11.8} color={c.ink3}>{`${n} ${l}`}</T></View>
            ))}
          </View>
        </>
      )}
    </DashCard>
  );
}

const styles = StyleSheet.create({
  bigRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  top: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  chip: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  empty: { paddingVertical: 18, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" },
  sk: { height: 12, borderRadius: 6 },
  io: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  ioBar: { height: 10, minWidth: 2, borderRadius: 5 },
  ledger: { marginTop: 2, borderTopWidth: 1.5 },
  ledRow: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1 },
  ledM: { flex: 1, alignSelf: "stretch", paddingLeft: 10, paddingVertical: 8, borderLeftWidth: 1.5 },
  coins: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  coin: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed" },
  foot: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12, borderTopWidth: 1, borderStyle: "dashed" },
  faces: { flexDirection: "row", alignItems: "center", paddingLeft: 6 },
  more: { width: 26, height: 26, borderRadius: 13, marginLeft: -6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  sky: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 92, marginTop: 10, borderBottomWidth: 1.5 },
  skyBar: { flex: 1, minWidth: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderWidth: 1.5, borderBottomWidth: 0 },
  goal: { position: "absolute", left: -4, right: -4, borderTopWidth: 1.5, borderStyle: "dashed" },
  goalTag: { position: "absolute", right: 0, bottom: 3, paddingHorizontal: 4, borderRadius: 4 },
  top3: { paddingTop: 12, borderTopWidth: 1, borderStyle: "dashed" },
  topBar: { height: 7, borderRadius: 4, opacity: 0.75 },
  hist: { flexDirection: "row", alignItems: "flex-end", gap: 5, height: 96, marginTop: 36, borderBottomWidth: 1.5, overflow: "visible" },
  histCol: { flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center", gap: 3 },
  histBar: { width: "100%", borderTopLeftRadius: 5, borderTopRightRadius: 5, borderBottomWidth: 0 },
  cut: { position: "absolute", top: -24, bottom: 0, borderLeftWidth: 1.5, borderStyle: "dashed", zIndex: 2 },
  cutTag: { position: "absolute", top: -30, width: 96, marginLeft: 5, zIndex: 2 },
  avg: { position: "absolute", bottom: -7, width: 12, height: 12, marginLeft: -6, borderRadius: 6, borderWidth: 2.5 },
  histX: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  key: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  keyIt: { flexDirection: "row", alignItems: "center", gap: 6 },
  keyDot: { width: 9, height: 9, borderRadius: 5 },
  keyLn: { width: 0, height: 12, borderLeftWidth: 1.5, borderStyle: "dashed" },
  keySq: { width: 10, height: 10, borderRadius: 3, borderWidth: 1.5 },
  polas: { flexDirection: "row", gap: 12, paddingHorizontal: 4, marginTop: 4 },
  pola: { flex: 1, padding: 6, paddingBottom: 8, borderRadius: 6, borderWidth: 1.5, gap: 4 },
  ph: { aspectRatio: 1, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  next: { marginTop: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5 },
  tape: { position: "absolute", top: -7, left: 14, width: 38, height: 13, opacity: 0.7, transform: [{ rotate: "-4deg" }] },
  strip: { height: 84, marginTop: 10, borderBottomWidth: 1.5 },
  zone: { position: "absolute", bottom: 0, height: "100%", opacity: 0.35 },
  mDot: { position: "absolute", width: 12, height: 12, marginLeft: -6, borderRadius: 6, borderWidth: 1.5 },
  ticks: { height: 16 },
  tick: { position: "absolute", transform: [{ translateX: -4 }] },
});
