/**
 * More → Treasury (U9), read-only, for everyone on the "finance" workflow, as the web's
 * sidebar shows it (GET /api/treasury and /api/transactions are open to members); the
 * requests waiting on approval only for the books' keepers (~/more/model seesTreasury).
 * What's on hand, counted
 * up the first time it opens in a session; the balance month by month as one calm line
 * (data only: no fill, no decoration, the first and last month named, the high and low
 * marked); requests waiting on approval; and the latest lines of the ledger.
 *
 * Recording, editing and approving stay on chaptos.com, where the treasury's controls and
 * its approval record live. Reads GET /api/treasury, /api/transactions,
 * /api/treasury/categories (labels) and /api/reimbursements (what's waiting).
 */
import type { Transaction, TransactionCategory, TreasuryData } from "@/lib/api-types";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { useCategories, useReimbursements, useTransactions, useTreasury } from "~/data/money";
import { useEntryOf } from "~/entry/EntryContext";
import { money } from "~/members/model";
import { useCountUp } from "~/money/countUp";
import { seesTreasury } from "~/more/model";
import { TickingNumber } from "~/paper/TickingNumber";
import { Kicker } from "~/paper/bits";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { monthDay } from "~/today/time";
import { T } from "~/ui/T";

const RECENT = 12;

export default function TreasuryPage() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const allowed = !!entry?.me.org?.enabledWorkflows.includes("finance");
  const keeper = !!entry && seesTreasury(entry.me);
  const t = useTreasury(allowed);
  const tx = useTransactions(allowed);
  const cats = useCategories(allowed);
  const reimb = useReimbursements(allowed && keeper);
  if (!entry) return null;
  const refresh = () => Promise.all([t.refetch(), tx.refetch(), reimb.refetch()]);

  if (!allowed) {
    return (
      <Screen title="Treasury" back="More">
        <EmptyState title="This chapter keeps its books elsewhere." line="The treasury is switched off for this chapter." />
      </Screen>
    );
  }

  const waiting = keeper ? (reimb.data ?? []).filter(r => r.status === "pending") : [];
  return (
    <Screen title="Treasury" back="More" onRefresh={refresh}>
      {t.data ? <StaleNote updatedAt={t.dataUpdatedAt} failed={t.isError || tx.isError} onRetry={() => void refresh()} /> : null}
      {!t.data ? (t.isError ? <ErrorState title="Couldn't load the treasury." error={t.error} onRetry={() => void refresh()} /> : <SkeletonCard height={220} />)
        : <Balance data={t.data} />}

      {waiting.length ? (
        <View style={[styles.waiting, { borderColor: c.pastel.rose.border, backgroundColor: c.pastel.rose.soft }]} accessibilityRole="summary">
          <T v="callout">
            <T v="callout" style={{ fontWeight: "700" }}>{waiting.length} {waiting.length === 1 ? "request" : "requests"} waiting</T>, {money(waiting.reduce((s, r) => s + r.amount, 0))} in all.
          </T>
          <T v="meta" color={c.ink2}>Approve or decline them on chaptos.com, where the approval is recorded.</T>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <T v="label" color={c.ink3} accessibilityRole="header">Latest in the ledger</T>
        {!tx.data ? (tx.isError ? <ErrorState compact title="Couldn't load the ledger." error={tx.error} onRetry={() => void tx.refetch()} /> : <SkeletonCard lines={5} />)
          : <Ledger list={tx.data} cats={cats.data ?? []} />}
        <T v="meta" color={c.ink3}>Read-only here. Record, edit and approve on chaptos.com.</T>
      </View>
    </Screen>
  );
}

function Balance({ data }: { data: TreasuryData }) {
  const { c } = useTheme();
  const shown = useCountUp("treasury-balance", data.balance);
  const neg = data.balance < 0;
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `4px 4px 0 ${c.pastel.mint.fill}` }]}>
      <Kicker label="On hand" tone="mint" />
      <TickingNumber value={money(shown ?? data.balance)} v="hero" color={neg ? c.pastel.rose.ink : c.ink} accessibilityLabel={`${money(data.balance)} on hand`} />
      {data.openingBalance != null ? <T v="meta" color={c.ink3}>Counting the {money(data.openingBalance)} the books started with.</T> : null}
      {data.trend.length >= 2 ? <Trend points={data.trend.slice(-12)} /> : null}
    </View>
  );
}

/** The balance by month: one line, the ends named, the high and low marked. */
function Trend({ points }: { points: TreasuryData["trend"] }) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const H = 96, PAD = 6;
  const vals = points.map(p => p.balance);
  const hi = Math.max(...vals), lo = Math.min(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => PAD + (i * (w - PAD * 2)) / (points.length - 1);
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);
  const first = points[0]!, last = points[points.length - 1]!;
  return (
    <View style={{ gap: 6, marginTop: 6 }} accessible accessibilityLabel={`Balance by month: ${first.month} ${money(first.balance)}, high ${money(hi)}, low ${money(lo)}, ${last.month} ${money(last.balance)}.`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <T v="mono" color={c.ink3} style={{ fontSize: 10.5 }}>High {money(hi)}</T>
        <T v="mono" color={c.ink3} style={{ fontSize: 10.5 }}>Low {money(lo)}</T>
      </View>
      <View style={{ height: H }} onLayout={e => setW(e.nativeEvent.layout.width)}>
        {w > 0 ? (
          <Svg width={w} height={H}>
            <Line x1={0} x2={w} y1={y(hi)} y2={y(hi)} stroke={alpha(c.ink, 0.1)} strokeWidth={1} />
            <Line x1={0} x2={w} y1={y(lo)} y2={y(lo)} stroke={alpha(c.ink, 0.1)} strokeWidth={1} />
            <Polyline points={points.map((p, i) => `${x(i)},${y(p.balance)}`).join(" ")} fill="none" stroke={c.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={x(points.length - 1)} cy={y(last.balance)} r={3.5} fill={c.ink} />
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <T v="mono" color={c.ink3} style={{ fontSize: 10.5 }}>{first.month}</T>
        <T v="mono" color={c.ink3} style={{ fontSize: 10.5 }}>{last.month}</T>
      </View>
    </View>
  );
}

function Ledger({ list, cats }: { list: Transaction[]; cats: TransactionCategory[] }) {
  const { c } = useTheme();
  const rows = list.filter(t => !t.deletedAt)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT);
  if (!rows.length) {
    return <EmptyState compact title="Nothing in the ledger yet." line="Income and expenses the treasurer records show up here." />;
  }
  const label = (t: Transaction) => cats.find(x => x.kind === t.type && x.slug === t.category)?.label ?? t.category;
  return (
    <View style={[styles.ledger, { borderColor: c.line, backgroundColor: c.card }]}>
      {rows.map((t, i) => {
        const inc = t.type === "income";
        return (
          <View key={t.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.lineSoft }]}
            accessible accessibilityLabel={`${t.description || label(t)}, ${monthDay(t.date)}, ${inc ? "in" : "out"} ${money(t.amount)}`}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="callout" numberOfLines={1}>{t.description || label(t)}</T>
              <T v="meta" color={c.ink3} numberOfLines={1}>{monthDay(t.date)} · {label(t)}{t.status === "pending" ? " · pending" : ""}</T>
            </View>
            <T v="mono" color={inc ? c.pastel.mint.ink : c.ink} style={{ fontSize: 13 }}>{inc ? "+" : "−"}{money(t.amount)}</T>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 20, padding: 16, gap: 6 },
  waiting: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 4 },
  ledger: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
});
