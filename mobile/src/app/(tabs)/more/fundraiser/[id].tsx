/**
 * One fundraiser (app/org/[slug]/fundraisers/[id] at phone width), from a card on
 * Fundraisers. Rules and words: lib/fundraising/ledger (shared with the web).
 *
 *   head         the day, the name, kind / date / hours / place / goal chips; Edit and
 *                Delete → "Delete for good?" (4s) for MANAGE_FUNDRAISING
 *   steps        Shopping list → Wrap up → What you made
 *   shopping     numbered lines, each saved when you leave it; "Add a supply…" with its
 *                cost; the usual supplies for its kind as chips; the running total.
 *                Locked once wrapped, read-only for members.
 *   the jar      before: "How much came in?", the jar over the list total, the legend, the
 *                came-in field and its subtraction, Wrap it up. After: We made / Came up
 *                short, the figure, the stamped jar, the receipt, the goal line, Copy for
 *                the group chat, Reopen.
 *
 * Arrivals as on the web: ?created=1 says "Created. Now, what are you buying?" and puts
 * the cursor on the list; ?wrap=1 (or a ready one, for an officer) on the total. Once the
 * server has the wrap-up, the jar fills over the page and the stamp slams (JarMoment).
 */
import type { Fundraiser } from "@/lib/api-types";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { memo, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { isApiError } from "~/api/errors";
import { addSupply, deleteFundraiser, patchSupply, removeSupply, reopenFundraiser, useFundraiser, wrapFundraiser } from "~/data/fundraisers";
import { localDay } from "~/data/home";
import { useEntryOf } from "~/entry/EntryContext";
import { Cal, Chip, KindChip, MoneyJar, StepsBar } from "~/fundraisers/bits";
import {
  $m, DETAIL, FUNDRAISER_KINDS, SAY, canFund, stageOf, copyText, dateRel, errorText, fmtD, goalLine, hours, inV, num, spentOf, steps as stepsOf, suggestionsFor,
} from "~/fundraisers/model";
import { Composer, JarMoment } from "~/fundraisers/sheets";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { Screen } from "~/shell/Screen";
import { ErrorState, SkeletonCard } from "~/shell/states";
import { toast } from "~/shell/toast";
import { alpha } from "~/theme/palette";
import { useFontScale, useTheme } from "~/theme/PaperProvider";
import { resolveType } from "~/theme/type";
import { TrBtn } from "~/treasury/bits";
import { T } from "~/ui/T";

interface Row { id: number; name: string; cost: string }
type TI = ComponentRef<typeof TextInput>;

export default function FundraiserPage() {
  const { c } = useTheme();
  const { id: idS, created, wrap } = useLocalSearchParams<{ id: string; created?: string; wrap?: string }>();
  const id = Number(idS);
  const me = useEntryOf("ready")?.me ?? null;
  const canManage = !!me && canFund(me);
  const q = useFundraiser(id);
  const f = q.data;
  const today = localDay();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moment, setMoment] = useState<Fundraiser | null>(null);
  const [addN, setAddN] = useState(""), [addC, setAddC] = useState("");
  const addName = useRef<TI>(null), totalRef = useRef<TI>(null);
  const seen = useRef<Fundraiser | undefined>(undefined);

  // Take the server's copy, except a line someone is still mid-edit on (it differs from
  // what the server last said), so a save on one line can't wipe another.
  useEffect(() => {
    if (!f) return;
    const prev = seen.current; seen.current = f;
    setRows(rs => f.supplies.map(s => {
      const local = rs.find(r => r.id === s.id), old = prev?.supplies.find(o => o.id === s.id);
      const dirty = local && old && (local.name !== old.name || num(local.cost) !== old.cost);
      return dirty ? local : { id: s.id, name: s.name, cost: inV(s.cost) };
    }));
  }, [f]);

  const arrived = useRef(false);
  useEffect(() => {
    if (!f || arrived.current) return; arrived.current = true;
    if (created) { toast.show(SAY.created); setTimeout(() => addName.current?.focus(), 400); }
    else if (canManage && !f.wrappedAt && (wrap || stageOf({ date: f.date, wrapped: false }, today) === "ready")) setTimeout(() => totalRef.current?.focus(), 500);
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!confirmDelete) return; const t = setTimeout(() => setConfirmDelete(false), 4000); return () => clearTimeout(t); }, [confirmDelete]);

  const spent = useMemo(() => spentOf(rows.map(r => r.cost)), [rows]);
  const names = useMemo(() => rows.map(r => r.name), [rows]);
  const sugg = useMemo(() => (f ? suggestionsFor(f.kind, names) : []), [f, names]);
  const stepList = useMemo(() => (f ? stepsOf(f, spent, rows.length, today) : []), [f, spent, rows.length, today]);

  if (!f) {
    const missing = isApiError(q.error, 404);
    return (
      <Screen title={DETAIL.back} back={DETAIL.back} onRefresh={() => q.refetch()}>
        {missing ? (
          <View style={{ gap: 12, alignItems: "flex-start" }}>
            <T v="body">{DETAIL.missing}</T>
            <TrBtn kind="ghost" label={DETAIL.back} onPress={() => router.back()} />
          </View>
        ) : q.isError ? <ErrorState title={DETAIL.loadFailed} error={q.error} onRetry={() => void q.refetch()} /> : <SkeletonCard height={260} />}
      </Screen>
    );
  }

  const fund = f;
  const wrapped = !!fund.wrappedAt, locked = wrapped || !canManage;
  const st = stageOf({ date: fund.date, wrapped }, today);
  const K = FUNDRAISER_KINDS[fund.kind];

  async function call(run: () => Promise<Fundraiser>, fail: string): Promise<Fundraiser | null> {
    setBusy(true);
    try { return await run(); }
    catch (e) { haptics.error(); toast.error(errorText(e, fail)); return null; }
    finally { setBusy(false); }
  }
  async function add(name: string, cost: number, viaChip = false) {
    name = name.trim(); if (!name) return;
    const next = await call(() => addSupply(fund.id, name, cost), SAY.addFailed);
    if (!next) return;
    haptics.success();
    if (viaChip) toast.show(SAY.added(name));
    else { setAddN(""); setAddC(""); addName.current?.focus(); }
  }
  async function saveRow(rowId: number) {
    const r = rows.find(x => x.id === rowId), was = fund.supplies.find(s => s.id === rowId);
    if (!r || !was) return;
    const name = r.name.trim(), cost = num(r.cost);
    if (!name) { setRows(rs => rs.map(x => (x.id === rowId ? { ...x, name: was.name } : x))); return; }
    if (name === was.name && cost === was.cost) return;
    await call(() => patchSupply(fund.id, rowId, name, cost), SAY.lineFailed);
  }
  async function remove(r: Row) {
    const next = await call(() => removeSupply(fund.id, r.id), SAY.removeFailed);
    if (next) { haptics.success(); toast.show(SAY.removed(r.name)); }
  }
  async function wrapUp() {
    const cameIn = num(total); if (!cameIn || busy) return;
    const next = await call(() => wrapFundraiser(fund.id, cameIn), SAY.wrapFailed);
    if (!next) return;
    setMoment(next); // the stamp's impact carries the success tap
    toast.show(SAY.wrapped(next.made ?? 0));
  }
  async function reopen() {
    const keep = fund.cameIn;
    const next = await call(() => reopenFundraiser(fund.id), SAY.reopenFailed);
    if (!next) return;
    haptics.success();
    setTotal(inV(keep ?? 0));
    setTimeout(() => totalRef.current?.focus(), 80);
  }
  async function del() {
    setBusy(true);
    try {
      await deleteFundraiser(fund.id);
      haptics.success();
      toast.show(SAY.deleted(fund.name));
      router.back();
    } catch (e) { haptics.error(); toast.error(errorText(e, SAY.deleteFailed)); setBusy(false); }
  }
  async function copy() {
    try { await Clipboard.setStringAsync(copyText(fund)); toast.show(SAY.copied); }
    catch { toast.error(SAY.copyFailed); }
  }

  const inn = num(total), m = Math.round((inn - spent) * 100) / 100;
  const edit = (rowId: number, patch: Partial<Row>) => setRows(rs => rs.map(x => (x.id === rowId ? { ...x, ...patch } : x)));

  return (
    <Screen title={fund.name} back={DETAIL.back} onRefresh={() => q.refetch()}>
      <View style={{ gap: 18 }}>
        <View style={styles.head}>
          <Cal date={fund.date} size={52} />
          <View style={{ flex: 1, gap: 8 }}>
            <T v="title" accessibilityRole="header">{fund.name}</T>
            <View style={styles.chips}>
              <KindChip kind={fund.kind} />
              <Chip icon="cal" text={`${fmtD(fund.date)}${dateRel(fund.date, wrapped, today)}`} />
              {fund.startTime ? <Chip icon="clock" text={hours(fund)} /> : null}
              {fund.place ? <Chip icon="pin" text={fund.place} /> : null}
              {fund.goal != null ? <Chip icon="flag" text={`${DETAIL.goalK}${$m(fund.goal)}`} tone="lilac" /> : null}
            </View>
          </View>
        </View>
        {canManage ? (
          <View style={styles.acts}>
            <TrBtn kind="ghost" small label={DETAIL.edit} icon="pencil" disabled={busy} onPress={() => setEditing(true)} />
            <Pressable disabled={busy} onPress={() => (confirmDelete ? void del() : setConfirmDelete(true))} accessibilityRole="button" hitSlop={8}
              style={({ pressed }) => [styles.link, pressed && pressedDim]}>
              <T v="callout" color={c.pastel.rose.ink} style={{ fontWeight: "600", textDecorationLine: "underline" }}>{DETAIL.del(confirmDelete)}</T>
            </Pressable>
          </View>
        ) : null}

        <StepsBar steps={stepList} count={rows.length} wrapped={wrapped} />

        {/* the shopping list */}
        <View style={[styles.pad, { backgroundColor: c.note.fill.butter, borderColor: c.ink, opacity: locked && !canManage ? 1 : 1 }]}>
          <View style={styles.padH}>
            <View style={[styles.tile, { backgroundColor: c.pastel.butter.fill, borderColor: c.ink }]}><Icon name="bag" size={16} color={c.ink} /></View>
            <View style={{ flex: 1 }}>
              <T v="subhead" accessibilityRole="header">{DETAIL.padTitle}</T>
              <T v="meta" color={c.ink2}>{DETAIL.padSub(wrapped, canManage)}</T>
            </View>
          </View>
          <View>
            {rows.map((r, i) => (
              <Line key={r.id} n={i + 1} row={r} locked={locked} busy={busy}
                onName={v => edit(r.id, { name: v })} onCost={v => edit(r.id, { cost: v })}
                onLeave={() => void saveRow(r.id)} onRemove={() => void remove(r)} />
            ))}
            {!locked ? (
              <View style={[styles.line, { borderBottomColor: alpha(c.ink, 0.15) }]}>
                <View style={styles.no}><Icon name="plus" size={13} color={c.ink3} /></View>
                <Input ref={addName} value={addN} onChange={setAddN} placeholder={DETAIL.addPh} label="New supply" flex
                  onSubmit={() => void add(addN, num(addC))} />
                <Cost value={addC} onChange={setAddC} label="Cost" onSubmit={() => void add(addN, num(addC))} />
                <Pressable onPress={() => void add(addN, num(addC))} disabled={busy} accessibilityRole="button" accessibilityLabel="Add supply" hitSlop={8}
                  style={({ pressed }) => [styles.x, pressed && pressedDim]}>
                  <Icon name="plus" size={15} color={c.ink} />
                </Pressable>
              </View>
            ) : null}
          </View>
          {!rows.length && !locked ? <T v="meta" color={c.ink3}>{DETAIL.empty[0]}{sugg.length ? DETAIL.empty[1] : ""}{DETAIL.empty[2]}</T> : null}
          {!rows.length && locked ? <T v="meta" color={c.ink3}>{DETAIL.emptyLocked}</T> : null}
          {sugg.length > 0 && !locked ? (
            <View style={{ gap: 8 }}>
              <T v="meta" color={c.ink2}>{DETAIL.usually(K.label)}</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
                {sugg.map(([n, cost]) => (
                  <Pressable key={n} disabled={busy} onPress={() => void add(n, cost, true)} accessibilityRole="button" accessibilityLabel={`Add ${n}, about $${cost}`}
                    style={({ pressed }) => [styles.sugg, { borderColor: c.ink, backgroundColor: c.card }, pressed && pressedDim]}>
                    <Icon name="plus" size={12} color={c.ink} />
                    <T v="meta" color={c.ink}>{n} <T v="meta" color={c.ink3} style={{ fontStyle: "italic" }}>{DETAIL.sugg(cost)}</T></T>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <View style={[styles.total, { borderTopColor: c.ink }]}>
            <T v="callout" style={{ fontWeight: "700" }}>{DETAIL.supplies}</T>
            <T v="meta" color={c.ink3} style={{ flex: 1 }}>{DETAIL.items(rows.length)}</T>
            <T v="mono" style={{ fontWeight: "700" }}>{$m(spent)}</T>
          </View>
        </View>

        {/* the jar */}
        {!wrapped ? (
          <View style={[styles.jar, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `4px 4px 0 ${c.pastel.mint.fill}` }]}>
            <T v="title" size={22} accessibilityRole="header">{DETAIL.jarTitle(st === "ready")}</T>
            <T v="body" color={c.ink2}>{DETAIL.lede(canManage, st === "ready", fund.date)}</T>
            <View style={styles.jarRow}>
              <MoneyJar uid={`d${fund.id}`} sup={spent} goal={fund.goal} inn={inn || null} width={130} />
              <View style={{ flex: 1, gap: 8 }}>
                <Legend swatch={c.pastel.butter.fill} label={DETAIL.legend[0]} value={$m(Math.min(inn, spent))} />
                <Legend swatch={c.pastel.mint.fill} label={DETAIL.legend[1]} value={$m(Math.max(m, 0))} />
                {fund.goal != null ? <Legend dashed={c.pastel.lilac.ink} label={DETAIL.legend[2]} value={$m(fund.goal)} /> : null}
              </View>
            </View>
            {canManage ? (
              <>
                <View style={{ gap: 6 }}>
                  <View style={styles.fldL}><Icon name="cash" size={14} color={c.ink2} /><T v="callout" style={{ fontWeight: "600" }}>{DETAIL.total}</T></View>
                  <Amount ref={totalRef} value={total} onChange={setTotal} onSubmit={() => void wrapUp()} />
                </View>
                <T v="body" color={c.ink2} accessibilityLiveRegion="polite">{!inn
                  ? <>{DETAIL.mathEmpty[0]}<T v="mono">{$m(spent)}</T>{DETAIL.mathEmpty[1]}<T v="body" color={c.ink3} style={{ fontWeight: "700" }}>{DETAIL.mathEmpty[2]}</T></>
                  : <><T v="mono">{$m(inn)}</T>{DETAIL.math[0]}<T v="body" color={c.ink3}>{DETAIL.math[1]}</T> <T v="mono">{$m(spent)}</T>{DETAIL.math[2]}<T v="body" color={c.ink3}>{DETAIL.math[3]}</T> <T v="body" color={m < 0 ? c.pastel.rose.ink : c.pastel.mint.ink} style={{ fontWeight: "700" }}><T v="mono" color={m < 0 ? c.pastel.rose.ink : c.pastel.mint.ink}>{$m(Math.abs(m))}</T> {m < 0 ? DETAIL.short : DETAIL.made}</T></>}</T>
                <View style={{ gap: 8, alignItems: "flex-start" }}>
                  <TrBtn label={DETAIL.wrap} icon="check" disabled={!inn || busy} onPress={() => void wrapUp()} />
                  <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{DETAIL.wrapNote}</T>
                </View>
              </>
            ) : null}
          </View>
        ) : <Wrapped fund={fund} canManage={canManage} busy={busy} onCopy={() => void copy()} onReopen={() => void reopen()} />}
      </View>
      {canManage ? <Composer open={editing} editing={fund} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); toast.show(SAY.saved); }} /> : null}
      <JarMoment f={moment} onDone={() => setMoment(null)} />
    </Screen>
  );
}

function Wrapped({ fund, canManage, busy, onCopy, onReopen }: { fund: Fundraiser; canManage: boolean; busy: boolean; onCopy: () => void; onReopen: () => void }) {
  const { c } = useTheme();
  const made = fund.made ?? 0, loss = made < 0, g = fund.goal;
  const tone = loss ? c.pastel.rose : c.pastel.mint;
  const rc = DETAIL.rcpt(loss);
  return (
    <View style={[styles.jar, { backgroundColor: tone.soft, borderColor: c.ink, boxShadow: `4px 4px 0 ${tone.fill}` }]}>
      <T v="kicker" color={tone.ink}>{DETAIL.kick(loss)}</T>
      <View style={[styles.big, { backgroundColor: tone.fill }]}><T v="hero" size={44}>{$m(Math.abs(made))}</T></View>
      <View style={styles.jarRow}>
        <MoneyJar uid={`w${fund.id}`} sup={fund.spent} goal={g} inn={fund.cameIn} stamp={loss ? "SHORT" : "WRAPPED"} width={130} />
        <View style={[styles.rcpt, { backgroundColor: c.card, borderColor: c.line2 }]}>
          <RLine k={rc[0]} v={$m(fund.cameIn ?? 0)} />
          <RLine k={rc[1]} v={`−${$m(fund.spent)}`} />
          <View style={{ borderTopWidth: 1.5, borderTopColor: c.ink, borderStyle: "dashed", paddingTop: 4 }}><RLine k={rc[2]} v={$m(made)} bold /></View>
        </View>
      </View>
      {g != null ? (
        <View style={styles.goalbar}>
          <Icon name="flag" size={14} color={c.ink2} />
          <T v="body" color={c.ink2} style={{ flex: 1 }}>{goalLine(made, g).map((p, i) => <T key={i} v="body" color={p.bold ? c.ink : c.ink2} style={p.bold ? { fontWeight: "700" } : undefined}>{p.text}</T>)}</T>
        </View>
      ) : null}
      {loss ? (
        <View style={styles.goalbar}>
          <Icon name="receipt" size={14} color={c.ink2} />
          <T v="body" color={c.ink2} style={{ flex: 1 }}>{DETAIL.lossLine}</T>
        </View>
      ) : null}
      <View style={styles.acts}>
        <TrBtn kind="ghost" small label={DETAIL.copy} icon="copy" onPress={onCopy} />
        {canManage ? (
          <Pressable disabled={busy} onPress={onReopen} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.link, pressed && pressedDim]}>
            <T v="callout" color={c.ink2} style={{ fontWeight: "600", textDecorationLine: "underline" }}>{DETAIL.reopen}</T>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function RLine({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={styles.rline}>
      <T v="mono" color={bold ? c.ink : c.ink2} style={{ fontSize: 12, fontWeight: bold ? "700" : "400" }}>{k}</T>
      <T v="mono" color={c.ink} style={{ fontSize: 12, fontWeight: bold ? "700" : "400" }}>{v}</T>
    </View>
  );
}

function Legend({ swatch, dashed, label, value }: { swatch?: string; dashed?: string; label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.legend}>
      <View style={[styles.sw, swatch ? { backgroundColor: swatch, borderColor: c.ink } : { borderColor: dashed, borderStyle: "dashed" }]} />
      <T v="meta" color={c.ink2} style={{ flex: 1 }}>{label}</T>
      <T v="mono" style={{ fontSize: 12 }}>{value}</T>
    </View>
  );
}

const Line = memo(function Line({ n, row, locked, busy, onName, onCost, onLeave, onRemove }: {
  n: number; row: Row; locked: boolean; busy: boolean;
  onName: (v: string) => void; onCost: (v: string) => void; onLeave: () => void; onRemove: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.line, { borderBottomColor: alpha(c.ink, 0.15) }]}>
      <View style={styles.no}><T v="mono" color={c.ink3} style={{ fontSize: 12 }}>{String(n)}</T></View>
      <Input value={row.name} onChange={onName} label="Supply" readOnly={locked} onLeave={onLeave} flex />
      <Cost value={row.cost} onChange={onCost} label={`Cost of ${row.name}`} readOnly={locked} onLeave={onLeave} />
      {!locked ? (
        <Pressable onPress={onRemove} disabled={busy} accessibilityRole="button" accessibilityLabel={`Remove ${row.name}`} hitSlop={8}
          style={({ pressed }) => [styles.x, pressed && pressedDim]}>
          <Icon name="x" size={14} color={c.ink3} />
        </Pressable>
      ) : null}
    </View>
  );
});

interface InputProps {
  value: string; onChange: (v: string) => void; label: string; placeholder?: string;
  readOnly?: boolean; onLeave?: () => void; onSubmit?: () => void; flex?: boolean; ref?: React.Ref<TI>;
}

function Input({ value, onChange, label, placeholder, readOnly, onLeave, onSubmit, flex, ref }: InputProps) {
  const { c } = useTheme();
  const fs = useFontScale();
  return (
    <TextInput ref={ref} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.faint} accessibilityLabel={label}
      editable={!readOnly} maxLength={120} onBlur={onLeave} onSubmitEditing={onSubmit} returnKeyType={onSubmit ? "done" : "next"} submitBehavior={onSubmit ? "submit" : "blurAndSubmit"}
      style={[resolveType("body", fs), { color: c.ink, paddingVertical: 8 }, flex && { flex: 1, minWidth: 0 }]} />
  );
}

function Cost({ value, onChange, label, readOnly, onLeave, onSubmit }: InputProps) {
  const { c } = useTheme();
  const fs = useFontScale();
  return (
    <View style={styles.cost}>
      <T v="mono" color={c.ink3}>$</T>
      <TextInput value={value} onChangeText={onChange} placeholder={DETAIL.costPh} placeholderTextColor={c.faint} accessibilityLabel={label}
        editable={!readOnly} keyboardType="decimal-pad" onBlur={onLeave} onSubmitEditing={onSubmit}
        style={[resolveType("mono", fs), { color: c.ink, paddingVertical: 8, width: 64, textAlign: "right" }]} />
    </View>
  );
}

function Amount({ value, onChange, onSubmit, ref }: { value: string; onChange: (v: string) => void; onSubmit: () => void; ref?: React.Ref<TI> }) {
  const { c } = useTheme();
  const fs = useFontScale();
  return (
    <View style={[styles.amt, { borderColor: c.ink, backgroundColor: c.card }]}>
      <T v="title" color={c.ink3}>$</T>
      <TextInput ref={ref} value={value} onChangeText={onChange} placeholder="0" placeholderTextColor={c.faint} accessibilityLabel={DETAIL.total}
        keyboardType="decimal-pad" returnKeyType="done" onSubmitEditing={onSubmit}
        style={[resolveType("title", fs), { color: c.ink, flex: 1, paddingVertical: 10 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  acts: { flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" },
  link: { paddingVertical: 4 },
  pad: { borderWidth: 1.5, borderRadius: 6, padding: 14, gap: 12, transform: [{ rotate: "-0.4deg" }] },
  padH: { flexDirection: "row", gap: 10, alignItems: "center" },
  tile: { width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  line: { flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1 },
  no: { width: 20, alignItems: "center" },
  cost: { flexDirection: "row", alignItems: "center", gap: 2 },
  x: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  sugg: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  total: { flexDirection: "row", alignItems: "baseline", gap: 8, borderTopWidth: 1.5, paddingTop: 10 },
  jar: { borderWidth: 1.5, borderRadius: 18, padding: 16, gap: 14 },
  jarRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  legend: { flexDirection: "row", alignItems: "center", gap: 8 },
  sw: { width: 14, height: 14, borderRadius: 3, borderWidth: 1.5 },
  fldL: { flexDirection: "row", alignItems: "center", gap: 6 },
  amt: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12 },
  big: { alignSelf: "flex-start", paddingHorizontal: 10, borderRadius: 8, transform: [{ rotate: "-1deg" }] },
  rcpt: { flex: 1, borderWidth: 1.5, borderRadius: 8, padding: 10, gap: 4 },
  rline: { flexDirection: "row", justifyContent: "space-between" },
  goalbar: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
});
