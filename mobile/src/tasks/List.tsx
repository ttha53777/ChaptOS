/**
 * The Tasks page body, as the web phone draws it (app/org/[slug]/tasks/PaperTasks.tsx +
 * tasks-paper.css at max-width 600px), from the shared rules in @/lib/tasks/list:
 *
 *   TasksHead     TASKS + term chip, "2 overdue, 9 coming up" (the count on a highlighter),
 *                 the line under it, New poll / New task (MANAGE_POLLS / MANAGE_TASKS)
 *   Whose         Everyone's / Just mine, full width
 *   Pile          Overdue (peach) or Upcoming (sky): a coloured head, then rows
 *   TaskRow       tick circle · title + who chips + "· when" · tear-off date stub. A swipe
 *                 left past 96pt finishes it, as on the web phone; either way the row gets
 *                 the DONE stamp and flies off (~/moments/TaskDone), then the write goes
 *                 out (~/tasks/tick: optimistic, Undo in the toast)
 *   DoneSection   "N done this term", folding open to the latest six, Show N more
 *   Votes         section head, the vote cards (tap a choice to cast or change it)
 *   TasksDayOne   two little piles, "Two piles. That's the whole page.", one button
 *
 * Rows are memoized with stable callbacks; no per-row layout animation (a long list).
 */
import type { Poll, Task } from "@/lib/api-types";
import {
  DONE_SHOWN, avTone, briefOf, canComplete, closesTxt, first, progPct, rowWhenAt, stubOf, voteCardOf, type Me,
} from "@/lib/tasks/list";
import { memo, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, type IconName } from "~/icons/Icon";
import { DeckFlight, type DeckPhase } from "~/moments/TaskDone";
import { haptics } from "~/motion/haptics";
import { Avatar } from "~/paper/bits";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";

/* ── head ─────────────────────────────────────────────────────────────────────── */

/** A run of display text on the web's `.tks-hi` highlighter. */
export function Hi({ children, tone = "mint", size }: { children: string; tone?: Tone; size: number }) {
  const { c } = useTheme();
  return (
    <View>
      <View style={[styles.hi, { backgroundColor: c.pastel[tone].fill, opacity: c.markOp, height: size * 0.48, bottom: size * 0.12 }]} />
      <T v="hero" size={size} ls={-0.032} lh={1.06}>{children}</T>
    </View>
  );
}

export function Kick({ term }: { term: string | null }) {
  const { c } = useTheme();
  return (
    <View style={styles.kick}>
      <T v="kicker" size={11.5} color={c.ink3}>Tasks</T>
      {term ? <View style={[styles.kickChip, { backgroundColor: c.card, borderColor: c.line2 }]}><T v="buttonSm" size={11.5} color={c.ink2}>{term}</T></View> : null}
    </View>
  );
}

export function TBtn({ label, icon, soft, tone = "butter", onPress, small, disabled }: {
  label: string; icon?: IconName; soft?: boolean; tone?: Tone; onPress: () => void; small?: boolean; disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.btn, small && styles.btnSm,
        soft ? { borderColor: c.line2, backgroundColor: "transparent" } : [{ borderColor: c.ink, backgroundColor: c.ink }, !pressed && hard(c.pastel[tone].fill, 2.5)],
        pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }, disabled && { opacity: 0.5 },
      ]}>
      {icon ? <Icon name={icon} size={small ? 13 : 15} color={soft ? c.ink2 : c.paper} /> : null}
      <T v="button" size={small ? 12.8 : 14} color={soft ? c.ink2 : c.paper} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

export function TasksHead({ term, over, up, mineOnly, canManage, canManagePolls, onNewTask, onNewPoll }: {
  term: string | null; over: number; up: number; mineOnly: boolean; canManage: boolean; canManagePolls: boolean;
  onNewTask: () => void; onNewPoll: () => void;
}) {
  const { c } = useTheme();
  const { forYou, sub } = briefOf(over, up, mineOnly);
  const H = (s: string) => <T v="hero" size={29.6} ls={-0.032} lh={1.06}>{s}</T>;
  return (
    <View style={{ gap: 16 }}>
      <View>
        <Kick term={term} />
        <View style={styles.greet} accessibilityRole="header"
          accessibilityLabel={over ? `${over} overdue${forYou}, ${up} coming up` : `Nothing overdue${forYou}. ${up} coming up`}>
          {over
            ? <><Hi tone="peach" size={29.6}>{`${over} overdue`}</Hi>{H(`${forYou}, ${up} coming up`)}</>
            : <>{H(`Nothing overdue${forYou}. `)}<Hi size={29.6}>{`${up} coming up`}</Hi></>}
        </View>
        <T v="body" size={14.7} lh={1.55} color={c.ink2} style={{ marginTop: 10 }}>{sub}</T>
      </View>
      {canManage || canManagePolls ? (
        <View style={styles.headBtns}>
          {canManagePolls ? <View style={{ flex: 1 }}><TBtn soft icon="bars" label="New poll" onPress={onNewPoll} /></View> : null}
          {canManage ? <View style={{ flex: 1 }}><TBtn icon="plus" label="New task" onPress={onNewTask} /></View> : null}
        </View>
      ) : null}
    </View>
  );
}

export function Whose({ mineOnly, onChange }: { mineOnly: boolean; onChange: (mine: boolean) => void }) {
  const { c } = useTheme();
  const opt = (label: string, on: boolean, v: boolean) => (
    <Pressable key={label} onPress={() => { if (!on) { haptics.tap(); onChange(v); } }} accessibilityRole="radio" accessibilityState={{ checked: on }}
      style={[styles.segOpt, on && { backgroundColor: c.ink }]}>
      <T v="buttonSm" size={13.4} color={on ? c.paper : c.ink2}>{label}</T>
    </Pressable>
  );
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Whose tasks" style={[styles.seg, { borderColor: c.line2, backgroundColor: c.card }]}>
      {opt("Everyone’s", !mineOnly, false)}
      {opt("Just mine", mineOnly, true)}
    </View>
  );
}

/* ── piles ────────────────────────────────────────────────────────────────────── */

export interface RowEnv {
  today: Date;
  me: Me;
  canManage: boolean;
  onOpen: (t: Task) => void;
  onTick: (t: Task) => void;
}

export function Pile({ kind, tasks, env, empty }: { kind: "over" | "up"; tasks: Task[]; env: RowEnv; empty: string }) {
  const { c } = useTheme();
  const tone: Tone = kind === "over" ? "peach" : "sky";
  const p = c.pastel[tone];
  return (
    <View style={[styles.pile, { backgroundColor: c.card, borderColor: c.ink }, hard(p.fill, 3)]}>
      <View style={[styles.pileH, { backgroundColor: p.soft, borderBottomColor: c.ink }]}>
        <View style={[styles.pileTile, { backgroundColor: c.note.fill[tone], borderColor: c.note.ink }]}>
          <Icon name={kind === "over" ? "alert" : "cal"} size={16} color={c.note.ink} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="title" size={17.9} ls={-0.024} lh={1.1} color={kind === "over" ? p.ink : c.ink} accessibilityRole="header">{kind === "over" ? "Overdue" : "Upcoming"}</T>
          <T v="meta" size={12.2} color={p.ink} style={{ opacity: kind === "over" ? 0.8 : 0.75 }}>
            {kind === "over" ? "Past its date. Start here." : "Soonest first. No-date tasks wait at the bottom."}
          </T>
        </View>
        <View style={[styles.pileN, { borderColor: c.ink, backgroundColor: c.card }, hard(p.fill, 2)]}>
          <T v="title" size={21.6} ls={-0.04} lh={1} color={kind === "over" ? p.ink : c.ink}>{String(tasks.length)}</T>
        </View>
      </View>
      {tasks.length
        ? tasks.map((t, i) => <TaskRow key={t.id} task={t} kind={kind} first={i === 0} last={i === tasks.length - 1} env={env} />)
        : <View style={[styles.emptyRow, styles.lastRow]}><T v="callout" size={14.4} color={c.ink3}>{empty}</T></View>}
    </View>
  );
}

export function ClearLine() {
  const { c } = useTheme();
  return (
    <View style={[styles.clear, { borderColor: c.pastel.mint.ink, backgroundColor: c.pastel.mint.soft }]}>
      <View style={[styles.clearTile, { backgroundColor: c.note.fill.mint, borderColor: c.note.ink }]}><Icon name="check" size={14} color={c.note.ink} /></View>
      <T v="callout" size={13.8} color={c.ink2} style={{ flex: 1 }}>
        <T v="bodyStrong" size={13.8} color={c.ink}>Nothing overdue.</T> Every open task is still ahead of its date.
      </T>
    </View>
  );
}

/** The tear-off date stub (`.tks-stub`). */
export function Stub({ dueDate, today, tone }: { dueDate: string | null; today: Date; tone: Tone }) {
  const { c } = useTheme();
  const st = stubOf(dueDate, today);
  if (!st) {
    return (
      <View style={[styles.stub, { borderColor: c.line2, borderStyle: "dashed", backgroundColor: c.card }]}>
        <View style={[styles.stubTop, { borderBottomColor: c.line2, borderStyle: "dashed" }]}><T v="kicker" size={9} color={c.ink3}>ANY</T></View>
        <T v="title" size={16.8} ls={-0.04} lh={1.15} color={c.ink3} style={styles.stubB}>—</T>
      </View>
    );
  }
  const sc = st.today ? "butter" : tone;
  return (
    <View style={[styles.stub, { borderColor: c.ink, backgroundColor: c.card }, hard(c.pastel[sc].fill, 2)]}>
      <View style={[styles.stubTop, { borderBottomColor: c.ink, backgroundColor: c.note.fill[sc] }]}><T v="kicker" size={9} color={c.note.ink}>{st.mon}</T></View>
      <T v="title" size={16.8} ls={-0.04} lh={1.15} style={styles.stubB}>{st.day}</T>
    </View>
  );
}

/** Who a row is on: role tags, faces, or Everyone / Anyone with the each-task bar. */
export function WhoChips({ task, me }: { task: Pick<Task, "assignments" | "everyone" | "doneCount" | "memberCount">; me: Me }) {
  const { c } = useTheme();
  if (task.everyone) {
    const { doneCount: n0, memberCount: n } = task;
    return (
      <>
        <View style={[styles.who, styles.whoLead, { borderColor: c.ink, backgroundColor: c.paper }]}>
          <Icon name="people" size={12} color={c.ink} />
          <T v="pill" size={11.8} color={c.ink}>{task.everyone === "each" ? "Everyone" : "Anyone"}</T>
        </View>
        {task.everyone === "each" && n0 != null && n != null ? (
          <View style={styles.prog} accessibilityLabel={`${n0} of ${n} members have done their part`}>
            <View style={[styles.progBar, { backgroundColor: c.paper3 }]}>
              <View style={{ width: `${progPct(n0, n)}%`, height: "100%", backgroundColor: c.pastel.mint.ink, borderRadius: 3 }} />
            </View>
            <T v="mono" size={10.9} color={c.ink3}>{`${n0} of ${n}`}</T>
          </View>
        ) : null}
      </>
    );
  }
  return (
    <>
      {task.assignments.map(a => a.role ? (
        <View key={`r${a.id}`} style={[styles.who, styles.whoLead, { borderColor: me.myRoleIds.has(a.role.id) ? c.ink : c.line, backgroundColor: c.paper }]}>
          <View style={[styles.swatch, { backgroundColor: a.role.color ?? c.paper3, borderColor: c.ink }]} />
          <T v="pill" size={11.8} color={me.myRoleIds.has(a.role.id) ? c.ink : c.ink2}>{a.role.name}</T>
        </View>
      ) : a.brother ? (
        <View key={`b${a.id}`} style={[styles.who, { borderColor: a.brother.id === me.selfId ? c.ink : c.line, backgroundColor: c.paper }]}>
          <Avatar name={a.brother.name} uri={a.brother.avatarUrl} tone={avTone(a.brother.id)} px={20} />
          <T v="pill" size={11.8} color={a.brother.id === me.selfId ? c.ink : c.ink2}>{a.brother.id === me.selfId ? "You" : first(a.brother.name)}</T>
        </View>
      ) : null)}
    </>
  );
}

const SWIPE_ARM = 96;
const SWIPE_MAX = 170;

export const TaskRow = memo(function TaskRow({ task, kind, first: isFirst, last, env }: { task: Task; kind: "over" | "up"; first: boolean; last?: boolean; env: RowEnv }) {
  const { c } = useTheme();
  const m = useMotion();
  const can = canComplete(task, env.me, env.canManage);
  const [phase, setPhase] = useState<DeckPhase>("rest");
  const tone: Tone = kind === "over" ? "peach" : "sky";
  const when = rowWhenAt(task, env.today);

  const x = useSharedValue(0);
  const armedSV = useSharedValue(0);
  const [armed, setArmed] = useState(false);
  const backCfg = m.reduced ? m.timing(120, "out") : m.spring("settle");
  const armCfg = m.timing(160, "out");

  const tick = () => {
    if (!can || phase !== "rest") return;
    setPhase("done");
  };
  const onArm = (on: boolean) => { setArmed(on); if (on) haptics.select(); };

  const pan = usePanGesture({
    enabled: can && phase === "rest",
    activeOffsetX: [-12, 1000],
    failOffsetY: [-10, 10],
    onUpdate: e => {
      "worklet";
      x.value = Math.max(-SWIPE_MAX, Math.min(0, e.translationX));
      const on = x.value < -SWIPE_ARM ? 1 : 0;
      if (on !== armedSV.value) { armedSV.value = on; scheduleOnRN(onArm, on === 1); }
    },
    onDeactivate: () => {
      "worklet";
      const go = x.value < -SWIPE_ARM;
      x.value = withSpring(0, backCfg);
      armedSV.value = 0;
      scheduleOnRN(onArm, false);
      if (go) scheduleOnRN(tick);
    },
  });
  const face = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const strip = useAnimatedStyle(() => ({ opacity: x.value < -1 ? 1 : 0 }));
  const ckOn = useSharedValue(0);
  useEffect(() => { ckOn.value = withTiming(phase === "done" ? 1 : 0, armCfg); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const ckStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + ckOn.value * 0.08 }] }));

  return (
    <DeckFlight phase={phase} stamp={task.everyone === "each" ? "My part" : "Done"} stampSize="md"
      stampStyle={{ right: 64, top: 10 }} burstAt={{ x: 0.08, y: 0.5 }}
      onFlown={() => env.onTick(task)} style={phase === "done" ? { zIndex: 5 } : undefined}>
      <View style={[styles.rowWrap, !isFirst && { borderTopWidth: 1.5, borderTopColor: c.line }, last && styles.lastRow]}>
        {can ? (
          <Animated.View style={[styles.swipe, { backgroundColor: armed ? c.pastel.mint.ink : c.note.fill.mint }, strip]} pointerEvents="none">
            <Icon name="check" size={16} color={armed ? "#fff" : c.note.ink} />
            <T v="bodyStrong" size={13.8} color={armed ? "#fff" : c.note.ink}>Done</T>
          </Animated.View>
        ) : null}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.row, { backgroundColor: c.card }, face]}>
            <Animated.View style={ckStyle}>
              <Pressable onPress={tick} disabled={!can} hitSlop={6} accessibilityRole="button"
                accessibilityLabel={can ? `Mark “${task.title}” done` : "Only the people on it can tick this"}
                style={[styles.ck, can
                  ? { borderColor: c.ink, backgroundColor: phase === "done" ? c.note.fill.mint : c.card }
                  : { borderColor: c.line2, borderStyle: "dashed", backgroundColor: "transparent" }]}>
                {phase === "done" ? <Icon name="check" size={15} color={c.note.ink} /> : null}
              </Pressable>
            </Animated.View>
            <Pressable onPress={() => env.onOpen(task)} style={{ flex: 1, minWidth: 0 }} accessibilityRole="button" accessibilityLabel={`${task.title}, ${when}`}>
              <T v="bodyStrong" size={15.2} lh={1.3} ls={-0.012}
                style={phase === "done" ? { textDecorationLine: "line-through", color: c.ink3 } : undefined}>{task.title}</T>
              <View style={styles.meta}>
                <WhoChips task={task} me={env.me} />
                {task.notes ? <Icon name="doc" size={13} color={c.ink3} /> : null}
                <T v="mono" size={10.9} color={kind === "over" ? c.pastel.peach.ink : c.ink3} style={{ fontWeight: "600" }}>{`· ${when}`}</T>
              </View>
            </Pressable>
            <Stub dueDate={task.dueDate} today={env.today} tone={tone} />
          </Animated.View>
        </GestureDetector>
      </View>
    </DeckFlight>
  );
});

/* ── done ─────────────────────────────────────────────────────────────────────── */

export function DoneSection({ done, env, onReopen }: { done: Task[]; env: RowEnv; onReopen: (t: Task) => void }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  if (!done.length) return null;
  return (
    <View>
      <Pressable onPress={() => { haptics.tap(); setOpen(o => !o); }} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={[styles.doneBar, { borderColor: c.line2 }]}>
        <View style={[styles.doneTile, { backgroundColor: c.note.fill.mint, borderColor: c.note.ink }]}><Icon name="check" size={13} color={c.note.ink} /></View>
        <T v="bodyStrong" size={14.4} color={c.ink2} style={{ flex: 1 }}>{`${done.length} done this term`}</T>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}><Icon name="chev-d" size={16} color={c.ink3} /></View>
      </Pressable>
      {open ? (
        <View style={{ marginTop: 6 }}>
          {(all ? done : done.slice(0, DONE_SHOWN)).map((t, i) => {
            const can = canComplete(t, env.me, env.canManage);
            return (
              <View key={t.id} style={[styles.doneRow, i > 0 && { borderTopWidth: 1.5, borderTopColor: c.line, borderStyle: "dashed" }]}>
                <Pressable onPress={() => onReopen(t)} disabled={!can} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Reopen “${t.title}”`}
                  style={[styles.ckSm, { borderColor: c.ink, backgroundColor: c.note.fill.mint }]}>
                  <Icon name="check" size={13} color={c.note.ink} />
                </Pressable>
                <Pressable onPress={() => env.onOpen(t)} style={{ flex: 1, minWidth: 0 }} accessibilityRole="button">
                  <T v="callout" size={15.2} color={c.ink3} style={{ textDecorationLine: "line-through" }}>{t.title}</T>
                </Pressable>
              </View>
            );
          })}
          {done.length > DONE_SHOWN ? (
            <Pressable onPress={() => setAll(a => !a)} accessibilityRole="button" style={{ marginTop: 4, marginLeft: 6, paddingVertical: 4 }}>
              <T v="buttonSm" size={13.1} color={c.ink3} style={{ textDecorationLine: "underline" }}>{all ? "Show fewer" : `Show ${done.length - DONE_SHOWN} more`}</T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/* ── votes ────────────────────────────────────────────────────────────────────── */

export function VotesHead({ canManagePolls, openCount, onNewPoll }: { canManagePolls: boolean; openCount: number; onNewPoll: () => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.sec}>
      <T v="title" size={18.4} ls={-0.022} accessibilityRole="header">Votes</T>
      <View style={[styles.rule, { backgroundColor: c.line }]} />
      {canManagePolls ? (
        <Pressable onPress={onNewPoll} accessibilityRole="button" style={[styles.secBtn, { borderColor: c.ink, backgroundColor: c.card }]}>
          <Icon name="plus" size={13} color={c.ink} />
          <T v="buttonSm" size={12.8} color={c.ink}>New poll</T>
        </Pressable>
      ) : <T v="mono" size={11.5} color={c.ink3}>{`${openCount} open`}</T>}
    </View>
  );
}

export function NoVotes({ canManagePolls, onNewPoll }: { canManagePolls: boolean; onNewPoll: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.vote, styles.voteEmpty, { borderColor: c.line2 }]}>
      <T v="callout" size={14.4} color={c.ink3}>No votes open right now.</T>
      {canManagePolls ? <View style={{ alignSelf: "flex-start" }}><TBtn small soft icon="bars" label="Ask the chapter something" onPress={onNewPoll} /></View> : null}
    </View>
  );
}

export const VoteCard = memo(function VoteCard({ poll, today, canVote, onVote, onOpen }: {
  poll: Poll; today: Date; canVote: boolean; onVote: (p: Poll, optionId: number) => void; onOpen: (p: Poll) => void;
}) {
  const { c } = useTheme();
  const v = voteCardOf(poll, canVote);
  return (
    <View style={[styles.vote, v.closed ? { borderColor: c.line2, backgroundColor: c.card } : [{ borderColor: c.ink, backgroundColor: c.card }, hard(c.pastel.lilac.fill, 3)]]}>
      <Pressable onPress={() => onOpen(poll)} accessibilityRole="button" style={styles.voteH}>
        <T v="title" size={17.3} ls={-0.02} lh={1.25}>{poll.question}</T>
        <T v="meta" size={12.8} color={c.ink3}>{`${closesTxt(poll, today)} · ${poll.totalVotes} of ${poll.assigneeCount} voted`}</T>
      </Pressable>
      <View style={{ gap: 8, marginTop: 12 }}>
        {poll.options.map(o => (
          <VoteOption key={o.id} label={o.label} pct={v.pct(o.voteCount)} reveal={v.reveal} mine={o.id === v.mine} win={v.closed && o.id === v.lead}
            disabled={!v.live} onPress={() => { if (v.live && o.id !== v.mine) onVote(poll, o.id); }} />
        ))}
      </View>
      <T v="meta" size={12.8} color={c.ink3} style={{ marginTop: 10 }}>{v.foot}</T>
    </View>
  );
});

function VoteOption({ label, pct, reveal, mine, win, disabled, onPress }: {
  label: string; pct: number; reveal: boolean; mine: boolean; win: boolean; disabled: boolean; onPress: () => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const w = useSharedValue(reveal ? pct : 0);
  const ck = useSharedValue(mine ? 1 : 0);
  useEffect(() => { w.value = m.reduced ? (reveal ? pct : 0) : withTiming(reveal ? pct : 0, m.timing(700, "spring")); }, [reveal, pct]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ck.value = m.reduced ? (mine ? 1 : 0) : withTiming(mine ? 1 : 0, m.timing(260, "spring")); }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps
  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  const mark = useAnimatedStyle(() => ({ opacity: ck.value, transform: [{ scale: 0.6 + ck.value * 0.4 }] }));
  return (
    <Pressable onPress={() => { haptics.tap(); onPress(); }} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: mine, disabled }}
      accessibilityLabel={reveal ? `${label}, ${pct}%` : label}
      style={[styles.opt, { borderColor: mine || win ? c.ink : c.line2, backgroundColor: c.paper }]}>
      <Animated.View style={[styles.optFill, { backgroundColor: c.pastel.lilac.soft }, fill]} />
      <View style={[styles.bx, { borderColor: c.ink, backgroundColor: mine ? c.note.fill.lilac : "transparent" }]}>
        <Animated.View style={mark}><Icon name="check" size={11} color={c.note.ink} /></Animated.View>
      </View>
      <T v="callout" size={14.4} style={[{ flex: 1 }, win && { fontWeight: "700" }]} numberOfLines={2}>{label}</T>
      {reveal ? <T v="mono" size={11.8} color={c.ink3}>{`${pct}%`}</T> : null}
    </Pressable>
  );
}

/* ── day one ──────────────────────────────────────────────────────────────────── */

export function TasksDayOne({ term, canManage, canManagePolls, onNewTask, onNewPoll }: {
  term: string | null; canManage: boolean; canManagePolls: boolean; onNewTask: () => void; onNewPoll: () => void;
}) {
  const { c } = useTheme();
  const mini = (label: string, row: string, em: string, tone: Tone, rot: string, over: boolean) => (
    <View style={[styles.mini, { borderColor: c.ink, backgroundColor: c.card, transform: [{ rotate: rot }] }, hard(c.pastel[tone].fill, 3)]}>
      <T v="kicker" size={9.6} color={c.ink3}>{label}</T>
      <View style={styles.miniRow}>
        <View style={[styles.miniCk, { borderColor: c.ink }]} />
        <T v="bodyStrong" size={13.1} style={{ flex: 1 }}>{row}</T>
        <T v="mono" size={9.9} color={over ? c.pastel.peach.ink : c.ink3}>{em}</T>
      </View>
    </View>
  );
  return (
    <View style={{ gap: 26 }}>
      <View>
        <Kick term={term} />
        <View style={styles.greet} accessibilityRole="header" accessibilityLabel="Nothing to do yet">
          <T v="hero" size={29.6} ls={-0.032} lh={1.06}>{"Nothing to do "}</T>
          <Hi tone="butter" size={29.6}>yet</Hi>
        </View>
        <T v="body" size={14.7} lh={1.55} color={c.ink2} style={{ marginTop: 10 }}>
          {canManage ? "Hand out a task and it lands here, sorted by date." : "When an officer hands you a task, it shows up here."}
        </T>
      </View>
      <View style={[styles.d1, { backgroundColor: c.card, borderColor: c.line2 }]}>
        <View style={{ gap: 18, alignItems: "center" }}>
          {mini("Overdue", "Past its date", "2 days late", "peach", "-2deg", true)}
          {mini("Upcoming", "Still ahead", "Fri", "sky", "2deg", false)}
        </View>
        <T v="title" size={21.6} ls={-0.025} align="center" style={{ marginTop: 26 }}>Two piles. That’s the whole page.</T>
        <T v="body" size={14.7} color={c.ink3} align="center" style={{ marginTop: 6 }}>
          Anything past its date goes on top. Everything else waits below, soonest first. Tick it and it’s done.
        </T>
        {canManage || canManagePolls ? (
          <View style={{ alignSelf: "center", marginTop: 18 }}>
            {canManage
              ? <TBtn icon="plus" label="Hand out the first task" onPress={onNewTask} />
              : <TBtn icon="bars" label="Ask the chapter something" onPress={onNewPoll} />}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hi: { position: "absolute", left: -3, right: -1, borderRadius: 8, transform: [{ rotate: "-0.8deg" }] },
  kick: { flexDirection: "row", alignItems: "center", gap: 8 },
  kickChip: { paddingVertical: 2, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1.5 },
  greet: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 },
  headBtns: { flexDirection: "row", gap: 10 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 17, borderRadius: 999, borderWidth: 1.5 },
  btnSm: { paddingVertical: 6, paddingHorizontal: 12, gap: 6 },
  seg: { flexDirection: "row", gap: 4, padding: 3, borderRadius: 999, borderWidth: 1.5 },
  segOpt: { flex: 1, alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999 },
  pile: { borderWidth: 1.5, borderRadius: 20 },
  pileH: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 13, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1.5, borderTopLeftRadius: 18.5, borderTopRightRadius: 18.5 },
  pileTile: { width: 30, height: 30, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  pileN: { minWidth: 40, height: 40, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  emptyRow: { paddingVertical: 16, paddingHorizontal: 14 },
  clear: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed" },
  clearTile: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  rowWrap: { overflow: "hidden" },
  lastRow: { borderBottomLeftRadius: 18.5, borderBottomRightRadius: 18.5 },
  swipe: { position: "absolute", top: 0, bottom: 0, right: 0, width: SWIPE_MAX, flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  ck: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.8, alignItems: "center", justifyContent: "center" },
  ckSm: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.8, alignItems: "center", justifyContent: "center" },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 5 },
  who: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 1, paddingLeft: 2, paddingRight: 9, borderRadius: 999, borderWidth: 1.3 },
  whoLead: { paddingLeft: 8, minHeight: 23 },
  swatch: { width: 7, height: 7, borderRadius: 2, borderWidth: 1.2 },
  prog: { flexDirection: "row", alignItems: "center", gap: 6 },
  progBar: { width: 44, height: 5, borderRadius: 3, overflow: "hidden" },
  stub: { width: 40, borderRadius: 9, borderWidth: 1.5, overflow: "hidden", alignItems: "stretch" },
  stubTop: { alignItems: "center", paddingVertical: 1, borderBottomWidth: 1.5 },
  stubB: { textAlign: "center", paddingTop: 2, paddingBottom: 3 },
  doneBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5 },
  doneTile: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  doneRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 8 },
  sec: { flexDirection: "row", alignItems: "center", gap: 12 },
  rule: { flex: 1, height: 1.5 },
  secBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5 },
  vote: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1.5 },
  voteEmpty: { borderStyle: "dashed", gap: 10 },
  voteH: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 10, rowGap: 4 },
  opt: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1.5, overflow: "hidden" },
  optFill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  bx: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.6, alignItems: "center", justifyContent: "center" },
  d1: { paddingTop: 26, paddingHorizontal: 18, paddingBottom: 24, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 28 },
  mini: { width: 230, borderWidth: 1.5, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  miniRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 8 },
  miniCk: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
});
