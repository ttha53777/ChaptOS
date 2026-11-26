/**
 * Tasks (the web's app/org/[slug]/tasks: page.tsx + PaperTasks.tsx), reached from More,
 * in the web phone's order, from the shared rules in @/lib/tasks/list:
 *
 *   head      TASKS + term, "2 overdue, 9 coming up", the line under it, New poll (MANAGE_POLLS)
 *             / New task (MANAGE_TASKS)
 *   whose     Everyone's / Just mine
 *   piles     Overdue (or "Nothing overdue."), Upcoming; tap a title for the spotlight,
 *             tick or swipe left to finish (DONE stamp + flight, then ~/tasks/tick)
 *   done      N done this term, folding open
 *   votes     Votes + New poll / "N open", the vote cards; a question opens the ballot
 *   day one   no tasks and no polls: "Nothing to do yet", the two little piles, one button
 *
 * ?open=<taskId> / ?poll=<pollId> (from a push) opens that task's spotlight or poll's ballot.
 * Reads GET /api/tasks, GET /api/polls, GET /api/brothers (names, faces, role holders).
 * Sheets sit in slots, so opening one doesn't re-render the lists.
 */
import type { Poll, Task } from "@/lib/api-types";
import { canComplete, canVote, pollShelf, startOfToday, taskPiles, type Me } from "@/lib/tasks/list";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { usePolls, useRoster, useTasks } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { navLabel } from "~/more/model";
import { Screen } from "~/shell/Screen";
import { useSlot, SlotView } from "~/shell/slot";
import { ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { BallotSheet, FIRST_VOTE } from "~/tasks/BallotSheet";
import { ClearLine, DoneSection, NoVotes, Pile, TasksDayOne, TasksHead, VoteCard, VotesHead, Whose, type RowEnv } from "~/tasks/List";
import { DeletePoll, PollForm } from "~/tasks/PollForm";
import { TaskSpotlight } from "~/tasks/Spotlight";
import { DeleteTask, TaskForm } from "~/tasks/TaskForm";
import { tickTask } from "~/tasks/tick";
import { castVote } from "~/tasks/vote";

const MANAGE_TASKS = 1 << 12;
const MANAGE_POLLS = 1 << 13;

export default function Tasks() {
  const entry = useEntryOf("ready");
  const tasks = useTasks();
  const polls = usePolls();
  const roster = useRoster();
  const [mineOnly, setMineOnly] = useState(false);
  const spot = useSlot<number>();
  const ballot = useSlot<number>();
  const taskForm = useSlot<Task | "new">();
  const pollForm = useSlot<Poll | "new">();
  const doomedTask = useSlot<Task>();
  const doomedPoll = useSlot<Poll>();
  const today = useMemo(() => startOfToday(), []);
  // A push opens a task's spotlight (?open=<id>) or a poll's ballot (?poll=<id>), once
  // the list holding it has loaded; the param is then cleared so Back doesn't reopen it.
  const params = useLocalSearchParams<{ open?: string; poll?: string }>();
  useEffect(() => {
    const id = Number(params.open);
    if (!params.open || !tasks.data) return;
    if (tasks.data.some(t => t.id === id)) spot.set(id);
    router.setParams({ open: undefined });
  }, [params.open, tasks.data, spot]);
  useEffect(() => {
    const id = Number(params.poll);
    if (!params.poll || !polls.data) return;
    if (polls.data.some(p => p.id === id)) ballot.set(id);
    router.setParams({ poll: undefined });
  }, [params.poll, polls.data, ballot]);

  const meRow = entry?.me ?? null;
  const me: Me = useMemo(() => ({ selfId: meRow?.id ?? null, myRoleIds: new Set((meRow?.roles ?? []).map(r => r.id)) }), [meRow]);
  const canManage = !!meRow && (meRow.permissions & MANAGE_TASKS) !== 0;
  const canManagePolls = !!meRow && (meRow.permissions & MANAGE_POLLS) !== 0;

  const onOpen = useCallback((t: Task) => spot.set(t.id), [spot]);
  const onTick = useCallback((t: Task) => tickTask(t, true), []);
  const env: RowEnv = useMemo(() => ({ today, me, canManage, onOpen, onTick }), [today, me, canManage, onOpen, onTick]);
  const onVote = useCallback((p: Poll, optionId: number) => castVote(p, optionId, { confirm: FIRST_VOTE }), []);
  const onOpenPoll = useCallback((p: Poll) => ballot.set(p.id), [ballot]);

  const list = tasks.data;
  const pollList = polls.data;
  const piles = useMemo(() => (list ? taskPiles(list, today, mineOnly, me) : null), [list, today, mineOnly, me]);
  const shelf = useMemo(() => pollShelf(pollList ?? [], mineOnly, canManagePolls, me), [pollList, mineOnly, canManagePolls, me]);

  if (!entry || !meRow) return null;
  const term = meRow.org?.activeTerm?.label ?? null;
  const refresh = () => Promise.all([tasks.refetch(), polls.refetch(), roster.refetch()]);
  const newTask = () => taskForm.set("new");
  const newPoll = () => pollForm.set("new");
  // Polls only hold the page back when there are no tasks to show (it could be day one).
  const loading = !list || (!pollList && !polls.isError && list.length === 0);
  const dayOne = !!list && list.length === 0 && (pollList ?? []).length === 0;
  const openPolls = shelf.filter(p => p.status === "open").length;

  let body: React.ReactNode;
  if (tasks.isError && !list) {
    body = <ErrorState title="Couldn't load Tasks." error={tasks.error} onRetry={() => void tasks.refetch()} />;
  } else if (loading || !piles) {
    body = <View style={{ gap: 18 }}><SkeletonCard height={120} title={false} lines={0} /><SkeletonCard height={220} /><SkeletonCard height={150} /></View>;
  } else if (dayOne) {
    body = <TasksDayOne term={term} canManage={canManage} canManagePolls={canManagePolls} onNewTask={newTask} onNewPoll={newPoll} />;
  } else {
    body = (
      <View>
        <TasksHead term={term} over={piles.over.length} up={piles.up.length} mineOnly={mineOnly}
          canManage={canManage} canManagePolls={canManagePolls} onNewTask={newTask} onNewPoll={newPoll} />
        <View style={{ marginTop: 18 }}><Whose mineOnly={mineOnly} onChange={setMineOnly} /></View>
        <View style={{ marginTop: 20, gap: 14 }}>
          {piles.over.length ? <Pile kind="over" tasks={piles.over} env={env} empty="" /> : <ClearLine />}
          <Pile kind="up" tasks={piles.up} env={env} empty={`Nothing coming up${mineOnly ? " for you" : ""}.`} />
          <DoneSection done={piles.done} env={env} onReopen={t => tickTask(t, false)} />
        </View>
        <View style={{ marginTop: 30, gap: 14 }}>
          <VotesHead canManagePolls={canManagePolls} openCount={openPolls} onNewPoll={newPoll} />
          {polls.isError && !pollList
            ? <ErrorState compact title="Couldn't load the polls." error={polls.error} onRetry={() => void polls.refetch()} />
            : shelf.length === 0
              ? <NoVotes canManagePolls={canManagePolls} onNewPoll={newPoll} />
              : shelf.map(p => <VoteCard key={p.id} poll={p} today={today} canVote={canVote(p, me)} onVote={onVote} onOpen={onOpenPoll} />)}
        </View>
      </View>
    );
  }

  const rosterList = roster.data ?? [];
  return (
    <Screen title={navLabel(meRow, "Tasks")} back="More" onRefresh={refresh}>
      {list ? <StaleNote updatedAt={tasks.dataUpdatedAt} failed={tasks.isError || polls.isError} onRetry={() => void refresh()} /> : null}
      <View style={styles.page}>{body}</View>

      <SlotView slot={spot}>{(id, close) => {
        const t = id != null ? list?.find(x => x.id === id) ?? null : null;
        return <TaskSpotlight task={t} today={today} me={me} roster={rosterList} canComplete={!!t && canComplete(t, me, canManage)} canManage={canManage}
          onEdit={x => { close(); taskForm.set(x); }} onDelete={x => { close(); doomedTask.set(x); }} onClose={close} />;
      }}</SlotView>
      <SlotView slot={ballot}>{(id, close) => {
        const p = id != null ? pollList?.find(x => x.id === id) ?? null : null;
        return <BallotSheet poll={p} today={today} rosterSize={rosterList.length} canManage={canManagePolls} canVote={!!p && canVote(p, me)}
          onEdit={x => { close(); pollForm.set(x); }} onDelete={x => { close(); doomedPoll.set(x); }} onClose={close} />;
      }}</SlotView>
      {canManage ? <SlotView slot={taskForm}>{(v, close) => <TaskForm open={v != null} task={v === "new" || v == null ? null : v} onClose={close} />}</SlotView> : null}
      {canManagePolls ? <SlotView slot={pollForm}>{(v, close) => <PollForm open={v != null} poll={v === "new" || v == null ? null : v} onClose={close} />}</SlotView> : null}
      {canManage ? <SlotView slot={doomedTask}>{(t, close) => <DeleteTask task={t} onClose={close} />}</SlotView> : null}
      {canManagePolls ? <SlotView slot={doomedPoll}>{(p, close) => <DeletePoll poll={p} onClose={close} />}</SlotView> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 12 },
});
