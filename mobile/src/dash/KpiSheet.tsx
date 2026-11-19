/**
 * The headline numbers' detail (web KPIDetailDrawer, the Deadlines widget drawer and
 * CustomMetricDetailDrawer in app/org/[slug]/page.tsx), as a bottom sheet: the web's
 * stat row, its lowest-first list, its note, in its words.
 *
 *   attendance  avg · below 80% · at risk; every member lowest first; follow-up note
 *   dues        total owed · owe · paid up; balances (days late) then paid up
 *   gpa         avg · below 3.0 · at risk; lowest first; the academic note
 *   service     total · on track · below goal; fewest first, hours to go
 *   deadlines   overdue · upcoming · open · done; the four buckets, tick to complete
 *   metric      on track · not on track · goal; the summary panel
 *
 * Writes the web makes from a drawer: ticking a deadline happens here (the same
 * tickTask as everywhere else). The rest (Log attendance, Pay, +1h, edit, delete, add)
 * hand off to the page that owns them, which is where the app keeps those forms.
 */
import type { Brother, DashboardMetric, MemberDuesStanding, Task } from "@/lib/api-types";
import { taskAssigneeLabel } from "@/lib/dashboard/plate";
import { fmtUsd } from "@/lib/money";
import { isAttendanceExempt, type Thresholds } from "@/lib/thresholds";
import { taskUrgency } from "@/lib/tasks/urgency";
import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, type IconName } from "~/icons/Icon";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { tickTask } from "~/tasks/tick";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export type KpiKey = "attendance" | "dues" | "gpa" | "service" | "deadlines" | `metric:${number}`;

export interface KpiCtx {
  brothers: Brother[];
  tasks: Task[];
  metrics: DashboardMetric[];
  duesStandings: MemberDuesStanding[];
  thresholds: Thresholds;
  hasDuesData: boolean;
  canTreasury: boolean;
  financeEnabled: boolean;
  words: { dues: string; meetings: string; members: string; treasury: string };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (s: string) => { const [, m, d] = s.split("-").map(Number); return `${MONTHS[m! - 1]} ${d}`; };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const first = (name: string) => name.split(" ")[0] ?? name;
const s = (n: number, one: string, many: string) => (n === 1 ? one : many);

type Ink = "" | "gold" | "rose" | "ok" | "vio" | "info";

function useInk() {
  const { c } = useTheme();
  return (k: Ink) => (k === "gold" ? c.pastel.butter.ink : k === "rose" ? c.pastel.rose.ink : k === "ok" ? c.pastel.mint.ink : k === "vio" ? c.pastel.lilac.ink : k === "info" ? c.pastel.sky.ink : c.ink);
}

function Stats({ items }: { items: [string, string, Ink][] }) {
  const { c } = useTheme();
  const ink = useInk();
  return (
    <View style={styles.stats}>
      {items.map(([n, l, k]) => (
        <View key={l} style={[styles.stat, { backgroundColor: c.card, borderColor: c.line }]}>
          <T v="monoLg" size={18} color={ink(k)} numberOfLines={1}>{n}</T>
          <T v="label" size={9.5} color={c.ink3} numberOfLines={1}>{l}</T>
        </View>
      ))}
    </View>
  );
}

function Label({ children, count }: { children: string; count?: string }) {
  const { c } = useTheme();
  return <T v="label" color={c.ink3} style={{ marginTop: 4 }}>{children}{count ? <T v="label" color={c.faint}>{count}</T> : null}</T>;
}

function BarRow({ name, pct, value, tone, hint }: { name: string; pct: number; value: string; tone: Ink; hint?: { text: string; tone: Ink } }) {
  const { c } = useTheme();
  const ink = useInk();
  return (
    <View style={styles.barRow}>
      <T v="meta" color={c.ink2} numberOfLines={1} style={{ width: 76 }}>{name}</T>
      <View style={[styles.track, { backgroundColor: c.paper3 }]}>
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: tone ? ink(tone) : c.pastel.lilac.ink }]} />
      </View>
      <T v="mono" size={12} color={ink(tone)} align="right" style={{ width: 44 }}>{value}</T>
      {hint ? <T v="mono" size={11} color={ink(hint.tone)} align="right" style={{ width: 36 }}>{hint.text}</T> : null}
    </View>
  );
}

function Note({ children, tone = "" }: { children: React.ReactNode; tone?: Ink }) {
  const { c } = useTheme();
  const p = tone === "rose" ? c.pastel.rose : tone === "gold" ? c.pastel.butter : tone === "ok" ? c.pastel.mint : null;
  return (
    <View style={[styles.note, { backgroundColor: p?.soft ?? c.card2, borderColor: p?.border ?? c.line }]}>
      <T v="meta" lh={1.5} color={c.ink2}>{children}</T>
    </View>
  );
}

const B = ({ children }: { children: React.ReactNode }) => {
  const { c } = useTheme();
  return <T v="meta" color={c.ink} style={{ fontWeight: "700" }}>{children}</T>;
};

/* ── the sheet ────────────────────────────────────────────────────────────────── */

const META: Record<"attendance" | "dues" | "gpa" | "service" | "deadlines" | "metric", { icon: IconName; tone: Tone }> = {
  attendance: { icon: "people", tone: "sky" },
  dues: { icon: "jar", tone: "butter" },
  gpa: { icon: "star", tone: "lilac" },
  service: { icon: "heart", tone: "mint" },
  deadlines: { icon: "clock", tone: "peach" },
  metric: { icon: "bars", tone: "sky" },
};

export function KpiSheet({ id, k, onClose }: { id: KpiKey | null; k: KpiCtx; onClose: () => void }) {
  const metric = id?.startsWith("metric:") ? k.metrics.find(m => `metric:${m.definitionId}` === id) ?? null : null;
  const kind = id ? (id.startsWith("metric:") ? "metric" : id) as keyof typeof META : "attendance";
  const title = !id ? "" : metric ? metric.name
    : id === "attendance" ? "Avg Attendance" : id === "dues" ? k.words.dues : id === "gpa" ? `${k.words.meetings} GPA`
    : id === "service" ? "Service Hours" : "Deadlines";
  const go = (href: string) => { onClose(); router.push(href as Href); };

  const footer = !id ? undefined
    : id === "attendance" ? <Button label="Log Attendance" tone="sky" block onPress={() => go("/more/meetings")} style={{ flex: 1 }} />
    : id === "deadlines" ? <Button label="+ Add Deadline" variant="ghost" block onPress={() => go("/more/tasks")} style={{ flex: 1 }} />
    : id === "service" ? <Button label="Log service hours" variant="ghost" block onPress={() => go("/more/service")} style={{ flex: 1 }} />
    : id === "dues" && k.canTreasury && k.financeEnabled ? <Button label={`Open ${k.words.treasury}`} variant="ghost" block onPress={() => go("/more/treasury")} style={{ flex: 1 }} />
    : undefined;

  return (
    <Sheet open={id != null && (!id.startsWith("metric:") || !!metric)} onClose={onClose} title={title} icon={META[kind].icon} tone={META[kind].tone} size="tall" footer={footer}>
      <View style={{ gap: 12 }}>
        {id === "attendance" ? <Attendance k={k} />
          : id === "dues" ? <Dues k={k} />
          : id === "gpa" ? <Gpa k={k} />
          : id === "service" ? <Service k={k} />
          : id === "deadlines" ? <Deadlines k={k} />
          : metric ? <Metric snap={metric} /> : null}
      </View>
    </Sheet>
  );
}

function Attendance({ k }: { k: KpiCtx }) {
  const T_ = k.thresholds;
  const attendees = k.brothers.filter(b => !isAttendanceExempt(b.attendance));
  const sorted = [...attendees].sort((a, b) => a.attendance - b.attendance);
  const belowWatch = attendees.filter(b => b.attendance < T_.attendanceWatch);
  const atRisk = attendees.filter(b => b.attendance < T_.attendanceAtRisk);
  return (
    <>
      <Stats items={[[`${avg(attendees.map(b => b.attendance)).toFixed(1)}%`, `${k.words.meetings} avg`, "info"], [String(belowWatch.length), "Below 80%", "gold"], [String(atRisk.length), "At risk", "rose"]]} />
      <Label>{`All ${k.words.members} — Lowest First`}</Label>
      <View>
        {sorted.map(b => {
          const tone: Ink = b.attendance >= T_.attendanceWatch ? "" : b.attendance >= T_.attendanceAtRisk ? "gold" : "rose";
          return <BarRow key={b.id} name={first(b.name)} pct={b.attendance} value={`${b.attendance}%`} tone={tone} />;
        })}
      </View>
      <Note>
        {atRisk.length > 0
          ? <><B>{`${atRisk.length} brother${atRisk.length > 1 ? "s" : ""} need${atRisk.length === 1 ? "s" : ""} immediate follow-up.`}</B>{" Attendance goal is 80%+."}</>
          : "No brothers are at attendance risk. Chapter goal is 80%+."}
      </Note>
    </>
  );
}

function Dues({ k }: { k: KpiCtx }) {
  const { c } = useTheme();
  const late = new Map(k.duesStandings.map(x => [x.brotherId, x.lateDays] as const));
  const lateOf = (id: number) => late.get(id) ?? 0;
  if (!k.hasDuesData) {
    return <Note>{`No ${k.words.dues.toLowerCase()} set yet — assign an amount on the ${k.words.treasury.toLowerCase()} page and balances appear here.`}</Note>;
  }
  const oweList = k.brothers.filter(b => b.duesOwed > 0).sort((a, b) => lateOf(b.id) - lateOf(a.id) || b.duesOwed - a.duesOwed);
  const overdue = oweList.filter(b => lateOf(b.id) > 0).length;
  const paidList = k.brothers.filter(b => b.duesOwed === 0);
  const outstanding = k.brothers.reduce((a, b) => a + b.duesOwed, 0);
  return (
    <>
      <Stats items={[[fmtUsd(outstanding), "Total owed", "gold"], [String(oweList.length), `${k.words.members} owe`, "rose"], [String(paidList.length), "Paid up", "ok"]]} />
      {oweList.length ? (
        <>
          <Label count={overdue > 0 ? ` · ${overdue} overdue` : undefined}>Outstanding Balances</Label>
          <View style={{ gap: 6 }}>
            {oweList.map(b => (
              <View key={b.id} style={[styles.item, { borderColor: c.pastel.butter.border, backgroundColor: c.pastel.butter.soft }]}>
                <View style={{ flex: 1 }}>
                  <T v="callout" numberOfLines={1}>{b.name}</T>
                  <T v="meta" color={c.ink3} numberOfLines={1}>{b.role.split(" · ")[0]}</T>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <T v="mono" size={13}>{fmtUsd(b.duesOwed)}</T>
                  {lateOf(b.id) > 0 ? <T v="mono" size={10.5} color={c.pastel.rose.ink}>{`${lateOf(b.id)}d late`}</T> : null}
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {paidList.length ? (
        <>
          <Label count={` (${paidList.length})`}>Paid Up</Label>
          <View>
            {paidList.map(b => (
              <View key={b.id} style={[styles.line, { borderBottomColor: c.lineSoft }]}>
                <T v="meta" color={c.ink2} numberOfLines={1} style={{ flex: 1 }}>{b.name}</T>
                <T v="mono" size={11.5} color={c.pastel.mint.ink}>✓ Clear</T>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {outstanding === 0 ? <Note tone="ok">{`All ${k.words.members.toLowerCase()} are paid up.`}</Note> : null}
    </>
  );
}

function Gpa({ k }: { k: KpiCtx }) {
  const T_ = k.thresholds;
  const sorted = [...k.brothers].sort((a, b) => a.gpa - b.gpa);
  const belowWatch = k.brothers.filter(b => b.gpa < T_.gpaWatch);
  const atRisk = k.brothers.filter(b => b.gpa < T_.gpaAtRisk);
  return (
    <>
      <Stats items={[[avg(k.brothers.map(b => b.gpa)).toFixed(2), `${k.words.meetings} avg`, "vio"], [String(belowWatch.length), "Below 3.0", "gold"], [String(atRisk.length), "At risk", "rose"]]} />
      <Label>{`All ${k.words.members} — Lowest First`}</Label>
      <View>
        {sorted.map(b => {
          const tone: Ink = b.gpa < T_.gpaAtRisk ? "rose" : b.gpa < T_.gpaWatch ? "gold" : "";
          return <BarRow key={b.id} name={first(b.name)} pct={Math.round(Math.max(5, ((b.gpa - 2.0) / 2.0) * 100))} value={b.gpa.toFixed(1)} tone={tone} />;
        })}
      </View>
      {atRisk.length > 0 ? (
        <Note tone="rose"><B>{`${atRisk.length} brother${atRisk.length > 1 ? "s" : ""} below 2.7 GPA`}</B>{" — consider academic check-in or intervention."}</Note>
      ) : belowWatch.length > 0 ? (
        <Note tone="gold"><B>{`${belowWatch.length} brother${belowWatch.length > 1 ? "s" : ""} below 3.0`}</B>{" — monitor and encourage academic support."}</Note>
      ) : <Note tone="ok">{`All ${k.words.members.toLowerCase()} meeting academic standards.`}</Note>}
    </>
  );
}

function Service({ k }: { k: KpiCtx }) {
  const goal = k.thresholds.serviceHoursGoal;
  const sorted = [...k.brothers].sort((a, b) => a.serviceHours - b.serviceHours);
  const below = k.brothers.filter(b => b.serviceHours < goal);
  const total = k.brothers.reduce((a, b) => a + b.serviceHours, 0);
  return (
    <>
      <Stats items={[[`${total}h`, "Total hours", "ok"], [String(k.brothers.length - below.length), "On track", ""], [String(below.length), "Below goal", "gold"]]} />
      <Label>{`All ${k.words.members} — Fewest Hours First`}</Label>
      <View>
        {sorted.map(b => {
          const on = b.serviceHours >= goal;
          return (
            <BarRow key={b.id} name={first(b.name)} pct={Math.round((b.serviceHours / goal) * 100)} value={`${b.serviceHours}h`} tone={on ? "ok" : "gold"}
              hint={{ text: on ? "✓" : `-${Math.max(0, goal - b.serviceHours)}h`, tone: on ? "ok" : "" }} />
          );
        })}
      </View>
      {below.length > 0 ? (
        <Note tone="gold"><B>{`${below.length} brother${below.length > 1 ? "s" : ""} still need${below.length === 1 ? "s" : ""} service hours`}</B>{` before the semester ends. Goal: ${goal}h each.`}</Note>
      ) : <Note tone="ok">{`All ${k.words.members.toLowerCase()} have met the service hours goal!`}</Note>}
    </>
  );
}

function Deadlines({ k }: { k: KpiCtx }) {
  const { c } = useTheme();
  const open = k.tasks.filter(t => t.status !== "done");
  const done = k.tasks.filter(t => t.status === "done");
  const buckets: { key: string; label: string; tone: Ink; items: Task[] }[] = [
    { key: "overdue", label: "Overdue", tone: "rose", items: open.filter(t => taskUrgency(t.dueDate) === "overdue") },
    { key: "upcoming", label: "Upcoming", tone: "", items: open.filter(t => taskUrgency(t.dueDate) === "upcoming") },
    { key: "none", label: "No date", tone: "", items: open.filter(t => taskUrgency(t.dueDate) === "none") },
    { key: "done", label: "Done", tone: "ok", items: done },
  ];
  return (
    <>
      <View style={styles.stats}>
        {([["Overdue", buckets[0]!.items.length, "rose"], ["Upcoming", buckets[1]!.items.length, ""], ["Open", open.length, ""], ["Done", done.length, "ok"]] as const).map(([l, n, tone]) => (
          <StatCell key={l} n={String(n)} l={l} tone={tone} />
        ))}
      </View>
      {k.tasks.length === 0 ? <Note>No tasks yet — open the Tasks page to create one</Note> : buckets.map(bk => bk.items.length ? (
        <View key={bk.key} style={{ gap: 6 }}>
          <Label count={` (${bk.items.length})`}>{bk.label}</Label>
          {bk.items.map(t => (
            <View key={t.id} style={[styles.item, { borderColor: bk.tone === "rose" ? c.pastel.rose.border : c.line, backgroundColor: bk.tone === "rose" ? c.pastel.rose.soft : c.card }]}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push("/more/tasks" as Href)} accessibilityRole="button" accessibilityLabel={`${t.title}, open`}>
                <T v="callout" numberOfLines={2} color={t.status === "done" ? c.ink3 : c.ink} style={t.status === "done" ? { textDecorationLine: "line-through" } : undefined}>{t.title}</T>
                <T v="meta" color={c.ink3} numberOfLines={1}>{`${t.dueDate ? fmtDate(t.dueDate) : "No date"} · ${taskAssigneeLabel(t, 1)}`}</T>
              </Pressable>
              {t.status !== "done" ? (
                <Pressable onPress={() => tickTask(t, true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mark complete"
                  style={({ pressed }) => [styles.tick, { borderColor: c.pastel.mint.ink }, pressed && { backgroundColor: c.pastel.mint.soft }]}>
                  <Icon name="check" size={14} color={c.pastel.mint.ink} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null)}
    </>
  );
}

function StatCell({ n, l, tone }: { n: string; l: string; tone: Ink }) {
  const { c } = useTheme();
  const ink = useInk();
  return (
    <View style={[styles.stat, { backgroundColor: c.card, borderColor: c.line }]}>
      <T v="monoLg" size={18} color={ink(tone)}>{n}</T>
      <T v="label" size={9.5} color={c.ink3} numberOfLines={1}>{l}</T>
    </View>
  );
}

function Metric({ snap }: { snap: DashboardMetric }) {
  const { c } = useTheme();
  const unit = snap.unit ?? "";
  const rows: [string, string, string?][] = [
    ["Aggregation", snap.aggregation.replace("_", " ").replace(/^\w/, x => x.toUpperCase())],
    [snap.aggregation === "avg" ? "Chapter avg" : snap.aggregation === "sum" ? "Chapter total" : "On track", `${Number.isInteger(snap.headline) ? snap.headline : snap.headline.toFixed(1)}${unit}`, c.pastel.lilac.ink],
    ["Members recorded", String(snap.totalCount)],
  ];
  return (
    <>
      <Stats items={[[String(snap.onTrackCount), "On Track", "ok"], [String(snap.totalCount - snap.onTrackCount), "Not on Track", "gold"], [`${snap.goal}${unit}`, "Goal", ""]]} />
      <Label>Summary</Label>
      <View style={[styles.panel, { borderColor: c.line, backgroundColor: c.card }]}>
        {rows.map(([kk, v, col]) => (
          <View key={kk} style={styles.kv}>
            <T v="meta" color={c.ink3}>{kk}</T>
            <T v="mono" size={12.5} color={col ?? c.ink}>{v}</T>
          </View>
        ))}
      </View>
      <T v="meta" color={c.ink3}>Open a member's profile drawer and switch to the Metrics tab to view or update individual values.</T>
    </>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, gap: 4, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1.5 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  note: { padding: 12, borderRadius: 12, borderWidth: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5 },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1 },
  tick: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  panel: { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 6 },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
});
