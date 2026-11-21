/**
 * The Service page's pieces, as the web phone draws them (service-paper.css psv-*):
 * the desk-calendar date, the measures, an event card that opens onto its sign-in
 * sheet, a member's punch card, the legend, day one. Words and rules: ./model.
 */
import type { Brother, ServiceEvent, ServiceParticipationRow } from "@/lib/api-types";
import { roleTitle } from "@/lib/dashboard/roster";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, type IconName } from "~/icons/Icon";
import { pressedDim } from "~/motion/press";
import { Avatar } from "~/paper/bits";
import { alpha, type Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import {
  DAY_ONE, PAGE, STANDING_TONE, cardTail, dateParts, dayLabel, dayOneHoles, eventTag, holesFor, lineNo, members, mon3, r1, sheetEmpty, sheetSum,
  standing, timeLabel,
} from "./model";

/* ── the desk calendar date ───────────────────────────────────────────────────── */

export function DeskDate({ date, up }: { date: string; up?: boolean }) {
  const { c } = useTheme();
  const p = dateParts(date);
  return (
    <View style={[styles.cal, { borderColor: up ? c.line2 : c.ink, borderStyle: up ? "dashed" : "solid", backgroundColor: c.card }, !up && hard(c.line2, 2)]}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.calTop, { backgroundColor: up ? c.pastel.sky.soft : c.pastel.mint.soft, borderBottomColor: up ? c.pastel.sky.border : c.ink, borderStyle: up ? "dashed" : "solid" }]}>
        <T v="kicker" size={9} color={up ? c.pastel.sky.ink : c.ink}>{mon3(p.m).toUpperCase()}</T>
      </View>
      <T v="title" size={20} lh={1.2} color={c.ink} style={{ paddingVertical: 3 }}>{String(p.d)}</T>
    </View>
  );
}

/* ── measures ─────────────────────────────────────────────────────────────────── */

export function Measure({ label, icon, tone, value, unit, note, warn, unset }: {
  label: string; icon: IconName; tone: Tone; value: string; unit?: string; note: string; warn?: boolean; unset?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.meas, unset ? { borderColor: c.line2, borderStyle: "dashed" } : { borderColor: c.line, backgroundColor: c.card }]}
      accessible accessibilityLabel={`${label}: ${value}${unit ?? ""}, ${note}`}>
      <View style={styles.measK}>
        <Icon name={icon} size={14} color={c.pastel[tone].ink} />
        <T v="label" size={10.5} ls={0.09} color={c.ink3} numberOfLines={1} style={{ flex: 1, fontWeight: "700", textTransform: "uppercase" }}>{label}</T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 8 }}>
        <T v="title" size={30} lh={1} color={unset ? c.ink3 : warn ? c.pastel.butter.ink : c.ink}>{value}</T>
        {unit ? <T v="body" size={15} color={c.ink3} style={{ marginLeft: 3, marginBottom: 2 }}>{unit}</T> : null}
      </View>
      <T v={unset ? "meta" : "mono"} color={unset ? c.ink2 : c.ink3} style={unset ? { marginTop: 9 } : { fontSize: 11.5, marginTop: 6 }}>{note}</T>
    </View>
  );
}

/* ── section head ─────────────────────────────────────────────────────────────── */

export function SectionHead({ title, count }: { title: string; count: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.sec} accessibilityRole="header" accessible accessibilityLabel={`${title}, ${count}`}>
      <T v="heading" size={21}>{title}</T>
      <View style={[styles.rule, { borderColor: c.line2 }]} />
      <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{count}</T>
    </View>
  );
}

/* ── an event card ────────────────────────────────────────────────────────────── */

export const EventCard = memo(function EventCard({ ev, today, open, pending, rows, canService, selfId, onToggle, onLog, onEdit, onDelete, onRemove }: {
  ev: ServiceEvent; today: string; open: boolean; pending: boolean; rows: ServiceParticipationRow[] | undefined;
  canService: boolean; selfId: number;
  onToggle: (id: number) => void; onLog: (ev: ServiceEvent) => void; onEdit: (ev: ServiceEvent) => void; onDelete: (ev: ServiceEvent) => void;
  onRemove: (eventId: number, p: ServiceParticipationRow) => void;
}) {
  const { c } = useTheme();
  const tag = eventTag(ev.date, today);
  const up = tag.up;
  const s = sheetSum(rows);
  const t = timeLabel(ev);
  const list = rows ? [...rows].sort((a, b) => a.brother.name.localeCompare(b.brother.name)) : [];
  const dim = pending ? { opacity: 0.35 } : null;
  return (
    <View style={[styles.ev, { borderColor: open ? c.ink : c.line, backgroundColor: up && !open ? alpha(c.card, 0.7) : c.card, borderStyle: up && !open ? "dashed" : "solid" },
      open && hard(c.pastel.mint.fill, 4)]} accessibilityState={{ busy: pending }}>
      <Pressable onPress={() => onToggle(ev.id)} disabled={pending} accessibilityRole="button" accessibilityState={{ expanded: open, disabled: pending }}
        accessibilityLabel={`${ev.title}, ${tag.label}, ${dayLabel(ev.date)}${t ? ` · ${t}` : ""}${ev.location ? `, ${ev.location}` : ""}`}
        style={({ pressed }) => [styles.head, pressed && pressedDim]}>
        <DeskDate date={ev.date} up={up} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.titleRow}>
            <T v="subhead" size={17}>{ev.title}</T>
            <View style={[styles.tag, up ? { backgroundColor: c.pastel.sky.soft, borderColor: c.pastel.sky.border } : { backgroundColor: c.paper2, borderColor: c.line2 }]}>
              <T v="kicker" size={9.5} color={up ? c.pastel.sky.ink : c.ink3}>{tag.label.toUpperCase()}</T>
            </View>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaBit}><Icon name="cal" size={12} color={c.ink3} /><T v="meta" color={c.ink2}>{`${dayLabel(ev.date)}${t ? ` · ${t}` : ""}`}</T></View>
            {ev.location ? <View style={styles.metaBit}><Icon name="pin" size={12} color={c.ink3} /><T v="meta" color={c.ink2}>{ev.location}</T></View> : null}
          </View>
          <View style={[styles.stats, dim]}>
            <T v="mono" color={c.ink3} style={{ fontSize: 10.5 }}><T v="title" size={17} color={s?.n ? c.ink : c.line2}>{String(s?.n || "—")}</T>{` ${PAGE.here}`}</T>
            <T v="mono" color={c.ink3} style={{ fontSize: 10.5 }}><T v="title" size={17} color={s?.n ? c.ink : c.line2}>{s?.n ? r1(s.h) : "—"}</T>{` ${PAGE.hours}`}</T>
          </View>
        </View>
        <View style={[dim, { transform: [{ rotate: open ? "90deg" : "0deg" }] }]}><Icon name="chev-r" size={16} color={c.ink3} /></View>
      </Pressable>
      {open ? (
        <View style={styles.body}>
          {ev.notes ? <T v="body" color={c.ink2}>{ev.notes}</T> : null}
          <View style={[styles.sheet, { borderColor: c.line, backgroundColor: c.paper }]}>
            <View style={[styles.margin, { backgroundColor: alpha(c.pastel.rose.ink, 0.45) }]} />
            <View style={[styles.shH, { borderBottomColor: c.pastel.sky.border }]}>
              <T v="kicker" size={9} color={c.ink3} style={styles.no}>#</T>
              <T v="kicker" size={9} color={c.ink3} style={styles.who}>{PAGE.signedIn.toUpperCase()}</T>
              <T v="kicker" size={9} color={c.ink3} style={styles.hrs}>{PAGE.hoursCol.toUpperCase()}</T>
              <View style={styles.x} />
            </View>
            {!rows ? (
              <T v="meta" color={c.ink3} style={styles.empty}>{PAGE.fetching}</T>
            ) : !list.length ? (
              <T v="meta" color={c.ink3} style={styles.empty}>{sheetEmpty(up, canService)}</T>
            ) : (
              <>
                {list.map((p, i) => (
                  <View key={p.id} style={[styles.line, { borderBottomColor: c.pastel.sky.border }]}>
                    <T v="mono" color={c.ink3} style={[styles.no, { fontSize: 10 }]}>{lineNo(i)}</T>
                    <View style={[styles.who, styles.whoRow]}>
                      <Avatar name={p.brother.name} uri={p.brother.avatarUrl} px={22} />
                      <T v="callout" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {p.brother.name}{p.brotherId === selfId ? <T v="callout" color={c.ink3}>{PAGE.you}</T> : null}
                      </T>
                    </View>
                    <T v="mono" style={[styles.hrs, { fontSize: 13, fontWeight: "600" }]}>{`${r1(p.hours)}h`}</T>
                    {canService ? (
                      <Pressable onPress={() => onRemove(ev.id, p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${p.brother.name}`}
                        style={({ pressed }) => [styles.x, pressed && pressedDim]}>
                        <Icon name="x" size={12} color={c.ink3} />
                      </Pressable>
                    ) : <View style={styles.x} />}
                  </View>
                ))}
                <View style={[styles.tot, { backgroundColor: c.paper2, borderTopColor: c.line }]}>
                  <View style={styles.no} />
                  <T v="meta" color={c.ink2} style={styles.who}>{members(list.length)}</T>
                  <T v="mono" style={[styles.hrs, { fontWeight: "700" }]}>{`${r1(list.reduce((a, p) => a + p.hours, 0))}h`}</T>
                  <View style={styles.x} />
                </View>
              </>
            )}
          </View>
          {canService ? (
            <View style={styles.acts}>
              <SmallBtn label={PAGE.logHours} icon="clock" ink onPress={() => onLog(ev)} />
              <SmallBtn label={PAGE.edit} icon="pencil" onPress={() => onEdit(ev)} />
              <View style={{ flex: 1 }} />
              <SmallBtn label={PAGE.delete} icon="trash" danger onPress={() => onDelete(ev)} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

/** .psv-btn.sm: ink, soft, or soft + del. */
export function SmallBtn({ label, icon, ink, danger, onPress }: { label: string; icon: IconName; ink?: boolean; danger?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const fg = ink ? c.paper : danger ? c.pastel.rose.ink : c.ink2;
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.sm, ink ? { backgroundColor: c.ink, borderColor: c.ink } : { borderColor: danger ? c.pastel.rose.border : c.line2 }, pressed && pressedDim]}>
      <Icon name={icon} size={13} color={fg} />
      <T v="buttonSm" color={fg}>{label}</T>
    </Pressable>
  );
}

/* ── a member's punch card ────────────────────────────────────────────────────── */

export const MemberCard = memo(function MemberCard({ b, goal, you, onPress }: { b: Brother; goal: number; you: boolean; onPress: (b: Brother) => void }) {
  const { c } = useTheme();
  const hh = b.serviceHours;
  const tone = STANDING_TONE[standing(hh, goal)];
  const holes = holesFor(goal);
  const tail = cardTail(hh, goal);
  const role = `${roleTitle(b) || PAGE.member}${you ? PAGE.you : ""}`;
  return (
    <Pressable onPress={() => onPress(b)} accessibilityRole="button" accessibilityLabel={`${b.name}, ${role}, ${r1(hh)} of ${goal} hours, ${tail.text}`}
      style={({ pressed }) => [styles.card, { backgroundColor: alpha(c.pastel[tone].fill, 0.35), borderColor: you ? c.ink : c.pastel[tone].border, borderWidth: you ? 2 : 1.5 },
        hard(c.pastel[tone].border, 3), pressed && pressedDim]}>
      <View style={styles.cardTop}>
        <Avatar name={b.name} uri={b.avatarUrl} size="md" />
        <View style={{ flex: 1 }}>
          <T v="callout" style={{ fontWeight: "600" }} numberOfLines={1}>{b.name}</T>
          <T v="meta" color={c.ink3} numberOfLines={1}>{role}</T>
        </View>
        <T v="title" size={20}>{r1(hh)}<T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{`/${goal}h`}</T></T>
      </View>
      <View style={[styles.holes, { borderTopColor: alpha(c.ink, 0.18) }]}>
        {Array.from({ length: holes }, (_, i) => (
          <View key={i} style={[styles.hole, i < Math.floor(hh) ? { backgroundColor: c.ink2, borderColor: c.ink } : { borderColor: alpha(c.ink, 0.28), borderStyle: "dashed" }]} />
        ))}
        <T v="mono" color={tail.kind === "x" ? c.pastel.mint.ink : c.ink3} style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: tail.kind === "x" ? "600" : "400" }}>{tail.text}</T>
      </View>
    </Pressable>
  );
});

export function Legend({ goal }: { goal: number }) {
  const { c } = useTheme();
  const sw = (tone: Tone) => <View style={[styles.sw, { backgroundColor: c.pastel[tone].fill, borderColor: c.line2 }]} />;
  return (
    <View style={styles.legend}>
      <View style={styles.lg}>{sw("mint")}<T v="meta" color={c.ink3}>{PAGE.legendOk(goal)}</T></View>
      <View style={styles.lg}>{sw("butter")}<T v="meta" color={c.ink3}>{PAGE.legendHalf}</T></View>
      <View style={styles.lg}>{sw("peach")}<T v="meta" color={c.ink3}>{PAGE.legendUnder}</T></View>
      <T v="meta" color={c.ink3}>{PAGE.legendNote}</T>
    </View>
  );
}

/* ── calm (no match) and empty ────────────────────────────────────────────────── */

export function Calm({ title, line, onClear }: { title: string; line: string; onClear?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.calm, { borderColor: c.line2 }]}>
      <View style={[styles.art, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}><Icon name="search" size={18} color={c.pastel.lilac.ink} /></View>
      <View style={{ flex: 1, gap: 4 }}>
        <T v="subhead" size={16}>{title}</T>
        <T v="meta" color={c.ink3}>{line}</T>
        {onClear ? <View style={{ alignSelf: "flex-start", marginTop: 8 }}><SmallBtn label={PAGE.clear} icon="x" onPress={onClear} /></View> : null}
      </View>
    </View>
  );
}

/* ── day one ──────────────────────────────────────────────────────────────────── */

export function DayOne({ goal, officer, onNew }: { goal: number; officer: boolean; onNew: () => void }) {
  const { c } = useTheme();
  const { punched, holes } = dayOneHoles(goal);
  const step = (i: 0 | 1 | 2, art: React.ReactNode) => {
    const s = DAY_ONE.steps[i];
    return (
      <View style={styles.d1Step}>
        <View style={styles.d1Art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{art}</View>
        <T v="subhead" size={16} align="center">{s.title}</T>
        <T v="meta" color={c.ink3} align="center">{typeof s.line === "string" ? s.line : s.line(goal)}</T>
      </View>
    );
  };
  return (
    <View style={{ gap: 18 }}>
      <View style={[styles.d1, { borderColor: c.line2 }]} accessibilityLabel={DAY_ONE.aria}>
        {step(0, (
          <View style={[styles.d1Cal, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.lilac.fill, 3)]}>
            <View style={[styles.d1CalTop, { backgroundColor: c.pastel.sky.fill, borderBottomColor: c.ink }]}><T v="kicker" size={9} color={c.ink}>{DAY_ONE.calMonth.toUpperCase()}</T></View>
            <T v="title" size={34} align="center">{DAY_ONE.calDay}</T>
            <T v="meta" align="center" color={c.ink2} style={{ paddingBottom: 6 }}>{DAY_ONE.calTitle}</T>
          </View>
        ))}
        {step(1, (
          <View style={[styles.d1Pad, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.lilac.fill, 3)]}>
            {DAY_ONE.pad.map(([n, h], i) => (
              <View key={n} style={[styles.d1PadRow, { borderTopColor: i === 3 ? c.ink : c.line, borderTopWidth: i === 0 ? 0 : i === 3 ? 1.5 : 1 }]}>
                <T v="mono" size={11} color={c.ink} style={i === 3 ? { fontWeight: "700" } : null}>{n}</T>
                <T v="mono" size={11} color={c.ink} style={i === 3 ? { fontWeight: "700" } : null}>{h}</T>
              </View>
            ))}
          </View>
        ))}
        {step(2, (
          <View style={[styles.d1Punch, { backgroundColor: c.pastel.butter.soft, borderColor: c.ink }, hard(c.pastel.butter.fill, 3)]}>
            <View style={[styles.d1Plus, { backgroundColor: c.pastel.mint.fill, borderColor: c.ink }]}><T v="mono" size={11} style={{ fontWeight: "700" }}>{`+${punched}h`}</T></View>
            <T v="kicker" size={8.5} color={c.pastel.peach.ink}>{DAY_ONE.card.toUpperCase()}</T>
            <View style={styles.d1Holes}>
              {Array.from({ length: holes }, (_, i) => (
                <View key={i} style={[styles.d1Hole, i < punched ? { backgroundColor: c.ink2, borderColor: c.ink } : { borderColor: alpha(c.ink, 0.3), borderStyle: "dashed" }]} />
              ))}
            </View>
          </View>
        ))}
      </View>
      {officer ? (
        <Pressable onPress={onNew} accessibilityRole="button"
          style={({ pressed }) => [styles.d1Cta, { backgroundColor: c.ink }, !pressed && hard(c.pastel.mint.fill, 3), pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
          <Icon name="plus" size={15} color={c.paper} />
          <T v="button" color={c.paper}>{DAY_ONE.cta}</T>
        </Pressable>
      ) : <T v="body" color={c.ink2} align="center">{DAY_ONE.member}</T>}
    </View>
  );
}

const styles = StyleSheet.create({
  cal: { width: 46, borderWidth: 1.5, borderRadius: 8, overflow: "hidden", alignItems: "center" },
  calTop: { alignSelf: "stretch", alignItems: "center", paddingVertical: 2, borderBottomWidth: 1.5 },
  meas: { width: "48.5%", borderWidth: 1.5, borderRadius: 20, padding: 16 },
  measK: { flexDirection: "row", alignItems: "center", gap: 8 },
  sec: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  rule: { flex: 1, borderTopWidth: 1.5, borderStyle: "dashed" },
  ev: { borderWidth: 1.5, borderRadius: 22 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 4 },
  tag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 2 },
  metaBit: { flexDirection: "row", alignItems: "center", gap: 5 },
  stats: { flexDirection: "row", gap: 14, marginTop: 6 },
  body: { gap: 12, paddingHorizontal: 12, paddingBottom: 14 },
  sheet: { borderWidth: 1.5, borderTopLeftRadius: 6, borderTopRightRadius: 14, borderBottomRightRadius: 8, borderBottomLeftRadius: 12, overflow: "hidden" },
  margin: { position: "absolute", left: 40, top: 0, bottom: 0, width: 1.5 },
  shH: { flexDirection: "row", alignItems: "center", minHeight: 30, borderBottomWidth: 1.5 },
  line: { flexDirection: "row", alignItems: "center", minHeight: 38, borderBottomWidth: 1 },
  tot: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 1.5 },
  no: { width: 40, textAlign: "right", paddingRight: 9 },
  who: { flex: 1, paddingLeft: 10 },
  whoRow: { flexDirection: "row", alignItems: "center", gap: 9, minWidth: 0 },
  hrs: { width: 60, textAlign: "right" },
  x: { width: 34, alignItems: "center", justifyContent: "center" },
  empty: { paddingVertical: 14, paddingRight: 12, paddingLeft: 52 },
  acts: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  sm: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 13, minHeight: 36 },
  card: { borderRadius: 18, padding: 14, gap: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  holes: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, borderTopWidth: 1.5, borderStyle: "dashed", paddingTop: 12 },
  hole: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 6 },
  lg: { flexDirection: "row", alignItems: "center", gap: 6 },
  sw: { width: 10, height: 10, borderRadius: 3, borderWidth: 1.5 },
  calm: { flexDirection: "row", gap: 14, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 18, padding: 18 },
  art: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  d1: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 24, paddingVertical: 28, paddingHorizontal: 18, gap: 34 },
  d1Step: { alignItems: "center", gap: 6 },
  d1Art: { marginBottom: 12, alignItems: "center", justifyContent: "center" },
  d1Cal: { width: 116, borderWidth: 1.5, borderRadius: 10, overflow: "hidden", transform: [{ rotate: "-3deg" }] },
  d1CalTop: { alignItems: "center", paddingVertical: 4, borderBottomWidth: 1.5 },
  d1Pad: { width: 150, borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, transform: [{ rotate: "2deg" }] },
  d1PadRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  d1Punch: { width: 150, borderWidth: 1.5, borderRadius: 10, padding: 12, gap: 8, transform: [{ rotate: "-2deg" }] },
  d1Plus: { position: "absolute", right: -8, top: -12, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  d1Holes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  d1Hole: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  d1Cta: { alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 999, minHeight: 46, paddingHorizontal: 20 },
});
