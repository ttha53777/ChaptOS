/**
 * The ballot sheet, the web's PaperBallot (app/org/[slug]/tasks/PaperTasks.tsx), opened
 * from a vote card's question. Words from @/lib/tasks/list.
 *
 *   ballot     an open poll I can vote on and haven't (or chose Change vote): pick one,
 *              "N sealed so far…", Cast ballot / Change vote; a poll manager may Peek
 *   results    bars with counts, "your vote", "leading" / "won"; a manager peeking is told
 *              voters still see a sealed ballot
 *   not mine   "You're not on this ballot — results open up when it closes."
 *   managers   Not voted yet (faces + names); Close poll (with the web's confirm) or
 *              Reopen, Edit, Delete
 *
 * Casting is ~/tasks/vote (optimistic, the server's answer reveals the counts). Closing
 * and reopening are PATCH /api/polls/[id] { status }.
 */
import type { Poll } from "@/lib/api-types";
import { avTone, ballotSub, ballotWho, leaderOf, pendingLine } from "@/lib/tasks/list";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { editPoll } from "~/data/tasks";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Avatar } from "~/paper/bits";
import { Stamp } from "~/paper/Stamp";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { TBtn } from "./List";
import { castVote } from "./vote";

export const FIRST_VOTE = "Your vote is in — here's how the room is leaning so far.";

export function BallotSheet({ poll, today, rosterSize, canManage, canVote, onEdit, onDelete, onClose }: {
  poll: Poll | null; today: Date; rosterSize: number; canManage: boolean; canVote: boolean;
  onEdit: (p: Poll) => void; onDelete: (p: Poll) => void; onClose: () => void;
}) {
  const [last, setLast] = useState<Poll | null>(poll);
  if (poll && poll !== last) setLast(poll);
  const p = poll ?? last;
  return (
    <Sheet open={!!poll} onClose={onClose} size="fit" accessibilityLabel="Poll">
      {p ? <Body key={p.id} poll={p} today={today} rosterSize={rosterSize} canManage={canManage} canVote={canVote}
        onEdit={() => onEdit(p)} onDelete={() => onDelete(p)} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Body({ poll, today, rosterSize, canManage, canVote, onEdit, onDelete, onClose }: {
  poll: Poll; today: Date; rosterSize: number; canManage: boolean; canVote: boolean;
  onEdit: () => void; onDelete: () => void; onClose: () => void;
}) {
  const { c } = useTheme();
  const closed = poll.status === "closed";
  const mv = poll.myVoteOptionId;
  const tot = poll.totalVotes;
  const [pick, setPick] = useState<number | null>(mv);
  const [peek, setPeek] = useState(false);
  const [change, setChange] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const ballot = !closed && canVote && (mv == null || change) && !peek;
  const counted = poll.options.every(o => o.voteCount != null);
  const lead = leaderOf(poll);
  const pending = poll.pendingVoters ?? [];

  const cast = () => {
    if (pick == null) return;
    castVote(poll, pick, { confirm: FIRST_VOTE });
    setChange(false); setPeek(false);
  };
  const setStatus = async (status: "open" | "closed") => {
    setBusy(true);
    try { await editPoll(poll.id, { status }); haptics.success(); }
    catch (e) { haptics.error(); toast.error("Could not update the poll.", { detail: errorMessage(e) }); }
    setBusy(false);
  };

  const lock = (text: string, link?: { label: string; onPress: () => void }) => (
    <View style={[styles.seal, { borderColor: c.line2 }]}>
      <Icon name="lock" size={15} color={c.ink3} />
      <T v="meta" size={13.4} color={c.ink2} style={{ flex: 1 }}>{text}</T>
      {link ? <Pressable onPress={link.onPress} accessibilityRole="button" hitSlop={6}><T v="buttonSm" color={c.pastel.lilac.ink}>{link.label}</T></Pressable> : null}
    </View>
  );

  return (
    <View style={{ gap: 14 }}>
      {closed ? <View style={styles.rubber}><Stamp label="Decided" state="shown" size="sm" rotate={8} tone="mint" /></View> : null}
      <T v="kicker" size={11.5} color={c.ink3} style={{ paddingRight: closed ? 120 : 40 }}>{`${closed ? "Final results" : "Ballot"} · ${ballotWho(poll, rosterSize)} · anonymous`}</T>
      <T v="hero" size={27} ls={-0.03} lh={1.1}>{poll.question}</T>
      <T v="body" size={15.2} color={c.ink3}>{ballotSub(poll, today)}</T>

      {ballot ? (
        <>
          <View style={{ gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel="Your vote">
            {poll.options.map(o => {
              const on = pick === o.id;
              return (
                <Pressable key={o.id} onPress={() => { haptics.tap(); setPick(o.id); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={[styles.o, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel.lilac.soft : c.card }]}>
                  <View style={[styles.bx, { borderColor: c.ink, backgroundColor: on ? c.note.fill.lilac : c.card }]}>{on ? <Icon name="x" size={14} color={c.note.ink} /> : null}</View>
                  <T v="bodyStrong" size={16} style={{ flex: 1 }}>{o.label}</T>
                </Pressable>
              );
            })}
          </View>
          {lock(mv == null ? `${tot} sealed so far. Counts open up to you once you vote — nobody sees who picked what.` : "Changing your vote replaces the old one.",
            mv == null && canManage && counted ? { label: "Peek →", onPress: () => setPeek(true) } : undefined)}
        </>
      ) : counted ? (
        <>
          <View style={{ gap: 10 }}>
            {poll.options.map(o => {
              const n = o.voteCount ?? 0;
              const w = tot ? (n / tot) * 100 : 0;
              const win = o.id === lead;
              return (
                <View key={o.id} style={[styles.o, styles.res, { borderColor: c.line2, backgroundColor: c.card }]}>
                  <View style={[styles.resFill, { width: `${w}%`, backgroundColor: win ? c.pastel.mint.soft : c.pastel.lilac.soft }]} />
                  <View style={styles.resNm}>
                    <T v="bodyStrong" size={17} numberOfLines={2} style={{ flexShrink: 1 }}>{o.label}</T>
                    {o.id === mv ? <View style={[styles.tg, { borderColor: c.pastel.lilac.ink }]}><T v="kicker" size={10.6} color={c.pastel.lilac.ink}>your vote</T></View> : null}
                    {win ? <View style={[styles.tg, { borderColor: c.pastel.mint.ink }]}><T v="kicker" size={10.6} color={c.pastel.mint.ink}>{closed ? "won" : "leading"}</T></View> : null}
                  </View>
                  <T v="title" size={17} style={{ marginLeft: 8 }}>{String(n)}</T>
                  <T v="mono" size={12.5} color={c.ink2}>{` ${Math.round(w)}%`}</T>
                </View>
              );
            })}
          </View>
          {peek && mv == null && !closed ? lock("You’re peeking as an officer — voters still see a sealed ballot.",
            canVote ? { label: "Back to the ballot", onPress: () => setPeek(false) } : undefined) : null}
        </>
      ) : lock("You’re not on this ballot — results open up when it closes.")}

      {!closed && canManage && pending.length > 0 ? (
        <View style={[styles.who, { borderTopColor: c.line2 }]}>
          <T v="kicker" size={11.5} color={c.ink3}>Not voted yet</T>
          <View style={styles.whoRow}>
            <View style={{ flexDirection: "row" }}>
              {pending.slice(0, 5).map((v, i) => (
                <View key={v.brotherId} style={{ marginLeft: i ? -8 : 0 }}><Avatar name={v.name} uri={v.avatarUrl} tone={avTone(v.brotherId)} px={30} ring={c.card} /></View>
              ))}
            </View>
            <T v="callout" size={15} color={c.ink2} style={{ flex: 1 }}>{pendingLine(pending)}</T>
          </View>
        </View>
      ) : null}

      {confirm ? (
        <View style={{ gap: 10 }}>
          <T v="callout" color={c.ink2}>Close now? Voting stops and the results become final.</T>
          <View style={styles.foot}>
            <TBtn small soft label="Keep open" onPress={() => setConfirm(false)} />
            <TBtn small label="Close poll" disabled={busy} onPress={() => { setConfirm(false); void setStatus("closed"); }} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {canManage ? (
            <View style={styles.mgmt}>
              {closed
                ? <TBtn small soft label="Reopen" disabled={busy} onPress={() => void setStatus("open")} />
                : <TBtn small soft label="Close poll" onPress={() => setConfirm(true)} />}
              <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Edit poll" hitSlop={6} style={styles.ib}><Icon name="pencil" size={17} color={c.ink3} /></Pressable>
              <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Delete poll" hitSlop={6} style={styles.ib}><Icon name="trash" size={17} color={c.ink3} /></Pressable>
            </View>
          ) : null}
          <View style={[styles.foot, { justifyContent: "flex-end" }]}>
            {ballot ? (
              <TBtn icon="check" label={mv == null ? "Cast ballot" : "Change vote"} tone="lilac" disabled={pick == null} onPress={cast} />
            ) : (
              <>
                {!closed && canVote && mv != null ? <TBtn soft label="Change vote" onPress={() => { setPick(mv); setChange(true); setPeek(false); }} /> : null}
                <TBtn label="Done" tone="lilac" onPress={onClose} />
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rubber: { position: "absolute", right: 44, top: -6, zIndex: 2 },
  o: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, overflow: "hidden" },
  res: { paddingVertical: 16 },
  resFill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  resNm: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  tg: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6, borderWidth: 1.5 },
  bx: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.6, alignItems: "center", justifyContent: "center" },
  seal: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed" },
  who: { gap: 10, paddingTop: 16, borderTopWidth: 1.5, borderStyle: "dashed" },
  whoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  foot: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  mgmt: { flexDirection: "row", alignItems: "center", gap: 14 },
  ib: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
