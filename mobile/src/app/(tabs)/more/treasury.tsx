/**
 * Treasury (the web's app/org/[slug]/treasury/page.tsx), reached from More, in the web
 * phone's order, every figure from the shared rules in @/lib/treasury/ledger:
 *
 *   brief     THU · NOV 19 · TREASURY · FA26, "The ledger.", the digest (or "No entries")
 *   actions   Log money (MANAGE_TREASURY) · Request reimbursement · Ask about the books
 *   gates     books never opened: a member gets the lock + their own requests, a treasurer
 *             the one question (TreasuryOpenBooks)
 *   tabs      Overview · Transactions · Dues (when dues are tracked) · Reimbursements (badge)
 *             · Reports, then the term pills, Export CSV (treasury) and Add Party Event
 *   Overview  first-entry banner, the balance, the breakdown, Dues, Coming up, the term so
 *             far, Recent entries, At the door
 *
 * Reads GET /api/treasury, /api/transactions, /api/parties, /api/treasury/categories,
 * /api/reimbursements, /api/semesters, /api/dues?semester=, /api/brothers, /api/calendar.
 * Sheets sit in slots, so opening one doesn't re-render the page.
 */
import type { Reimbursement, Transaction } from "@/lib/api-types";
import {
  booksOf, booksState, breakdownOf, catalogOf, categoryOptions, chartEntries, chartWindow, comingUp, dateLabelOf, digestOf,
  duesRollup, statementOf, tabRows, tabTotal, termOnScreen, termsOf, withRunning, type LedgerParty, type TxTab,
} from "@/lib/treasury/ledger";
import { toPeople, type DuesFilter } from "@/lib/treasury/dues";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { config } from "~/config";
import { useCalendar } from "~/data/calendar";
import { localDay } from "~/data/home";
import {
  exportCsv, keepsBooks, patchTransaction, useCategories, useReimbursements, useSemesters, useTermDues, useTransactions, useTreasury,
} from "~/data/money";
import { useParties } from "~/data/parties";
import { useRoster } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon, type IconName } from "~/icons/Icon";
import { trackedOf, vocab } from "~/members/model";
import { AttachSheet, RequestSheet } from "~/money/RequestSheet";
import { navLabel, plural } from "~/more/model";
import { haptics } from "~/motion/haptics";
import { Screen } from "~/shell/Screen";
import { SlotView, useSlot } from "~/shell/slot";
import { EmptyState, ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { toast } from "~/shell/toast";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { PageBrief, type BriefPart } from "~/ui/PageBrief";
import { T } from "~/ui/T";
import { TrBtn } from "~/treasury/bits";
import { DuesQuickCard } from "~/treasury/dues/QuickCard";
import { DuesTab, type DuesJump } from "~/treasury/dues/DuesTab";
import { Locked, OpenBooks } from "~/treasury/Gates";
import { AtTheDoor, BalanceCard, BreakdownCard, ComingUp, FirstEntry, LogCard, ReportGrid, SoFar, Statement, type LogEnv } from "~/treasury/Overview";
import { ReimbursementsView, type ReimbEnv } from "~/treasury/Reimbursements";
import { DeleteConfirm, LedgerTxForm, PartyForm, type Doomed, type PartyLike } from "~/treasury/Sheets";

type NavTab = "Overview" | "Transactions" | "Dues" | "Reports" | "Reimbursements";
const TAB_ICON: Record<NavTab, IconName> = { Overview: "home", Transactions: "receipt", Dues: "jar", Reports: "bars", Reimbursements: "hand" };
const TAB_TONE: Record<NavTab, Tone> = { Overview: "mint", Transactions: "sky", Dues: "mint", Reports: "butter", Reimbursements: "peach" };
// The web's CSS gives Reports `order: 1`, so it stands after the others.
const TAB_ORDER: NavTab[] = ["Overview", "Transactions", "Dues", "Reimbursements", "Reports"];
const EMPTY: never[] = [];

export default function TreasuryPage() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const me = entry?.me ?? null;
  const allowed = !!me?.org?.enabledWorkflows.includes("finance");
  const canTreasury = !!me && keepsBooks(me);
  const duesOn = !!me && trackedOf(me.org?.disabledFeatures).duesOwed;

  const treasury = useTreasury(allowed);
  const txq = useTransactions(allowed);
  const partyq = useParties(allowed);
  const catq = useCategories(allowed);
  const reimbq = useReimbursements(allowed);
  const semq = useSemesters(allowed);
  const roster = useRoster(allowed);
  const cal = useCalendar();

  const [navTab, setNavTab] = useState<NavTab>("Overview");
  const [picked, setPicked] = useState<string | null>(null);
  const [range, setRange] = useState<"2w" | "1m" | "term">("term");
  const [donut, setDonut] = useState<"income" | "expense">("income");
  const [txTab, setTxTab] = useState<TxTab>("all");
  const [txCat, setTxCat] = useState("all");
  const [txSearch, setTxSearch] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [duesJump, setDuesJump] = useState<DuesJump | null>(null);
  const txForm = useSlot<Transaction | "new">();
  const partyForm = useSlot<PartyLike | "new">();
  const doomed = useSlot<Doomed>();
  const request = useSlot<true>();
  const attach = useSlot<Reimbursement>();

  const transactions = txq.data ?? EMPTY;
  const parties = (partyq.data ?? EMPTY) as LedgerParty[];
  const termRows = semq.data ?? EMPTY;
  const reimbursements = reimbq.data ?? EMPTY;
  const rosterList = roster.data ?? EMPTY;
  const catalog = useMemo(() => catalogOf(catq.data ?? EMPTY), [catq.data]);
  const activeLabel = termRows.find(t => t.isActive)?.label ?? me?.org?.activeTerm?.label ?? null;
  const today = localDay();
  const opening = treasury.data?.openingBalance ?? null;

  const terms = useMemo(() => termsOf(transactions, termRows, activeLabel), [transactions, termRows, activeLabel]);
  const term = termOnScreen(picked, activeLabel, terms);
  const termRow = termRows.find(r => r.label === term) ?? null;
  const books = useMemo(() => booksOf({ transactions, parties, termRows, term, openingBalance: opening }), [transactions, parties, termRows, term, opening]);
  const loaded = !!treasury.data && !!txq.data && !!partyq.data;
  const { booksUnopened, statedUnstarted } = booksState({ loaded, openingBalance: treasury.data?.openingBalance, transactions, parties, books });
  const dues = useTermDues(termRow ? termRow.label : null, allowed && duesOn);
  const board = dues.data ?? null;
  const people = useMemo(() => toPeople(rosterList), [rosterList]);
  const duesErr = dues.error && !board ? errorMessage(dues.error, "Couldn't load dues. Try again in a moment.") : null;

  // Memoized so logRows below only recomputes the running balance when the rows change,
  // not on every keystroke, scrub frame or sheet toggle.
  const visible = useMemo(() => tabRows(books, txTab, txCat), [books, txTab, txCat]);
  const logRows = useMemo(() => withRunning(books.activeTxns, visible, txSearch), [books.activeTxns, visible, txSearch]);
  const catOptions = useMemo(() => categoryOptions(txTab, catalog, tabRows(books, txTab, "all")), [txTab, catalog, books]);
  const ppCats = useMemo(() => breakdownOf(books, donut, catalog), [books, donut, catalog]);
  const chart = useMemo(() => {
    const e = chartEntries(books, catalog);
    const w = chartWindow(termRow, today, e.posted);
    return { opening: opening ?? 0, posted: e.posted, scheduled: e.scheduled, termStart: w.termStart, asOf: w.asOf, isToday: w.asOf === today };
  }, [books, catalog, termRow, today, opening]);
  const up = useMemo(() => comingUp({ transactions, parties, charges: duesOn ? board?.charges ?? [] : [], today, chargesToday: board?.today }),
    [transactions, parties, duesOn, board, today]);
  const duesRoll = duesRollup(rosterList, board?.members.filter(m => m.standing === "overdue") ?? []);
  const pendingCount = reimbursements.filter(r => r.status === "pending").length;
  const duesOwing = board?.members.filter(m => m.standing === "overdue" || m.standing === "due").length ?? 0;

  const goDues = useCallback((filter: DuesFilter | null, memberId: number | null = null, sheet = false) => {
    setDuesJump({ filter, memberId, sheet, at: Date.now() });
    setNavTab("Dues");
  }, []);
  const logEnv: LogEnv = useMemo(() => ({
    catalog, canTreasury, duesOn, duesWord: me ? vocab(me, "Dues") : "Dues",
    onMarkPaid: t => void markPaid(t), onEdit: t => txForm.set(t), onDelete: t => doomed.set({ kind: "tx", tx: t }),
    onSeeDues: id => goDues(null, id),
  }), [catalog, canTreasury, duesOn, me, txForm, doomed, goDues]);
  const reimbEnv: ReimbEnv = useMemo(() => ({ canTreasury, selfId: me?.id ?? null, balance: books.balance, catalog, onAttach: r => attach.set(r) }),
    [canTreasury, me, books.balance, catalog, attach]);

  if (!entry || !me) return null;
  const title = navLabel(me, "Treasury");
  if (!allowed) {
    return (
      <Screen title={title} back="More">
        <EmptyState title="This chapter keeps its books elsewhere." line="The treasury is switched off for this chapter." />
      </Screen>
    );
  }

  const v = (k: string) => vocab(me, k);
  const memberWord = (pl: boolean) => (pl ? plural(v("Member")) : v("Member"));
  const refresh = () => Promise.all([treasury.refetch(), txq.refetch(), partyq.refetch(), reimbq.refetch(), semq.refetch(), dues.refetch(), roster.refetch()]);
  const lockedForMember = booksUnopened && !canTreasury;
  const openingForOfficer = booksUnopened && canTreasury;
  const tabs = TAB_ORDER.filter(t => t !== "Dues" || duesOn);
  const tab = !duesOn && navTab === "Dues" ? "Overview" : navTab;

  const dg = digestOf({ books, openingBalance: opening, duesOn, dues: duesRoll, pending: reimbursements.filter(r => r.status === "pending"), canTreasury, upcomingTxns: up.txns, memberWord, duesWord: v("Dues") });
  const digest: BriefPart[] = [{ text: dg.balance, bold: true }, { text: ` in the account${dg.moved}.` }];
  const duesParts: BriefPart[] = !dg.dues ? [] : dg.dues.kind === "owe"
    ? [{ text: dg.dues.who, bold: true }, { text: ` still ${dg.dues.verb} ` }, { text: dg.dues.amount, bold: true }, { text: ` in ${dg.dues.word}` },
      ...(dg.dues.overdue ? [{ text: ", " }, { text: dg.dues.overdue, bold: true }] : [])]
    : [{ text: dg.dues.text }];
  const reimbParts: BriefPart[] = dg.reimb ? [{ text: dg.reimb.bold, bold: true }, { text: ` ${dg.reimb.rest} waiting on you` }] : [];
  if (duesParts.length || reimbParts.length) digest.push({ text: " " }, ...duesParts, ...(duesParts.length && reimbParts.length ? [{ text: ", and " }] : []), ...reimbParts, { text: "." });
  if (dg.nextOut) digest.push({ text: " Next out: " }, { text: dg.nextOut.what, bold: true }, { text: ` on ${dg.nextOut.on}.` });

  async function markPaid(t: Transaction) {
    try { await patchTransaction(t.id, { status: "posted" }); haptics.success(); }
    catch (e) { haptics.error(); toast.error("Failed to mark transaction as paid.", { detail: errorMessage(e) }); }
  }
  const onExport = async () => {
    try { await Share.share({ message: await exportCsv(term || null), title: `${term || "Treasury"} transactions` }); }
    catch (e) { haptics.error(); toast.error("Couldn't export the ledger", { detail: errorMessage(e) }); }
  };
  const editCategories = () => void WebBrowser.openBrowserAsync(`${config.apiUrl}/org/${me.org!.slug}/settings?section=money-categories`);
  const toLog = (t: TxTab, cat = "all") => { setNavTab("Transactions"); setTxTab(t); setTxCat(cat); setTxSearch(""); };
  const log = () => txForm.set("new");
  const addParty = () => partyForm.set("new");

  const pill = dateLabelOf(new Date());
  const kicker = `${v("Treasury")}${!booksUnopened && term ? `  ·  ${term}` : ""}`;

  let body: React.ReactNode;
  if (lockedForMember) {
    body = <>
      <Locked treasuryWord={v("Treasury")} />
      <ReimbursementsView list={reimbursements} env={{ ...reimbEnv, canTreasury: false }} showArchived={showResolved} onToggleArchived={() => setShowResolved(s => !s)} onRequest={() => request.set(true)} />
    </>;
  } else if (openingForOfficer) {
    body = <OpenBooks />;
  } else {
    body = <>
      <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        <View style={[styles.rule, { backgroundColor: c.ink }]} />
        {tabs.map(t => {
          const on = t === tab;
          const label = t === "Dues" ? v("Dues") : t;
          return (
            <Pressable key={t} onPress={() => { setNavTab(t); if (t === "Dues") setDuesJump(null); }} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={[styles.tab, on ? [styles.tabOn, { backgroundColor: c.paper, borderColor: c.ink }] : { backgroundColor: c.paper2, borderColor: c.line2 }]}>
              <View style={[styles.tabLip, { backgroundColor: c.pastel[TAB_TONE[t]].fill }]} />
              <Icon name={TAB_ICON[t]} size={15} color={on ? c.ink : c.ink3} />
              <T v="button" size={14} color={on ? c.ink : c.ink3}>{label}</T>
              {t === "Reimbursements" && pendingCount > 0 ? <Badge n={pendingCount > 9 ? "9+" : String(pendingCount)} label={`${pendingCount} requests awaiting review`} /> : null}
              {t === "Dues" && board ? (board.charges.length === 0
                ? <T v="kicker" size={9.5} color={c.pastel.mint.ink}>NEW</T>
                : duesOwing > 0 ? <Badge n={duesOwing > 99 ? "99+" : String(duesOwing)} label={`${duesOwing} members owe`} /> : null) : null}
              {t === "Transactions" && books.activeTxns.length > 0 ? <T v="mono" size={11} color={c.ink3}>{books.activeTxns.length}</T> : null}
            </Pressable>
          );
        })}
        <View style={styles.tools}>
          {terms.length > 1 ? terms.map(s => (
            <Pressable key={s} onPress={() => setPicked(s)} accessibilityRole="button" accessibilityState={{ selected: term === s }}
              style={[styles.sem, term === s ? { backgroundColor: c.ink, borderColor: c.ink } : { backgroundColor: c.card, borderColor: c.line2 }]}>
              <T v="mono" size={11} style={{ fontFamily: "PlexMono-600" }} color={term === s ? c.paper : c.ink3}>{s}</T>
            </Pressable>
          )) : null}
          {canTreasury ? <IconBtn icon="upload" label="Export CSV" onPress={() => void onExport()} /> : null}
          <IconBtn icon="ticket" label="Add Party Event" onPress={addParty} />
        </View>
      </ScrollView>

      {!loaded && (treasury.isError || txq.isError || partyq.isError) ? (
        <ErrorState title="Couldn't load the treasury." error={treasury.error ?? txq.error ?? partyq.error} onRetry={() => void refresh()} />
      ) : !loaded ? (
        <View style={{ gap: 18, marginTop: 24 }}><SkeletonCard height={360} /><SkeletonCard height={360} /><SkeletonCard height={420} /></View>
      ) : (
        <View>
          {statedUnstarted && tab === "Overview" ? <FirstEntry canTreasury={canTreasury} duesWord={v("Dues")} treasuryWord={v("Treasury")} onLog={log} /> : null}
          {tab === "Overview" ? (
            <View style={{ marginTop: 24, gap: 22 }}>
              <BalanceCard books={books} unstarted={statedUnstarted} range={range} onRange={setRange} chart={chart} onScheduled={() => toLog("expense")} />
              <BreakdownCard mode={donut} onMode={setDonut} rows={ppCats} catalog={catalog} unstarted={statedUnstarted} canTreasury={canTreasury}
                onPick={slug => toLog(donut, slug)} onEditCategories={editCategories} />
              {duesOn ? <DuesQuickCard board={board} error={duesErr} people={people} duesWord={v("Dues")} canTreasury={canTreasury}
                onGo={(f, m) => goDues(f, m ?? null)} onHandOut={() => goDues(null, null, true)} /> : null}
              <ComingUp dues={up.dues} parties={up.parties} txns={up.txns} catalog={catalog} duesWord={v("Dues")} canTreasury={canTreasury}
                onDues={() => goDues("due")} onSchedule={log} onAddParty={addParty} />
              <SoFar term={term} books={books} unstarted={statedUnstarted} partyCount={parties.length} canTreasury={canTreasury} onExport={() => void onExport()} />
            </View>
          ) : null}
          {tab === "Overview" || tab === "Transactions" ? (
            <LogCard rows={logRows} anyInTerm={books.activeTxns.length > 0} tab={txTab} onTab={t => { setTxTab(t); setTxCat("all"); setTxSearch(""); }}
              category={txCat} onCategory={setTxCat} categories={catOptions} search={txSearch} onSearch={setTxSearch}
              total={tabTotal(books, txTab)} unstarted={statedUnstarted} term={term} env={logEnv} onLog={log}
              onClear={() => { setTxTab("all"); setTxCat("all"); setTxSearch(""); }} />
          ) : null}
          {tab === "Overview" ? (
            <AtTheDoor parties={parties} today={today} canTreasury={canTreasury} onOpen={p => partyForm.set(p as PartyLike)}
              onDelete={p => doomed.set({ kind: "party", party: p as PartyLike })} onAdd={addParty} />
          ) : null}
          {tab === "Reports" ? <>
            <Statement term={term} treasuryWord={v("Treasury")} asOf={pill} books={books} unstarted={statedUnstarted} canTreasury={canTreasury} onExport={() => void onExport()}
              ins={statementOf(books.incomeTxns, "income", catalog)} outs={statementOf(books.expenseTxns, "expense", catalog)} />
            <ReportGrid books={books} />
          </> : null}
          {tab === "Dues" && duesOn ? (
            <DuesTab board={board} error={duesErr} loading={dues.isLoading} roster={rosterList} selfId={me.id} canTreasury={canTreasury}
              duesWord={v("Dues")} jump={duesJump} />
          ) : null}
          {tab === "Reimbursements" ? (
            <ReimbursementsView list={reimbursements} env={reimbEnv} showArchived={showResolved} onToggleArchived={() => setShowResolved(s => !s)} onRequest={() => request.set(true)} />
          ) : null}
        </View>
      )}
    </>;
  }

  return (
    <Screen title={title} back="More" onRefresh={refresh}>
      {treasury.data ? <StaleNote updatedAt={treasury.dataUpdatedAt} failed={treasury.isError || txq.isError} onRetry={() => void refresh()} /> : null}
      <PageBrief pill={pill} kicker={kicker} kickerSep={false} lead="The " mark="ledger" markTone="mint"
        digest={loaded && !booksUnopened && !statedUnstarted ? digest : null} />
      {statedUnstarted ? (
        <View style={styles.noEntries}>
          <View style={[styles.stateChip, { borderColor: c.line2, backgroundColor: c.paper2 }]}><T v="label" size={10.5} ls={0.07} color={c.ink3}>No entries</T></View>
          <T v="body" size={15.2} lh={1.5} color={c.ink2} style={{ flex: 1 }}>
            Books opened at {`$${Math.round(books.balance).toLocaleString("en-US")}`}. Nothing has moved yet{canTreasury ? " — the first transaction you log starts the line." : "."}
          </T>
        </View>
      ) : null}
      {!booksUnopened ? (
        <View style={styles.acts}>
          {canTreasury ? <TrBtn label="Log money" icon="plus" onPress={log} /> : null}
          <TrBtn kind="card" tone="peach" label="Request reimbursement" icon="receipt" onPress={() => request.set(true)} />
          <TrBtn kind="ask" label="Ask about the books" icon="spark" hint="Opens Ask Chapt"
            onPress={() => router.push({ pathname: "/ask", params: { q: "How are the books looking this term?" } })} />
        </View>
      ) : null}
      {body}

      {canTreasury ? <SlotView slot={txForm}>{(x, close) => (
        <LedgerTxForm open={x != null} tx={x === "new" || x == null ? null : x} catalog={catalog} terms={termRows} activeTerm={activeLabel} events={cal.data ?? []} onClose={close} />
      )}</SlotView> : null}
      <SlotView slot={partyForm}>{(p, close) => <PartyForm open={p != null} party={p === "new" || p == null ? null : p} onClose={close} />}</SlotView>
      <SlotView slot={doomed}>{(d, close) => <DeleteConfirm doomed={d} onClose={close} />}</SlotView>
      <SlotView slot={request}>{(o, close) => <RequestSheet open={!!o} onClose={close} meId={me.id} categories={catq.data ?? []} />}</SlotView>
      <SlotView slot={attach}>{(r, close) => <AttachSheet r={r} onClose={close} />}</SlotView>
    </Screen>
  );
}

function Badge({ n, label }: { n: string; label: string }) {
  const { c } = useTheme();
  return (
    <View accessibilityLabel={label} style={[styles.badge, { backgroundColor: c.note.fill.peach, borderColor: c.note.ink }]}>
      <T v="pill" size={10.5} color={c.note.ink}>{n}</T>
    </View>
  );
}

function IconBtn({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.iconBtn, { borderColor: pressed ? c.ink : c.line2, backgroundColor: c.card }]}>
      <Icon name={icon} size={15} color={c.ink2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  noEntries: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 14 },
  stateChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, marginTop: 4 },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 },
  tabsScroll: { marginTop: 30 },
  tabs: { alignItems: "flex-end", gap: 6, paddingLeft: 6, paddingRight: 6, position: "relative" },
  rule: { position: "absolute", left: 0, right: 0, bottom: 0, height: 1.5 },
  tab: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 1.5, paddingTop: 10, paddingBottom: 9, paddingHorizontal: 16, borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 13, borderTopRightRadius: 13 },
  tabOn: { marginBottom: 0, paddingTop: 12, paddingBottom: 12.5, paddingHorizontal: 18, zIndex: 1 },
  tabLip: { position: "absolute", left: 12, right: 12, top: -1.5, height: 4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, opacity: 0.9 },
  badge: { minWidth: 19, height: 19, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tools: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingBottom: 6, alignSelf: "center" },
  sem: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
