/**
 * The one way a task gets ticked, from Today's plate or from Tasks (deck or board):
 *
 *   1. optimistic: the cached task list flips (an "each" task bumps its count) and, on a
 *      tick, the row leaves Today's plate, so both screens agree before the server answers
 *   2. success haptic + toast with the 10s Undo ring (a reopen gets a plain toast)
 *   3. PATCH /api/tasks/[id] { status }, serialised per task, so an Undo tapped mid-flight
 *      waits for the tick it undoes
 *   4. the answer replaces the cached row; Today re-reads quietly; an "each" task's crowd
 *      (TaskDetail.parts) is re-read
 *
 * A refusal restores both caches, plays an error haptic, says why in a toast, and tells
 * subscribers (onTickRefused) so the screen on top can play its motion backwards. The
 * list is re-read a moment later, after the backwards motion has had time to read.
 */
import type { Task } from "@/lib/api-types";
import { errorMessage } from "~/api/errors";
import { dropFromPlate, refreshHome } from "~/data/home";
import { patchTaskInCache, refreshTaskDetail, refreshTasks, setTaskDone, tickedLocally } from "~/data/tasks";
import { haptics } from "~/motion/haptics";
import { toast } from "~/shell/toast";

const inflight = new Map<number, Promise<unknown>>();

function after<T>(id: number, f: () => Promise<T>): Promise<T> {
  const p = (inflight.get(id) ?? Promise.resolve()).catch(() => {}).then(f);
  inflight.set(id, p);
  return p;
}

const refused = new Set<(taskId: number) => void>();
/** Hear about refused ticks/unticks (the deck flies the card back, the board unstrikes). */
export function onTickRefused(fn: (taskId: number) => void): () => void {
  refused.add(fn);
  return () => { refused.delete(fn); };
}
const announceRefusal = (id: number) => refused.forEach(f => f(id));

/** After a refusal the cache is back to what it was; re-read once the motion has played. */
const rereadSoon = () => setTimeout(() => { void refreshTasks(); void refreshHome(); }, 1500);

function landed(t: Task) {
  patchTaskInCache(t.id, t);
  void refreshHome();
  if (t.everyone === "each") void refreshTaskDetail(t.id);
}

export function tickTask(task: Task, done: boolean): void {
  const plateKey = `task-${task.id}`;
  const restoreList = patchTaskInCache(task.id, t => tickedLocally(t, done));
  const restorePlate = done ? dropFromPlate(plateKey) : () => {};

  if (done) {
    haptics.success();
    toast.show(task.everyone === "each" ? "Your part's done" : "Done", { detail: task.title, undo: () => untick(task, plateKey, restorePlate) });
  } else {
    haptics.tap();
    toast.show("Reopened", { detail: task.title, tone: "butter", icon: "refresh" });
  }

  after(task.id, () => setTaskDone(task.id, done)).then(landed, e => {
    restoreList();
    restorePlate();
    haptics.error();
    toast.error(done ? "Couldn't tick that off" : "Couldn't reopen that", { detail: errorMessage(e) });
    announceRefusal(task.id);
    rereadSoon();
  });
}

/** The toast's Undo: the reverse write, through the same queue. */
function untick(task: Task, plateKey: string, putBackOnPlate: () => void) {
  const restore = patchTaskInCache(task.id, t => tickedLocally(t, false));
  putBackOnPlate();
  // The toast's Undo press gives the tap.
  after(task.id, () => setTaskDone(task.id, false)).then(landed, e => {
    restore();
    dropFromPlate(plateKey);
    haptics.error();
    toast.error("Couldn't take that back", { detail: errorMessage(e) });
    announceRefusal(task.id);
    rereadSoon();
  });
}
