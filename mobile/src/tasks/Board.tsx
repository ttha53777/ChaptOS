/**
 * The board: Overdue then Upcoming, as on the web (PaperTasks), with Everything / Mine.
 * Rows carry no swipe actions: an assignee can only tick, never reschedule or delete.
 *
 *   tick       check fills → title strikes → the row collapses out of its pile (the
 *              siblings glide up through a Reanimated layout transition). The cache
 *              flips at once (~/tasks/tick); the row lingers 760ms as a done row so the
 *              tick and strike can be seen before it leaves.
 *   refused    the row comes back (or never left), the check empties and the strike
 *              retracts: the same motion backwards, then the toast says why.
 *   Done fold  this term's done tasks, folded. Ticking one off there reopens it.
 *
 * A row I can't tick (it's on someone else) shows a dashed box and says so to VoiceOver.
 * Reduced motion: the tick and strike cross-fade; the collapse is a fade with no glide.
 */
import type { Task } from "@/lib/api-types";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { Icon } from "~/icons/Icon";
import { EASE } from "~/motion/motion";
import { EmptyState } from "~/shell/states";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { Segmented } from "~/ui/Segmented";
import { T } from "~/ui/T";
import { CheckBox, CrowdStrip, StrikeTitle } from "./bits";
import { BAND_TONE } from "./Deck";
import { bandOf, byDue, canTick, isMine, pileOf, rowWhen, whoLine, type Viewer } from "./model";
import { onTickRefused, tickTask } from "./tick";

const LINGER = 760;

type Filter = "all" | "mine";

export function Board({ tasks, viewer, today, onOpen }: { tasks: Task[]; viewer: Viewer; today: string; onOpen: (t: Task) => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const [filter, setFilter] = useState<Filter>("all");
  const [foldOpen, setFoldOpen] = useState(false);
  // Rows just ticked, kept in their pile (as done) until the strike has played.
  const [linger, setLinger] = useState<Map<number, Task>>(new Map());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // A refusal: stop lingering, the cache already holds the open row again.
  useEffect(() => onTickRefused(id => {
    clearTimeout(timers.current.get(id));
    setLinger(l => { if (!l.has(id)) return l; const n = new Map(l); n.delete(id); return n; });
  }), []);

  const tick = (t: Task) => {
    const done = t.status !== "done";
    if (done) {
      setLinger(l => new Map(l).set(t.id, { ...t, status: "done" }));
      clearTimeout(timers.current.get(t.id));
      timers.current.set(t.id, setTimeout(() => {
        setLinger(l => { const n = new Map(l); n.delete(t.id); return n; });
      }, m.t(LINGER)));
    }
    tickTask(t, done);
  };

  const vis = filter === "mine" ? tasks.filter(t => isMine(t, viewer)) : tasks;
  const open = vis.filter(t => t.status !== "done" || linger.has(t.id)).map(t => linger.get(t.id) ?? t);
  const over = open.filter(t => pileOf(t, today) === "over").sort(byDue);
  const up = open.filter(t => pileOf(t, today) === "up").sort(byDue);
  const done = vis.filter(t => t.status === "done" && !linger.has(t.id))
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
  const mineCount = tasks.filter(t => t.status !== "done" && isMine(t, viewer)).length;
  const allCount = tasks.filter(t => t.status !== "done").length;

  const layout = m.reduced ? undefined : LinearTransition.duration(m.t(320)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
  const exit = m.reduced ? FadeOut.duration(m.t(180)).reduceMotion(ReduceMotion.Never)
    : FadeOut.duration(m.t(240)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
  const enter = FadeIn.duration(m.t(220)).reduceMotion(ReduceMotion.Never);

  const row = (t: Task, i: number) => (
    <Animated.View key={t.id} entering={enter} exiting={exit} layout={layout}>
      <Row task={t} viewer={viewer} today={today} first={i === 0} onTick={() => tick(t)} onOpen={() => onOpen(t)} />
    </Animated.View>
  );

  return (
    <View style={{ gap: 12 }}>
      <Segmented<Filter> label="Show" value={filter} onChange={setFilter}
        options={[{ value: "all", label: `Everything ${allCount}` }, { value: "mine", label: `Mine ${mineCount}` }]} />

      <Pile title="Overdue" sub="Past its date. Start here." tone="rose" count={over.length} layout={layout}>
        {over.length ? over.map(row) : (
          <View style={styles.calm}><T v="meta" color={c.ink2}><T v="meta" style={{ fontWeight: "600" }} color={c.ink}>Nothing overdue.</T> Every open task is still ahead of its date.</T></View>
        )}
      </Pile>

      <Pile title="Upcoming" sub="Soonest first. No-date tasks wait at the bottom." tone="sky" count={up.length} layout={layout}>
        {up.length ? up.map(row) : (
          <View style={styles.calm}><T v="meta" color={c.ink2}>{filter === "mine" ? "Nothing open is on you or your role." : "Nothing coming up."}</T></View>
        )}
      </Pile>

      {!over.length && !up.length ? (
        <EmptyState compact title={filter === "mine" ? "You're all caught up." : "No open tasks."}
          line={done.length ? "Done ones are folded below." : undefined} />
      ) : null}

      {done.length ? (
        <Animated.View layout={layout} style={{ gap: 10 }}>
          <Pressable onPress={() => setFoldOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: foldOpen }}
            style={[styles.fold, { borderColor: c.line2 }]}>
            <Icon name="check" size={15} color={c.pastel.mint.ink} />
            <T v="callout" color={c.ink2}>Done this term</T>
            <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{done.length}</T>
            <View style={{ marginLeft: "auto", transform: [{ rotate: foldOpen ? "90deg" : "0deg" }] }}>
              <Icon name="chev-r" size={14} color={c.ink3} />
            </View>
          </Pressable>
          {foldOpen ? (
            <Animated.View entering={enter} exiting={exit} style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
              {done.map(row)}
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

function Pile({ title, sub, tone, count, layout, children }: {
  title: string; sub: string; tone: Tone; count: number; layout: LinearTransition | undefined; children: ReactNode;
}) {
  const { c } = useTheme();
  const ink = c.pastel[tone].ink;
  return (
    <Animated.View layout={layout} style={{ gap: 8 }}>
      <View style={styles.pileHead}>
        <View style={[styles.dot, { backgroundColor: ink }]} />
        <T v="label" color={ink} accessibilityRole="header">{title}</T>
        <T v="meta" color={c.ink3} style={{ flexShrink: 1, fontSize: 12 }} numberOfLines={1}>{sub}</T>
        <T v="mono" color={c.ink3} style={{ marginLeft: "auto", fontSize: 11 }}>{count}</T>
      </View>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        <View style={[styles.rail, { backgroundColor: ink }]} />
        {children}
      </View>
    </Animated.View>
  );
}

function Row({ task, viewer, today, first, onTick, onOpen }: {
  task: Task; viewer: Viewer; today: string; first: boolean; onTick: () => void; onOpen: () => void;
}) {
  const { c } = useTheme();
  const done = task.status === "done";
  const band = bandOf(task, today);
  const tickable = canTick(task, viewer);
  const when = done ? "Done" : rowWhen(task.dueDate, today);
  const each = task.everyone === "each";
  const late = band === "overdue";

  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${task.title}. ${when}. ${whoLine(task, viewer)}`}
      accessibilityHint="Opens the task" style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.paper2 }]}>
      {!first ? <View style={[styles.rule, { backgroundColor: c.line }]} /> : null}
      <CheckBox done={done} tone={BAND_TONE[band === "done" ? "upcoming" : band]} disabled={!tickable} onPress={onTick}
        label={!tickable ? `${task.title}: only the people on it can tick it` : done ? `Reopen ${task.title}` : each ? `Done my part of ${task.title}` : `Mark ${task.title} done`} />
      <View style={{ flex: 1, gap: 3 }}>
        <StrikeTitle struck={done} v="callout">{task.title}</StrikeTitle>
        <View style={styles.sub}>
          <Who task={task} viewer={viewer} />
          {each && task.memberCount != null ? (
            <View style={styles.subCrowd}>
              <View style={{ width: Math.min(task.memberCount, 12) * 8 }}><CrowdStrip done={Math.min(task.doneCount ?? 0, 12)} total={Math.min(task.memberCount, 12)} size={6} label={`${task.doneCount ?? 0} of ${task.memberCount} done`} /></View>
              <T v="mono" color={c.ink3} style={{ fontSize: 10.5 }}>{task.doneCount ?? 0}/{task.memberCount}</T>
            </View>
          ) : task.notes ? <T v="meta" color={c.ink3} numberOfLines={1} style={{ flexShrink: 1, fontSize: 12 }}>· {task.notes}</T> : null}
        </View>
      </View>
      <T v="mono" color={late && !done ? c.pastel.rose.ink : c.ink3} style={{ fontSize: 11.5 }}>{when}</T>
    </Pressable>
  );
}

function Who({ task, viewer }: { task: Task; viewer: Viewer }) {
  const { c } = useTheme();
  if (task.everyone) {
    return (
      <View style={styles.who}>
        <Icon name="people" size={13} color={c.pastel.sky.ink} />
        <T v="pill" color={c.ink2}>{task.everyone === "each" ? "Everyone" : "Anyone"}</T>
      </View>
    );
  }
  const a = task.assignments[0];
  if (!a) return null;
  const mine = a.brotherId === viewer.id || (a.roleId != null && viewer.roleIds.has(a.roleId));
  const name = a.role ? a.role.name : a.brotherId === viewer.id ? "You" : a.brother?.name.split(" ")[0] ?? "Someone";
  const more = task.assignments.length - 1;
  return (
    <View style={styles.who}>
      {a.role ? <View style={[styles.diamond, { backgroundColor: c.pastel.lilac.ink }]} /> : null}
      <T v="pill" color={mine ? c.pastel.lilac.ink : c.ink2}>{name}{more > 0 ? ` +${more}` : ""}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  pileHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  card: { borderWidth: 1.5, borderRadius: 18, overflow: "hidden" },
  rail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, opacity: 0.6, zIndex: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingLeft: 16, paddingRight: 14 },
  sub: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  subCrowd: { flexDirection: "row", alignItems: "center", gap: 6 },
  who: { flexDirection: "row", alignItems: "center", gap: 5 },
  diamond: { width: 7, height: 7, borderRadius: 2, transform: [{ rotate: "45deg" }], marginHorizontal: 1 },
  rule: { position: "absolute", left: 16, right: 0, top: 0, height: 1 },
  calm: { paddingVertical: 14, paddingLeft: 18, paddingRight: 14 },
  fold: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 14, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14 },
});
