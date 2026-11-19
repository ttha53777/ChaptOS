/**
 * The Members page's three pieces (app/org/[slug]/brothers/page.tsx at phone width), on the
 * shared rules in lib/dashboard/roster.ts:
 *
 *   Measures      the ledger strip as two-up tiles: Attendance, <Meetings> GPA, <Dues>
 *                 outstanding, <Service> hours (each only when tracked), In good standing.
 *                 A tile filters/scrolls to the roster, as the web's focusRoster does
 *   StandingCard  the band bar (Good · Watch · At risk, widths by count), the legend chips,
 *                 and every face ringed by standing. A band or chip filters the roster; a
 *                 face opens that member's card. Before anything is recorded: the web's
 *                 "Starts once the first record is in" line and plain rings
 *   RosterCard    "N shown", the band chips, search, then the rows: name (+ the pending-excuse
 *                 clip for attendance officers), role line, dues with "Nd late" and Pay
 *                 (treasury), and the status tag (NOT YET until something is measured).
 *                 The foot repeats the counts
 *
 * Motion: the band bar draws in from the left on a spring; filtering dims the bands and
 * faces it leaves out (opacity) and the rows settle with a layout transition. Reduced:
 * instant. Haptics: select on a filter change; none for opening a card (navigation).
 */
import type { Brother } from "@/lib/api-types";
import { getBrotherStatus, type BrotherStatus } from "@/lib/dashboard/standing";
import { roleTitle, type RosterKpis, type StatusFilter } from "@/lib/dashboard/roster";
import type { Thresholds } from "@/lib/thresholds";
import type { TrackedMetrics } from "@/lib/tracked-metrics";
import { fmtUsd } from "@/lib/money";
import { memo, useEffect } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Avatar } from "~/paper/bits";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";

export const BANDS: { value: BrotherStatus; label: string; tag: string; tone: Tone }[] = [
  { value: "Good", label: "Good", tag: "GOOD", tone: "mint" },
  { value: "Watch", label: "Watch", tag: "WATCH", tone: "butter" },
  { value: "At Risk", label: "At risk", tag: "AT RISK", tone: "peach" },
];
const bandOf = (s: BrotherStatus) => BANDS.find(b => b.value === s)!;

/* ── Measures ─────────────────────────────────────────────────────────────────── */

export type Focus = "attendance" | "gpa" | "serviceHours" | "duesOwed" | "good";

export function Measures({ k, roster, t, tracked, measured, good, nothingMeasured, words, onFocus }: {
  k: RosterKpis; roster: Brother[]; t: Thresholds; tracked: TrackedMetrics; measured: TrackedMetrics;
  good: number; nothingMeasured: boolean;
  words: { meetings: string; dues: string; service: string; members: string };
  onFocus: (f: Focus) => void;
}) {
  const members = words.members.toLowerCase();
  const tiles: (TileProps & { key: Focus })[] = [];
  if (tracked.attendance) tiles.push({
    key: "attendance", label: "Attendance", value: measured.attendance ? k.avgAtt.toFixed(1) : "—", unit: measured.attendance ? "%" : undefined,
    note: !measured.attendance ? "no meetings yet" : k.belowAttend > 0 ? `${k.belowAttend} below ${t.attendanceWatch}%` : "all on track",
    tone: !measured.attendance ? undefined : k.belowAttend > 0 ? "warn" : "ok",
  });
  if (tracked.gpa) tiles.push({
    key: "gpa", label: `${words.meetings} GPA`, value: measured.gpa ? k.avgGpa.toFixed(2) : "—",
    note: measured.gpa ? `${k.belowGpa} below ${t.gpaWatch.toFixed(1)}` : "none entered yet",
  });
  if (tracked.duesOwed) tiles.push({
    key: "duesOwed", label: `${words.dues} outstanding`, prefix: "$", value: k.duesTotal.toLocaleString(),
    note: k.duesOwing > 0 ? `${k.duesOwing} ${members} owe${k.duesOverdue ? ` · ${k.duesOverdue} overdue` : ""}` : "all paid up",
    tone: k.duesOwing > 0 ? "warn" : "ok",
  });
  if (tracked.serviceHours) tiles.push({
    key: "serviceHours", label: `${words.service} hours`, value: String(roster.reduce((s, b) => s + b.serviceHours, 0)), unit: "h",
    note: measured.serviceHours ? `${k.svcMet} of ${k.total} on track` : "none logged yet",
  });
  tiles.push({
    key: "good", label: "In good standing", value: nothingMeasured ? "—" : String(good), unit: nothingMeasured ? undefined : ` / ${k.total}`,
    note: nothingMeasured ? "starts with the first record" : `${Math.round((good / Math.max(1, k.total)) * 100)}% of ${members}`,
    tone: nothingMeasured ? undefined : "ok",
  });
  return (
    <View style={styles.tiles}>
      {tiles.map(({ key, ...p }) => <Tile key={key} {...p} onPress={() => onFocus(key)} />)}
    </View>
  );
}

interface TileProps { label: string; value: string; unit?: string; prefix?: string; note: string; tone?: "ok" | "warn"; onPress?: () => void }

function Tile({ label, value, unit, prefix, note, tone, onPress }: TileProps) {
  const { c } = useTheme();
  const noteColor = tone === "warn" ? c.risk : tone === "ok" ? c.ok : c.ink3;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${prefix ?? ""}${value}${unit ?? ""}. ${note}`} onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: c.card, borderColor: c.line, boxShadow: c.sh1 }, pressed && { opacity: 0.85 }]}>
      <T v="label" size={10.5} color={c.ink3}>{label}</T>
      <View style={styles.tileValue}>
        {prefix ? <T v="mono" size={14} color={c.ink3} style={{ marginBottom: 4 }}>{prefix}</T> : null}
        <T v="measure" size={30}>{value}</T>
        {unit ? <T v="mono" size={unit.startsWith(" ") ? 14 : 16} color={c.ink3} style={{ marginBottom: 4 }}>{unit}</T> : null}
      </View>
      <T v="mono" size={11.5} lh={1.45} color={noteColor}>{note}</T>
    </Pressable>
  );
}

/* ── Standing ─────────────────────────────────────────────────────────────────── */

export function StandingCard({ roster, counts, t, measured, nothingMeasured, hint, filter, onFilter, onOpen, meId, myPhoto }: {
  roster: Brother[]; counts: Record<StatusFilter, number>; t: Thresholds; measured: TrackedMetrics;
  nothingMeasured: boolean; hint: string; filter: StatusFilter;
  onFilter: (f: StatusFilter) => void; onOpen: (b: Brother) => void; meId: number; myPhoto: string | null;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const draw = useSharedValue(m.reduced ? 1 : 0);
  useEffect(() => { if (!m.reduced) draw.value = withDelay(m.t(200), withSpring(1, m.spring("settle"))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: draw.value }] }));
  const toggle = (v: BrotherStatus) => { haptics.select(); onFilter(filter === v ? "All" : v); };
  const live = BANDS.filter(b => counts[b.value] > 0);

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line, boxShadow: c.sh1 }]}>
      <T v="title" size={21} ls={-0.02}>Standing</T>
      <T v="body" size={14.5} lh={1.5} color={c.ink3} style={{ marginTop: 8 }}>
        {nothingMeasured ? "Starts once the first record is in. Until then nobody is judged on a 0." : hint.replace("Click", "Tap")}
      </T>

      {!nothingMeasured ? (
        <>
          <Animated.View style={[styles.bar, { borderColor: c.ink }, hard(c.line2, 3), barStyle]}>
            {live.map((b, i) => (
              <Dim key={b.value} on={filter === "All" || filter === b.value} style={{ flex: counts[b.value] }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Filter ${b.label}`} onPress={() => toggle(b.value)}
                  style={[styles.band, { backgroundColor: c.pastel[b.tone].fill }, i > 0 && { borderLeftWidth: 1.5, borderLeftColor: c.ink }]}>
                  <T v="bodyStrong" size={13} color={c.ink}>{counts[b.value] > 2 ? String(counts[b.value]) : ""}</T>
                </Pressable>
              </Dim>
            ))}
          </Animated.View>
          <View style={styles.legend}>
            {BANDS.map(b => {
              const on = filter === b.value;
              return (
                <Pressable key={b.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => toggle(b.value)}
                  style={[styles.legendChip, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel[b.tone].soft : c.card }]}>
                  <View style={[styles.legendDot, { borderColor: c.pastel[b.tone].ink, backgroundColor: c.pastel[b.tone].fill }]} />
                  <T v="callout" size={14} color={c.ink} style={{ fontWeight: "500" }}>{b.label}</T>
                  <T v="mono" size={12} color={c.ink3}>{counts[b.value]}</T>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <View style={[styles.photo, { borderTopColor: c.line2 }, nothingMeasured && { borderTopWidth: 0, paddingTop: 4, marginTop: 14 }]}>
        <View style={styles.faces}>
          {roster.map(b => {
            const st = getBrotherStatus(b, t, measured);
            const ring = nothingMeasured ? c.line2 : c.pastel[bandOf(st).tone].fill;
            const you = b.id === meId;
            return (
              <Dim key={b.id} on={filter === "All" || filter === st}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Open ${b.name}`} onPress={() => onOpen(b)}
                  style={[styles.face, { borderColor: ring }, you && { borderColor: c.ink }]}>
                  <Avatar name={b.name} uri={you ? myPhoto ?? b.avatarUrl : b.avatarUrl} tone="lilac" px={32} />
                </Pressable>
              </Dim>
            );
          })}
        </View>
        <T v="callout" size={13.5} color={c.ink3} style={{ marginTop: 10 }}>
          {`Everyone at a glance — ${roster.length} ${roster.length === 1 ? "face" : "faces"}, one ring each.`}
        </T>
      </View>
    </View>
  );
}

/** Opacity for what a filter leaves out. */
function Dim({ on, style, children }: { on: boolean; style?: object; children: React.ReactNode }) {
  const m = useMotion();
  const s = useAnimatedStyle(() => ({ opacity: withTiming(on ? 1 : 0.32, m.timing(m.reduced ? 0 : 200, "out")) }), [on]);
  return <Animated.View style={[style, s]}>{children}</Animated.View>;
}

/* ── Roster ───────────────────────────────────────────────────────────────────── */

export function RosterCard({ roster, shown, counts, t, tracked, measured, nothingMeasured, filter, onFilter, q, onQ, lateDays, excuses, canPay, onPay, onOpen, meId, myPhoto, words }: {
  roster: Brother[]; shown: Brother[]; counts: Record<StatusFilter, number>;
  t: Thresholds; tracked: TrackedMetrics; measured: TrackedMetrics; nothingMeasured: boolean;
  filter: StatusFilter; onFilter: (f: StatusFilter) => void; q: string; onQ: (q: string) => void;
  lateDays: (id: number) => number; excuses: Record<number, number> | null;
  canPay: boolean; onPay: (b: Brother) => void; onOpen: (b: Brother) => void;
  meId: number; myPhoto: string | null; words: { members: string; dues: string; service: string };
}) {
  const { c } = useTheme();
  const m = useMotion();
  const animateRows = !m.reduced && shown.length <= 40;
  const layout = m.reduced ? undefined : LinearTransition.springify().damping(22).stiffness(240).reduceMotion(ReduceMotion.System);
  const chips: StatusFilter[] = ["All", "Good", "Watch", "At Risk"];
  return (
    <View style={[styles.card, styles.rosterCard, { backgroundColor: c.card, borderColor: c.line, boxShadow: c.sh1 }]}>
      <View style={styles.rosterTop}>
        <View style={styles.head}>
          <View style={[styles.headTile, { backgroundColor: c.pastel.sky.soft, borderColor: c.pastel.sky.border }]}>
            <Icon name="people" size={17} color={c.pastel.sky.ink} />
          </View>
          <T v="title" size={20} ls={-0.02}>Roster</T>
          <View style={[styles.countPill, { backgroundColor: c.paper2, borderColor: c.pastel.sky.border }]}>
            <T v="callout" size={12.5} color={c.ink2}>{`${shown.length} shown`}</T>
          </View>
        </View>

        <View style={[styles.chips, { backgroundColor: c.paper2, borderColor: c.line }]} accessibilityRole="tablist">
          {chips.map(f => {
            const on = filter === f;
            return (
              <Pressable key={f} accessibilityRole="tab" accessibilityState={{ selected: on }}
                onPress={() => { if (!on) { haptics.select(); onFilter(f); } }}
                style={[styles.chip, on && { backgroundColor: c.card, boxShadow: c.sh1 }]}>
                <T v="callout" size={13.5} color={on ? c.ink : c.ink3} style={{ fontWeight: on ? "600" : "500" }}>{`${f} ${counts[f]}`}</T>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.search, { borderColor: c.line2, backgroundColor: c.card }]}>
          <Icon name="search" size={15} color={c.ink3} />
          <TextInput value={q} onChangeText={onQ} placeholder="Search name or role…" placeholderTextColor={c.faint}
            selectionColor={c.ink} autoCorrect={false} returnKeyType="search" accessibilityLabel="Search name or role"
            style={[styles.searchInput, { color: c.ink }]} />
          {q ? <Pressable onPress={() => onQ("")} accessibilityLabel="Clear search" hitSlop={10}><Icon name="x" size={14} color={c.ink3} /></Pressable> : null}
        </View>
      </View>

      <View style={[styles.thead, { backgroundColor: c.paper2, borderColor: c.line }]}>
        <T v="label" size={10.5} color={c.ink3} style={{ flex: 1 }}>Member</T>
        {tracked.duesOwed ? <T v="label" size={10.5} color={c.ink3} style={{ width: 82, textAlign: "right" }}>{words.dues}</T> : null}
        <T v="label" size={10.5} color={c.ink3} style={{ width: 70, textAlign: "right" }}>Status</T>
      </View>

      {shown.length === 0 ? (
        <T v="body" size={14.5} color={c.ink3} style={{ padding: 20, textAlign: "center", fontStyle: "italic" }}>
          {`No ${words.members.toLowerCase()} match your filters.`}
        </T>
      ) : shown.map((b, i) => {
        const row = (
          <Row b={b} first={i === 0} status={getBrotherStatus(b, t, measured)} nothingMeasured={nothingMeasured}
            dues={tracked.duesOwed} late={lateDays(b.id)} excuses={excuses?.[b.id] ?? 0}
            canPay={canPay} onPay={onPay} onOpen={onOpen} photo={(b.id === meId ? myPhoto ?? b.avatarUrl : b.avatarUrl) ?? null} />
        );
        // A long roster skips the per-row layout/enter/exit animations: animating every row's
        // position on each filter change is what made searching a big chapter stutter.
        return animateRows ? (
          <Animated.View key={b.id} layout={layout} entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}>{row}</Animated.View>
        ) : <View key={b.id}>{row}</View>;
      })}

      {shown.length > 0 ? (
        <View style={[styles.foot, { backgroundColor: c.paper2, borderTopColor: c.line }]}>
          <T v="mono" size={11} lh={1.6} color={c.ink3}>
            {`${shown.length} of ${roster.length} ${words.members.toLowerCase()} · ${counts.Good} good · ${counts.Watch} watch · ${counts["At Risk"]} at risk — tap a row for profile, ${words.dues.toLowerCase()} & ${words.service.toLowerCase()} log`}
          </T>
        </View>
      ) : null}
    </View>
  );
}

/** Memoized: props are primitives, the row's own Brother, and stable callbacks, so a parent
 *  re-render (a keystroke in search, a filter tap) only redraws rows that changed. */
const Row = memo(function Row({ b, first, status, nothingMeasured, dues, late, excuses, canPay, onPay: payFor, onOpen: openFor, photo }: {
  b: Brother; first: boolean; status: BrotherStatus; nothingMeasured: boolean; dues: boolean; late: number; excuses: number;
  canPay: boolean; onPay: (b: Brother) => void; onOpen: (b: Brother) => void; photo: string | null;
}) {
  const onPay = () => payFor(b);
  const onOpen = () => openFor(b);
  const { c } = useTheme();
  const band = bandOf(status);
  const tag = nothingMeasured ? { tag: "NOT YET", soft: c.paper2, border: c.line2, ink: c.ink3 }
    : { tag: band.tag, soft: c.pastel[band.tone].soft, border: c.pastel[band.tone].border, ink: band.tone === "peach" ? c.risk : band.tone === "mint" ? c.ok : c.warn };
  const wash = !nothingMeasured && status === "At Risk" ? c.riskBg : c.card;
  return (
    <Pressable accessibilityRole="button" accessibilityHint="Opens their card" onPress={onOpen}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.paper2 : wash, borderTopColor: c.pastel.sky.border }, first && { borderTopWidth: 0 }]}>
      <Avatar name={b.name} uri={photo} tone="lilac" px={30} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.nameLine}>
          <T v="bodyStrong" size={15.5} style={{ flexShrink: 1 }}>{b.name}</T>
          {excuses > 0 ? (
            <View style={[styles.clip, { backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }]}
              accessibilityLabel={`${excuses} pending excuse ${excuses === 1 ? "review" : "reviews"}`}>
              <Icon name="clip" size={11} color={c.pastel.butter.ink} />
              <T v="mono" size={11} color={c.pastel.butter.ink}>{excuses}</T>
            </View>
          ) : null}
        </View>
        <T v="callout" size={13.5} color={c.ink3} numberOfLines={1}>{roleTitle(b)}</T>
      </View>
      {dues ? (
        <View style={styles.duesCol}>
          {b.duesOwed > 0 ? (
            <>
              <View style={styles.duesLine}>
                <T v="mono" size={13.5} color={c.warn}>{fmtUsd(b.duesOwed)}</T>
                {late > 0 ? (
                  <View style={[styles.late, { backgroundColor: c.pastel.rose.soft, borderColor: c.pastel.rose.border }]}>
                    <T v="mono" size={10.5} color={c.pastel.rose.ink}>{`${late}d late`}</T>
                  </View>
                ) : null}
              </View>
              {canPay ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Record a payment from ${b.name}`} onPress={onPay} hitSlop={6}
                  style={({ pressed }) => [styles.pay, { borderColor: c.ink, backgroundColor: c.card }, pressed ? null : hard(c.pastel.mint.fill, 2)]}>
                  <T v="button" size={13} color={c.ink}>Pay</T>
                </Pressable>
              ) : null}
            </>
          ) : <T v="mono" size={13} color={c.faint}>—</T>}
        </View>
      ) : null}
      <View style={{ width: 70, alignItems: "flex-end" }}>
        <View style={[styles.tag, { backgroundColor: tag.soft, borderColor: tag.border }]}>
          <T v="label" size={10} color={tag.ink}>{tag.tag}</T>
        </View>
      </View>
    </Pressable>
  );
});

/* ── Day one ──────────────────────────────────────────────────────────────────── */

const STEPS: { icon: IconName; title: string; line: string }[] = [
  { icon: "link", title: "Share the link", line: "Drop it in the group chat or the recruitment email." },
  { icon: "people", title: "They sign in with Google", line: "…and ask to join. Nothing is created yet." },
  { icon: "check", title: "You approve them here", line: "One tap puts them on the roster — with a role if they hold one." },
];

/** "How joining works", for a roster of one (the web's .bh-inv). */
export function HowJoining() {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line, boxShadow: c.sh1 }]} accessibilityLabel="How joining works">
      <T v="label" size={10.5} color={c.pastel.lilac.ink}>How joining works</T>
      <T v="title" size={20} lh={1.25} ls={-0.02} style={{ marginTop: 6 }}>Joining is reviewed — a link isn’t access.</T>
      <T v="body" size={14.5} lh={1.5} color={c.ink2} style={{ marginTop: 8 }}>
        Anyone with the link can ask. Their request waits here until you approve it, and you can hand them a role as you do.
      </T>
      <View style={{ marginTop: 14, gap: 12 }}>
        {STEPS.map((s, i) => (
          <View key={s.title} style={styles.step}>
            <View style={[styles.stepN, { borderColor: c.ink, backgroundColor: c.pastel[(["peach", "sky", "mint"] as const)[i]!].fill }]}>
              <T v="mono" size={12} color="#26211B">{String(i + 1)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T v="bodyStrong" size={15}>{s.title}</T>
              <T v="callout" size={13.5} lh={1.45} color={c.ink3}>{s.line}</T>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: "47.8%", flexGrow: 0, borderWidth: 1.5, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 16, gap: 6 },
  tileValue: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  card: { borderWidth: 1.5, borderRadius: 22, padding: 20 },
  bar: { flexDirection: "row", height: 32, marginTop: 16, borderWidth: 1.5, borderRadius: 10, overflow: "hidden", transformOrigin: "left center" },
  band: { flex: 1, justifyContent: "center", paddingHorizontal: 10 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  legendChip: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5 },
  legendDot: { width: 11, height: 11, borderRadius: 3, borderWidth: 1.5 },
  photo: { marginTop: 16, paddingTop: 14, borderTopWidth: 1.5, borderStyle: "dashed" },
  faces: { flexDirection: "row", flexWrap: "wrap", gap: 2 },
  face: { padding: 2, borderRadius: 999, borderWidth: 3 },
  rosterCard: { padding: 0, overflow: "hidden" },
  rosterTop: { padding: 18, paddingBottom: 14, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  headTile: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  countPill: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  chips: { flexDirection: "row", alignSelf: "flex-start", padding: 3, gap: 2, borderRadius: 999, borderWidth: 1.5 },
  chip: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 999 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, height: 40 },
  searchInput: { flex: 1, fontSize: 14.5, paddingVertical: 0 },
  thead: { flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingHorizontal: 16, borderTopWidth: 1.5, borderBottomWidth: 1.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: 1 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  clip: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 999, borderWidth: 1 },
  duesCol: { width: 82, alignItems: "flex-end", gap: 6 },
  duesLine: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" },
  late: { paddingVertical: 1, paddingHorizontal: 5, borderRadius: 999, borderWidth: 1 },
  pay: { paddingVertical: 6, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5 },
  tag: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1 },
  foot: { paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1.5 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepN: { width: 26, height: 26, borderRadius: 999, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1 },
});
