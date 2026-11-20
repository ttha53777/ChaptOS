/**
 * The task spotlight, as the web phone shows it (app/org/[slug]/tasks/TaskSpotlight.tsx,
 * a bottom sheet under 600px). One column, read top to bottom, from @/lib/tasks/list:
 *
 *   top bar     the state chip; Edit / Delete for MANAGE_TASKS; close
 *   hero        the desk-calendar page (or ANY — NO DATE), the title, the sentence under
 *               it, and the one button: Mark done / Mark my part done / Reopen, or "Only
 *               X can tick this." for someone who isn't on it
 *   when        Start → Due bookends, the span, the weeks as a desk calendar, the number
 *   note        the note, or Add a note (officers)
 *   parts       Everyone · each: the ring and every face (GET /api/tasks/[id] parts)
 *   who         For … / From … · date
 *   history     folded, "History · N entries" (GET /api/tasks/[id] history)
 *
 * Ticking stamps DONE on the calendar page (success haptic from ~/tasks/tick), then the
 * write goes out and the sheet closes, as on the web.
 */
import type { Brother, Task, TaskDetail } from "@/lib/api-types";
import {
  DOW, MON, andList, avTone, deskCal, first, forNames, historyLines, historyStamp, longD, partsOf, plural, shortD, spotHead,
  type DeskCell, type Me,
} from "@/lib/tasks/list";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTaskDetail } from "~/data/tasks";
import { Icon } from "~/icons/Icon";
import { Avatar } from "~/paper/bits";
import { Stamp } from "~/paper/Stamp";
import { CloseX, Sheet } from "~/shell/sheets";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { tickTask } from "./tick";
import { pressedDim } from "~/motion/press";

const TONE: Record<"done" | "over" | "up", Tone> = { done: "mint", over: "peach", up: "sky" };

export function TaskSpotlight({ task, today, me, roster, canComplete, canManage, onEdit, onDelete, onClose }: {
  task: Task | null; today: Date; me: Me; roster: Brother[]; canComplete: boolean; canManage: boolean;
  onEdit: (t: Task) => void; onDelete: (t: Task) => void; onClose: () => void;
}) {
  const [last, setLast] = useState<Task | null>(task);
  if (task && task !== last) setLast(task);
  const t = task ?? last;
  return (
    <Sheet open={!!task} onClose={onClose} size="tall" ownClose accessibilityLabel={t?.title ?? "Task"}>
      {t ? <Body task={t} today={today} me={me} roster={roster} canComplete={canComplete} canManage={canManage}
        onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Body({ task, today, me, roster, canComplete, canManage, onEdit, onDelete, onClose }: {
  task: Task; today: Date; me: Me; roster: Brother[]; canComplete: boolean; canManage: boolean;
  onEdit: () => void; onDelete: () => void; onClose: () => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const detailQ = useTaskDetail(task.id);
  const detail = detailQ.data ?? null;
  const [stamping, setStamping] = useState(false);
  const byId = new Map(roster.map(b => [b.id, b] as const));
  const nameOf = (id: number | null) => id == null ? "Someone" : id === me.selfId ? "You" : byId.has(id) ? first(byId.get(id)!.name) : "Someone";
  const h = spotHead(task, today, nameOf);
  const p = c.pastel[TONE[h.tone]];
  const names = forNames(task, me.selfId);
  const holders = (roleId: number) => roster.filter(b => b.roles?.some(r => r.id === roleId));

  const tick = () => {
    if (!canComplete || stamping) return;
    if (h.done) { tickTask(task, false); onClose(); return; }
    if (m.reduced) { tickTask(task, true); onClose(); return; }
    setStamping(true);
    setTimeout(() => { tickTask(task, true); onClose(); }, 820);
  };

  const w = h.when;
  const B = (s: string) => <T v="bodyStrong" size={16.6} color={c.ink}>{s}</T>;
  const sentence = w.kind === "done" ? <>{B(w.who)}{w.on ? ` on ${w.on}` : ""}{w.rel}.</>
    : w.kind === "none" ? <>No date. It waits at the bottom of {B("Upcoming")} until someone gets to it.</>
    : w.kind === "late" ? <>Was due {B(w.day)}. <T v="bodyStrong" size={16.6} color={c.pastel.peach.ink}>{`${w.ago}.`}</T></>
    : <>Due {B(w.day)}{w.tail}</>;

  return (
    <View style={{ marginHorizontal: -16 }}>
      <View style={{ backgroundColor: p.soft, paddingBottom: 22 }}>
        <View style={styles.top}>
          <View style={[styles.chip, { backgroundColor: c.card, borderColor: p.border }]}>
            <View style={[styles.dot, { backgroundColor: p.ink }]} />
            <T v="buttonSm" size={12.2} color={p.ink}>{h.chip}</T>
          </View>
          <View style={{ flex: 1 }} />
          {canManage ? (
            <>
              <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Edit" hitSlop={4} style={({ pressed }) => [styles.tool, pressed && pressedDim]}><Icon name="pencil" size={17} color={c.ink3} /></Pressable>
              <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Delete" hitSlop={4} style={({ pressed }) => [styles.tool, pressed && pressedDim]}><Icon name="trash" size={17} color={c.ink3} /></Pressable>
            </>
          ) : null}
          <CloseX onPress={onClose} />
        </View>
        <View style={styles.hero}>
          <View>
            <CalPage due={h.due} tone={TONE[h.tone]} />
            {stamping ? <Stamp label={task.everyone === "each" ? "My part" : "Done"} state="in" size="md" rotate={-9} tone="mint" style={styles.stamp} /> : null}
          </View>
          <T v="hero" size={27} ls={-0.032} lh={1.08} style={{ flex: 1 }} accessibilityRole="header">{task.title}</T>
        </View>
        <T v="body" size={16.6} color={c.ink2} style={styles.pad}>{sentence}</T>
        <View style={[styles.pad, { marginTop: 16 }]}>
          {!canComplete ? (
            <View style={styles.hint}><Icon name="lock" size={14} color={c.ink3} /><T v="meta" size={13.8} color={c.ink3}>{`Only ${andList(names) || "the people on it"} can tick this.`}</T></View>
          ) : (
            <Pressable onPress={tick} disabled={stamping} accessibilityRole="button"
              style={({ pressed }) => [styles.bigtick, { borderColor: c.ink, backgroundColor: c.card }, !pressed && hard(c.pastel.mint.fill, 3), pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
              <View style={[styles.o, { borderColor: c.ink, backgroundColor: h.done || stamping ? c.note.fill.mint : c.card }]}>
                {h.done || stamping ? <Icon name="check" size={22} color={c.note.ink} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <T v="title" size={17.3} ls={-0.02} lh={1.15}>{h.done ? "Reopen" : h.each ? "Mark my part done" : "Mark done"}</T>
                <T v="meta" size={11.8} color={c.ink3}>{h.done ? "Puts it back in its pile" : "Same as ticking the circle in the list"}</T>
              </View>
            </Pressable>
          )}
        </View>
      </View>

      {h.due ? <WhenSec task={task} today={today} due={h.due} finAt={h.finAt} late={h.late} tone={TONE[h.tone]} /> : (
        <Sec>
          <View style={[styles.nodate, { borderColor: c.line2 }]}>
            <Icon name="cal" size={16} color={c.ink3} />
            <T v="callout" size={14.4} color={c.ink2} style={{ flex: 1 }}>
              <T v="bodyStrong" size={14.4} color={c.ink}>No due date.</T>{` It isn’t on the Timeline${canManage ? ", so edit it to add one." : "."}`}
            </T>
          </View>
        </Sec>
      )}

      {task.notes ? (
        <Sec><Lab>Note</Lab><T v="body" size={15} color={c.ink}>{task.notes}</T></Sec>
      ) : canManage ? (
        <Sec>
          <Pressable onPress={onEdit} accessibilityRole="button" style={({ pressed }) => [styles.addn, pressed && pressedDim]}>
            <Icon name="plus" size={15} color={c.ink2} /><T v="bodyStrong" size={15} color={c.ink2}>Add a note</T>
          </Pressable>
        </Sec>
      ) : null}

      {h.each ? <Parts task={task} detail={detail} roster={roster} me={me} /> : null}

      <Sec>
        <View style={styles.whoLine}>
          <View style={styles.whoPart}>
            <T v="kicker" size={10.2} color={c.ink3}>For</T>
            {task.everyone
              ? <View style={[styles.rl, { borderColor: c.line2, backgroundColor: c.card }]}><View style={[styles.sw, { backgroundColor: c.note.fill.lilac, borderColor: c.ink }]} /><T v="pill" size={12.5}>{h.each ? "Everyone, each" : "Anyone"}</T></View>
              : task.assignments.length === 0 ? <T v="callout" color={c.ink3}>No one yet</T>
              : task.assignments.map(a => a.role ? (
                  <View key={`r${a.id}`} style={styles.whoPart}>
                    <View style={[styles.rl, { borderColor: c.line2, backgroundColor: c.card }]}><View style={[styles.sw, { backgroundColor: a.role.color ?? c.paper3, borderColor: c.ink }]} /><T v="pill" size={12.5}>{a.role.name}</T></View>
                    <T v="callout" color={c.ink3}>{roleHolders(holders(a.role.id), me.selfId)}</T>
                  </View>
                ) : a.brother ? (
                  <View key={`b${a.id}`} style={styles.whoPart}>
                    <Avatar name={a.brother.name} uri={a.brother.avatarUrl} tone={avTone(a.brother.id)} px={22} />
                    <T v="callout" size={15.5}>{a.brother.id === me.selfId ? "You" : first(a.brother.name)}</T>
                  </View>
                ) : null)}
          </View>
          {task.createdById != null ? (
            <View style={styles.whoPart}>
              <T v="kicker" size={10.2} color={c.ink3}>From</T>
              {byId.get(task.createdById) ? <Avatar name={byId.get(task.createdById)!.name} uri={byId.get(task.createdById)!.avatarUrl} tone={avTone(task.createdById)} px={22} /> : null}
              <T v="callout" size={15.5}>{nameOf(task.createdById)}</T>
              <T v="callout" size={15.5} color={c.ink3}>{`· ${shortD(new Date(task.createdAt))}`}</T>
            </View>
          ) : null}
        </View>
      </Sec>

      <History task={task} detail={detail} failed={detailQ.isError && !detail} nameOf={nameOf} />
      <View style={{ height: 12 }} />
    </View>
  );
}

function roleHolders(hs: Brother[], selfId: number | null): string {
  if (hs.length === 0) return "(nobody yet)";
  if (hs.length === 1) return `(${hs[0]!.id === selfId ? "you" : first(hs[0]!.name)})`;
  return `(${hs.length} people)`;
}

function Sec({ children, noRule }: { children: React.ReactNode; noRule?: boolean }) {
  const { c } = useTheme();
  return <View style={[styles.sec, !noRule && { borderTopWidth: 1.5, borderTopColor: c.line2, borderStyle: "dashed" }]}>{children}</View>;
}
function Lab({ children }: { children: string }) {
  const { c } = useTheme();
  return <T v="kicker" size={10.2} color={c.ink3} style={{ marginBottom: 12 }}>{children}</T>;
}

/** The desk-calendar page in the hero (`.cal`). */
function CalPage({ due, tone }: { due: Date | null; tone: Tone }) {
  const { c } = useTheme();
  if (!due) {
    return (
      <View style={[styles.cal, { borderColor: c.line2, borderStyle: "dashed", backgroundColor: c.card }]}>
        <View style={[styles.calTop, { borderBottomColor: c.line2, borderStyle: "dashed" }]}><T v="kicker" size={11.5} color={c.ink3}>ANY</T></View>
        <T v="figure" size={46} color={c.ink3} align="center" style={{ paddingTop: 6 }}>—</T>
        <T v="kicker" size={10.6} color={c.ink3} align="center" style={{ paddingBottom: 9, paddingTop: 2 }}>NO DATE</T>
      </View>
    );
  }
  return (
    <View style={[styles.cal, { borderColor: c.ink, backgroundColor: c.card, transform: [{ rotate: "-3deg" }] }, hard(c.pastel[tone].fill, 4)]}>
      <View style={[styles.tape, { backgroundColor: c.pastel.butter.fill }]} />
      <View style={[styles.calTop, { borderBottomColor: c.ink, backgroundColor: c.note.fill[tone] }]}><T v="kicker" size={11.5} color={c.note.ink}>{MON[due.getMonth()]!}</T></View>
      <T v="figure" size={46} align="center" style={{ paddingTop: 6 }}>{String(due.getDate())}</T>
      <T v="kicker" size={10.6} color={c.ink3} align="center" style={{ paddingBottom: 9, paddingTop: 2 }}>{DOW[due.getDay()]!.toUpperCase()}</T>
    </View>
  );
}

function WhenSec({ task, today, due, finAt, late, tone }: { task: Task; today: Date; due: Date; finAt: Date | null; late: boolean; tone: Tone }) {
  const { c } = useTheme();
  const d = deskCal(task, today, due, finAt, late);
  const toneInk = d.tone === "late" ? c.pastel.peach.ink : d.tone === "fin" ? c.pastel.mint.ink : c.pastel.sky.ink;
  const toneFill = d.tone === "late" ? c.pastel.peach.fill : d.tone === "fin" ? c.pastel.mint.fill : c.pastel.sky.fill;
  // seven to a row (a gap row spans the week)
  const rows: DeskCell[][] = [];
  let cur: DeskCell[] = [];
  for (const cell of d.cells) {
    if (cell.kind === "gap") { if (cur.length) rows.push(cur); rows.push([cell]); cur = []; continue; }
    cur.push(cell);
    if (cur.length === 7) { rows.push(cur); cur = []; }
  }
  if (cur.length) rows.push(cur);

  return (
    <>
      <View style={[styles.pad, { paddingTop: 18, gap: 10 }]}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <End label="Start" day={longD(d.a0)} tone="butter" start />
          <End label="Due" day={longD(due)} tone={tone} />
        </View>
        <View style={styles.len}>
          <View style={[styles.lenLine, { borderTopColor: c.line2 }]} />
          <View style={[styles.lenPill, { borderColor: c.line2, backgroundColor: c.card }]}><T v="mono" size={10.9} color={c.ink2} style={{ fontWeight: "600" }}>{d.spanText}</T></View>
          <View style={[styles.lenLine, { borderTopColor: c.line2 }]} />
          <Icon name="chev-r" size={14} color={c.ink3} />
        </View>
      </View>
      <View style={[styles.pad, { paddingTop: 18, paddingBottom: 24, gap: 18 }]}>
        <View>
          <T v="title" size={16} ls={-0.02} style={{ marginBottom: 10 }}>{d.monthLabel}</T>
          <View style={styles.dcRow}>
            {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => <T key={i} v="kicker" size={9.6} color={c.ink3} align="center" style={{ flex: 1 }}>{x}</T>)}
          </View>
          {rows.map((r, i) => r[0]!.kind === "gap"
            ? <View key={i} style={styles.dcGap}><T v="mono" size={10.6} color={c.ink3}>{r[0]!.label}</T></View>
            : <View key={i} style={styles.dcRow}>{r.map(cell => cell.kind === "day" ? <DayCell key={cell.key} cell={cell} /> : null)}</View>)}
          <View style={styles.key}>
            <Key label="Start" swatch={<View style={[styles.keySw, { backgroundColor: c.note.fill.butter, borderColor: c.ink }]} />} />
            {d.fin
              ? <Key label="Done" swatch={<View style={[styles.keySw, { backgroundColor: c.note.fill.mint, borderColor: c.ink }]} />} />
              : <Key label="Today" swatch={<View style={[styles.keySw, { borderRadius: 7, borderWidth: 2, borderColor: c.pastel.peach.ink }]} />} />}
            <Key label="Due" swatch={<View style={[styles.keySw, { backgroundColor: c.pastel.peach.soft, borderColor: c.ink }]} />} />
            {d.tone === "late" ? <Key label="Late" swatch={<View style={[styles.keySw, { backgroundColor: c.pastel.peach.fill, borderColor: c.pastel.peach.border }]} />} />
              : d.tone === "left" ? <Key label="Still ahead" swatch={<View style={[styles.keySw, { backgroundColor: c.pastel.sky.soft, borderColor: c.pastel.sky.border }]} />} /> : null}
          </View>
        </View>
        <View style={[styles.count, { borderColor: c.ink, backgroundColor: c.card }, hard(toneFill, 4)]}>
          <T v="figure" size={52} color={toneInk}>{d.big}</T>
          <View style={{ flex: 1 }}>
            <T v="title" size={20} ls={-0.02}>{d.cap}</T>
            <T v="mono" size={11.5} color={c.ink3}>{d.foot}</T>
          </View>
        </View>
      </View>
    </>
  );
}

function End({ label, day, tone, start }: { label: string; day: string; tone: Tone; start?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.end, { borderColor: c.ink, backgroundColor: c.card }, hard(c.pastel[tone].fill, 3)]}>
      <View style={[styles.endI, { backgroundColor: c.note.fill[tone], borderColor: c.note.ink }]}>
        {start ? <View style={[styles.endDot, { borderColor: c.note.ink, backgroundColor: c.card }]} /> : <Icon name="flag" size={15} color={c.note.ink} />}
      </View>
      <View style={{ flexShrink: 1 }}>
        <T v="kicker" size={9.6} color={c.ink3}>{label}</T>
        <T v="bodyStrong" size={14.7} numberOfLines={1}>{day}</T>
      </View>
    </View>
  );
}

function DayCell({ cell }: { cell: Extract<DeskCell, { kind: "day" }> }) {
  const { c } = useTheme();
  const has = (k: string) => cell.cls.includes(k);
  const out = has("out");
  let bg = c.card, bd = c.line, ink = c.ink2, bw = 1.3;
  if (out) { bg = "transparent"; bd = "transparent"; ink = c.faint; }
  else if (has("late")) { bg = c.pastel.peach.soft; bd = c.pastel.peach.border; ink = c.pastel.peach.ink; }
  else if (has("left")) { bg = c.pastel.sky.soft; bd = c.pastel.sky.border; }
  else if (has("gone")) { bg = c.paper2; ink = c.ink3; }
  if (has("due")) { bg = c.pastel.peach.soft; bd = c.ink; bw = 1.6; ink = c.ink; }
  if (has("as")) { bd = c.ink; bw = 1.6; }
  const today = has("today");
  return (
    <View style={[styles.dc, { backgroundColor: bg, borderColor: today ? c.pastel.peach.ink : bd, borderWidth: today ? 2 : bw },
      today && { borderRadius: 20 }, has("as") && hard(c.pastel.butter.fill, 2), has("due") && hard(c.ink, 2)]}>
      <T v="mono" size={11.5} color={ink} style={{ fontWeight: out ? "400" : "600" }}>{String(cell.day)}</T>
      {cell.marks.map(mk => mk === "f"
        ? <View key="f" style={[styles.tickm, { backgroundColor: c.note.fill.mint, borderColor: c.ink }]}><Icon name="check" size={9} color={c.note.ink} /></View>
        : <View key={mk} style={[styles.tag, { borderColor: c.ink, backgroundColor: mk === "s" ? c.note.fill.butter : c.card }]}>
            <T v="kicker" size={7.5} color={c.note.ink}>{mk === "s" ? "START" : "DUE"}</T>
          </View>)}
    </View>
  );
}

function Key({ label, swatch }: { label: string; swatch: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={styles.keyItem}>{swatch}<T v="meta" size={12.5} color={c.ink3}>{label}</T></View>;
}

function Parts({ task, detail, roster, me }: { task: Task; detail: TaskDetail | null; roster: Brother[]; me: Me }) {
  const { c } = useTheme();
  const p = partsOf(task, detail, roster, me.selfId);
  return (
    <Sec>
      <Lab>Everyone’s part</Lab>
      <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
        <View style={styles.ring}>
          <Svg width={70} height={70} style={StyleSheet.absoluteFill}>
            <Circle cx={35} cy={35} r={30} stroke={c.paper3} strokeWidth={7} fill="none" />
            <Circle cx={35} cy={35} r={30} stroke={c.pastel.mint.ink} strokeWidth={7} fill="none" strokeLinecap="round"
              strokeDasharray={`${(p.pct / 100) * 2 * Math.PI * 30} ${2 * Math.PI * 30}`} transform="rotate(-90 35 35)" />
          </Svg>
          <T v="title" size={18}>{`${p.doneN}`}<T v="meta" size={11} color={c.ink3}>{`/${p.total}`}</T></T>
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          {detail ? (
            <>
              <View style={styles.faces}>
                {p.faces.map(b => (
                  <View key={b.id} style={{ opacity: p.doneIds.has(b.id) ? 1 : 0.35 }}>
                    <Avatar name={b.name} uri={b.avatarUrl} tone={avTone(b.id)} px={26} ring={b.id === me.selfId ? c.ink : undefined} />
                  </View>
                ))}
              </View>
              <T v="callout" size={14} color={c.ink2}>
                {p.left.length ? <><T v="bodyStrong" size={14}>{`${p.left.length} still to go:`}</T>{` ${p.leftNames}.`}</> : <T v="bodyStrong" size={14}>Everyone’s done.</T>}
              </T>
            </>
          ) : <View style={[styles.facesWait, { backgroundColor: c.skel }]} />}
        </View>
      </View>
    </Sec>
  );
}

function History({ task, detail, failed, nameOf }: { task: Task; detail: TaskDetail | null; failed: boolean; nameOf: (id: number | null) => string }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const lines = historyLines(task, detail);
  const ink = { c: c.pastel.sky.ink, d: c.pastel.mint.ink, e: c.ink3, r: c.pastel.peach.ink };
  return (
    <Sec>
      <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={({ pressed }) => [styles.histSum, pressed && pressedDim]}>
        <T v="bodyStrong" size={14.4} color={c.ink2}>{`History${detail ? ` · ${plural(lines.length, "entry", "entries")}` : ""}`}</T>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}><Icon name="chev-d" size={15} color={c.ink3} /></View>
      </Pressable>
      {open ? (
        failed ? <T v="meta" color={c.ink3} style={{ marginTop: 10 }}>Couldn’t load the history.</T>
        : !detail ? <T v="meta" color={c.ink3} style={{ marginTop: 10 }}>Loading…</T>
        : (
          <View style={{ marginTop: 12, gap: 10 }}>
            {lines.map((l, i) => (
              <View key={i} style={styles.histRow}>
                <View style={[styles.histDot, { backgroundColor: ink[l.tone] }]} />
                <T v="callout" size={14} style={{ flex: 1 }}><T v="bodyStrong" size={14}>{nameOf(l.actorId)}</T>{` ${l.text}`}</T>
                <T v="mono" size={10.9} color={c.ink3}>{historyStamp(l.at)}</T>
              </View>
            ))}
          </View>
        )
      ) : null}
    </Sec>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 0, paddingLeft: 16, paddingRight: 14, paddingBottom: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1.3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  tool: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  hero: { flexDirection: "row", alignItems: "center", gap: 18, paddingHorizontal: 16, paddingTop: 16 },
  pad: { paddingHorizontal: 16, marginTop: 14 },
  stamp: { position: "absolute", left: 6, top: 30 },
  cal: { width: 88, borderRadius: 14, borderWidth: 1.8 },
  calTop: { alignItems: "center", paddingTop: 4, paddingBottom: 3, borderBottomWidth: 1.8, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  tape: { position: "absolute", top: -8, left: 18, width: 50, height: 15, opacity: 0.75, transform: [{ rotate: "4deg" }], zIndex: 2 },
  hint: { flexDirection: "row", alignItems: "center", gap: 6 },
  bigtick: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 7, paddingLeft: 7, paddingRight: 20, borderRadius: 999, borderWidth: 1.8 },
  o: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.8, alignItems: "center", justifyContent: "center" },
  sec: { paddingVertical: 20, paddingHorizontal: 16 },
  nodate: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" },
  addn: { flexDirection: "row", alignItems: "center", gap: 8 },
  whoLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 22, rowGap: 10 },
  whoPart: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rl: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1.3 },
  sw: { width: 8, height: 8, borderRadius: 2, borderWidth: 1.2 },
  end: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingLeft: 8, paddingRight: 12, borderRadius: 14, borderWidth: 1.6 },
  endI: { width: 30, height: 30, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  endDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.6 },
  len: { flexDirection: "row", alignItems: "center", gap: 6 },
  lenLine: { flex: 1, borderTopWidth: 2, borderStyle: "dashed" },
  lenPill: { paddingVertical: 2, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1.3 },
  dcRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
  dcGap: { alignItems: "center", paddingVertical: 4, marginBottom: 10 },
  dc: { flex: 1, height: 40, borderRadius: 9, paddingVertical: 4, paddingHorizontal: 6 },
  tag: { position: "absolute", bottom: -7, left: 2, right: 2, alignItems: "center", borderRadius: 6, borderWidth: 1.2, paddingVertical: 1 },
  tickm: { position: "absolute", right: 3, bottom: 3, width: 14, height: 14, borderRadius: 7, borderWidth: 1.2, alignItems: "center", justifyContent: "center" },
  key: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 4 },
  keyItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  keySw: { width: 14, height: 14, borderRadius: 4, borderWidth: 1.3 },
  count: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 22, borderWidth: 1.6 },
  ring: { width: 70, height: 70, alignItems: "center", justifyContent: "center" },
  faces: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  facesWait: { height: 26, borderRadius: 13 },
  histSum: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  histRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  histDot: { width: 8, height: 8, borderRadius: 4 },
});
