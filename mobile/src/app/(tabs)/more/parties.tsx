/**
 * Parties (the web's house ledger), reached from More → Parties:
 *
 *   briefing     "The house ledger.": how many closed out, net positive or in the red,
 *                how many still waiting on numbers; Ask what the door cleared (opens Ask
 *                Chapt with the web's question waiting in the composer)
 *   the one task the oldest party that happened with no figures, as a sealed envelope:
 *                Close it out (officers, MANAGE_PARTIES)
 *   takings      net this semester over closed parties, door / spent / avg roll / best
 *                night, and the night-by-night strip (a bar opens its party)
 *   the book     every party, newest first; a row opens the party sheet, a due row's
 *                Wrap up opens the wrap-up straight away
 *   day one      nothing yet: the blank ledger, and Add party for officers
 *
 * Parties are Treasury's door money too: writes refresh the treasury, the Timeline and
 * home (~/data/parties). "Open in Timeline" shows the Timeline's own event sheet on top.
 */
import type { Party, PartyRollRow } from "@/lib/api-types";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useCalendar, useEventTypes } from "~/data/calendar";
import { localDay } from "~/data/home";
import { useParties, usePartyRolls } from "~/data/parties";
import { useRoster } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { navLabel } from "~/more/model";
import { Highlighter } from "~/paper/stationery";
import { Book, Hero, TakingsCard } from "~/parties/bits";
import { briefing, canManage, newestFirst, takings, waiting } from "~/parties/model";
import { DeleteParty, PartyForm, PartySheet, WrapUp } from "~/parties/sheets";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonCard, SkeletonList } from "~/shell/states";
import { viewerOf } from "~/tasks/model";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { EventSheet as TimelineSheet } from "~/timeline/EventSheet";
import { T } from "~/ui/T";

const ASK = "What did the door clear this semester?";

export default function Parties() {
  const { c } = useTheme();
  const m = useMotion();
  const me = useEntryOf("ready")?.me ?? null;
  const q = useParties();
  const rollsQ = usePartyRolls();
  const officer = !!me && canManage(me);
  const today = localDay();
  const [open, setOpen] = useState<number | null>(null);
  const [wrap, setWrap] = useState<number | null>(null);
  const [form, setForm] = useState<{ party: Party | null } | null>(null);
  const [del, setDel] = useState<number | null>(null);
  const [tl, setTl] = useState<number | null>(null);

  const all = q.data ?? null;
  const rolls = useMemo(() => new Map((rollsQ.data ?? []).map((r: PartyRollRow) => [r.partyId, r])), [rollsQ.data]);
  const byId = (id: number | null) => (id == null ? null : all?.find(p => p.id === id) ?? null);

  // the Timeline's own sheet for "Open in Timeline"
  const cal = useCalendar();
  const types = useEventTypes();
  const roster = useRoster(tl != null);
  const rosterMap = useMemo(() => new Map((roster.data ?? []).map(b => [b.id, b])), [roster.data]);
  const tlEvent = tl == null ? null : cal.data?.find(e => e.id === tl) ?? null;

  if (!me) return null;
  const org = me.org?.name ?? "ChaptOS";
  const title = navLabel(me, "Parties");
  const wrapParty = byId(wrap);

  const right = officer ? (
    <Pressable onPress={() => setForm({ party: null })} accessibilityRole="button" accessibilityLabel="Add party" hitSlop={8}
      style={({ pressed }) => [styles.plus, { backgroundColor: c.ink, boxShadow: `${pressed ? 1 : 2}px ${pressed ? 1 : 2}px 0 ${c.note.fill.rose}` }, pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
      <Icon name="plus" size={16} color={c.paper} />
    </Pressable>
  ) : null;

  let body: React.ReactNode;
  if (!all) {
    body = q.isError
      ? <ErrorState title="Couldn't load the ledger." error={q.error} onRetry={() => void q.refetch()} />
      : <><SkeletonCard height={150} /><SkeletonList count={5} /></>;
  } else {
    const wait = waiting(all, today);
    const hero = officer ? wait[0] ?? null : null;
    const t = takings(all, rolls);
    const b = briefing(t.closed.length, t.net, wait.length);
    const sorted = newestFirst(all);
    const rise = (i: number) => (m.reduced ? FadeIn.duration(m.t(160)) : FadeInDown.delay(m.t(i * 60)).duration(m.t(280)).springify().damping(18)).reduceMotion(ReduceMotion.Never);
    body = (
      <>
        <View style={{ gap: 10 }}>
          <View style={styles.h1}>
            <T v="title">The </T>
            <Highlighter tone="rose"><T v="title">house</T></Highlighter>
            <T v="title"> ledger.</T>
          </View>
          <T v="body" color={c.ink2} style={{ lineHeight: 23 }}>
            {b.lead}{b.strong ? <T v="body" color={c.ink} style={{ fontWeight: "700" }}>{b.strong}</T> : null}{b.rest}
          </T>
          <Pressable onPress={() => router.push({ pathname: "/ask", params: { q: ASK } })} accessibilityRole="button" accessibilityHint="Opens Ask Chapt with the question ready to send"
            style={({ pressed }) => [styles.ask, { borderColor: pressed ? c.pastel.lilac.ink : c.line2, backgroundColor: pressed ? c.pastel.lilac.soft : "transparent" }]}>
            <Icon name="spark" size={14} color={c.pastel.lilac.ink} />
            <T v="callout" color={c.ink2}>Ask what the door cleared</T>
          </Pressable>
        </View>

        {hero ? (
          <Animated.View entering={rise(0)}>
            <Hero party={hero} more={wait.length - 1} org={org} today={today} onClose={() => setWrap(hero.id)} />
          </Animated.View>
        ) : null}

        {t.closed.length ? (
          <Animated.View entering={rise(1)}>
            <TakingsCard t={t} onOpen={setOpen} />
          </Animated.View>
        ) : null}

        <View style={styles.sec} accessibilityRole="header">
          <T v="heading">Every party</T>
          <View style={[styles.rule, { borderColor: c.line2 }]} />
          <T v="mono" color={c.ink3} style={{ fontSize: 11.5 }}>{sorted.length ? `${sorted.length} total · newest first` : ""}</T>
        </View>

        {!sorted.length ? (
          <EmptyState
            pictures={[{ icon: "note", tone: "rose", label: "Add the party" }, { icon: "receipt", tone: "butter", label: "Close it out: door + spent" }, { icon: "bars", tone: "mint", label: "The net keeps itself" }]}
            title="No parties yet."
            line={officer
              ? "Add your first party to start tracking the books. After the night, close it out with the door and what you spent, and the semester's net keeps itself."
              : "Nothing here yet. Once an officer adds a party, it lands in this book."}
            action={officer ? { label: "Add party", icon: "plus", onPress: () => setForm({ party: null }) } : undefined} />
        ) : (
          <Animated.View entering={rise(2)}>
            <Book parties={sorted} today={today} officer={officer} onOpen={p => setOpen(p.id)} onWrap={p => setWrap(p.id)} />
          </Animated.View>
        )}
      </>
    );
  }

  return (
    <Screen title={title} large back="More" right={right} onRefresh={() => Promise.all([q.refetch(), rollsQ.refetch()])} subtitle={me.org?.activeTerm?.label}>
      {body}
      <PartySheet party={byId(open)} roll={open != null ? rolls.get(open) ?? null : null} onClose={() => setOpen(null)}
        onWrap={p => setWrap(p.id)} onEdit={p => setForm({ party: p })} onDelete={p => setDel(p.id)} onTimeline={setTl} />
      {officer ? (
        <>
          <PartyForm open={!!form} party={form?.party ?? null} onClose={() => setForm(null)} onSaved={p => { if (!form?.party) setOpen(p.id); }} />
          <WrapUp party={wrapParty} rolled={wrap != null && rolls.has(wrap)} onClose={() => setWrap(null)} />
          <DeleteParty party={byId(del)} onClose={() => setDel(null)} onDeleted={() => setOpen(null)} />
        </>
      ) : null}
      <TimelineSheet event={tlEvent} task={null} types={types.data} viewer={viewerOf(me)} today={today} roster={rosterMap} onClose={() => setTl(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  plus: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  h1: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap" },
  ask: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 999, paddingHorizontal: 14, minHeight: 40 },
  sec: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 },
  rule: { flex: 1, borderTopWidth: 1.5, borderStyle: "dashed", transform: [{ translateY: -4 }] },
});
