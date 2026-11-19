/**
 * Casting (or changing) a vote. POST /api/polls/[id]/vote is an upsert on the server, so
 * a member may change their pick while the poll is open, as on the web ("Tap another to
 * change it").
 *
 * Optimistic: my pick moves in the cached poll at once (the X is drawn on it) and a first
 * vote takes the poll off Today's plate. The blind ballot holds: sealed counts stay null
 * until the server's answer reveals them, and that answer is what grows the bars. The
 * light haptic belongs to the pen stroke and the success haptic to the bars landing (the
 * Ballot plays both); a refusal restores the poll, buzzes, says why, and tells the
 * ballot to erase its X.
 */
import type { Poll } from "@/lib/api-types";
import { errorMessage } from "~/api/errors";
import { dropFromPlate, refreshHome } from "~/data/home";
import { patchPollInCache, postVote, refreshPolls, votedLocally } from "~/data/tasks";
import { haptics } from "~/motion/haptics";
import { toast } from "~/shell/toast";

const refused = new Set<(pollId: number) => void>();
export function onVoteRefused(fn: (pollId: number) => void): () => void {
  refused.add(fn);
  return () => { refused.delete(fn); };
}

const queue = new Map<number, Promise<unknown>>();

/** `confirm`: a toast once the server has a first vote (the web Tasks page's "Your vote is in…"). */
export function castVote(poll: Poll, optionId: number, opts?: { confirm?: string }): void {
  if (poll.myVoteOptionId === optionId) return;
  const first = poll.myVoteOptionId == null;
  const restore = patchPollInCache(poll.id, p => votedLocally(p, optionId));
  const restorePlate = first ? dropFromPlate(`poll-${poll.id}`) : () => {};

  const p = (queue.get(poll.id) ?? Promise.resolve()).catch(() => {}).then(() => postVote(poll.id, optionId));
  queue.set(poll.id, p);
  p.then(
    fresh => {
      patchPollInCache(poll.id, fresh);
      void refreshHome();
      if (first && opts?.confirm) { haptics.success(); toast.show(opts.confirm); }
    },
    e => {
      restore();
      restorePlate();
      haptics.error();
      toast.error(first ? "Couldn't cast your vote" : "Couldn't change your vote", { detail: errorMessage(e) });
      refused.forEach(f => f(poll.id));
      setTimeout(() => { void refreshPolls(); void refreshHome(); }, 1500);
    },
  );
}
