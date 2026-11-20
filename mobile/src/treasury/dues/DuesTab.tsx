/**
 * Treasury → Dues (the web's app/components/treasury/dues/DuesTab.tsx at phone width):
 * who owes what, at a glance and person by person. Everything is read off GET /api/dues;
 * the rules that scope and sort it are @/lib/treasury/dues, shared with the web.
 *
 *   day one     "Nobody’s been billed yet." with the three ways (Everyone / By role / A few people)
 *   Your tab    a member (not treasury) with something billed
 *   hero        collected of billed, the money bar, the legend (a filter), the punch strip,
 *               Hand out / Record a payment (treasury)
 *   Charges     one stub per bill (tap to scope the page to it; ⋯ edits, treasury)
 *   the wall    search, Standing/Role, Tags/List, the filter chips, lanes of tags or the list
 *
 * Writes go through the member drawer, the Hand out sheet and the charge editor; each one
 * refreshes the boards, the roster and the open tab, then says so in a toast (with Undo
 * where the web offers one).
 */
import type { Brother, DuesBoard, DuesChargeSummary, DuesStanding, MemberDuesStanding } from "@/lib/api-types";
import {
  STANDING, chargeAmounts, chargeToneKey, dueLine, fmtDay, heroOf, lanesOf, money, personFor, plural, rolesOf, rowsOf, standingLine,
  stripOrder, tableOrder, toPeople, visibleRows, type DuesFilter, type DuesRow,
} from "@/lib/treasury/dues";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { duesWritten, voidCharge } from "~/data/dues";
import { Icon, type IconName } from "~/icons/Icon";
import { Avatar } from "~/paper/bits";
import { SkeletonCard } from "~/shell/states";
import { toast } from "~/shell/toast";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { DuBtn, DuCard, DuLink, Empty, Kicker, Search, Seg, Strip, useStanding } from "./bits";
import { ChargeEditSheet } from "./ChargeEdit";
import { DuesMemberDrawer, type DuesWriteDone } from "./Drawer";
import { HandOutSheet, type SheetStart } from "./HandOut";
import { pressedDim } from "~/motion/press";

export interface DuesJump { filter: DuesFilter | null; memberId: number | null; sheet?: boolean; at: number }

export function DuesTab({ board, error, loading, roster, selfId, canTreasury, duesWord, jump }: {
  board: DuesBoard | null; error: string | null; loading: boolean; roster: readonly Brother[]; selfId: number | null;
  canTreasury: boolean; duesWord: string; jump: DuesJump | null;
}) {
  const { c } = useTheme();
  const sw = useStanding();
  const [filter, setFilter] = useState<DuesFilter>(jump?.filter ?? "all");
  const [group, setGroup] = useState<"standing" | "role">("standing");
  const [view, setView] = useState<"wall" | "list">("wall");
  const [scopeId, setScopeId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(jump?.memberId ?? null);
  const [sheet, setSheet] = useState<SheetStart | null>(jump?.sheet && canTreasury ? { mode: "all" } : null);
  const [editId, setEditId] = useState<number | null>(null);

  useEffect(() => {
    if (!jump) return;
    if (jump.filter) { setFilter(jump.filter); setScopeId(null); }
    if (jump.memberId) setOpenId(jump.memberId);
    if (jump.sheet && canTreasury) setSheet({ mode: "all" });
  }, [jump, canTreasury]);

  const people = useMemo(() => toPeople(roster), [roster]);
  const rosterList = useMemo(() => [...people.values()].sort((a, b) => a.name.localeCompare(b.name)), [people]);
  const roles = useMemo(() => rolesOf(roster), [roster]);
  const scope = board?.charges.find(x => x.id === scopeId) ?? null;
  useEffect(() => { if (scopeId !== null && board && !scope) setScopeId(null); }, [scopeId, board, scope]);
  const rows = useMemo(() => (board ? rowsOf(board, people, scope) : []), [board, people, scope]);

  /** After any write: pull everything back in, then toast (with Undo when there is one). */
  const done = async ({ msg, undo, tx }: DuesWriteDone) => {
    try { await duesWritten(tx); } catch { msg = `${msg} — but the page didn't refresh. Pull to see it.`; }
    toast.show(msg, undo ? {
      undo: () => {
        void undo().then(m => duesWritten().then(() => toast.show(m))).catch(e => toast.error(errorMessage(e, "Couldn't undo that.")));
      },
    } : {});
  };

  if (!board) {
    return error ? <Empty>{error}</Empty> : <View style={{ marginTop: 28 }} accessibilityState={{ busy: loading }}><SkeletonCard height={360} /></View>;
  }

  const sheetEl = (
    <HandOutSheet start={sheet} people={rosterList} roles={roles} board={board} duesWord={duesWord} onClose={() => setSheet(null)}
      onIssued={issued => {
        setSheet(null); setOpenId(null); setScopeId(null); setFilter("all");
        void done({
          msg: `${issued.name} handed out · ${plural(issued.people, "person", "people")} · ${money(issued.total)}${issued.skipped ? ` · ${issued.skipped} skipped` : ""}`,
          undo: async () => { await voidCharge(issued.id); return "Charge taken back. Nobody was billed."; },
        });
      }} />
  );

  if (board.charges.length === 0) {
    return <><DayOne count={rows.length} canTreasury={canTreasury} duesWord={duesWord} onStart={setSheet} />{sheetEl}</>;
  }

  const h = heroOf(rows);
  const visible = visibleRows(rows, filter, q);
  const viewer = board.viewer;
  const showYourTab = !canTreasury && viewer !== null && viewer.billed > 0;
  const openPerson = openId !== null ? personFor(people, openId) : null;
  const editCharge = editId !== null ? board.charges.find(x => x.id === editId) ?? null : null;

  return (
    <View>
      {showYourTab ? <YourTab viewer={viewer!} charges={board.charges} today={board.today} onOpen={() => setOpenId(viewer!.brotherId)} /> : null}

      <View style={[styles.hero, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.butter.fill, 4)]}>
        <Kicker icon="jar">{scope ? `${scope.name}${scope.dueDate ? ` · due ${fmtDay(scope.dueDate)}` : ""}` : board.term ? `${board.term.label}, every charge` : "Every charge"}</Kicker>
        <View style={styles.big}>
          <T v="figure" size={40} ls={-0.05} lh={1}>{money(h.paid)}</T>
          <T v="body" size={15} color={c.ink3}>collected of <T v="bodyStrong" size={15}>{money(h.billed)}</T> billed · {h.pct}%</T>
        </View>
        <View style={[styles.mbar, { borderColor: c.ink, backgroundColor: c.paper2 }]} accessibilityLabel={`Collected ${h.pct} percent`}>
          {h.paid > 0 ? <View style={{ flexBasis: `${(h.paid / h.billed) * 100}%`, backgroundColor: c.pastel.mint.fill }} /> : null}
          {h.due > 0 ? <Hatch basis={(h.due / h.billed) * 100} tone="butter" /> : null}
          {h.overdue > 0 ? <Hatch basis={(h.overdue / h.billed) * 100} tone="rose" /> : null}
        </View>
        <View style={styles.legend}>
          {([["paid", "Paid", h.paid], ["due", "Not due yet", h.due], ["overdue", "Overdue", h.overdue]] as const).map(([s, l, v]) => (h.count(s) > 0 || v > 0) ? (
            <Pressable key={s} onPress={() => setFilter(f => (f === s ? "all" : s))} accessibilityRole="button" accessibilityState={{ selected: filter === s }}
              style={[styles.lg, filter === s && { backgroundColor: c.paper3, borderColor: c.ink }]}>
              <View style={[styles.lsw, { backgroundColor: sw(s).fill, borderColor: c.ink }]} />
              <T v="meta" size={13} color={c.ink2}>{l} <T v="mono" size={12.5} style={{ fontFamily: "PlexMono-600" }}>{money(v)}</T>{h.count(s) > 0 ? <T v="meta" size={13} color={c.ink3}> · {plural(h.count(s), "person", "people")}</T> : null}</T>
            </Pressable>
          ) : null)}
        </View>
        <View style={styles.stripH}>
          <T v="meta" size={12.5} color={c.ink3} style={{ flex: 1 }}>One square per member · tap one to open</T>
          <T v="mono" size={11.5} color={c.ink3}>{h.count("paid")} / {rows.length} square</T>
        </View>
        <Strip dim={filter !== "all"} onPress={setOpenId}
          items={stripOrder(rows).map(r => ({ id: r.p.id, s: r.s, on: filter === r.s, label: `${r.p.name}: ${STANDING[r.s].chip}` }))} />
        {canTreasury ? (
          <View style={[styles.cta, { borderTopColor: c.line2 }]}>
            <DuBtn label={`Hand out ${duesWord.toLowerCase()}`} icon="plus" onPress={() => setSheet({ mode: "all" })} style={{ flexBasis: "100%" }} />
            <DuBtn ghost label="Record a payment" icon="wallet" style={{ flexBasis: "100%" }} onPress={() => {
              setFilter(h.count("overdue") ? "overdue" : h.count("due") ? "due" : "all"); setView("wall");
              toast.show("Tap who paid, then Record payment on their tab.");
            }} />
          </View>
        ) : null}
      </View>

      <DuCard style={styles.charges}>
        <View style={styles.chargesH}>
          <T v="title" size={18} ls={-0.03}>Charges</T>
          {scope ? <DuLink label="Show every charge" onPress={() => setScopeId(null)} /> : <Kicker>{plural(board.charges.length, "bill")}</Kicker>}
        </View>
        <View style={{ gap: 10, marginTop: 12 }}>
          {board.charges.map(ch => <Stub key={ch.id} ch={ch} on={scopeId === ch.id} canTreasury={canTreasury}
            onPress={() => { setScopeId(id => (id === ch.id ? null : ch.id)); setFilter("all"); }} onEdit={() => setEditId(ch.id)} />)}
        </View>
        <View style={[styles.foot, { borderTopColor: c.line2 }]}>
          <T v="meta" size={12.5} color={c.ink3} style={{ flex: 1 }}>Tap a charge to see only its payers.</T>
          {canTreasury ? <DuLink label="New charge" icon="plus" onPress={() => setSheet({ mode: "all" })} /> : null}
        </View>
      </DuCard>

      <View style={styles.wallH}>
        <T v="title" size={24} ls={-0.035} lh={1.1} accessibilityRole="header">{scope ? `Who owes for ${scope.name}` : "Who owes what"}</T>
        <T v="body" size={14} color={c.ink3}>{scope ? `${plural(rows.length, "person", "people")} on this charge` : "Everyone on the roster, sorted by where they stand"}</T>
        <View style={styles.tools}>
          <Search value={q} onChangeText={setQ} placeholder="Find a member or role" style={{ flexBasis: "100%" }} />
          <Seg label="Group by" value={group} onChange={setGroup} options={[{ k: "standing", l: "Standing" }, { k: "role", l: "Role" }]} />
          <Seg label="View" value={view} onChange={setView} options={[{ k: "wall", icon: "board", a11y: "Tags" }, { k: "list", icon: "sheet", a11y: "List" }]} />
        </View>
      </View>

      <View style={styles.filt}>
        <FilterChip f="all" label="Everyone" n={rows.length} cur={filter} set={setFilter} />
        <FilterChip f="overdue" label="Overdue" n={h.count("overdue")} cur={filter} set={setFilter} />
        <FilterChip f="due" label="Not due yet" n={h.count("due")} cur={filter} set={setFilter} />
        <FilterChip f="paid" label="Paid up" n={h.count("paid")} cur={filter} set={setFilter} />
        {h.count("none") > 0 ? <FilterChip f="none" label="Nothing billed" n={h.count("none")} cur={filter} set={setFilter} /> : null}
        {scope ? (
          <View style={styles.note}>
            <T v="meta" size={12.5} color={c.ink3}>Filtered to <T v="bodyStrong" size={12.5} color={c.ink3}>{scope.name}</T></T>
            <DuLink label="clear" onPress={() => setScopeId(null)} />
          </View>
        ) : null}
      </View>

      {visible.length === 0 ? (
        <Empty>
          <T v="body" size={14} color={c.ink3} align="center">Nobody matches that. </T>
          <View style={{ alignItems: "center", marginTop: 4 }}><DuLink label="Show everyone" onPress={() => { setFilter("all"); setQ(""); setScopeId(null); }} /></View>
        </Empty>
      ) : view === "list" ? (
        <Table rows={visible} onOpen={setOpenId} />
      ) : (
        lanesOf(visible, group).map(l => (
          <View key={l.key} style={{ marginTop: 26 }}>
            <View style={[styles.laneH, { borderBottomColor: c.line }]}>
              <View style={[styles.lsw2, { backgroundColor: sw(l.s ?? "role").fill, borderColor: c.ink, borderStyle: l.s === "none" ? "dashed" : "solid" }]} />
              <T v="bodyStrong" size={15.5}>{l.label}</T>
              <T v="mono" size={12} color={c.ink3}>{l.rows.length}</T>
              <T v="mono" size={13} style={{ fontFamily: "PlexMono-600", marginLeft: "auto" }}>{l.out ? `${money(l.out)} out` : l.s === "paid" ? "all square" : ""}</T>
              {canTreasury && l.bill !== undefined ? <View style={{ marginLeft: 12 }}><DuLink label={`Bill ${l.label}`} onPress={() => setSheet({ mode: "role", key: l.bill as number | "none" })} /></View> : null}
            </View>
            <View style={styles.tags}>{l.rows.map(r => <Tag key={r.p.id} r={r} selfId={selfId} onOpen={setOpenId} />)}</View>
          </View>
        ))
      )}

      <DuesMemberDrawer person={openPerson} today={board.today} onClose={() => setOpenId(null)}
        manage={canTreasury ? { onBill: () => { const id = openPerson!.id; setOpenId(null); setSheet({ mode: "pick", brotherIds: [id] }); }, onDone: done } : undefined} />
      <ChargeEditSheet charge={editCharge} today={board.today} onClose={() => setEditId(null)}
        onSaved={() => { const n = editCharge!.name; setEditId(null); void done({ msg: `${n} updated` }); }}
        onTakenBack={() => { const n = editCharge!.name; setEditId(null); void done({ msg: `${n} taken back. It’s off every tab.` }); }} />
      {sheetEl}
    </View>
  );
}

/** .du-mbar .du-d / .du-o: the stripes as a soft fill with the strong colour's ink border. */
function Hatch({ basis, tone }: { basis: number; tone: Tone }) {
  const { c } = useTheme();
  return (
    <View style={{ flexBasis: `${basis}%`, backgroundColor: c.pastel[tone].soft, borderLeftWidth: 1.5, borderLeftColor: c.ink, overflow: "hidden", flexDirection: "row" }}>
      {Array.from({ length: 40 }, (_, i) => <View key={i} style={{ width: 6, marginRight: 5, backgroundColor: c.pastel[tone].fill, transform: [{ skewX: "45deg" }] }} />)}
    </View>
  );
}

function Stub({ ch, on, canTreasury, onPress, onEdit }: { ch: DuesChargeSummary; on: boolean; canTreasury: boolean; onPress: () => void; onEdit: () => void }) {
  const { c } = useTheme();
  const tk = chargeToneKey(ch);
  const col = tk === "card" ? c.card : c.pastel[tk].fill;
  const amt = chargeAmounts(ch);
  return (
    <View>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={[styles.stub, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.card : c.paper }, on && hard(col, 3)]}>
        <View style={[styles.stubEdge, { backgroundColor: col, borderRightColor: c.ink3 }]} />
        <View style={{ flex: 1, minWidth: 0, gap: 3, paddingVertical: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T v="bodyStrong" size={14.5} numberOfLines={1} style={{ flexShrink: 1 }}>{ch.name}</T>
            <View style={[styles.aud, { backgroundColor: c.paper3 }]}><T v="pill" size={10.5} color={c.ink2}>{ch.audienceLabel}</T></View>
          </View>
          <T v="meta" size={12} color={c.ink3}>
            {ch.overdue ? <T v="meta" size={12} style={{ fontFamily: "Inter-600" }} color={c.pastel.rose.ink}>Overdue since {fmtDay(ch.dueDate!)}</T> : ch.dueDate ? `Due ${fmtDay(ch.dueDate)}` : "No due date"}
            {"  ·  "}{money(ch.outstanding)} out
          </T>
        </View>
        <View style={{ alignItems: "flex-end", paddingRight: 16 }}>
          <T v="mono" size={14} style={{ fontFamily: "PlexMono-600" }}>{amt.text}{amt.each ? <T v="mono" size={11} color={c.ink3}> ea</T> : null}</T>
          <T v="mono" size={11} color={c.ink3}>{ch.paidPeople}/{ch.people} paid</T>
          <View style={[styles.prog, { backgroundColor: c.paper3 }]}><View style={{ width: `${ch.people ? (ch.paidPeople / ch.people) * 100 : 0}%`, height: "100%", backgroundColor: c.pastel.mint.ink, borderRadius: 9 }} /></View>
        </View>
      </Pressable>
      {canTreasury ? (
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${ch.name}`} hitSlop={8} style={({ pressed }) => [[styles.more, { borderColor: c.line2, backgroundColor: c.card }], pressed && pressedDim]}>
          <Icon name="dots" size={14} color={c.ink2} />
        </Pressable>
      ) : null}
    </View>
  );
}

function FilterChip({ f, label, n, cur, set }: { f: DuesFilter; label: string; n: number; cur: DuesFilter; set: (f: DuesFilter) => void }) {
  const { c } = useTheme();
  const sw = useStanding();
  const on = cur === f;
  return (
    <Pressable onPress={() => set(on && f !== "all" ? "all" : f)} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[styles.fchip, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.card }]}>
      {f !== "all" ? <View style={[styles.fsw, { backgroundColor: sw(f).fill, borderColor: on ? c.paper : c.ink, borderStyle: f === "none" ? "dashed" : "solid" }]} /> : null}
      <T v="buttonSm" size={13} color={on ? c.paper : c.ink2}>{label}</T>
      <T v="mono" size={11.5} color={on ? c.paper : c.ink3} style={on ? { opacity: 0.7 } : null}>{n}</T>
    </Pressable>
  );
}

function Tag({ r, selfId, onOpen }: { r: DuesRow; selfId: number | null; onOpen: (id: number) => void }) {
  const { c } = useTheme();
  const x = useStanding()(r.s);
  const none = r.s === "none";
  return (
    <Pressable onPress={() => onOpen(r.p.id)} accessibilityRole="button" style={({ pressed }) => [styles.tag, { borderColor: pressed ? c.ink : c.line2, backgroundColor: none ? "transparent" : c.card, borderStyle: none ? "dashed" : "solid" }, pressed && hard(x.fill, 3)]}>
      <View style={[styles.tagEdge, { backgroundColor: x.fill }]} />
      <View style={[styles.hole, { borderColor: c.line2, backgroundColor: c.paper }]} />
      <View style={styles.who}>
        <Avatar name={r.p.name} uri={r.p.avatarUrl} px={22} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="bodyStrong" size={13.5} lh={1.2} numberOfLines={1}>{r.p.name}{r.p.id === selfId ? " (you)" : ""}</T>
          <T v="meta" size={11} color={c.ink3} numberOfLines={1}>{r.p.title}</T>
        </View>
      </View>
      <View style={styles.owe}>
        {r.s === "paid"
          ? <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Icon name="check" size={16} color={c.pastel.mint.ink} /><T v="title" size={16} color={c.pastel.mint.ink}>Paid up</T></View>
          : none ? <T v="title" size={15} color={c.ink3}>Nothing billed</T>
          : <T v="title" size={22} ls={-0.04} lh={1}>{money(r.owes)}</T>}
        <T v="label" size={10} ls={0.06} color={x.ink} numberOfLines={1}>{standingLine(r.s, r.lateDays, r.nextDueDate)}</T>
      </View>
      {r.billed > 0 ? <>
        <View style={[styles.bar, { backgroundColor: c.paper3 }]}><View style={{ width: `${(r.paid / r.billed) * 100}%`, height: "100%", backgroundColor: c.pastel.mint.ink, borderRadius: 9 }} /></View>
        <T v="mono" size={10} color={c.ink3} style={{ marginTop: 5 }}>{money(r.paid)} of {money(r.billed)} paid</T>
      </> : null}
    </Pressable>
  );
}

/** The list view; under 900px the web keeps Member, Owes and Standing. */
function Table({ rows, onOpen }: { rows: DuesRow[]; onOpen: (id: number) => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.tbl, { borderColor: c.line, backgroundColor: c.card }]}>
      <View style={[styles.tr, { backgroundColor: c.paper2 }]}>
        <T v="label" size={10.5} color={c.ink3} style={{ flex: 1 }}>Member</T>
        <T v="label" size={10.5} color={c.ink3} style={{ width: 84, textAlign: "right" }}>Owes</T>
        <T v="label" size={10.5} color={c.ink3} style={{ width: 96 }}>Standing</T>
      </View>
      {tableOrder(rows).map(r => <TableRow key={r.p.id} r={r} onOpen={onOpen} />)}
    </View>
  );
}

function TableRow({ r, onOpen }: { r: DuesRow; onOpen: (id: number) => void }) {
  const { c } = useTheme();
  const x = useStanding()(r.s);
  return (
    <Pressable onPress={() => onOpen(r.p.id)} accessibilityRole="button" style={({ pressed }) => [styles.tr, { borderTopWidth: 1, borderTopColor: c.line }, pressed && { backgroundColor: c.paper2 }]}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Avatar name={r.p.name} uri={r.p.avatarUrl} px={22} />
        <T v="bodyStrong" size={14} numberOfLines={1} style={{ flexShrink: 1 }}>{r.p.name}</T>
      </View>
      <T v="mono" size={13.5} style={{ width: 84, textAlign: "right", fontFamily: "PlexMono-600" }}>{r.owes ? money(r.owes) : "—"}</T>
      <View style={{ width: 96 }}>
        <View style={[styles.stp, { backgroundColor: x.soft, borderColor: x.border }]}><T v="pill" size={11.5} color={x.ink}>{r.s === "overdue" ? `${r.lateDays}d late` : STANDING[r.s].chip}</T></View>
      </View>
    </Pressable>
  );
}

function YourTab({ viewer, charges, today, onOpen }: { viewer: MemberDuesStanding; charges: DuesChargeSummary[]; today: string; onOpen: () => void }) {
  const { c } = useTheme();
  const x = useStanding()(viewer.standing);
  const next = viewer.nextChargeId !== null ? charges.find(ch => ch.id === viewer.nextChargeId) ?? null : null;
  return (
    <View style={[styles.you, { backgroundColor: c.card, borderColor: c.ink }, hard(viewer.standing === "none" ? c.pastel.mint.fill : x.fill, 4)]}>
      <View style={{ gap: 4 }}>
        <Kicker icon="jar">Your tab</Kicker>
        <View style={styles.big}>
          <T v="figure" size={34} ls={-0.05} lh={1}>{viewer.owes ? money(viewer.owes) : "Square"}</T>
          <T v="body" size={15} color={c.ink3}>
            {viewer.owes ? (viewer.standing === "overdue" ? `${viewer.lateDays} days late` : next ? `${next.name} · ${dueLine(next.dueDate, today).toLowerCase()}` : "owed") : `${money(viewer.paid)} paid · nothing left`}
          </T>
        </View>
        {next?.note ? <View style={[styles.dnote, { backgroundColor: c.paper2, borderColor: c.line2 }]}><T v="body" size={13.5} color={c.ink2}>{next.note}</T></View> : null}
      </View>
      <DuBtn ghost label="See it line by line" onPress={onOpen} />
    </View>
  );
}

const WAYS: { mode: SheetStart["mode"]; icon: IconName; tone: Tone; title: string; body: string; eg: (n: number) => string }[] = [
  { mode: "all", icon: "people", tone: "sky", title: "Everyone", body: "One amount, the whole roster.", eg: n => `Fall dues · $140 × ${n}` },
  { mode: "role", icon: "star", tone: "lilac", title: "By role", body: "A rate per role. Holding two roles? They pay both.", eg: () => "Treasurer $60 · Social $40" },
  { mode: "pick", icon: "hand", tone: "peach", title: "A few people", body: "Fines, a shirt, a retreat seat.", eg: () => "Late fine · $25 × 3" },
];

function DayOne({ count, canTreasury, duesWord, onStart }: { count: number; canTreasury: boolean; duesWord: string; onStart: (s: SheetStart) => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.d1, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.butter.fill, 5)]}>
      <View style={styles.eyebrow}><View style={[styles.eyebar, { backgroundColor: c.pastel.butter.fill }]} /><T v="label" size={11} ls={0.11} color={c.ink3}>{duesWord}</T></View>
      <View style={styles.h2} accessibilityRole="header" accessibilityLabel="Nobody’s been billed yet.">
        <T v="title" size={30} ls={-0.04} lh={1.1}>Nobody’s been </T>
        <View><View style={[styles.hi, { backgroundColor: c.pastel.butter.fill }]} /><T v="title" size={30} ls={-0.04} lh={1.1}>billed</T></View>
        <T v="title" size={30} ls={-0.04} lh={1.1}> yet.</T>
      </View>
      <T v="body" size={15} color={c.ink3} align="center" style={{ marginTop: 10 }}>
        {canTreasury
          ? `Hand out the term’s ${duesWord.toLowerCase()} once and this page keeps the tab for all ${count} of you: who’s paid, who’s late, and what’s still out.`
          : `When your treasurer hands out ${duesWord.toLowerCase()}, this page shows what each of you owes, what’s been paid, and what’s late.`}
      </T>
      <View style={{ gap: 16, marginTop: 28 }}>
        {WAYS.map(w => {
          const inner = <>
            <View style={[styles.g, { backgroundColor: c.note.fill[w.tone], borderColor: c.note.ink }]}><Icon name={w.icon} size={20} color={c.note.ink} /></View>
            <T v="title" size={18} ls={-0.025} style={{ marginTop: 14 }}>{w.title}</T>
            <T v="body" size={13.5} color={c.ink3} style={{ marginTop: 4 }}>{w.body}</T>
            <View style={[styles.eg, { backgroundColor: c.paper2, borderColor: c.line2 }]}><T v="mono" size={11.5} color={c.ink2}>{w.eg(count)}</T></View>
          </>;
          return canTreasury
            ? <Pressable key={w.mode} onPress={() => onStart({ mode: w.mode } as SheetStart)} accessibilityRole="button" style={({ pressed }) => [styles.way, { borderColor: pressed ? c.ink : c.line2, backgroundColor: c.paper }, pressed && hard(c.pastel[w.tone].fill, 4)]}>{inner}</Pressable>
            : <View key={w.mode} style={[styles.way, { borderColor: c.line2, backgroundColor: c.paper }]}>{inner}</View>;
        })}
      </View>
      {canTreasury ? <View style={{ alignItems: "center", marginTop: 26 }}><DuBtn label={`Hand out ${duesWord.toLowerCase()}`} icon="plus" onPress={() => onStart({ mode: "all" })} /></View> : null}
      <View style={{ marginTop: 30 }}>
        <Strip items={Array.from({ length: count }, (_, i) => ({ id: `n${i}`, s: "none" as DuesStanding }))} />
        <T v="meta" size={12.5} color={c.ink3} align="center" style={{ marginTop: 10 }}>One square per member. Each one fills in as they pay.</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: 28, borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 18 },
  big: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 12, rowGap: 4, marginTop: 8 },
  mbar: { flexDirection: "row", marginTop: 20, height: 22, borderWidth: 1.5, borderRadius: 999, overflow: "hidden" },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 6, marginTop: 12 },
  lg: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, borderWidth: 1.5, borderColor: "transparent", marginHorizontal: -6 },
  lsw: { width: 12, height: 12, borderRadius: 4, borderWidth: 1.5 },
  stripH: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 22 },
  cta: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 22, paddingTop: 18, borderTopWidth: 1.5, borderStyle: "dashed" },
  charges: { marginTop: 20, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  chargesH: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 4 },
  stub: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1.5, borderRadius: 14, overflow: "hidden" },
  stubEdge: { alignSelf: "stretch", width: 6, borderRightWidth: 1.5, borderStyle: "dashed" },
  aud: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  prog: { marginTop: 5, width: 84, height: 5, borderRadius: 9, overflow: "hidden" },
  more: { position: "absolute", right: -9, top: -9, width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  foot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 10, paddingHorizontal: 4, borderTopWidth: 1.5, borderStyle: "dashed" },
  wallH: { marginTop: 40, gap: 3 },
  tools: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 14 },
  filt: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 16 },
  fchip: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6 },
  fsw: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
  note: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 4 },
  laneH: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 1.5 },
  lsw2: { width: 14, height: 14, borderRadius: 5, borderWidth: 1.5 },
  tags: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10, marginTop: 14 },
  tag: { width: "48.5%", paddingLeft: 16, paddingRight: 14, paddingTop: 13, paddingBottom: 12, borderWidth: 1.5, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, borderTopRightRadius: 16, borderBottomRightRadius: 16, overflow: "hidden" },
  tagEdge: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  hole: { position: "absolute", right: 12, top: 12, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
  who: { flexDirection: "row", alignItems: "center", gap: 9, paddingRight: 14 },
  owe: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 11 },
  bar: { marginTop: 9, height: 5, borderRadius: 9, overflow: "hidden" },
  tbl: { marginTop: 18, borderWidth: 1.5, borderRadius: 18, overflow: "hidden" },
  tr: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 10 },
  stp: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  you: { marginTop: 28, borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 20, paddingVertical: 20, gap: 16 },
  dnote: { alignSelf: "flex-start", marginTop: 8, borderWidth: 1, borderStyle: "dashed", borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  d1: { marginTop: 30, borderWidth: 1.5, borderRadius: 26, paddingHorizontal: 20, paddingTop: 30, paddingBottom: 26 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 9, alignSelf: "center" },
  eyebar: { width: 18, height: 2, borderRadius: 2 },
  h2: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end", marginTop: 10 },
  hi: { position: "absolute", left: -3, right: -3, bottom: 2, height: "45%", borderRadius: 8, opacity: 0.75, transform: [{ rotate: "-0.8deg" }] },
  way: { borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18 },
  g: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  eg: { marginTop: 12, borderWidth: 1, borderStyle: "dashed", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
});
