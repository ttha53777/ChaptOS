/**
 * One member's tab, line by line (DuesMemberDrawer.tsx; a bottom sheet on phones, as the
 * web's own phone layout draws it): GET /api/dues/members/[id]. Everyone sees the same
 * sheet; a treasurer (`manage`) also gets Record payment, Waive some, Bill <name>, and
 * Take off on each open charge. A payment is a Dues income row in the books; a waiver
 * moves no money. Both are capped at what they owe (the server refuses more anyway).
 */
import type { PaymentMethod } from "@/lib/api-types";
import { PAY_METHODS, acctStatus, dueLine, fmtDay, money, parseDollars, type DuesPerson } from "@/lib/treasury/dues";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { recordPayment, useMemberBook, voidLine, voidWaiver, waive } from "~/data/dues";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Avatar } from "~/paper/bits";
import { Sheet } from "~/shell/sheets";
import { SkeletonCard } from "~/shell/states";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { DuBtn, DuLink, Empty, Kicker, Money, Sg, useStanding } from "./bits";

/** What a write tells the tab: the toast (with an optional undo) and whether the books moved. */
export interface DuesWriteDone { msg: string; undo?: () => Promise<string>; tx?: boolean }
export interface DrawerManage { onBill: () => void; onDone: (d: DuesWriteDone) => Promise<void> }

export function DuesMemberDrawer({ person, today, onClose, manage }: { person: DuesPerson | null; today: string; onClose: () => void; manage?: DrawerManage }) {
  const { c } = useTheme();
  const sw = useStanding();
  const q = useMemberBook(person?.id ?? null);
  const book = q.data && q.data.brotherId === person?.id ? q.data : null;
  const s = book?.standing;
  const first = person?.name.split(/\s+/)[0] ?? "";

  const [mode, setMode] = useState<null | "pay" | "waive">(null);
  const [amt, setAmt] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("venmo");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [takeOff, setTakeOff] = useState<number | null>(null);
  // A different person, or a refreshed book, closes any half-done form.
  useEffect(() => { setMode(null); setTakeOff(null); setErr(null); }, [person?.id, q.dataUpdatedAt]);

  const owes = s?.owes ?? 0;
  const amount = parseDollars(amt);
  const tooMuch = amount > owes + 1e-9;
  const open = (m: "pay" | "waive") => { setMode(m); setErr(null); setReason(""); setAmt(s ? String(s.owes) : ""); };

  const submit = async () => {
    if (!manage || !mode || !amount || tooMuch || !person) return;
    setBusy(true); setErr(null);
    try {
      const left = Math.round((owes - amount) * 100) / 100;
      if (mode === "pay") {
        await recordPayment({ brotherId: person.id, name: person.name, amount, method, date: today });
        haptics.success();
        await manage.onDone({ msg: `${money(amount)} from ${first} posted to the books${left ? "" : " · all square"}`, tx: true });
      } else {
        const w = await waive({ brotherId: person.id, amount, reason: reason.trim() || null });
        haptics.success();
        await manage.onDone({
          msg: `${money(amount)} waived for ${first}${left ? "" : " · all square"}`,
          undo: async () => { await voidWaiver(w.waiverId); return `Waiver undone. ${first} owes ${money(owes)} again.`; },
        });
      }
    } catch (e) {
      haptics.error();
      setErr(errorMessage(e, mode === "pay" ? "Couldn't record that payment. Nothing was posted." : "Couldn't waive that. Nothing changed."));
    } finally { setBusy(false); }
  };

  const doTakeOff = async (chargeId: number, name: string) => {
    if (!manage || !person) return;
    setBusy(true); setErr(null);
    try { await voidLine(chargeId, person.id); haptics.success(); await manage.onDone({ msg: `${first} taken off ${name}` }); }
    catch (e) { haptics.error(); setErr(errorMessage(e, "Couldn't take them off that charge.")); setTakeOff(null); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={!!person} onClose={onClose} size="tall" accessibilityLabel={person ? `${person.name}'s dues` : undefined}>
      {person ? (
        <View>
          <View style={[styles.h, { borderBottomColor: c.line }]}>
            <Avatar name={person.name} uri={person.avatarUrl} px={52} ring={c.ink} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T v="title" size={22} ls={-0.03} lh={1.15}>{person.name}</T>
              <T v="meta" size={13} color={c.ink3}>{person.title}</T>
            </View>
          </View>

          {q.isError && !book ? <Empty>{errorMessage(q.error, "Couldn't load this tab.")}</Empty> : null}
          {!book && !q.isError ? <SkeletonCard height={160} /> : null}
          {book && s ? <>
            <View style={[styles.acct, { backgroundColor: c.card, borderColor: c.ink }, hard(s.standing === "none" ? c.paper3 : sw(s.standing).fill, 3)]}>
              <Kicker>On their tab</Kicker>
              <View style={styles.row1}>
                <T v="figure" size={37} ls={-0.05} lh={1}>{s.owes ? money(s.owes) : s.billed ? "Square" : "—"}</T>
                <View style={[styles.stp, { backgroundColor: sw(s.standing).soft, borderColor: sw(s.standing).border }]}><T v="pill" size={11.5} color={sw(s.standing).ink}>{acctStatus(s)}</T></View>
              </View>
              {s.billed > 0 ? <>
                <View style={[styles.bar, { backgroundColor: c.paper3 }]}><View style={{ width: `${(s.paid / s.billed) * 100}%`, height: "100%", backgroundColor: c.pastel.mint.ink, borderRadius: 9 }} /></View>
                <T v="mono" size={11} color={c.ink3} style={{ marginTop: 5 }}>{money(s.paid)} of {money(s.billed)} paid</T>
              </> : null}
              {manage ? (
                <View style={styles.acts}>
                  <Act icon="wallet" tone="mint" label="Record payment" on={mode === "pay"} disabled={!owes} onPress={() => (mode === "pay" ? setMode(null) : open("pay"))} />
                  <Act icon="flag" tone="butter" label="Waive some" on={mode === "waive"} disabled={!owes} onPress={() => (mode === "waive" ? setMode(null) : open("waive"))} />
                  <Act icon="plus" tone="peach" label={`Bill ${first}`} onPress={manage.onBill} />
                </View>
              ) : null}
              {manage && mode && owes > 0 ? (
                <View style={[styles.inline, { borderColor: c.line2, backgroundColor: c.paper2 }]}>
                  <T v="bodyStrong" size={14}>{mode === "pay" ? `Record what ${first} paid` : "Waive part of the tab"}</T>
                  <T v="meta" size={12.5} color={c.ink3}>{mode === "pay" ? "Posts a Dues income row to the books and takes it off the tab." : "Lowers what they owe. No money moves, so nothing hits the books."}</T>
                  <View style={styles.r}>
                    <Money label="Amount" value={amt} onChangeText={setAmt} style={{ width: 130 }} autoFocus selectTextOnFocus />
                    {mode === "pay"
                      ? PAY_METHODS.map(m => <Sg key={m.k} label={m.l} on={method === m.k} onPress={() => setMethod(m.k)} />)
                      : <TextInput value={reason} onChangeText={setReason} maxLength={200} placeholder="Why? e.g. hardship, scholarship" placeholderTextColor={c.ink3}
                          accessibilityLabel="Reason" style={[styles.why, { borderColor: c.line2, backgroundColor: c.card, color: c.ink }]} />}
                  </View>
                  {tooMuch ? <T v="meta" size={12.5} style={{ fontFamily: "Inter-600" }} color={c.pastel.rose.ink}>{first} only owes {money(owes)}.</T> : null}
                  {err ? <T v="meta" size={12.5} style={{ fontFamily: "Inter-600" }} color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T> : null}
                  <View style={[styles.r, { marginTop: 12 }]}>
                    <DuBtn small label={busy ? "Saving…" : mode === "pay" ? "Record payment" : "Waive it"} onPress={() => void submit()} disabled={busy || !amount || tooMuch} />
                    <DuLink label="Cancel" onPress={() => setMode(null)} />
                  </View>
                </View>
              ) : null}
              {manage && !mode && err ? <T v="meta" size={12.5} style={{ fontFamily: "Inter-600", marginTop: 8 }} color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T> : null}
            </View>

            <T v="label" size={11} ls={0.11} color={c.ink3} style={styles.sec}>Their dues, line by line</T>
            {book.entries.length ? (
              <Book>
                {book.entries.map(e => (
                  <Bk key={`${e.kind}-${e.refId}`} d={fmtDay(e.date)} title={e.title} detail={e.detail}
                    a={e.amount < 0 ? `−${money(-e.amount)}` : `+${money(e.amount)}`} neg={e.amount < 0} />
                ))}
                <Bk total title="Still owes" a={money(s.owes)} />
              </Book>
            ) : <Empty>{`Nothing billed to ${first} yet.`}</Empty>}

            {book.open.length > 0 ? <>
              <T v="label" size={11} ls={0.11} color={c.ink3} style={styles.sec}>What’s still open</T>
              <Book>
                {book.open.map(o => (
                  <Bk key={o.chargeId} d={o.dueDate ? fmtDay(o.dueDate) : "—"} title={o.name} detail={dueLine(o.dueDate, today)} a={money(o.rest)}
                    after={manage ? (takeOff === o.chargeId ? (
                      <View style={styles.offQ}>
                        <T v="meta" size={12.5} color={c.ink2}>Take {first} off {o.name}?</T>
                        <DuLink rose label="Take off" onPress={() => { if (!busy) void doTakeOff(o.chargeId, o.name); }} />
                        <DuLink label="Keep" onPress={() => setTakeOff(null)} />
                      </View>
                    ) : (
                      <View style={styles.offQ}><DuLink label="Take off" onPress={() => setTakeOff(o.chargeId)} /></View>
                    )) : null} />
                ))}
              </Book>
            </> : null}
            <View style={{ height: 12 }} />
          </> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

function Act({ icon, tone, label, on, disabled, onPress }: { icon: IconName; tone: Tone; label: string; on?: boolean; disabled?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: !!on, disabled: !!disabled }}
      style={[styles.act, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.paper2 : c.card }, disabled && { opacity: 0.4 }]}>
      <View style={[styles.g, { backgroundColor: c.note.fill[tone], borderColor: c.note.ink }]}><Icon name={icon} size={15} color={c.note.ink} /></View>
      <T v="buttonSm" size={12.5} align="center" numberOfLines={2}>{label}</T>
    </Pressable>
  );
}

function Book({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.book, { borderColor: c.line, backgroundColor: c.card }]}>
      <View style={[styles.margin, { backgroundColor: c.pastel.rose.border }]} pointerEvents="none" />
      {children}
    </View>
  );
}

function Bk({ d = "", title, detail, a, neg, total, after }: { d?: string; title: string; detail?: string | null; a: string; neg?: boolean; total?: boolean; after?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.bkW, { borderTopColor: c.line }, total && { backgroundColor: c.paper2 }]}>
      <View style={styles.bk}>
        <T v="mono" size={10.5} color={c.ink3} style={{ width: 40, textAlign: "right" }}>{d}</T>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="bodyStrong" size={13.5}>{title}</T>
          {detail ? <T v="meta" size={11.5} color={c.ink3}>{detail}</T> : null}
        </View>
        <T v="mono" size={13.5} style={{ fontFamily: "PlexMono-600" }} color={neg ? c.pastel.mint.ink : c.ink}>{a}</T>
      </View>
      {after}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingBottom: 18, marginBottom: 20, borderBottomWidth: 1.5 },
  acct: { borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16 },
  row1: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 8 },
  stp: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  bar: { marginTop: 14, height: 6, borderRadius: 9, overflow: "hidden" },
  acts: { flexDirection: "row", gap: 8, marginTop: 16 },
  act: { flex: 1, alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 6, paddingVertical: 10 },
  g: { width: 30, height: 30, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  inline: { marginTop: 14, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, padding: 14, gap: 6 },
  r: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 6 },
  why: { flex: 1, minWidth: 160, borderWidth: 1.5, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Inter-400", fontSize: 14 },
  sec: { marginTop: 24, marginBottom: 10 },
  book: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  margin: { position: "absolute", left: 52, top: 0, bottom: 0, width: 1.5 },
  bkW: { borderTopWidth: 1, marginTop: -1 },
  bk: { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 10, paddingRight: 14, paddingVertical: 10 },
  offQ: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, paddingLeft: 62, paddingRight: 14, paddingBottom: 10, marginTop: -4 },
});
