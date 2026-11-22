/**
 * Fundraisers (app/org/[slug]/fundraisers at phone width), reached from More →
 * Fundraisers. Rules and words: lib/fundraising/ledger (shared with the web).
 *
 *   brief        FUNDRAISING [term], "You’ve made $X this term" (or "Fundraising, the easy
 *                way" on day one, "Nothing counted yet" before anything wraps), how many
 *                are wrapped / waiting / coming up; New fundraiser (MANAGE_FUNDRAISING)
 *   ready        each fundraiser whose day has come and nobody has counted, as a hero with
 *                its empty jar: Wrap it up (officers) / Open
 *   sections     Coming up · Wrapped up (this term, with what it made) · Earlier terms;
 *                a card opens its page (/more/fundraiser/[id])
 *   day one      the three figures (the shopping pad, the jar, the price tag), then "Plan
 *                your first fundraiser" (officers) or the member's line
 *
 * The Timeline's "Open in Fundraisers" passes ?event=<calendar event>, which lands on its
 * fundraiser, as on the web.
 */
import type { Fundraiser } from "@/lib/api-types";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { localDay } from "~/data/home";
import { useFundraisers } from "~/data/more";
import { useEntryOf } from "~/entry/EntryContext";
import { Card, MoneyJar, PriceTag } from "~/fundraisers/bits";
import { $m, DAY_ONE, LIST, briefBits, canFund, lists, rel, tiltAt } from "~/fundraisers/model";
import { Composer } from "~/fundraisers/sheets";
import { Icon } from "~/icons/Icon";
import { Screen } from "~/shell/Screen";
import { ErrorState, SkeletonCard } from "~/shell/states";
import { useTheme } from "~/theme/PaperProvider";
import { TrBtn } from "~/treasury/bits";
import { PageBrief, type BriefPart } from "~/ui/PageBrief";
import { T } from "~/ui/T";

export default function FundraisersPage() {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const canManage = !!me && canFund(me);
  const term = me?.org?.activeTerm ?? null;
  const q = useFundraisers();
  const list = q.data;
  const today = localDay();
  const [composing, setComposing] = useState(false);
  const { event } = useLocalSearchParams<{ event?: string }>();

  const open = useCallback((f: Fundraiser, extra = "") => router.push(`/more/fundraiser/${f.id}${extra}` as Href), []);

  // The Timeline's "Open in Fundraisers" names the calendar event; land on its fundraiser.
  useEffect(() => {
    const id = Number(event);
    if (!id || !list) return;
    const hit = list.find(f => f.calendarEventId === id);
    if (hit) router.replace(`/more/fundraiser/${hit.id}` as Href);
  }, [event, list]);

  const l = useMemo(() => (list ? lists(list, today, term) : null), [list, today, term]);

  const composer = canManage ? (
    <Composer open={composing} editing={null} onClose={() => setComposing(false)}
      onSaved={f => { setComposing(false); open(f, "?created=1"); }} />
  ) : null;

  if (!list || !l) {
    return (
      <Screen title={LIST.crumb} back="More" onRefresh={() => q.refetch()}>
        {q.isError ? <ErrorState title={LIST.loadFailed} error={q.error} onRetry={() => void q.refetch()} /> : <SkeletonCard height={220} />}
      </Screen>
    );
  }

  const bits = briefBits(l);
  const sub: string | BriefPart[] = !list.length ? LIST.subEmpty : [
    ...bits.flatMap(([n, w], i) => [...(i > 0 ? [{ text: " · " }] : []), { text: String(n), bold: true }, { text: w }]),
    { text: `${bits.length ? ". " : ""}${LIST.subTail}` },
  ];
  const title = !list.length
    ? { lead: LIST.greetEmpty[0], mark: LIST.greetEmpty[1], tail: "" }
    : l.wrapped.length ? { lead: LIST.made(l.termMade), mark: $m(Math.abs(l.termMade)), tail: LIST.thisTerm }
    : { lead: LIST.nothing, mark: "", tail: "" };

  return (
    <Screen title={LIST.crumb} back="More" onRefresh={() => q.refetch()}>
      <View style={{ gap: 18 }}>
        <PageBrief pill={term?.label ?? null} pillAfter kicker={LIST.kick} kickerSep={false}
          lead={title.lead} mark={title.mark} tail={title.tail} markTone={l.termMade < 0 ? "rose" : "mint"} sub={sub} />
        {canManage ? <View style={styles.actions}><TrBtn label={LIST.newOne} icon="plus" onPress={() => setComposing(true)} /></View> : null}

        {!list.length ? <DayOne canManage={canManage} onNew={() => setComposing(true)} /> : (
          <>
            {l.ready.map(f => (
              <View key={f.id} style={[styles.hero, { backgroundColor: c.pastel.butter.soft, borderColor: c.ink, boxShadow: `4px 4px 0 ${c.pastel.butter.fill}` }]}>
                <View style={{ alignItems: "center" }}><MoneyJar uid={`h${f.id}`} sup={f.spent} goal={f.goal} inn={null} width={130} /></View>
                <View style={{ gap: 6 }}>
                  <View style={[styles.tag, { backgroundColor: c.pastel.butter.fill, borderColor: c.ink }]}><T v="kicker" size={11}>{LIST.heroTag}</T></View>
                  <T v="title" accessibilityRole="header">{`${f.name} was ${rel(f.date, today)}. How much came in?`}</T>
                  <T v="body" color={c.ink2}>{LIST.heroSpent[0]}<T v="body" style={{ fontWeight: "700" }}>{$m(f.spent)}</T>{LIST.heroSpent[1]}{canManage ? LIST.heroOfficer : LIST.heroMember}</T>
                </View>
                <TrBtn label={LIST.heroAct(canManage)} icon="jar" onPress={() => open(f, "?wrap=1")} />
              </View>
            ))}
            <Section title={LIST.upcoming} count={String(l.upcoming.length)} list={l.upcoming} today={today} onOpen={open} />
            <Section title={LIST.wrapped} count={LIST.wrappedCnt(l.wrapped.length, l.termMade)} list={l.wrapped} today={today} onOpen={open} />
            <Section title={LIST.earlier} count={String(l.earlier.length)} list={l.earlier} today={today} onOpen={open} />
          </>
        )}
      </View>
      {composer}
    </Screen>
  );
}

function Section({ title, count, list, today, onOpen }: { title: string; count: string; list: Fundraiser[]; today: string; onOpen: (f: Fundraiser) => void }) {
  const { c } = useTheme();
  if (!list.length) return null;
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.sec} accessibilityRole="header" accessible accessibilityLabel={`${title}, ${count}`}>
        <T v="title" size={20}>{title}</T>
        <View style={[styles.rule, { borderTopColor: c.line2 }]} />
        <T v="mono" color={c.ink3} style={{ fontSize: 12 }}>{count}</T>
      </View>
      {list.map((f, i) => <Card key={f.id} f={f} rt={tiltAt(i)} today={today} onOpen={onOpen} />)}
    </View>
  );
}

function DayOne({ canManage, onNew }: { canManage: boolean; onNew: () => void }) {
  const { c } = useTheme();
  const fig = (i: 0 | 1 | 2, art: React.ReactNode) => (
    <View style={[styles.fig, { backgroundColor: c.card, borderColor: c.line2 }]}>
      <View style={styles.art}>{art}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="callout" style={{ fontWeight: "700" }}>{DAY_ONE.steps[i][0]}</T>
        <T v="meta" color={c.ink3}>{DAY_ONE.steps[i][1]}</T>
      </View>
    </View>
  );
  return (
    <>
      <View style={{ gap: 10 }}>
        {fig(0, (
          <View style={[styles.pad, { backgroundColor: c.note.fill.butter, borderColor: c.ink }]}>
            {DAY_ONE.pad.map(([k, v], i) => (
              <View key={k} style={[styles.padRow, i === DAY_ONE.pad.length - 1 && { borderTopWidth: 1, borderTopColor: c.ink }]}>
                <T v="mono" style={{ fontSize: 9 }}>{k}</T><T v="mono" style={{ fontSize: 9 }}>{v}</T>
              </View>
            ))}
          </View>
        ))}
        {fig(1, <MoneyJar uid="d1" sup={DAY_ONE.jar.sup} goal={null} inn={DAY_ONE.jar.inn} width={72} />)}
        {fig(2, <PriceTag made={DAY_ONE.tag} rt={-4} size={64} />)}
      </View>
      {canManage ? <View style={styles.actions}><TrBtn label={DAY_ONE.cta} icon="plus" onPress={onNew} /></View>
        : <View style={styles.note}><Icon name="jar" size={14} color={c.ink3} /><T v="meta" color={c.ink3} style={{ flex: 1 }}>{DAY_ONE.member}</T></View>}
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  hero: { borderWidth: 1.5, borderRadius: 18, padding: 16, gap: 14 },
  tag: { alignSelf: "flex-start", borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  sec: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 },
  rule: { flex: 1, borderTopWidth: 1.5, borderStyle: "dashed", transform: [{ translateY: -4 }] },
  fig: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1.5, borderRadius: 16, padding: 12 },
  art: { width: 84, height: 92, alignItems: "center", justifyContent: "center" },
  pad: { width: 80, borderWidth: 1.5, borderRadius: 4, padding: 6, gap: 2, transform: [{ rotate: "-2deg" }] },
  padRow: { flexDirection: "row", justifyContent: "space-between" },
  note: { flexDirection: "row", gap: 8, alignItems: "center" },
});
