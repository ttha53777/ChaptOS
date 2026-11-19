/**
 * Tasks (U5, in More as on the web's phone bar): On you (my open tasks as a deck), the ballots I'm asked into, and the
 * board (Overdue / Upcoming, as on the web). Reads GET /api/tasks and GET /api/polls; the
 * sheet adds GET /api/tasks/[id] and names from GET /api/brothers.
 *
 * A member's writes are tick (PATCH /api/tasks/[id] { status }, the same path Today's
 * plate uses, ~/tasks/tick) and vote (POST /api/polls/[id]/vote). Officers (MANAGE_TASKS)
 * also get New task (header) and Edit / Delete from the task sheet (~/tasks/TaskForm).
 *
 * States: first load = skeletons in the deck's and rows' shapes; nothing loaded and an
 * error = ErrorState; offline or a failed refresh over last-known data (the persisted
 * cache) = StaleNote; a chapter with no tasks and no polls = the day-one empty, with
 * "Hand out the first task" for officers and no button for members.
 */
import type { Poll } from "@/lib/api-types";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { localDay } from "~/data/home";
import { usePolls, useRoster, useTasks } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, FadeIn, SkeletonCard, StaleNote } from "~/shell/states";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { Ballot } from "~/tasks/Ballot";
import { Board } from "~/tasks/Board";
import { Deck } from "~/tasks/Deck";
import { byDue, canVote, isMine, pileOf, viewerOf, type Viewer } from "~/tasks/model";
import { DeleteTask, TaskForm } from "~/tasks/TaskForm";
import { TaskSheet } from "~/tasks/TaskSheet";
import type { Task } from "@/lib/api-types";
import { Icon } from "~/icons/Icon";

export default function Tasks() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const tasks = useTasks();
  const polls = usePolls();
  const roster = useRoster();
  const [openId, setOpenId] = useState<number | null>(null);
  // the form: null = closed, "new" = a new task, a Task = editing it
  const [form, setForm] = useState<Task | "new" | null>(null);
  const [doomed, setDoomed] = useState<Task | null>(null);
  const today = localDay();

  const viewer = useMemo(() => (entry ? viewerOf(entry.me) : null), [entry]);
  const people = useMemo(() => new Map((roster.data ?? []).map(b => [b.id, b] as const)), [roster.data]);

  if (!entry || !viewer) return null;
  const list = tasks.data;
  const refresh = () => Promise.all([tasks.refetch(), polls.refetch(), roster.refetch()]);
  const open = openId != null ? list?.find(t => t.id === openId) ?? null : null;
  const right = viewer.canManage ? (
    <Pressable onPress={() => setForm("new")} accessibilityRole="button" accessibilityLabel="New task" hitSlop={8}
      style={({ pressed }) => [styles.plus, { backgroundColor: c.ink, boxShadow: `${pressed ? 1 : 2}px ${pressed ? 1 : 2}px 0 ${c.note.fill.peach}` }, pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
      <Icon name="plus" size={16} color={c.paper} />
    </Pressable>
  ) : undefined;

  const mineOpen = (list ?? []).filter(t => t.status !== "done" && isMine(t, viewer)).sort(byDue);
  const over = mineOpen.filter(t => pileOf(t, today) === "over").length;
  const subtitle = !list ? undefined
    : mineOpen.length === 0 ? "Nothing is on you."
    : `${over ? `${over} overdue · ` : ""}${mineOpen.length - over} coming up`;

  return (
    <Screen title="Tasks" subtitle={subtitle} large back="More" onRefresh={refresh} right={right}>
      {list ? <StaleNote updatedAt={tasks.dataUpdatedAt} failed={tasks.isError || polls.isError} onRetry={() => void refresh()} /> : null}

      {list ? (
        list.length === 0 && (polls.data ?? []).length === 0 ? (
          <EmptyState
            pictures={[
              { icon: "note", tone: "lilac", label: "Tasks handed to you" },
              { icon: "envelope", tone: "sky", label: "Sealed ballots" },
              { icon: "check", tone: "mint", label: "Ticked off" },
            ]}
            title="Nothing here yet."
            line="When an officer hands out a task or asks the chapter to vote, it shows up here. Anything handed to you lands on top."
            action={viewer.canManage ? { label: "Hand out the first task", icon: "plus", onPress: () => setForm("new") } : undefined}
          />
        ) : (
          <FadeIn style={{ gap: 28 }}>
            <Deck mine={mineOpen} viewer={viewer} today={today} onOpen={t => setOpenId(t.id)}
              nameOf={id => (id == null ? null : people.get(id)?.name ?? null)} />
            <Polls polls={polls.data} error={polls.isError ? polls.error : null} onRetry={() => void polls.refetch()} viewer={viewer} today={today} />
            <Board tasks={list} viewer={viewer} today={today} onOpen={t => setOpenId(t.id)} />
          </FadeIn>
        )
      ) : tasks.isError ? (
        <ErrorState title="Couldn't load Tasks." error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : (
        <View style={styles.sk}>
          <SkeletonCard height={230} lines={4} radius={14} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} lead />
        </View>
      )}

      <TaskSheet task={open} viewer={viewer} today={today} roster={people} onClose={() => setOpenId(null)}
        onEdit={viewer.canManage ? t => { setOpenId(null); setForm(t); } : undefined}
        onDelete={viewer.canManage ? t => { setOpenId(null); setDoomed(t); } : undefined} />
      <TaskForm open={form != null} task={form === "new" ? null : form} onClose={() => setForm(null)} />
      <DeleteTask task={doomed} onClose={() => setDoomed(null)} />
    </Screen>
  );
}

/**
 * Ballots I'm asked into: open ones I haven't voted on first (soonest closing), then ones
 * I've voted on, then the two most recently decided. Same order as the web.
 */
function Polls({ polls, error, onRetry, viewer, today }: {
  polls: Poll[] | undefined; error: unknown; onRetry: () => void; viewer: Viewer; today: string;
}) {
  const { c } = useTheme();
  const shown = useMemo(() => {
    const mine = (polls ?? []).filter(p => canVote(p, viewer));
    const openP = mine.filter(p => p.status === "open").sort((a, b) =>
      (a.myVoteOptionId == null) !== (b.myVoteOptionId == null)
        ? (a.myVoteOptionId == null ? -1 : 1)
        : (a.closeDate ?? "9") < (b.closeDate ?? "9") ? -1 : (a.closeDate ?? "9") > (b.closeDate ?? "9") ? 1 : a.id - b.id);
    const decided = mine.filter(p => p.status === "closed").sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? "")).slice(0, 2);
    return [...openP, ...decided];
  }, [polls, viewer]);
  const waiting = shown.filter(p => p.status === "open" && p.myVoteOptionId == null).length;

  if (polls === undefined) return error ? <ErrorState compact title="Couldn't load the polls." error={error} onRetry={onRetry} /> : <SkeletonCard lines={3} />;
  if (!shown.length) return null;
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.head}>
        <T v="heading" accessibilityRole="header">Polls</T>
        <T v="mono" color={c.ink3} style={{ fontSize: 11.5 }}>{waiting ? `${waiting} waiting on you` : "all voted"}</T>
      </View>
      {shown.map(p => <Ballot key={p.id} poll={p} today={today} canVote={canVote(p, viewer)} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  sk: { gap: 12 },
  plus: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
});
