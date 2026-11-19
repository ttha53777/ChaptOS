/**
 * More → Fundraisers (read): a jar per fundraiser that fills to what came in against the
 * goal when the page opens (~/moments/Jar, staggered 120ms). Coming up first (date,
 * place, the goal, an empty jar), then the wrapped ones with what came in, what was
 * spent and what was made. Members don't run fundraisers from the phone; officers do on
 * the web. Reads GET /api/fundraisers.
 */
import type { Fundraiser } from "@/lib/api-types";
import { StyleSheet, View } from "react-native";
import { localDay } from "~/data/home";
import { useFundraisers } from "~/data/more";
import { money } from "~/members/model";
import { Jar } from "~/moments/Jar";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { useTheme } from "~/theme/PaperProvider";
import { clockLabel, monthDay, weekdayShort } from "~/today/time";
import { T } from "~/ui/T";

const STAGGER = 120;

export default function FundraisersPage() {
  const { c } = useTheme();
  const q = useFundraisers();
  const today = localDay();
  const list = q.data;
  const ahead = (list ?? []).filter(f => !f.wrappedAt && f.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const done = (list ?? []).filter(f => f.wrappedAt || f.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const raised = (list ?? []).reduce((s, f) => s + (f.made ?? 0), 0);

  return (
    <Screen title="Fundraisers" back="More" onRefresh={() => q.refetch()}>
      {list ? <StaleNote updatedAt={q.dataUpdatedAt} failed={q.isError} onRetry={() => void q.refetch()} /> : null}
      {!list ? (q.isError ? <ErrorState title="Couldn't load fundraisers." error={q.error} onRetry={() => void q.refetch()} /> : <SkeletonCard height={220} />)
        : !list.length ? (
          <EmptyState pictures={[{ icon: "jar", tone: "rose", label: "A jar each" }, { icon: "cash", tone: "mint", label: "What came in" }, { icon: "check", tone: "sky", label: "The goal" }]}
            title="No fundraisers yet." line="A bake sale, a car wash. When an officer plans one, its jar shows up here and fills when it wraps." />
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <T v="title" accessibilityRole="header">{raised > 0 ? `${money(raised)} made` : "Fundraisers"}</T>
              <T v="body" color={c.ink2}>{done.length ? `Across ${done.length} wrapped ${done.length === 1 ? "fundraiser" : "fundraisers"}, after supplies.` : "Nothing has wrapped yet."}</T>
            </View>
            {ahead.length ? <Section title="Coming up" list={ahead} today={today} from={0} /> : null}
            {done.length ? <Section title="Wrapped" list={done} today={today} from={ahead.length} /> : null}
          </>
        )}
    </Screen>
  );
}

function Section({ title, list, today, from }: { title: string; list: Fundraiser[]; today: string; from: number }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <T v="label" color={c.ink3} accessibilityRole="header">{title}</T>
      {list.map((f, i) => <Row key={f.id} f={f} today={today} delay={(from + i) * STAGGER} />)}
    </View>
  );
}

function Row({ f, today, delay }: { f: Fundraiser; today: string; delay: number }) {
  const { c } = useTheme();
  const wrapped = f.cameIn != null;
  const fill = wrapped && f.goal ? f.cameIn! / f.goal : wrapped ? 1 : 0;
  const tint = f.made != null && f.made < 0 ? c.pastel.rose.fill : c.pastel.mint.fill;
  const when = [f.date === today ? "Today" : `${weekdayShort(f.date)} ${monthDay(f.date)}`, clockLabel(f.startTime), f.place].filter(Boolean).join(" · ");
  const label = wrapped
    ? `${f.name}. ${money(f.cameIn!)} came in${f.goal ? ` of a ${money(f.goal)} goal` : ""}, ${money(f.spent)} spent, ${f.made! < 0 ? `${money(-f.made!)} short` : `${money(f.made!)} made`}.`
    : `${f.name}, ${when}.${f.goal ? ` Goal ${money(f.goal)}.` : ""}`;
  return (
    <View style={[styles.row, { backgroundColor: c.card, borderColor: c.line }]} accessible accessibilityLabel={label}>
      <Jar fill={fill} tint={tint} delay={delay} />
      <View style={{ flex: 1, gap: 3 }}>
        <T v="subhead" numberOfLines={2}>{f.name}</T>
        <T v="meta" color={c.ink3} numberOfLines={1}>{when}</T>
        {wrapped ? (
          <>
            <T v="callout"><T v="callout" style={{ fontWeight: "700" }}>{money(f.cameIn!)}</T>{f.goal ? <T v="callout" color={c.ink3}> of {money(f.goal)}</T> : null}</T>
            <T v="meta" color={f.made! < 0 ? c.pastel.rose.ink : c.pastel.mint.ink}>
              {money(f.spent)} on supplies · {f.made! < 0 ? `${money(-f.made!)} short` : `${money(f.made!)} made`}
            </T>
          </>
        ) : f.goal ? <T v="callout" color={c.ink2}>Goal {money(f.goal)}</T> : <T v="meta" color={c.ink3}>No goal set</T>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderWidth: 1.5, borderRadius: 16 },
});
