/**
 * Treasury's cards, in the web phone's order (app/org/[slug]/treasury/page.tsx, one column
 * under 820px), every figure from @/lib/treasury/ledger:
 *
 *   FirstEntry   books open, nothing moved: "Log your first transaction" / "Nothing logged yet"
 *   BalanceCard  IN THE ACCOUNT, 2W/1M/Term, the step line, money in vs out as one bar
 *   BreakdownCard "Where it came from" / "Where it went", In/Out, the ring, the Edit door
 *   ComingUp     dues still collecting, parties, dated entries; or "Nothing on the calendar."
 *   SoFar        "{term} so far": the statement lines, Export CSV
 *   LogCard      "Recent entries": All/Income/Expense, category, search, total; the ruled
 *                table (it scrolls sideways on a phone, as on the web)
 *   AtTheDoor    parties as ticket stubs
 *   Statement / ReportGrid  the Reports tab
 */
import type { Transaction } from "@/lib/api-types";
import {
  fmt$, fmtDate, ppDay, round2, type Books, type Catalog, type CatRow, type ChartEntry, type LedgerParty, type TxTab, type UpcomingCharge,
} from "@/lib/treasury/ledger";
import { memo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Icon } from "~/icons/Icon";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { Calm, DateBlock, Leader, PillToggle, SecNote, TrBtn, TrCard } from "./bits";
import { BalanceChart, Breakdown } from "./charts";
import { pressedDim } from "~/motion/press";

export function FirstEntry({ canTreasury, duesWord, treasuryWord, onLog }: { canTreasury: boolean; duesWord: string; treasuryWord: string; onLog: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.first, { borderColor: c.pastel.mint.ink, backgroundColor: c.pastel.mint.soft }]}>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
        <View style={[styles.glyph, { backgroundColor: c.note.fill.mint, borderColor: c.note.ink }]}><Icon name="plus" size={20} color={c.note.ink} /></View>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="subhead" size={17}>{canTreasury ? "Log your first transaction" : "Nothing logged yet"}</T>
          <T v="body" size={14} color={c.ink2}>
            {canTreasury
              ? `${duesWord} collected, a venue deposit, a fundraiser payout — anything that has already moved this term. Two or three entries is enough for the charts and the breakdown to become useful.`
              : `The books are open, but no money has been recorded yet. Once your ${treasuryWord.toLowerCase()} officer logs the first transaction, the charts and breakdown below fill in.`}
          </T>
        </View>
      </View>
      {canTreasury ? <View style={{ marginTop: 12 }}><TrBtn label="Log money" icon="plus" onPress={onLog} /></View> : null}
    </View>
  );
}

/* ── Balance ─────────────────────────────────────────────────────────────────── */

export function BalanceCard({ books, unstarted, range, onRange, chart, onScheduled }: {
  books: Books; unstarted: boolean; range: "2w" | "1m" | "term"; onRange: (r: "2w" | "1m" | "term") => void;
  chart: { opening: number; posted: ChartEntry[]; scheduled: ChartEntry[]; termStart: string; asOf: string; isToday: boolean };
  onScheduled: () => void;
}) {
  const { c } = useTheme();
  const { balance, totalIncome, totalExpenses, incomeTxns, expenseTxns } = books;
  const sum = totalIncome + totalExpenses;
  return (
    <View style={[styles.bal, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.mint.fill, 5)]}>
      <View style={styles.balTop}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <View style={styles.balLabel}>
            <Icon name="wallet" size={15} color={c.pastel.mint.ink} />
            <T v="label" size={10.5} color={c.ink3}>In the account</T>
          </View>
          <T v="figure" size={46} ls={-0.05} lh={0.98} color={balance < 0 ? c.pastel.peach.ink : c.ink} style={{ marginTop: 6 }}>{fmt$(Math.round(balance))}</T>
        </View>
        {!unstarted ? <PillToggle label="Chart range" mono value={range} onChange={onRange} options={[["2w", "2W"], ["1m", "1M"], ["term", "Term"]] as const} /> : null}
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <BalanceChart {...chart} range={range} ghost={unstarted} onScheduled={onScheduled} />
      </View>
      {unstarted || sum > 0 ? (
        <View style={[styles.io, { borderTopColor: c.line2 }]}>
          <View style={styles.ioRow}>
            <View style={styles.ioS}>
              <View style={[styles.ioDot, { backgroundColor: c.pastel.mint.ink }]} />
              <T v="meta" size={12.5} color={c.ink3}>Money in</T>
              {!unstarted && incomeTxns.length ? <T v="title" size={20} ls={-0.03}>{fmt$(Math.round(totalIncome))}</T> : <T v="title" size={20} color={c.ink3}>—</T>}
            </View>
            <View style={[styles.ioS, { justifyContent: "flex-end" }]}>
              <T v="meta" size={12.5} color={c.ink3}>Money out</T>
              {!unstarted && expenseTxns.length ? <T v="title" size={20} ls={-0.03}>{fmt$(Math.round(totalExpenses))}</T> : <T v="title" size={20} color={c.ink3}>—</T>}
              <View style={[styles.ioDot, { backgroundColor: c.pastel.peach.fill }]} />
            </View>
          </View>
          {unstarted ? <View style={[styles.ioBar, { borderWidth: 1.5, borderStyle: "dashed", borderColor: c.line2 }]} /> : (
            <View style={[styles.ioBar, { backgroundColor: c.paper3 }]}>
              <View style={{ width: `${(totalIncome / sum) * 100}%`, backgroundColor: c.pastel.mint.ink }} />
              <View style={{ width: `${(totalExpenses / sum) * 100}%`, backgroundColor: c.pastel.peach.fill }} />
            </View>
          )}
          <View style={styles.ioRow}>
            <T v="mono" size={11} color={c.ink3}>{!unstarted && incomeTxns.length ? `${incomeTxns.length} ${incomeTxns.length === 1 ? "deposit" : "deposits"}` : "nothing in yet"}</T>
            <T v="mono" size={11} color={c.ink3}>{!unstarted && expenseTxns.length ? `${expenseTxns.length} ${expenseTxns.length === 1 ? "payment" : "payments"}` : "nothing out yet"}</T>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function BreakdownCard({ mode, onMode, rows, catalog, unstarted, canTreasury, onPick, onEditCategories }: {
  mode: "income" | "expense"; onMode: (m: "income" | "expense") => void; rows: CatRow[]; catalog: Catalog; unstarted: boolean;
  canTreasury: boolean; onPick: (slug: string) => void; onEditCategories: () => void;
}) {
  const { c } = useTheme();
  return (
    <TrCard icon="bars" tone={mode === "income" ? "mint" : "peach"} title={mode === "income" ? "Where it came from" : "Where it went"}
      right={<PillToggle label="Money in or out" value={mode} onChange={onMode} options={[["income", "In"], ["expense", "Out"]] as const} />}>
      <Breakdown kind={mode} rows={rows} ghost={unstarted} onPick={onPick}
        ready={catalog.options(mode).map(x => ({ slug: x.slug, label: x.label, color: catalog.colorFor(mode, x.slug) }))} />
      {canTreasury ? (
        <View style={[styles.cardF, { borderTopColor: c.line, backgroundColor: c.paper2 }]}>
          <Icon name="folder" size={14} color={c.ink3} />
          <T v="meta" size={12.5} color={c.ink3} style={{ flex: 1 }}>Categories are yours to name</T>
          <Pressable onPress={onEditCategories} accessibilityRole="link" hitSlop={8} style={({ pressed }) => [styles.edit, pressed && pressedDim]}>
            <T v="buttonSm" size={12.5} color={c.ink2}>Edit</T><Icon name="arrow-r" size={13} color={c.ink2} />
          </Pressable>
        </View>
      ) : null}
    </TrCard>
  );
}

/* ── Coming up ───────────────────────────────────────────────────────────────── */

export function ComingUp({ dues, parties, txns, catalog, duesWord, canTreasury, onDues, onSchedule, onAddParty }: {
  dues: UpcomingCharge[]; parties: LedgerParty[]; txns: Transaction[]; catalog: Catalog; duesWord: string; canTreasury: boolean;
  onDues: () => void; onSchedule: () => void; onAddParty: () => void;
}) {
  const { c } = useTheme();
  const none = !dues.length && !parties.length && !txns.length;
  return (
    <TrCard icon="clock" tone="sky" title="Coming up" note="Events & txns">
      {none ? (
        <Calm icon="cal" tone="sky" title="Nothing on the calendar." actions={<>
          {canTreasury ? <TrBtn small label="Schedule a payment" icon="clock" tone="mint" onPress={onSchedule} /> : null}
          <TrBtn small kind="ghost" label="Add a party" icon="plus" onPress={onAddParty} />
        </>}>
          Payments you schedule and parties coming up land here, with their dates.
        </Calm>
      ) : (
        <View style={{ paddingHorizontal: 10, paddingTop: 4, paddingBottom: 10 }}>
          {dues.map(ch => {
            const d = ppDay(ch.dueDate!), left = ch.people - ch.paidPeople;
            return (
              <Pressable key={`d${ch.id}`} onPress={onDues} accessibilityRole="button" style={({ pressed }) => [styles.ev, pressed && { backgroundColor: c.paper2 }]}>
                <DateBlock {...d} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T v="bodyStrong" size={14} lh={1.25}>{ch.name} due</T>
                  <T v="meta" size={12} color={c.ink3}><T v="pill" size={11} color={c.pastel.butter.ink}>{duesWord}  </T>{left} {left === 1 ? "person still owes" : "people still owe"}</T>
                </View>
                <T v="mono" size={13} style={{ fontFamily: "PlexMono-600" }} color={c.pastel.butter.ink}>{fmt$(ch.outstanding)} out</T>
              </Pressable>
            );
          })}
          {parties.map(p => (
            <View key={`p${p.id}`} style={styles.ev}>
              <DateBlock {...ppDay(p.date)} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="bodyStrong" size={14} lh={1.25}>{p.name}</T>
                <T v="meta" size={12} color={c.ink3}>{fmtDate(p.date)} · Party event</T>
              </View>
              <T v="mono" size={13} style={{ fontFamily: "PlexMono-600" }} color={c.pastel.peach.ink}>{fmt$(p.doorRevenue)}</T>
            </View>
          ))}
          {txns.map(t => (
            <View key={`t${t.id}`} style={styles.ev}>
              <DateBlock {...ppDay(t.date)} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="bodyStrong" size={14} lh={1.25}>{t.description || catalog.labelFor(t.type, t.category)}</T>
                <T v="meta" size={12} color={c.ink3}>{fmtDate(t.date)}</T>
              </View>
              {t.status === "scheduled" ? <View style={[styles.tag, { backgroundColor: c.pastel.peach.soft, borderColor: c.pastel.peach.border }]}><T v="pill" size={11} color={c.pastel.peach.ink}>Scheduled</T></View> : null}
              <T v="mono" size={13} style={{ fontFamily: "PlexMono-600" }} color={t.type === "income" ? c.pastel.mint.ink : c.pastel.peach.ink}>{t.type === "income" ? "+" : "−"}{fmt$(t.amount)}</T>
            </View>
          ))}
        </View>
      )}
    </TrCard>
  );
}

/* ── {term} so far ───────────────────────────────────────────────────────────── */

export function SoFar({ term, books, unstarted, partyCount, canTreasury, onExport }: {
  term: string; books: Books; unstarted: boolean; partyCount: number; canTreasury: boolean; onExport: () => void;
}) {
  const { c } = useTheme();
  const un = (s: string) => (unstarted ? "—" : s);
  return (
    <TrCard icon="sheet" tone="lilac" title={`${term} so far`} note={term}>
      <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 16 }}>
        <Leader k="Total Income" v={un(fmt$(Math.round(books.totalIncome)))} color={unstarted ? c.ink3 : c.pastel.mint.ink} />
        <Leader k="Total Expenses" v={un(fmt$(Math.round(books.totalExpenses)))} color={unstarted ? c.ink3 : c.pastel.peach.ink} />
        <Leader k="Door Revenue" v={un(fmt$(Math.round(books.totalDoorRev)))} color={unstarted ? c.ink3 : c.pastel.peach.ink} />
        <Leader total k={unstarted ? "Opening Balance" : "Net Balance"} v={fmt$(Math.round(books.balance))} color={books.balance < 0 ? c.pastel.peach.ink : undefined} />
        <Leader k="Projected" v={un(fmt$(Math.round(books.projected)))} color={unstarted ? c.ink3 : undefined} />
        <Leader k="Party Events" v={partyCount ? String(partyCount) : "—"} color={partyCount ? undefined : c.ink3} />
        {canTreasury ? <View style={{ marginTop: 12 }}><TrBtn kind="ghost" label="Export CSV" icon="upload" onPress={onExport} /></View> : null}
      </View>
    </TrCard>
  );
}

/* ── The log ─────────────────────────────────────────────────────────────────── */

const COLS = { date: 64, cat: 150, desc: 220, method: 84, amt: 96, run: 92, acts: 128 } as const;

export interface LogEnv {
  catalog: Catalog; canTreasury: boolean; duesOn: boolean; duesWord: string;
  onMarkPaid: (t: Transaction) => void; onEdit: (t: Transaction) => void; onDelete: (t: Transaction) => void; onSeeDues: (brotherId: number) => void;
}

export function LogCard({ rows, anyInTerm, tab, onTab, category, onCategory, categories, search, onSearch, total, unstarted, term, env, onLog, onClear }: {
  rows: (Transaction & { running: number })[]; anyInTerm: boolean; tab: TxTab; onTab: (t: TxTab) => void;
  category: string; onCategory: (s: string) => void; categories: { slug: string; label: string }[];
  search: string; onSearch: (s: string) => void; total: number; unstarted: boolean; term: string; env: LogEnv; onLog: () => void; onClear: () => void;
}) {
  const { c } = useTheme();
  const [catOpen, setCatOpen] = useState(false);
  const totalColor = unstarted ? c.ink3 : tab === "expense" ? c.pastel.peach.ink : tab === "income" ? c.pastel.mint.ink : total >= 0 ? c.pastel.mint.ink : c.pastel.peach.ink;
  const catLabel = category === "all" ? "All categories" : categories.find(x => x.slug === category)?.label ?? category;
  return (
    <>
      <SecNote title="Recent entries" />
      <View style={[styles.log, { borderColor: c.line, backgroundColor: c.card }]}>
        <View style={[styles.logH, { borderBottomColor: c.line, backgroundColor: c.paper2 }]}>
          <T v="title" size={17} ls={-0.02}>Transaction Log</T>
          <View style={styles.logTools}>
            <PillToggle label="Show" inkOn value={tab} onChange={onTab} options={[["all", "All"], ["income", "Income"], ["expense", "Expense"]] as const} />
            <Pressable onPress={() => setCatOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: catOpen }}
              style={({ pressed }) => [[styles.select, { borderColor: c.line2, backgroundColor: c.card }], pressed && pressedDim]}>
              <T v="meta" color={c.ink}>{catLabel}</T><Icon name="updown" size={12} color={c.ink3} />
            </Pressable>
          </View>
          {catOpen ? (
            <View style={styles.catList}>
              {[{ slug: "all", label: "All categories" }, ...categories].map(o => (
                <Pressable key={o.slug} onPress={() => { onCategory(o.slug); setCatOpen(false); }} accessibilityRole="radio" accessibilityState={{ selected: o.slug === category }}
                  style={[styles.catChip, { borderColor: o.slug === category ? c.ink : c.line2, backgroundColor: o.slug === category ? c.ink : c.card }]}>
                  <T v="buttonSm" size={12.5} color={o.slug === category ? c.paper : c.ink2}>{o.label}</T>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={[styles.search, { borderColor: c.line2, backgroundColor: c.card }]}>
            <Icon name="search" size={14} color={c.ink3} />
            <TextInput value={search} onChangeText={onSearch} placeholder="Search description, category…" placeholderTextColor={c.ink3}
              style={[styles.searchIn, { color: c.ink }]} returnKeyType="search" />
            {search ? <Pressable onPress={() => onSearch("")} accessibilityLabel="Clear search" hitSlop={8}><Icon name="x" size={13} color={c.ink3} /></Pressable> : null}
          </View>
          <View style={[styles.total, { borderColor: c.line2, backgroundColor: c.card }]}>
            <T v="mono" size={13} style={{ fontFamily: "PlexMono-600" }} color={totalColor}>
              {unstarted ? "—" : `${tab === "all" && total >= 0 ? "+" : ""}${fmt$(Math.round(total))}`}
            </T>
          </View>
        </View>

        {rows.length === 0 ? (
          <Ruled>
            {anyInTerm ? (
              <>
                <T v="title" size={18} ls={-0.02}>Nothing matches.</T>
                <T v="body" size={14} lh={2.1} color={c.ink3}>
                  No entries match {search.trim() ? `“${search.trim()}”` : "this filter"}.{" "}
                  <T v="bodyStrong" size={14} onPress={onClear} accessibilityRole="button">Clear filters</T>
                </T>
              </>
            ) : (
              <>
                <T v="title" size={18} ls={-0.02}>Nothing logged yet.</T>
                <T v="body" size={14} lh={2.1} color={c.ink3}>
                  {env.canTreasury ? "The first entry you add lands here, with the running balance beside it." : `When money moves${term ? ` in ${term}` : ""}, every entry lands here with the running balance beside it.`}
                </T>
                {env.canTreasury ? <View style={{ marginTop: 8 }}><TrBtn label="Log money" icon="plus" onPress={onLog} /></View> : null}
              </>
            )}
          </Ruled>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} bounces={false}>
            <View>
              <View style={[styles.margin, { left: COLS.date, backgroundColor: c.pastel.rose.ink }]} pointerEvents="none" />
              <View style={[styles.tr, { borderBottomColor: c.line, backgroundColor: c.paper2 }]}>
                {(["Date", "Category", "Description", "Method", "Amount", "Balance", ""] as const).map((h, i) => (
                  <T key={h || i} v="label" size={10} color={c.ink3}
                    style={[styles.th, { width: Object.values(COLS)[i] }, i === 0 && { textAlign: "center" }, (h === "Amount" || h === "Balance") && { textAlign: "right" }]}>{h}</T>
                ))}
              </View>
              {rows.map(t => <LogRow key={t.id} t={t} env={env} />)}
            </View>
          </ScrollView>
        )}
      </View>
    </>
  );
}

function Ruled({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.ruled}>
      {Array.from({ length: 8 }, (_, i) => <View key={i} style={[styles.rule, { top: 29 + i * 30, backgroundColor: c.pastel.sky.border }]} />)}
      <View style={[styles.margin, { left: COLS.date, backgroundColor: c.pastel.rose.ink }]} />
      <View style={{ gap: 2, alignItems: "flex-start" }}>{children}</View>
    </View>
  );
}

const LogRow = memo(function LogRow({ t, env }: { t: Transaction & { running: number }; env: LogEnv }) {
  const { c } = useTheme();
  const inc = t.type === "income";
  const d = ppDay(t.date);
  return (
    <View style={[styles.tr, { borderBottomColor: c.lineSoft, alignItems: "center" }]}>
      <View style={[styles.td, { width: COLS.date, alignItems: "center" }]}>
        <T v="title" size={20} lh={1.05} ls={-0.03}>{String(d.d)}</T>
        <T v="kicker" size={9.5} ls={0.08} color={c.ink3}>{d.m}</T>
      </View>
      <View style={[styles.td, { width: COLS.cat, alignItems: "flex-start", gap: 4 }]}>
        <View style={[styles.catPill, { borderColor: c.line2, backgroundColor: c.paper }]}>
          <View style={[styles.pdot, { backgroundColor: inc ? c.pastel.mint.ink : c.pastel.peach.ink }]} />
          <T v="pill" color={c.ink2} numberOfLines={1}>{env.catalog.labelFor(t.type, t.category)}</T>
        </View>
        {t.status === "scheduled" ? <View style={[styles.tag, { backgroundColor: c.pastel.peach.soft, borderColor: c.pastel.peach.border }]}><T v="pill" size={11} color={c.pastel.peach.ink}>Sched</T></View> : null}
      </View>
      <View style={[styles.td, { width: COLS.desc }]}>
        <T v="bodyStrong" size={14.5} numberOfLines={2}>{t.description || "—"}</T>
        {inc && t.category === "Dues" && t.brotherId != null && env.duesOn ? (
          <Pressable onPress={() => env.onSeeDues(t.brotherId!)} hitSlop={6}><T v="buttonSm" size={12} color={c.pastel.butter.ink} style={{ textDecorationLine: "underline" }}>see in {env.duesWord}</T></Pressable>
        ) : null}
        {t.calendarEvents?.map(ev => (
          <View key={ev.id} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="cal" size={11} color={c.pastel.sky.ink} /><T v="meta" size={12} color={c.pastel.sky.ink} numberOfLines={1}>{ev.title}</T>
          </View>
        ))}
      </View>
      <View style={[styles.td, { width: COLS.method }]}><T v="mono" size={11.5} color={c.ink3}>{t.paymentMethod ? t.paymentMethod.charAt(0).toUpperCase() + t.paymentMethod.slice(1) : "—"}</T></View>
      <View style={[styles.td, { width: COLS.amt, alignItems: "flex-end" }]}>
        <T v="mono" size={14} style={{ fontFamily: "PlexMono-600" }} color={inc ? c.pastel.mint.ink : c.ink}>{inc ? "+" : "−"}{fmt$(t.amount)}</T>
      </View>
      <View style={[styles.td, { width: COLS.run, alignItems: "flex-end" }]}>
        <T v="mono" size={12} color={t.running < 0 ? c.pastel.peach.ink : c.ink3}>{fmt$(Math.round(t.running))}</T>
      </View>
      <View style={[styles.td, styles.acts, { width: COLS.acts }]}>
        {env.canTreasury ? <>
          {t.status === "scheduled" ? (
            <Pressable onPress={() => env.onMarkPaid(t)} accessibilityRole="button" style={({ pressed }) => [[styles.markPaid, { backgroundColor: c.pastel.mint.soft, borderColor: c.pastel.mint.border }], pressed && pressedDim]}>
              <T v="pill" color={c.pastel.mint.ink}>Mark Paid</T>
            </Pressable>
          ) : null}
          <Pressable onPress={() => env.onEdit(t)} accessibilityRole="button" accessibilityLabel="Edit" hitSlop={4} style={({ pressed }) => [styles.iconBtn, pressed && pressedDim]}><Icon name="pencil" size={15} color={c.ink3} /></Pressable>
          <Pressable onPress={() => env.onDelete(t)} accessibilityRole="button" accessibilityLabel="Delete" hitSlop={4} style={({ pressed }) => [styles.iconBtn, pressed && pressedDim]}><Icon name="trash" size={15} color={c.ink3} /></Pressable>
        </> : null}
      </View>
    </View>
  );
});

/* ── At the door ─────────────────────────────────────────────────────────────── */

export function AtTheDoor({ parties, today, canTreasury, onOpen, onDelete, onAdd }: {
  parties: LedgerParty[]; today: string; canTreasury: boolean; onOpen: (p: LedgerParty) => void; onDelete: (p: LedgerParty) => void; onAdd: () => void;
}) {
  const { c } = useTheme();
  const sorted = [...parties].sort((a, b) => b.date.localeCompare(a.date));
  const door = parties.reduce((s, p) => s + p.doorRevenue, 0);
  return (
    <View accessibilityLabel="Party events">
      <SecNote title="At the door" sum={sorted.length === 0 ? "none yet" : `${sorted.length} ${sorted.length === 1 ? "party" : "parties"} · ${fmt$(Math.round(door))} at the door`} />
      <View style={{ gap: 16 }}>
        {sorted.map(p => {
          const up = p.date >= today, d = ppDay(p.date);
          return (
            <Pressable key={p.id} onPress={() => onOpen(p)} accessibilityRole="button"
              style={({ pressed }) => [[styles.tix, { backgroundColor: c.card, borderColor: c.ink, borderStyle: up ? "dashed" : "solid" }, hard(up ? c.pastel.lilac.fill : c.pastel.rose.fill, 4)], pressed && pressedDim]}>
              <View style={styles.tixL}>
                <T v="kicker" size={10} ls={0.12} color={up ? c.pastel.lilac.ink : c.pastel.rose.ink}>{up ? "Coming up" : "Party"} · {d.w} {d.m} {d.d}</T>
                <T v="title" size={17} ls={-0.022} lh={1.15} style={{ marginTop: 3 }}>{p.name}</T>
                <T v="meta" size={12} color={c.ink3} style={{ marginTop: 4 }}>{p.attendance > 0 ? `${p.attendance} through the door` : "No headcount"}{p.notes ? ` · ${p.notes}` : ""}</T>
              </View>
              <View style={[styles.tixR, { borderLeftColor: c.line2 }]}>
                <View style={[styles.notch, { top: -9, backgroundColor: c.paper, borderColor: c.ink }]} />
                <View style={[styles.notch, { bottom: -9, backgroundColor: c.paper, borderColor: c.ink }]} />
                <T v="title" size={21} ls={-0.035}>{up && !p.doorRevenue ? "—" : fmt$(Math.round(p.doorRevenue))}</T>
                <T v="mono" size={10} color={c.ink3}>{p.attendance > 0 && p.doorRevenue > 0 ? `${fmt$(round2(p.doorRevenue / p.attendance))}/head` : "door"}</T>
              </View>
              {canTreasury ? (
                <Pressable onPress={() => onDelete(p)} accessibilityRole="button" accessibilityLabel={`Delete ${p.name}`} hitSlop={6} style={({ pressed }) => [[styles.tixDel, { backgroundColor: c.card }], pressed && pressedDim]}>
                  <Icon name="trash" size={14} color={c.ink3} />
                </Pressable>
              ) : null}
            </Pressable>
          );
        })}
        {canTreasury ? (
          <Pressable onPress={onAdd} accessibilityRole="button" style={({ pressed }) => [[styles.tixAdd, sorted.length === 0 && styles.tixFirst, { borderColor: c.line2 }], pressed && pressedDim]}>
            <Icon name="plus" size={sorted.length === 0 ? 20 : 16} color={c.ink2} />
            {sorted.length === 0 ? (
              <View style={{ gap: 2, flex: 1 }}>
                <T v="subhead" size={16}>Add the first party</T>
                <T v="meta" size={12.5} color={c.ink3}>Its door take lands here as a ticket stub.</T>
              </View>
            ) : <T v="bodyStrong" size={14} color={c.ink2}>Add a party</T>}
          </Pressable>
        ) : sorted.length === 0 ? (
          <View style={[styles.tixAdd, styles.tixFirst, { borderColor: c.line2 }]}>
            <Icon name="door" size={20} color={c.ink2} />
            <View style={{ gap: 2, flex: 1 }}>
              <T v="subhead" size={16}>No parties on the books yet</T>
              <T v="meta" size={12.5} color={c.ink3}>Door takes land here as ticket stubs.</T>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ── Reports ─────────────────────────────────────────────────────────────────── */

export function Statement({ term, treasuryWord, asOf, ins, outs, books, unstarted, canTreasury, onExport }: {
  term: string; treasuryWord: string; asOf: string; ins: { label: string; amt: number }[]; outs: { label: string; amt: number }[];
  books: Books; unstarted: boolean; canTreasury: boolean; onExport: () => void;
}) {
  const { c } = useTheme();
  const n = books.parties.length;
  return (
    <View style={[styles.stmt, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.butter.fill, 7)]}>
      <View style={[styles.stmtTape, { backgroundColor: c.pastel.sky.fill }]} />
      <View style={[styles.stmtH, { borderBottomColor: c.ink }]}>
        <T v="title" size={26} ls={-0.035} lh={1.1}>{term} statement</T>
        <T v="mono" size={11.5} color={c.ink3} style={{ marginTop: 4 }}>{treasuryWord} · as of {asOf}</T>
      </View>
      <H5 t="Money in" tone={c.pastel.mint.ink} />
      {ins.length === 0 ? <Leader k="Nothing in yet" v="—" color={c.ink3} /> : ins.map(r => <Leader key={r.label} sub k={r.label} v={`+${fmt$(round2(r.amt))}`} color={c.pastel.mint.ink} />)}
      <H5 t="Money out" tone={c.pastel.peach.fill} />
      {outs.length === 0 ? <Leader k="Nothing out yet" v="—" color={c.ink3} /> : outs.map(r => <Leader key={r.label} sub k={r.label} v={`−${fmt$(round2(r.amt))}`} color={c.pastel.peach.ink} />)}
      <Leader total k="Balance today" v={fmt$(Math.round(books.balance))} />
      {!unstarted ? <Leader k="Projected" v={fmt$(Math.round(books.projected))} /> : null}
      <Leader k="Door revenue" note={`${n} ${n === 1 ? "party" : "parties"}`} v={unstarted ? "—" : fmt$(Math.round(books.totalDoorRev))} />
      {canTreasury ? <View style={{ marginTop: 20 }}><TrBtn kind="ghost" label="Export CSV" icon="sheet" onPress={onExport} /></View> : null}
    </View>
  );
}

function H5({ t, tone }: { t: string; tone: string }) {
  const { c } = useTheme();
  return <View style={styles.h5}><View style={[styles.h5bar, { backgroundColor: tone }]} /><T v="label" size={10.5} ls={0.11} color={c.ink3}>{t}</T></View>;
}
function Cell({ k, v, color }: { k: string; v: string; color: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.cell, { borderColor: c.line, backgroundColor: c.card, boxShadow: c.sh1 }]}>
      <T v="label" size={10} ls={0.09} color={c.ink3}>{k}</T>
      <T v="title" size={26} ls={-0.04} color={color} style={{ marginTop: 4 }}>{v}</T>
    </View>
  );
}

export function ReportGrid({ books }: { books: Books }) {
  const { c } = useTheme();
  const cells = [
    { k: "Total Income", v: fmt$(Math.round(books.totalIncome)), color: c.pastel.mint.ink },
    { k: "Total Expenses", v: fmt$(Math.round(books.totalExpenses)), color: c.pastel.peach.ink },
    { k: "Door Revenue", v: fmt$(Math.round(books.totalDoorRev)), color: c.pastel.peach.ink },
    { k: "Net Balance", v: fmt$(Math.round(books.balance)), color: books.balance >= 0 ? c.ink : c.pastel.peach.ink },
  ];
  return (
    <View style={{ marginTop: 24, gap: 12 }}>
      <View style={styles.grid}>{cells.map(x => <View key={x.k} style={{ width: "48%" }}><Cell {...x} /></View>)}</View>
      <Cell k="Projected end-of-semester" v={fmt$(Math.round(books.projected))} color={c.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  first: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 22, paddingHorizontal: 18, paddingVertical: 16, marginTop: 24 },
  glyph: { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  bal: { borderWidth: 1.5, borderRadius: 22, paddingBottom: 16 },
  balTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4 },
  balLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  io: { marginHorizontal: 16, marginTop: 12, paddingTop: 14, borderTopWidth: 1.5, borderStyle: "dashed", gap: 6 },
  ioRow: { flexDirection: "row", justifyContent: "space-between", gap: 18 },
  ioS: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 8, minWidth: 0 },
  ioDot: { width: 9, height: 9, borderRadius: 3, alignSelf: "center" },
  ioBar: { flexDirection: "row", gap: 3, height: 12, borderRadius: 7, overflow: "hidden" },
  cardF: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 11, borderTopWidth: 1.5, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  edit: { flexDirection: "row", alignItems: "center", gap: 4 },
  ev: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 12 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, alignSelf: "flex-start" },
  log: { borderWidth: 1.5, borderRadius: 22, overflow: "hidden" },
  logH: { paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderBottomWidth: 1.5 },
  logTools: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  select: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  catList: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catChip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12 },
  searchIn: { flex: 1, paddingVertical: 8, fontFamily: "Inter-400", fontSize: 13 },
  total: { alignSelf: "flex-start", borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  margin: { position: "absolute", top: 0, bottom: 0, width: 1.5, opacity: 0.45, zIndex: 1 },
  tr: { flexDirection: "row", borderBottomWidth: 1 },
  th: { paddingHorizontal: 14, paddingVertical: 9 },
  td: { paddingHorizontal: 14, paddingVertical: 9, justifyContent: "center", gap: 3 },
  acts: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2 },
  catPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 1, maxWidth: 140 },
  pdot: { width: 7, height: 7, borderRadius: 4 },
  markPaid: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, marginRight: 2 },
  iconBtn: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  ruled: { paddingTop: 30, paddingBottom: 32, paddingLeft: 84, paddingRight: 20, position: "relative" },
  rule: { position: "absolute", left: 0, right: 0, height: 1 },
  tix: { flexDirection: "row", borderWidth: 1.5, borderRadius: 14 },
  tixL: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 12 },
  tixR: { alignItems: "flex-end", justifyContent: "center", paddingLeft: 16, paddingRight: 14, paddingVertical: 12, borderLeftWidth: 1.5, borderStyle: "dashed" },
  notch: { position: "absolute", left: -9, width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  tixDel: { position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tixAdd: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 86, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14 },
  tixFirst: { justifyContent: "flex-start", gap: 14, paddingHorizontal: 18, paddingVertical: 14 },
  stmt: { borderWidth: 1.5, borderTopLeftRadius: 6, borderTopRightRadius: 18, borderBottomRightRadius: 8, borderBottomLeftRadius: 16, paddingHorizontal: 16, paddingVertical: 20, marginTop: 24 },
  stmtTape: { position: "absolute", right: 60, top: -9, width: 66, height: 18, opacity: 0.7, transform: [{ rotate: "4deg" }] },
  stmtH: { paddingBottom: 14, borderBottomWidth: 1.5 },
  h5: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18, marginBottom: 4 },
  h5bar: { width: 14, height: 2, borderRadius: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  cell: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
});
