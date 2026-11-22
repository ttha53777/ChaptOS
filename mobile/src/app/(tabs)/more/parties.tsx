/**
 * Parties (the web's house ledger, app/org/[slug]/parties at phone width), reached from
 * More → Parties. Rules and words: lib/parties/ledger (shared with the web).
 *
 *   briefing     "Fri · Nov 20  Parties · Oozma Kappa", "The house ledger.", how many
 *                closed out, net positive or in the red, how many still waiting on numbers
 *   actions      Add party (MANAGE_PARTIES), Ask what the door cleared ⌘K (opens Ask Chapt
 *                with the web's question waiting)
 *   the one task the oldest party that happened with no figures, as a sealed envelope:
 *                Close it out (officers)
 *   takings      net this semester over closed parties, door / spent / avg roll / best
 *                night, and the night-by-night strip (a bar opens its party in the book)
 *   the book     every party, newest first; a row opens its drawer in place (the till
 *                receipt, notes, facts, who came, and Wrap up / Open in Timeline / Edit /
 *                Delete); a due row's "Wrap up →" opens the wrap-up straight away
 *
 * Writes are optimistic as on the web (a refusal puts the row back and says the web's
 * sentence). A party's door is Treasury's money too, so writes refresh the treasury, the
 * Timeline and home (~/data/parties). Once the server has a wrap-up, the night's receipt
 * feeds out of the till over the page (the signature moment, app-only).
 */
import type { Party, PartyRollRow } from "@/lib/api-types";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type ScrollViewInstance } from "react-native";
import { useCalendar, useEventTypes } from "~/data/calendar";
import { localDay } from "~/data/home";
import { createParty, deleteParty, editParties, patchParty, useParties, usePartyRolls, wrapUpParty } from "~/data/parties";
import { useRoster } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import type { TillSlip } from "~/moments/Till";
import { navLabel } from "~/more/model";
import { haptics } from "~/motion/haptics";
import { Book, Hero, TakingsCard, type BookActs } from "~/parties/bits";
import {
  PAGE, SAY, briefing, canManage, dow, fmt$, money, monDay, newestFirst, receiptNet, takings, waiting,
} from "~/parties/model";
import { DeleteParty, DoorMoment, PartyForm, WrapUp, type PartyFormBody, type WrapUpForm } from "~/parties/sheets";
import { Screen } from "~/shell/Screen";
import { ErrorState, SkeletonCard, SkeletonList } from "~/shell/states";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { EventSheet as TimelineSheet } from "~/timeline/EventSheet";
import { viewerOf } from "~/tasks/model";
import { TrBtn } from "~/treasury/bits";
import { PageBrief, type BriefPart } from "~/ui/PageBrief";
import { T } from "~/ui/T";

const TEMP = 1_000_000_000;

export default function Parties() {
  const { c } = useTheme();
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
  const [slip, setSlip] = useState<TillSlip | null>(null);
  const scroll = useRef<ScrollViewInstance | null>(null);
  const bookY = useRef(0);
  const rowY = useRef(new Map<number, number>());

  const all = q.data ?? null;
  const rolls = useMemo(() => new Map((rollsQ.data ?? []).map((r: PartyRollRow) => [r.partyId, r])), [rollsQ.data]);
  const byId = (id: number | null) => (id == null ? null : all?.find(p => p.id === id) ?? null);

  // The roll lists the roster in the web's order; the Timeline's sheet needs it too.
  const roster = useRoster(officer || tl != null);
  const people = roster.data ?? [];
  const rosterMap = useMemo(() => new Map((roster.data ?? []).map(b => [b.id, b])), [roster.data]);
  const cal = useCalendar();
  const types = useEventTypes();
  const tlEvent = tl == null ? null : cal.data?.find(e => e.id === tl) ?? null;

  const org = me?.org?.name ?? "ChaptOS";
  const sorted = useMemo(() => (all ? newestFirst(all) : []), [all]);
  const wait = useMemo(() => (all ? waiting(all, today) : []), [all, today]);
  const t = useMemo(() => takings(all ?? [], rolls.values()), [all, rolls]);

  const refused = (msg: string) => { haptics.error(); toast.error(msg); };

  /* ── writes (the web's handleAdd / handleEdit / handleWrapUp / handleDelete) ── */

  const add = (body: PartyFormBody) => {
    const tempId = TEMP + Date.now() % TEMP;
    const draft: Party = {
      id: tempId, name: body.name, date: body.date, schedule: body.schedule ?? null, partyType: body.partyType, theme: body.theme, collabOrg: body.collabOrg,
      doorRevenue: 0, attendance: 0, expenses: 0, notes: "", completed: false, completedAt: null, attendanceEventId: null, mandatory: false, time: null,
    };
    const undo = editParties(l => [...l, draft]);
    setForm(null);
    setOpen(tempId);
    createParty({ name: body.name, date: body.date, schedule: body.schedule, partyType: body.partyType, theme: body.theme, collabOrg: body.collabOrg })
      .then(saved => { editParties(l => l.filter(p => p.id !== tempId)); setOpen(o => (o === tempId ? saved.id : o)); haptics.success(); })
      .catch(() => { undo(); setOpen(o => (o === tempId ? null : o)); refused(SAY.addFailed); });
  };

  const edit = (party: Party, body: PartyFormBody) => {
    const undo = editParties(l => l.map(p => (p.id === party.id ? { ...p, ...body, schedule: body.schedule ?? p.schedule } : p)));
    setForm(null);
    patchParty(party.id, body)
      .then(() => haptics.success())
      .catch(() => { undo(); refused(SAY.editFailed); });
  };

  const wrapUp = (party: Party, f: WrapUpForm) => {
    if (party.id >= TEMP) { refused(SAY.stillSaving); return; }
    const door = money(f.doorRevenue), spent = money(f.expenses);
    const undo = editParties(l => l.map(p => (p.id === party.id ? { ...p, doorRevenue: door, expenses: spent, notes: f.notes, completed: true, completedAt: new Date().toISOString() } : p)));
    setWrap(null);
    wrapUpParty(party.id, {
      doorRevenue: door, expenses: spent, notes: f.notes,
      ...(f.attendedIds !== undefined ? { attendedIds: f.attendedIds, mandatory: !!f.mandatory } : {}),
    })
      .then(saved => {
        void rollsQ.refetch();
        const n = saved.doorRevenue - saved.expenses;
        // The till's own success haptic lands with the CLOSED OUT stamp.
        setSlip({ org, name: saved.name, when: `${dow(saved.date)} ${monDay(saved.date)}`, door: fmt$(saved.doorRevenue), spent: `−${fmt$(saved.expenses)}`, net: receiptNet(n), neg: n < 0 });
      })
      .catch(() => { undo(); refused(SAY.wrapFailed); });
  };

  const remove = (party: Party) => {
    setDel(null);
    if (open === party.id) setOpen(null);
    deleteParty(party.id)
      .then(() => haptics.success())
      .catch(() => refused(SAY.deleteFailed));
  };

  /* ── the book's hands ── */

  const acts = useMemo<BookActs>(() => ({
    onToggle: p => setOpen(id => (id === p.id ? null : p.id)),
    onWrap: p => setWrap(p.id),
    onEdit: p => setForm({ party: p }),
    onDelete: p => setDel(p.id),
    onTimeline: setTl,
    onRowY: (id, y) => { rowY.current.set(id, y); },
  }), []);
  const jumpTo = useCallback((id: number) => {
    setOpen(id);
    requestAnimationFrame(() => scroll.current?.scrollTo({ y: Math.max(0, bookY.current + (rowY.current.get(id) ?? 0) - 120), animated: true }));
  }, []);

  if (!me) return null;
  const title = navLabel(me, "Parties");
  const wrapParty = byId(wrap);
  const formParty = form?.party ?? null;

  let body: React.ReactNode;
  if (!all) {
    body = q.isError
      ? <ErrorState title="Couldn't load the ledger." error={q.error} onRetry={() => void q.refetch()} />
      : <><SkeletonCard height={150} /><SkeletonList count={5} /></>;
  } else {
    const hero = officer ? wait[0] ?? null : null;
    body = (
      <>
        {hero ? <Hero party={hero} more={wait.length - 1} org={org} today={today} onClose={() => setWrap(hero.id)} /> : null}
        {t.closed.length ? <TakingsCard t={t} onOpen={jumpTo} /> : null}
        <View style={styles.sec} accessibilityRole="header">
          <T v="heading">{PAGE.book}</T>
          <View style={[styles.rule, { borderColor: c.line2 }]} />
          <T v="mono" color={c.ink3} style={{ fontSize: 11.5 }}>{PAGE.count(sorted.length)}</T>
        </View>
        {!sorted.length ? (
          <View style={[styles.empty, { borderColor: c.line2, backgroundColor: c.card }]}>
            <T v="title">{PAGE.emptyT}<T v="title" color={c.pastel.rose.ink}>.</T></T>
            <T v="body" color={c.ink2}>{officer ? PAGE.emptyOfficer : PAGE.emptyMember}</T>
            {officer ? <View style={{ alignSelf: "flex-start" }}><TrBtn label={PAGE.add} icon="plus" onPress={() => setForm({ party: null })} /></View> : null}
            <View style={[styles.blank, { borderTopColor: c.line2 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {PAGE.cols.map(k => <T key={k} v="kicker" color={c.ink3} style={{ fontSize: 9 }}>{k}</T>)}
            </View>
          </View>
        ) : (
          <View onLayout={e => { bookY.current = e.nativeEvent.layout.y; }}>
            <Book parties={sorted} today={today} officer={officer} org={org} openId={open} rolls={rolls} acts={acts} />
          </View>
        )}
      </>
    );
  }

  const b = all ? briefing(t.closed.length, t.net, wait.length) : null;
  const sub: BriefPart[] | null = b ? [{ text: b.lead }, ...(b.strong ? [{ text: b.strong, bold: true }] : []), { text: b.rest }] : null;

  return (
    <Screen title={title} back="More" scrollRef={scroll} onRefresh={() => Promise.all([q.refetch(), rollsQ.refetch()])}>
      <View style={{ gap: 18 }}>
        <PageBrief pill={`${dow(today)} · ${monDay(today)}`} kicker={PAGE.kicker(org)} kickerSep={false}
          lead={PAGE.title[0]} mark={PAGE.title[1]} tail={PAGE.title[2]} markTone="rose" sub={sub} />
        <View style={styles.actions}>
          {officer ? <TrBtn label={PAGE.add} icon="plus" onPress={() => setForm({ party: null })} /> : null}
          <TrBtn kind="ask" label={PAGE.ask} icon="spark" kbd="⌘K" hint="Opens Ask Chapt with the question ready to send"
            onPress={() => router.push({ pathname: "/ask", params: { q: PAGE.askQ } })} />
        </View>
        {body}
      </View>
      {officer ? (
        <>
          <PartyForm open={!!form} party={formParty} onClose={() => setForm(null)} onSave={bd => (formParty ? edit(formParty, bd) : add(bd))} />
          <WrapUp party={wrapParty} people={people} rolled={wrap != null && rolls.has(wrap)} onClose={() => setWrap(null)} onSubmit={wrapUp} />
          <DeleteParty party={byId(del)} onClose={() => setDel(null)} onConfirm={remove} />
        </>
      ) : null}
      <DoorMoment slip={slip} onDone={() => setSlip(null)} />
      <TimelineSheet event={tlEvent} task={null} types={types.data} viewer={viewerOf(me)} today={today} roster={rosterMap} onClose={() => setTl(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sec: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 },
  rule: { flex: 1, borderTopWidth: 1.5, borderStyle: "dashed", transform: [{ translateY: -4 }] },
  empty: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16, padding: 18, gap: 12 },
  blank: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderStyle: "dashed", paddingTop: 10 },
});
