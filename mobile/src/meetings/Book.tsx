/**
 * The Chapter page's parts on a phone (app/org/[slug]/chapter/page.tsx, chapter.css), drawn
 * from the rules in @/lib/meetings/book so the words and numbers are the web's:
 *
 *   SecHead     "On deck" / "Past meetings", a dashed rule, a mono count
 *   OnDeck      the next meeting: taped calendar page, pill, when, title, clock / room /
 *               required, the attendance block (optional · check-in open · marked · not
 *               taken yet), excuses waiting, and the officer's actions
 *   Book        the past meetings as ledger rows, with All / No minutes / Under 70% tabs
 *   ChapterDayOne  nothing on the calendar: three pictures and one button
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, LinearTransition, ReduceMotion } from "react-native-reanimated";
import type { AttendanceSummaryRow, CalendarEvent } from "@/lib/api-types";
import {
  bookCount, emptyTabLine, excuseLine, hasNotes, ledgerRow, MISSING_LINE, MONTHS, onDeckHead, type OnDeckRoll, type PastFilter,
} from "@/lib/meetings/book";
import { Icon, type IconName } from "~/icons/Icon";
import { EASE } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";

/* ── section head ─────────────────────────────────────────────────────────────── */

export function SecHead({ title, right }: { title: string; right?: string | null }) {
  const { c } = useTheme();
  return (
    <View style={styles.sec}>
      <T v="hero" size={25} ls={-0.03} accessibilityRole="header">{title}</T>
      <View style={[styles.rule, { borderTopColor: c.line2 }]} />
      {right ? <T v="mono" size={11.5} color={c.ink3}>{right}</T> : null}
    </View>
  );
}

/* ── On deck ──────────────────────────────────────────────────────────────────── */

export function OnDeck({ event, roll, today, start, time, pendingNames, canAttend, canEvents, live, onCheckIn, onTake, onMinutes, onEdit, onExcuses, onOpen }: {
  event: CalendarEvent; roll: OnDeckRoll; today: string; start: string | null; time: string | null;
  pendingNames: string[]; canAttend: boolean; canEvents: boolean; live: boolean;
  onCheckIn: () => void; onTake: () => void; onMinutes: () => void; onEdit: () => void; onExcuses: () => void; onOpen: () => void;
}) {
  const { c } = useTheme();
  const head = onDeckHead(event, today, start);
  const [y, mo, d] = event.date.split("-").map(Number);
  const dow = new Date(y!, mo! - 1, d!).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const muted = roll.kind === "optional" || roll.kind === "pending";

  return (
    <View style={[styles.deck, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.sky.fill, 5)]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${event.title}, ${head.when}. Opens the minutes.`} style={styles.deckTop}>
        <View style={styles.calWrap}>
          <View style={[styles.tape, { backgroundColor: c.pastel.butter.fill }]} />
          <View style={[styles.cal, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.sky.fill, 3)]}>
            <View style={[styles.calHead, { backgroundColor: c.pastel.sky.fill, borderBottomColor: c.ink }]}>
              <T v="mono" size={10.5} color={c.ink} style={{ fontWeight: "700", letterSpacing: 1.4 }}>{MONTHS[mo! - 1]!.toUpperCase()}</T>
            </View>
            <T v="hero" size={38} ls={-0.05} lh={1.05}>{String(d)}</T>
            <T v="mono" size={9.5} color={c.ink3} style={{ letterSpacing: 1.4, marginBottom: 6 }}>{dow}</T>
          </View>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={[styles.pill, { backgroundColor: c.pastel.sky.soft, borderColor: c.pastel.sky.border }]}>
            {head.isToday ? <View style={[styles.dot, { backgroundColor: c.pastel.sky.ink }]} /> : null}
            <T v="callout" size={13} color={c.pastel.sky.ink} style={{ fontWeight: "600" }}>{head.pill}</T>
          </View>
          <T v="mono" size={11.5} color={c.ink3}>{head.when}</T>
          <T v="heading" size={21} ls={-0.02}>{event.title}</T>
        </View>
      </Pressable>

      <View style={styles.meta}>
        {time ? <Meta icon="clock" text={time} /> : null}
        <Meta icon="pin" text={event.location || "No location yet"} quiet={!event.location} />
        <Meta icon="people" text={event.mandatory ? "Required for everyone" : "Optional"} wide />
      </View>

      <View style={[styles.prog, muted ? { borderStyle: "dashed", borderColor: c.line2 } : { borderColor: c.line, backgroundColor: c.paper }]}>
        <View style={styles.pHead}>
          <T v="kicker" size={10.5} color={roll.kind === "live" ? c.pastel.mint.ink : c.ink3} style={{ flex: 1 }}>{roll.label}</T>
          {roll.kind === "live" ? <T v="mono" size={11.5} color={c.ink3}><T v="mono" size={11.5} color={c.ink} style={{ fontWeight: "700" }}>{String(roll.present)}</T>{` / ${roll.of} here so far`}</T>
            : roll.kind === "taken" ? <T v="mono" size={11.5} color={c.ink3}><T v="mono" size={11.5} color={c.ink} style={{ fontWeight: "700" }}>{String(roll.present)}</T>{` / ${roll.of} present`}</T>
            : roll.kind === "pending" && roll.expected > 0 ? <T v="mono" size={11.5} color={c.ink3}>{`${roll.expected} expected`}</T> : null}
        </View>
        {roll.kind === "live" || roll.kind === "taken" ? (
          <View style={[styles.meter, { backgroundColor: c.lineSoft }]}>
            <View style={{ width: `${roll.presentPct}%`, backgroundColor: c.pastel.lilac.ink }} />
            {roll.kind === "taken" ? <View style={{ width: `${roll.absentPct}%`, backgroundColor: c.line2 }} /> : null}
          </View>
        ) : null}
        {roll.kind === "taken" ? (
          <View style={styles.legend}>
            <Legend color={c.pastel.lilac.ink} text={`Present ${roll.present}`} />
            <Legend color={c.line2} text={`Absent ${roll.absent}`} />
            {roll.excused > 0 ? <Legend color={c.pastel.butter.ink} text={`Excused ${roll.excused}`} /> : null}
          </View>
        ) : <T v="body" size={14} lh={1.45} color={c.ink2}>{roll.msg}</T>}
      </View>

      {pendingNames.length && canAttend ? (
        <Pressable onPress={onExcuses} accessibilityRole="button" style={({ pressed }) => [styles.exc, { backgroundColor: pressed ? c.pastel.butter.fill : c.pastel.butter.soft, borderColor: c.pastel.butter.border }]}>
          <Icon name="form" size={15} color={c.pastel.butter.ink} />
          <T v="callout" size={13.5} color={c.pastel.butter.ink} style={{ flex: 1 }}>{excuseLine(pendingNames)}</T>
          <Icon name="chev-r" size={13} color={c.pastel.butter.ink} />
        </Pressable>
      ) : null}

      <View style={styles.acts}>
        {canAttend && event.mandatory ? (
          live ? <Act label="Go to check-in" icon="people" ink onPress={onCheckIn} />
            : <Act label={roll.kind === "taken" ? "Edit attendance" : "Take attendance"} icon="check" ink onPress={onTake} />
        ) : null}
        <Act label={hasNotes(event) ? "Open minutes" : "Start the minutes"} icon="pencil" onPress={onMinutes} />
        {canEvents ? <Act label="Edit" small onPress={onEdit} /> : null}
      </View>
    </View>
  );
}

function Meta({ icon, text, quiet, wide }: { icon: IconName; text: string; quiet?: boolean; wide?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.metaI, wide && { width: "100%" }]}>
      <Icon name={icon} size={15} color={c.ink3} />
      <T v="body" size={15} color={quiet ? c.ink3 : c.ink}>{text}</T>
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  const { c } = useTheme();
  return <View style={styles.li}><View style={[styles.ld, { backgroundColor: color }]} /><T v="meta" size={12.5} color={c.ink2}>{text}</T></View>;
}

function Act({ label, icon, ink, small, onPress }: { label: string; icon?: IconName; ink?: boolean; small?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const fg = ink ? c.paper : c.ink;
  return (
    <Pressable onPress={() => { haptics.tap(); onPress(); }} accessibilityRole="button"
      style={({ pressed }) => [styles.act, small && styles.actSm, { backgroundColor: ink ? c.ink : c.card, borderColor: small ? c.line2 : c.ink },
        !small && !pressed ? hard(ink ? c.pastel.lilac.fill : c.pastel.peach.fill, 3) : null, pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
      {icon ? <Icon name={icon} size={small ? 13 : 15} color={fg} /> : null}
      <T v={small ? "buttonSm" : "button"} size={small ? 13 : 14} color={fg}>{label}</T>
    </Pressable>
  );
}

/* ── the book ─────────────────────────────────────────────────────────────────── */

export function Book({ past, shown, tabs, filter, onFilter, rows, onOpen }: {
  past: CalendarEvent[]; shown: CalendarEvent[]; tabs: { key: PastFilter; label: string; count: number }[];
  filter: PastFilter; onFilter: (f: PastFilter) => void; rows: ReadonlyMap<number, AttendanceSummaryRow>; onOpen: (e: CalendarEvent) => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const layout = LinearTransition.duration(m.t(m.reduced ? 0 : 240)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
  return (
    <View style={{ gap: 12 }}>
      <SecHead title="Past meetings" right={bookCount(past.length)} />
      {past.length ? (
        <>
          <View style={[styles.tabs, { backgroundColor: c.paper2, borderColor: c.line }]} accessibilityRole="tablist">
            {tabs.map(t => {
              const on = t.key === filter;
              return (
                <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { haptics.select(); onFilter(t.key); }}
                  style={[styles.tab, on && [{ backgroundColor: c.card, borderColor: c.line2 }, hard(c.line, 0, 1)]]}>
                  <T v="callout" size={13.5} color={on ? c.ink : c.ink3} style={on ? { fontWeight: "600" } : undefined}>{t.label}</T>
                  <T v="mono" size={11} color={c.ink3}>{String(t.count)}</T>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.ledger, { borderColor: c.line, backgroundColor: c.card }]}>
            {shown.map((e, i) => (
              <Animated.View key={e.id} layout={layout}
                entering={(m.reduced ? FadeIn.duration(m.t(140)) : FadeInDown.delay(m.t(Math.min(i, 8) * 26)).duration(m.t(220))).reduceMotion(ReduceMotion.Never)}>
                <LedgerRow e={e} row={rows.get(e.id)} first={i === 0} onPress={() => onOpen(e)} />
              </Animated.View>
            ))}
            {!shown.length ? <T v="callout" color={c.ink3} align="center" style={{ padding: 22 }}>{emptyTabLine(filter)}</T> : null}
          </View>
        </>
      ) : (
        <View style={[styles.empty, { borderColor: c.line2 }]}>
          <T v="body" size={14.5} color={c.ink3} align="center">Past meetings land here, newest first, each with its minutes and who showed up.</T>
        </View>
      )}
    </View>
  );
}

function LedgerRow({ e, row, first, onPress }: { e: CalendarEvent; row: AttendanceSummaryRow | undefined; first: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const r = ledgerRow(e, row);
  const tone = c.pastel[e.mandatory ? "sky" : "mint"];
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${e.title}, ${r.parts.dow} ${r.parts.mon} ${r.parts.dnum}. ${r.tag}${r.counted ? `, ${r.stat} present` : ""}`}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: 1, borderTopColor: c.lineSoft }, pressed && { backgroundColor: c.paper2 }, !r.filed && { backgroundColor: c.pastel.rose.soft + "55" }]}>
      <View style={[styles.stub, { borderColor: c.line2, backgroundColor: c.paper }]}>
        <T v="mono" size={9} color={c.ink3} style={{ letterSpacing: 1 }}>{r.parts.dow.toUpperCase()}</T>
        <T v="hero" size={20} lh={1.1} ls={-0.03}>{String(r.parts.dnum)}</T>
        <T v="mono" size={9} color={c.ink3} style={{ letterSpacing: 1 }}>{r.parts.mon.toUpperCase()}</T>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.rowTop}>
          <View style={[styles.vdot, { backgroundColor: tone.ink }]} />
          <T v="callout" size={15} numberOfLines={1} style={{ flexShrink: 1, fontWeight: "600" }}>{e.title}</T>
          {r.summarized ? <Icon name="spark" size={12} color={c.pastel.lilac.ink} /> : null}
          {r.optional ? <View style={[styles.opt, { borderColor: c.line2 }]}><T v="mono" size={9.5} color={c.ink3}>OPTIONAL</T></View> : null}
        </View>
        <T v="meta" size={13} color={r.filed ? c.ink2 : c.pastel.rose.ink} numberOfLines={2}>{r.filed ? r.preview || "Minutes filed." : MISSING_LINE}</T>
        <View style={styles.rowFoot}>
          <View style={[styles.tag, r.filed ? { backgroundColor: c.pastel.mint.soft, borderColor: c.pastel.mint.border } : { backgroundColor: c.pastel.rose.soft, borderColor: c.pastel.rose.border }]}>
            <T v="mono" size={10} color={r.filed ? c.pastel.mint.ink : c.pastel.rose.ink} style={{ fontWeight: "600" }}>{r.tag.toUpperCase()}</T>
          </View>
          <T v="mono" size={12} color={r.low ? c.pastel.rose.ink : r.counted ? c.ink : c.ink3} style={r.low ? { fontWeight: "700" } : undefined}>{r.stat}</T>
          {r.counted ? <T v="mono" size={10} color={c.ink3}>present</T> : null}
        </View>
      </View>
      <Icon name="chev-r" size={14} color={c.ink3} />
    </Pressable>
  );
}

/* ── day one ──────────────────────────────────────────────────────────────────── */

export function ChapterDayOne({ canAdd, onAdd }: { canAdd: boolean; onAdd: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 18 }}>
      <View style={[styles.d1, { backgroundColor: c.card, borderColor: c.line, boxShadow: c.sh1 }]} accessibilityLabel="How meetings work">
        <Figure i={0} title="1 · Add the meeting" line="When and where. Everyone sees it."><CalPic /></Figure>
        <Figure i={1} title="2 · Take the notes" line="Type as you go, right in the meeting."><PadPic /></Figure>
        <Figure i={2} title="3 · Keep the book" line="Who came, and who owes what next time."><FiledPic /></Figure>
      </View>
      {canAdd ? (
        <Pressable onPress={onAdd} accessibilityRole="button" style={({ pressed }) => [styles.d1btn, { backgroundColor: c.ink }, hard(c.pastel.lilac.fill, 3), pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
          <Icon name="plus" size={15} color={c.paper} />
          <T v="button" color={c.paper}>Add your first meeting</T>
        </Pressable>
      ) : <T v="callout" color={c.ink3} align="center">No meetings yet. An officer will add the first one.</T>}
    </View>
  );
}

function Figure({ i, title, line, children }: { i: number; title: string; line: string; children: ReactNode }) {
  const { c } = useTheme();
  const m = useMotion();
  return (
    <Animated.View entering={FadeInDown.duration(m.t(360)).delay(m.reduced ? 0 : m.t(120 + i * 80)).reduceMotion(ReduceMotion.System)} style={{ alignItems: "center", gap: 4 }}>
      <View style={{ minHeight: 120, justifyContent: "flex-end", marginBottom: 10 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</View>
      <T v="heading" size={16.5} align="center">{title}</T>
      <T v="meta" color={c.ink3} align="center">{line}</T>
    </Animated.View>
  );
}

function CalPic() {
  const { c } = useTheme();
  return (
    <View style={[styles.calPic, { backgroundColor: c.card, borderColor: c.ink, transform: [{ rotate: "-2deg" }] }, hard(c.pastel.sky.fill, 3)]}>
      <View style={[styles.calPicStub, { backgroundColor: c.pastel.sky.fill, borderRightColor: c.ink }]}>
        <T v="mono" size={9} style={{ fontWeight: "700", letterSpacing: 1 }}>TUE · NOV</T>
        <T v="hero" size={30} ls={-0.05} lh={1.05}>10</T>
      </View>
      <View style={{ padding: 10, gap: 2, justifyContent: "center" }}>
        <T v="heading" size={14.5}>Chapter meeting</T>
        <T v="meta" size={11.5} color={c.ink3} style={{ fontStyle: "italic" }}>7 pm · the house</T>
      </View>
    </View>
  );
}

function PadPic() {
  const { c } = useTheme();
  const lines: { t: string; h?: boolean; act?: boolean }[] = [
    { t: "Old business", h: true }, { t: "Formal moved to Dec 5" }, { t: "– Ava: book the hall", act: true }, { t: "Dues due Nov 20" },
  ];
  return (
    <View style={[styles.pad, { backgroundColor: c.note.fill.butter, borderColor: c.line2, transform: [{ rotate: "1.5deg" }] }]}>
      <View style={[styles.margin, { backgroundColor: c.pastel.rose.border }]} />
      {lines.map((l, i) => (
        <View key={i} style={[styles.padLine, { borderBottomColor: c.pastel.sky.border }]}>
          <T v="meta" size={11.5} color={l.act ? c.pastel.peach.ink : c.note.ink} style={l.h ? { fontWeight: "700" } : undefined}>{l.t}</T>
        </View>
      ))}
    </View>
  );
}

function FiledPic() {
  const { c } = useTheme();
  return (
    <View style={[styles.filed, { backgroundColor: c.card, borderColor: c.line2 }]}>
      <View style={[styles.stamp, { borderColor: c.pastel.mint.ink }]}><T v="kicker" size={9.5} color={c.pastel.mint.ink}>Filed</T></View>
      <T v="mono" size={9.5} color={c.ink3}>NOV 10 · WHO CAME</T>
      <View style={styles.dots}>
        {Array.from({ length: 10 }, (_, i) => <View key={i} style={[styles.d6, { backgroundColor: i < 9 ? c.pastel.mint.ink : "transparent", borderColor: c.pastel.mint.ink }]} />)}
      </View>
      <T v="meta" size={11.5} color={c.ink}>9 of 10 came</T>
      <View style={{ gap: 2, marginTop: 4 }}>
        <View style={styles.todo}><View style={[styles.box, { borderColor: c.ink3, backgroundColor: c.ink3 }]} /><T v="meta" size={11} color={c.ink3} style={{ textDecorationLine: "line-through" }}>Send the agenda</T></View>
        <View style={styles.todo}><View style={[styles.box, { borderColor: c.ink3 }]} /><T v="meta" size={11} color={c.ink}>Ava · book the hall</T></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sec: { flexDirection: "row", alignItems: "center", gap: 12 },
  rule: { flex: 1, height: 0, borderTopWidth: 1.5, borderStyle: "dashed", marginTop: 4 },
  deck: { borderWidth: 1.5, borderRadius: 26, padding: 18, gap: 16 },
  deckTop: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  calWrap: { paddingTop: 6 },
  tape: { position: "absolute", top: 0, left: 18, width: 46, height: 14, opacity: 0.85, zIndex: 2, transform: [{ rotate: "-3deg" }] },
  cal: { width: 84, borderWidth: 1.5, borderRadius: 12, overflow: "hidden", alignItems: "center", transform: [{ rotate: "-2deg" }] },
  calHead: { alignSelf: "stretch", alignItems: "center", paddingVertical: 4, borderBottomWidth: 1.5 },
  pill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1.5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  meta: { flexDirection: "row", flexWrap: "wrap", columnGap: 18, rowGap: 8 },
  metaI: { flexDirection: "row", alignItems: "center", gap: 8 },
  prog: { borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 10 },
  pHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  meter: { height: 8, borderRadius: 4, overflow: "hidden", flexDirection: "row" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  li: { flexDirection: "row", alignItems: "center", gap: 6 },
  ld: { width: 8, height: 8, borderRadius: 4 },
  exc: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  act: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5 },
  actSm: { paddingVertical: 7, paddingHorizontal: 14 },
  tabs: { flexDirection: "row", borderWidth: 1.5, borderRadius: 16, padding: 4, gap: 2 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: "transparent" },
  ledger: { borderWidth: 1.5, borderRadius: 20, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 13 },
  stub: { width: 48, alignItems: "center", paddingVertical: 5, borderRadius: 10, borderWidth: 1.5 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  vdot: { width: 7, height: 7, borderRadius: 4 },
  opt: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  rowFoot: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  empty: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 18, padding: 22 },
  d1: { borderRadius: 22, borderWidth: 1.5, paddingVertical: 24, paddingHorizontal: 18, gap: 30 },
  d1btn: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999 },
  pad: { width: 170, borderWidth: 1, borderRadius: 6, paddingLeft: 22, paddingRight: 10, paddingTop: 10, paddingBottom: 4 },
  margin: { position: "absolute", left: 14, top: 0, bottom: 0, width: 1.5 },
  padLine: { borderBottomWidth: 1, paddingVertical: 3 },
  filed: { width: 170, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 3 },
  stamp: { position: "absolute", right: -8, top: 8, borderWidth: 2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, transform: [{ rotate: "12deg" }] },
  dots: { flexDirection: "row", gap: 3, marginTop: 4 },
  d6: { width: 7, height: 7, borderRadius: 4, borderWidth: 1 },
  todo: { flexDirection: "row", alignItems: "center", gap: 6 },
  box: { width: 9, height: 9, borderRadius: 2, borderWidth: 1.2 },
  calPic: { flexDirection: "row", borderWidth: 1.5, borderRadius: 12, overflow: "hidden" },
  calPicStub: { width: 64, alignItems: "center", justifyContent: "center", borderRightWidth: 1.5, borderStyle: "dashed", paddingVertical: 8 },
});
