/**
 * "Hand out dues" (HandOutDuesSheet.tsx at phone width, where the web folds the receipt
 * into a sticky footer): put one charge on some people's tabs. Who's paying (Everyone,
 * leaving some out · By role, a rate per row · Pick people), what it's for and how much,
 * when it's due, a note. The footer's total is resolveTargets() over this roster — the
 * same code POST /api/dues/charges runs — so what it reads is what gets written. Nothing
 * hits the books: a charge is a receivable.
 */
import type { DuesBoard, DuesChargeIssued } from "@/lib/api-types";
import { resolveTargets, type DuesTargetSpec, type ExistingCharge, type RateRow } from "@/lib/dues-targets";
import {
  addDays, cash, chargeSuggestions, dueDateOf, endOfMonth, fmtDay, handOutHint, money, parseDollars, plural, splitNote,
  type DueChoice, type DuesPerson, type RoleOption, type SheetMode,
} from "@/lib/treasury/dues";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { issueCharge, type IssueChargeBody } from "~/data/dues";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Sheet } from "~/shell/sheets";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { DuBtn, DuLink, Money, Search, Seg, Sg, Stack } from "./bits";
import { DayStep, DueChoiceBtn } from "./ChargeEdit";
import { pressedDim } from "~/motion/press";

export type SheetStart = { mode: "all" } | { mode: "role"; key?: number | "none" } | { mode: "pick"; brotherIds?: number[] };
type RateKey = number | "base" | "none";
const rk = (k: RateKey) => String(k);
type Rates = Record<string, { on: boolean; amt: string }>;

function ratesFor(start: SheetStart | null, roles: readonly RoleOption[]): Rates {
  const role = start?.mode === "role" ? start : null;
  const out: Rates = { base: { on: false, amt: "" }, none: { on: !role || role.key === undefined || role.key === "none", amt: "" } };
  for (const r of roles) out[rk(r.id)] = { on: !!role && role.key === r.id, amt: "" };
  return out;
}

export function HandOutSheet({ start, people, roles, board, duesWord, onClose, onIssued }: {
  start: SheetStart | null; people: readonly DuesPerson[]; roles: readonly RoleOption[]; board: DuesBoard; duesWord: string;
  onClose: () => void; onIssued: (issued: DuesChargeIssued) => void;
}) {
  const { c } = useTheme();
  const today = board.today;
  const [who, setWho] = useState<SheetMode>("all");
  const [excl, setExcl] = useState<number[]>([]);
  const [xq, setXq] = useState("");
  const [rates, setRates] = useState<Rates>({});
  const [picked, setPicked] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [amt, setAmt] = useState("");
  const [split, setSplit] = useState(false);
  const [total, setTotal] = useState("");
  const [due, setDue] = useState<DueChoice>("2w");
  const [custom, setCustom] = useState(addDays(today, 21));
  const [note, setNote] = useState("");
  const [dup, setDup] = useState<"skip" | "bill">("skip");
  const [phase, setPhase] = useState<"edit" | "sending">("edit");
  const [error, setError] = useState<string | null>(null);

  // Every opening starts fresh, from the door it came through.
  useEffect(() => {
    if (!start) return;
    setWho(start.mode); setExcl([]); setXq(""); setRates(ratesFor(start, roles));
    setPicked(start.mode === "pick" ? start.brotherIds ?? [] : []); setQ(""); setName(""); setAmt(""); setSplit(false); setTotal("");
    setDue("2w"); setCustom(addDays(today, 21)); setNote(""); setDup("skip"); setPhase("edit"); setError(null);
  }, [start]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const standing = useMemo(() => new Map(board.members.map(m => [m.brotherId, m])), [board.members]);
  const existing = useMemo<ExistingCharge[]>(() => board.charges.map(ch => ({
    chargeId: ch.id, name: ch.name, brotherIds: new Set(board.members.filter(m => m.lines.some(l => l.chargeId === ch.id)).map(m => m.brotherId)),
  })), [board]);
  const members = useMemo(() => people.map(p => ({ brotherId: p.id, name: p.name, roleIds: p.roleIds })), [people]);

  const dueDate = dueDateOf(due, today, custom);
  const customBad = due === "custom" && !/^\d{4}-\d{2}-\d{2}$/.test(custom);
  const checkedRows = (["base", "none", ...roles.map(r => r.id)] as RateKey[]).filter(k => rates[rk(k)]?.on);
  const rowMissingAmt = who === "role" && checkedRows.some(k => parseDollars(rates[rk(k)]!.amt) === 0);
  const spec: DuesTargetSpec = who === "role"
    ? { kind: "role", rates: checkedRows.map((k): RateRow => ({ key: k, amountCents: Math.round(parseDollars(rates[rk(k)]!.amt) * 100) })) }
    : (() => {
        const amount = split ? { mode: "split" as const, totalCents: Math.round(parseDollars(total) * 100) } : { mode: "each" as const, cents: Math.round(parseDollars(amt) * 100) };
        return who === "all" ? { kind: "all", amount, exclude: excl } : { kind: "pick", amount, brotherIds: picked };
      })();
  const res = resolveTargets(spec, members, { name, existing, onDuplicate: dup });
  const selectedCount = who === "all" ? people.length - excl.length : who === "pick" ? picked.length : res.selected;
  const dupCharge = res.duplicateOf !== null ? board.charges.find(x => x.id === res.duplicateOf) ?? null : null;
  const ok = phase === "edit" && res.lines.length > 0 && res.totalCents > 0 && !!name.trim() && !rowMissingAmt && !customBad;
  const hint = handOutHint({ selectedCount, name, rowMissingAmt, customBad, lines: res.lines.length, skipped: res.skipped.length });

  const submit = async () => {
    if (!ok) return;
    setPhase("sending"); setError(null);
    const amountBody = () => (split ? { mode: "split" as const, total: parseDollars(total) } : { mode: "each" as const, amount: parseDollars(amt) });
    const audience: IssueChargeBody["audience"] = who === "role"
      ? { kind: "role", rates: checkedRows.map(k => ({ key: k, amount: parseDollars(rates[rk(k)]!.amt) })) }
      : who === "all" ? { kind: "all", exclude: excl, amount: amountBody() }
      : { kind: "pick", brotherIds: picked, amount: amountBody() };
    try {
      const issued = await issueCharge({ name: name.trim(), dueDate, note: note.trim() || null, audience, onDuplicate: dup, ...(board.term ? { semester: board.term.label } : {}) });
      haptics.success();
      onIssued(issued);
    } catch (e) {
      haptics.error();
      setPhase("edit");
      setError(errorMessage(e, "Couldn't hand that out. Nothing was billed — try again."));
    }
  };

  const inRoster = people.filter(p => !excl.includes(p.id));
  const needle = q.trim().toLowerCase();
  const pickList = people.filter(p => !needle || p.name.toLowerCase().includes(needle) || p.title.toLowerCase().includes(needle));
  const xNeedle = xq.trim().toLowerCase();
  const xMatches = xNeedle ? inRoster.filter(p => p.name.toLowerCase().includes(xNeedle)).slice(0, 6) : [];
  const roleMembers = (k: RateKey) => (k === "base" ? people : k === "none" ? people.filter(p => p.roleIds.length === 0) : people.filter(p => p.roleIds.includes(k)));
  const sn = split ? splitNote(parseDollars(total), selectedCount) : null;
  const word = duesWord.toLowerCase();

  return (
    <Sheet open={!!start} onClose={onClose} locked={phase === "sending"} size="tall" tone="butter" icon="jar" title={`Hand out ${word}`}
      kicker="Puts a charge on people’s tabs. Nothing hits the books until they pay."
      footer={
        <View style={styles.sum}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="title" size={21} ls={-0.03} lh={1.1}>{cash(res.totalCents)}</T>
            <T v="meta" size={12} color={error ? c.pastel.rose.ink : c.ink3} numberOfLines={1} accessibilityRole={error ? "alert" : undefined}>
              {error ?? (res.lines.length ? `${plural(res.lines.length, "person", "people")}${name.trim() ? ` · ${name.trim()}` : ""}` : hint)}
            </T>
          </View>
          <DuBtn icon="send" label={phase === "sending" ? "Billing…" : "Bill them"} onPress={() => void submit()} disabled={!ok} />
        </View>
      }>
      {start ? (
        <View style={{ gap: 26 }}>
          <Step n={1} title="Who’s paying?">
            <View style={{ gap: 8 }}>
              <ModeB on={who === "all"} onPress={() => setWho("all")} icon="people" tone="sky" t="Everyone" s="The whole roster, one amount" />
              <ModeB on={who === "role"} onPress={() => setWho("role")} icon="star" tone="lilac" t="By role" s="A rate for each role" />
              <ModeB on={who === "pick"} onPress={() => setWho("pick")} icon="hand" tone="peach" t="Pick people" s="Fines, shirts, one-offs" />
            </View>
            <View style={{ marginTop: 14, gap: 12 }}>
              {who === "all" ? <>
                <View style={styles.everyone}>
                  <Stack ps={inRoster} max={9} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong" size={14}>{plural(inRoster.length, "member")}</T>
                    <T v="meta" size={12} color={c.ink3}>Everyone on the roster{excl.length ? `, minus ${excl.length}` : ""}</T>
                  </View>
                </View>
                <View style={styles.wrap}>
                  <T v="meta" size={13} color={c.ink3}>Leave someone out:</T>
                  {excl.map(id => (
                    <Pressable key={id} onPress={() => setExcl(e => e.filter(x => x !== id))} accessibilityRole="button" accessibilityLabel={`Put ${byId.get(id)?.name} back`}
                      style={({ pressed }) => [[styles.xchip, { borderColor: c.ink, backgroundColor: c.paper2 }], pressed && pressedDim]}>
                      <T v="pill" size={12}>{byId.get(id)?.name ?? "Member"}</T><Icon name="x" size={11} color={c.ink2} />
                    </Pressable>
                  ))}
                </View>
                <Search value={xq} onChangeText={setXq} placeholder="Type a name" />
                {xMatches.length ? (
                  <View style={[styles.pop, { borderColor: c.line2, backgroundColor: c.card }]}>
                    {xMatches.map(p => (
                      <Pressable key={p.id} onPress={() => { setExcl(e => [...e, p.id]); setXq(""); }} accessibilityRole="button" style={({ pressed }) => [styles.popRow, pressed && pressedDim]}>
                        <T v="bodyStrong" size={14}>{p.name}</T><T v="meta" size={12} color={c.ink3}>{p.title}</T>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </> : null}

              {who === "role" ? (
                <View style={{ gap: 8 }}>
                  {[...roles.map(r => ({ k: r.id as RateKey, l: r.name })), { k: "none" as RateKey, l: "Members with no role" }, { k: "base" as RateKey, l: "Everyone (base)" }].map(({ k, l }) => {
                    const r = rates[rk(k)] ?? { on: false, amt: "" };
                    const n = roleMembers(k).length;
                    const set = (patch: Partial<{ on: boolean; amt: string }>) => setRates(s => ({ ...s, [rk(k)]: { ...(s[rk(k)] ?? { on: false, amt: "" }), ...patch } }));
                    return (
                      <View key={rk(k)} style={[styles.rate, { borderColor: r.on ? c.ink : c.line2, backgroundColor: c.card }]}>
                        <Pressable onPress={() => { haptics.select(); set({ on: !r.on }); }} accessibilityRole="checkbox" accessibilityState={{ checked: r.on }} accessibilityLabel={l}
                          style={({ pressed }) => [[styles.cb, { borderColor: c.ink, backgroundColor: r.on ? c.ink : c.card }], pressed && pressedDim]}>
                          {r.on ? <Icon name="check" size={13} color={c.paper} /> : null}
                        </Pressable>
                        <View style={{ flex: 1, minWidth: 0, opacity: r.on ? 1 : 0.55 }}>
                          <T v="bodyStrong" size={14} numberOfLines={1}>{l}</T>
                          <T v="meta" size={11.5} color={c.ink3}>{plural(n, "person", "people")}{k === "base" ? " · added on top of any role" : ""}</T>
                        </View>
                        <Money label={`${l} amount`} value={r.amt} onChangeText={t => set({ amt: t })} ea disabled={!r.on} style={{ width: 108 }} />
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {who === "pick" ? <>
                <Search value={q} onChangeText={setQ} placeholder={`Search ${people.length} members`} />
                <View style={styles.wrap}>
                  <T v="meta" size={13} color={c.ink3}><T v="bodyStrong" size={13}>{picked.length}</T> picked</T>
                  <DuLink label="+ everyone overdue" onPress={() => setPicked(p => [...p, ...people.filter(x => standing.get(x.id)?.standing === "overdue" && !p.includes(x.id)).map(x => x.id)])} />
                  {picked.length > 0 ? <DuLink label="clear" onPress={() => setPicked([])} /> : null}
                </View>
                <View style={styles.wrap}>
                  {pickList.map(p => {
                    const on = picked.includes(p.id);
                    const s = standing.get(p.id);
                    return (
                      <Pressable key={p.id} onPress={() => { haptics.select(); setPicked(xs => (xs.includes(p.id) ? xs.filter(x => x !== p.id) : [...xs, p.id])); }}
                        accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                        style={[styles.pk, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.paper2 : c.card }]}>
                        <View style={[styles.tk, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : "transparent" }]}>{on ? <Icon name="check" size={10} color={c.paper} /> : null}</View>
                        <T v="buttonSm" size={13}>{p.name}</T>
                        {s?.standing === "overdue" ? <View accessibilityLabel={`Overdue · ${money(s.owes)}`} style={[styles.ow, { backgroundColor: c.pastel.rose.ink }]} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </> : null}
            </View>
          </Step>

          <Step n={2} title="What’s it for?">
            <TextInput value={name} onChangeText={setName} maxLength={60} placeholder="Name it, so people know what they’re paying for" placeholderTextColor={c.ink3}
              accessibilityLabel="Charge name" autoFocus={start.mode !== "pick"} style={[styles.txt, { borderColor: c.line2, backgroundColor: c.card, color: c.ink }]} />
            <View style={[styles.wrap, { marginTop: 10 }]}>
              {chargeSuggestions(duesWord).map(s => <Sg key={s} label={s} on={name === s} onPress={() => { setName(n => (n === s ? "" : s)); if (s === "Late fine" && who === "all") setWho("pick"); }} />)}
            </View>
            {dupCharge && res.already.length > 0 ? (
              <View style={[styles.warn, { backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }]}>
                <T v="body" size={13.5} color={c.ink2}>
                  <T v="bodyStrong" size={13.5}>{plural(res.already.length, "person", "people")} already {res.already.length === 1 ? "has" : "have"} “{dupCharge.name}”</T> on their tab from {fmtDay(dupCharge.createdAt.slice(0, 10))}.
                </T>
                <View style={[styles.wrap, { marginTop: 8 }]}>
                  <Sg label="Skip them" on={dup === "skip"} onPress={() => setDup("skip")} />
                  <Sg label="Bill them again" on={dup === "bill"} onPress={() => setDup("bill")} />
                </View>
              </View>
            ) : null}
            {who === "role" ? (
              <T v="meta" size={13} color={c.ink3} style={{ marginTop: 14 }}>Amounts are set per row above.</T>
            ) : (
              <View style={{ marginTop: 16, gap: 10 }}>
                <T v="label" color={c.ink2}>How much?</T>
                <View style={{ alignItems: "flex-start" }}>
                  <Seg label="How much" value={split ? "split" : "each"} onChange={v => setSplit(v === "split")} options={[{ k: "each", l: "Each person pays" }, { k: "split", l: "Split a total" }]} />
                </View>
                <Money lg label={split ? "Total to split" : "Amount each"} value={split ? total : amt} onChangeText={split ? setTotal : setAmt} />
                {split ? (
                  <T v="meta" size={13} color={c.ink3}>{sn ? <>{sn.lead}<T v="bodyStrong" size={13}>{sn.each}</T>{sn.tail}</> : "Pick who’s splitting it first"}</T>
                ) : (
                  <View style={styles.wrap}>{[25, 50, 90, 140].map(v => <Sg key={v} label={`$${v}`} on={parseDollars(amt) === v} onPress={() => setAmt(String(v))} />)}</View>
                )}
              </View>
            )}
          </Step>

          <Step n={3} title="When’s it due?" last>
            <View style={styles.dates}>
              <DueChoiceBtn t="In two weeks" s={fmtDay(addDays(today, 14))} on={due === "2w"} onPress={() => setDue("2w")} />
              <DueChoiceBtn t="End of month" s={fmtDay(endOfMonth(today))} on={due === "eom"} onPress={() => setDue("eom")} />
              <DueChoiceBtn t="Pick a date" on={due === "custom"} onPress={() => setDue("custom")}><DayStep date={custom} min={today} onChange={d => { setCustom(d); setDue("custom"); }} /></DueChoiceBtn>
              <DueChoiceBtn t="No due date" s="never late" on={due === "none"} onPress={() => setDue("none")} />
            </View>
            <View style={{ gap: 6, marginTop: 16 }}>
              <T v="label" color={c.ink2}>Note for members <T v="meta" color={c.ink3}>(optional)</T></T>
              <TextInput value={note} onChangeText={setNote} maxLength={500} multiline accessibilityLabel="Note for members"
                placeholder="Where to pay, e.g. Venmo @chapter · ask the treasurer about a payment plan" placeholderTextColor={c.ink3}
                style={[styles.txt, styles.area, { borderColor: c.line2, backgroundColor: c.card, color: c.ink }]} />
            </View>
          </Step>
        </View>
      ) : null}
    </Sheet>
  );
}

function Step({ n, title, children, last }: { n: number; title: string; children: ReactNode; last?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={styles.step}>
      <View style={{ alignItems: "center" }}>
        <View style={[styles.num, { borderColor: c.ink, backgroundColor: c.card }]}><T v="mono" size={12.5} style={{ fontFamily: "PlexMono-600" }}>{n}</T></View>
        {!last ? <View style={[styles.rail, { backgroundColor: c.line2 }]} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="title" size={18} ls={-0.025} style={{ marginBottom: 12, marginTop: 2 }}>{title}</T>
        {children}
      </View>
    </View>
  );
}

function ModeB({ on, onPress, icon, tone, t, s }: { on: boolean; onPress: () => void; icon: IconName; tone: Tone; t: string; s: string }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { haptics.select(); onPress(); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
      style={[styles.mode, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.card : c.paper }, on && hard(c.pastel[tone].fill, 3)]}>
      <View style={[styles.g, { backgroundColor: c.note.fill[tone], borderColor: c.note.ink }]}><Icon name={icon} size={17} color={c.note.ink} /></View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong" size={14.5}>{t}</T>
        <T v="meta" size={12} color={c.ink3}>{s}</T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sum: { flexDirection: "row", alignItems: "center", gap: 12 },
  step: { flexDirection: "row", gap: 12 },
  num: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  rail: { flex: 1, width: 1.5, marginTop: 6 },
  mode: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  g: { width: 36, height: 36, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  everyone: { flexDirection: "row", alignItems: "center", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  xchip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pop: { borderWidth: 1.5, borderRadius: 14, overflow: "hidden" },
  popRow: { paddingHorizontal: 14, paddingVertical: 9 },
  rate: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 },
  cb: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  pk: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  tk: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  ow: { width: 7, height: 7, borderRadius: 4 },
  txt: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, fontFamily: "Inter-400", fontSize: 15 },
  area: { minHeight: 84, textAlignVertical: "top" },
  warn: { marginTop: 14, borderWidth: 1.5, borderRadius: 14, padding: 12 },
  dates: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
