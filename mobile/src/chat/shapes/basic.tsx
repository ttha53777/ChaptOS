/**
 * Answer shapes, part one: Figure (one quantity drawn big, with how it's counted),
 * Tally (the whole roster as dots, the subset filled), Breakdown (a total split by
 * category, as one stacked bar and ranked lines). Every number is the server's.
 */
import type { AnswerRow, BreakdownShape, FigureShape, TallyShape } from "@/lib/api-types";
import { Pressable, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { money } from "~/members/model";
import { haptics } from "~/motion/haptics";
import { alpha, type Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { monthDay } from "~/today/time";
import { T } from "~/ui/T";
import { Kicker, Rows, styles, useActions } from "./common";

const fmt = (n: number, unit: "usd" | "count") => (unit === "usd" ? money(n) : n.toLocaleString("en-US"));

export function Figure({ s, tone }: { s: FigureShape; tone: Tone }) {
  const { c } = useTheme();
  const series = s.series && s.series.length >= 4 ? s.series : null;
  return (
    <View style={[styles.card, { borderColor: c.line, backgroundColor: c.card }]}>
      <Kicker text={s.kicker} />
      <T v="figure" accessibilityLabel={`${s.kicker}: ${fmt(s.value, s.unit)}`}>{fmt(s.value, s.unit)}</T>
      {s.delta ? (
        <T v="meta" color={s.delta.by >= 0 ? c.pastel.mint.ink : c.pastel.rose.ink}>
          {s.delta.by >= 0 ? "+" : "−"}{fmt(Math.abs(s.delta.by), s.unit)} since {monthDay(s.delta.since)}
        </T>
      ) : null}
      {series ? <Spark points={series.map(p => p.value)} ink={c.pastel[tone].ink} /> : null}
      {s.terms ? (
        <View style={{ gap: 4 }}>
          {s.terms.map((t, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T v="meta" color={c.ink2}>{t.op === "-" ? "− " : "+ "}{t.label}</T>
              <T v="mono" style={{ fontSize: 12 }}>{fmt(t.amount, s.unit)}</T>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: c.line }} />
        </View>
      ) : null}
      {s.split ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {s.split.map((p, i) => <T key={i} v="meta" color={c.ink2}><T v="mono" style={{ fontSize: 12 }}>{p.count}</T> {p.label}</T>)}
        </View>
      ) : null}
      <T v="meta" color={c.ink3}>As of {monthDay(s.asOf)}</T>
    </View>
  );
}

/** A calm, data-only line: one stroke, no fill, no dots. */
function Spark({ points, ink }: { points: number[]; ink: string }) {
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const pts = points.map((p, i) => `${(i / (points.length - 1)) * 100},${34 - ((p - min) / span) * 30}`).join(" ");
  return (
    <Svg width="100%" height={36} viewBox="0 0 100 36" preserveAspectRatio="none" accessibilityElementsHidden>
      <Polyline points={pts} fill="none" stroke={ink} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </Svg>
  );
}

export function Tally({ s, rows, tone }: { s: TallyShape; rows: AnswerRow[]; tone: Tone }) {
  const { c } = useTheme();
  const a = useActions();
  const p = c.pastel[tone];
  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.card, { borderColor: c.line, backgroundColor: c.card }]}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <T v="measure">{s.hit}</T>
          <T v="subhead" color={c.ink3}>/ {s.of} {s.hitWord}</T>
        </View>
        {s.marks ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }} accessible accessibilityLabel={`${s.hit} of ${s.of} ${s.hitWord}`}>
            {s.marks.map(mk => (
              <Pressable key={mk.id} onPress={() => a.peek({ type: "member", id: mk.id })} hitSlop={2}
                accessibilityLabel={`${mk.name}${mk.value ? `, ${mk.value}` : ""}`}
                style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.2,
                  borderColor: mk.state === "rest" ? c.line2 : p.ink,
                  backgroundColor: mk.state === "top" ? p.ink : mk.state === "hit" ? p.fill : "transparent" }} />
            ))}
          </View>
        ) : (
          <View style={{ height: 10, borderRadius: 5, backgroundColor: c.paper3, overflow: "hidden" }}>
            <View style={{ width: `${s.of ? (s.hit / s.of) * 100 : 0}%`, height: 10, backgroundColor: p.fill }} />
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
          <Legend fill={p.fill} border={p.ink} label={s.hitLegend} />
          {s.topLabel ? <Legend fill={p.ink} border={p.ink} label={s.topLabel} /> : null}
          <Legend fill="transparent" border={c.line2} label={s.restLegend} />
        </View>
      </View>
      <Rows rows={rows} />
    </View>
  );
}

function Legend({ fill, border, label }: { fill: string; border: string; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.2, borderColor: border, backgroundColor: fill }} />
      <T v="meta" color={c.ink2}>{label}</T>
    </View>
  );
}

export function Breakdown({ s, rows }: { s: BreakdownShape; rows: AnswerRow[] }) {
  const { c } = useTheme();
  const a = useActions();
  const dark = c.scheme === "dark";
  const col = (p: BreakdownShape["parts"][number], i: number) => (dark ? p.colorDark : p.color) ?? [c.pastel.sky.ink, c.pastel.mint.ink, c.pastel.peach.ink, c.pastel.lilac.ink, c.pastel.butter.ink, c.pastel.rose.ink][i % 6]!;
  return (
    <View style={[styles.card, { borderColor: c.line, backgroundColor: c.card }]}>
      <Kicker text={s.period} />
      <T v="measure">{money(s.total)}</T>
      <View style={{ flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: c.paper3 }} accessibilityElementsHidden>
        {s.parts.map((p, i) => <View key={i} style={{ flex: Math.max(p.share, 0.5), backgroundColor: col(p, i) }} />)}
      </View>
      <View>
        {s.parts.map((p, i) => {
          const row = rows[i];
          const ask = row?.ask;
          const line = (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: col(p, i) }} />
              <T v="callout" style={{ flex: 1 }} numberOfLines={1}>{p.label}</T>
              <T v="meta" color={c.ink3}>{p.share}%</T>
              <T v="mono" style={{ fontSize: 12.5, minWidth: 64, textAlign: "right" }}>{money(p.amount)}</T>
            </View>
          );
          return (
            <View key={i}>
              {ask ? <Pressable onPress={() => { haptics.select(); a.ask(ask); }} accessibilityRole="button">{line}</Pressable> : line}
              {s.hasBudget && p.budget != null ? (
                <View style={{ height: 4, borderRadius: 2, backgroundColor: c.paper3, marginLeft: 20, marginBottom: 4, overflow: "hidden" }}>
                  <View style={{ width: `${Math.min(100, (p.amount / Math.max(p.budget, 1)) * 100)}%`, height: 4, backgroundColor: p.amount > p.budget ? c.pastel.rose.ink : alpha(col(p, i), 0.7) }} />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      {s.hasBudget ? <T v="meta" color={c.ink3}>Thin bars: against this term's budget.</T> : null}
    </View>
  );
}
