/**
 * The task sheet: what the web's task spotlight shows a member. Due and who, the notes on
 * a legal pad, an Everyone · each task's crowd (who's done theirs, from TaskDetail.parts),
 * and the history (TaskDetail.history). Names come from the roster (GET /api/brothers);
 * someone who has left the chapter has no roster row and reads as "Someone who left".
 *
 * The task itself is read live from the cached list, so ticking here (Done / Done my part
 * / Reopen in the footer) updates the sheet in place: the crowd's new dot drops in while
 * the sheet stays open. There's nothing to edit: assignees can only tick.
 */
import type { Brother, Task, TaskHistoryEntry } from "@/lib/api-types";
import { StyleSheet, View } from "react-native";
import { useTaskDetail } from "~/data/tasks";
import { Button } from "~/paper/Button";
import { Avatar } from "~/paper/bits";
import { LegalPad, PAD_LINE } from "~/paper/stationery";
import { Sheet } from "~/shell/sheets";
import { ErrorState, SkeletonCard } from "~/shell/states";
import { useTheme } from "~/theme/PaperProvider";
import { clockLabel, monthDay } from "~/today/time";
import { T } from "~/ui/T";
import { CrowdCount, CrowdStrip } from "./bits";
import { BAND_TONE } from "./Deck";
import { bandOf, canTick, deckLabel, rowWhen, whoLine, type Viewer } from "./model";
import { tickTask } from "./tick";

export function TaskSheet({ task, viewer, today, roster, onClose }: {
  task: Task | null; viewer: Viewer; today: string; roster: Map<number, Brother>; onClose: () => void;
}) {
  return (
    <Sheet open={task != null} onClose={onClose} size="half" tone={task ? BAND_TONE[bandOf(task, today)] : "lilac"}
      kicker={task ? deckLabel(task, today) : undefined} title={task?.title} icon="check"
      footer={task ? <Footer task={task} viewer={viewer} /> : undefined}>
      {task ? <Body task={task} viewer={viewer} today={today} roster={roster} /> : null}
    </Sheet>
  );
}

function Footer({ task, viewer }: { task: Task; viewer: Viewer }) {
  const { c } = useTheme();
  const done = task.status === "done";
  if (!canTick(task, viewer)) {
    return <T v="meta" color={c.ink3} style={{ flex: 1 }}>Only the people on it can tick this off.</T>;
  }
  const each = task.everyone === "each";
  return done
    ? <Button label={each ? "Undo my part" : "Reopen"} icon="refresh" variant="ghost" tone="butter" block onPress={() => tickTask(task, false)} style={{ flex: 1 }} />
    : <Button label={each ? "Done my part" : "Done"} icon="check" tone="mint" block onPress={() => tickTask(task, true)} style={{ flex: 1 }} />;
}

function Body({ task, viewer, today, roster }: { task: Task; viewer: Viewer; today: string; roster: Map<number, Brother> }) {
  const { c } = useTheme();
  const detail = useTaskDetail(task.id);
  const at = clockLabel(task.dueTime);
  const nameOf = (id: number | null) => id == null ? null : id === viewer.id ? "You" : roster.get(id)?.name ?? "Someone who left";
  const from = nameOf(task.createdById);

  return (
    <View style={{ gap: 18 }}>
      <View style={styles.stats}>
        <Stat label={task.status === "done" ? "Was due" : "Due"}
          value={task.dueDate ? `${monthDay(task.dueDate)}${at ? ` · ${at}` : ""}` : "Whenever"}
          sub={task.dueDate ? (task.status === "done" ? "ticked off" : rowWhen(task.dueDate, today).toLowerCase()) : "no date, not on the Timeline"}
          warn={bandOf(task, today) === "overdue"} />
        <Stat label="Who" value={whoLine(task, viewer)}
          sub={task.everyone === "each" ? "each person does it" : task.everyone === "any" ? "one person finishes it" : from ? `from ${from === "You" ? "you" : from.split(" ")[0]}` : ""} />
      </View>

      {task.notes ? (
        <LegalPad>
          <T v="kicker" color={c.pastel.butter.ink} style={{ fontSize: 9.5 }}>Notes</T>
          <T v="body" color={c.note.ink} style={{ lineHeight: PAD_LINE }}>{task.notes}</T>
        </LegalPad>
      ) : null}

      {task.everyone === "each" && task.memberCount != null ? (
        <Crowd task={task} parts={detail.data?.parts ?? null} nameOf={nameOf} />
      ) : null}

      <View style={{ gap: 10 }}>
        <T v="label" color={c.ink3} accessibilityRole="header">History</T>
        {detail.data ? (
          detail.data.history.length ? detail.data.history.map((h, i) => (
            <HistoryRow key={i} entry={h} name={nameOf(h.actorId)} />
          )) : <T v="meta" color={c.ink3}>No history for this one yet.</T>
        ) : detail.isError ? (
          <ErrorState compact title="Couldn't load the history." error={detail.error} onRetry={() => void detail.refetch()} />
        ) : <SkeletonCard lines={2} title={false} />}
      </View>
    </View>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.stat, { borderColor: warn ? c.pastel.rose.border : c.line, backgroundColor: warn ? c.pastel.rose.soft : c.paper }]}>
      <T v="label" color={warn ? c.pastel.rose.ink : c.ink3}>{label}</T>
      <T v="subhead" numberOfLines={2}>{value}</T>
      {sub ? <T v="meta" color={c.ink3} numberOfLines={1}>{sub}</T> : null}
    </View>
  );
}

function Crowd({ task, parts, nameOf }: { task: Task; parts: { brotherId: number }[] | null; nameOf: (id: number | null) => string | null }) {
  const { c } = useTheme();
  const done = task.doneCount ?? 0;
  const total = task.memberCount ?? 0;
  const names = (parts ?? []).map(p => nameOf(p.brotherId)?.split(" ")[0]).filter((n): n is string => !!n);
  const shown = names.slice(0, 4);
  const line = !parts ? null
    : names.length === 0 ? "Nobody has done theirs yet."
    : `${shown.join(", ")}${names.length > shown.length ? ` and ${names.length - shown.length} more` : ""} ${names.length === 1 ? "has" : "have"} done theirs.`;
  return (
    <View style={[styles.crowd, { borderColor: c.line, backgroundColor: c.paper }]}>
      <View style={styles.crowdHead}>
        <T v="title" style={{ fontSize: 24 }}>{done}</T>
        <T v="meta" color={c.ink2}>of {total} have done their part</T>
        <View style={{ marginLeft: "auto" }}><CrowdCount done={done} total={total} /></View>
      </View>
      <CrowdStrip done={done} total={total} size={11} label={line ?? undefined} />
      {line ? <T v="meta" color={c.ink3}>{line}</T> : null}
    </View>
  );
}

const ACTION: Record<string, string> = {
  "task.created": "handed this out",
  "task.completed": "ticked it off",
  "task.reopened": "reopened it",
};
const FIELD: Record<string, string> = {
  title: "the title", dueDate: "the due date", notes: "the notes", assignees: "who it's on", everyone: "who it's on", status: "the status",
};

function HistoryRow({ entry, name }: { entry: TaskHistoryEntry; name: string | null }) {
  const { c } = useTheme();
  const what = entry.action === "task.updated"
    ? `changed ${[...new Set((entry.changedFields ?? []).map(f => FIELD[f] ?? f))].join(" and ") || "it"}`
    : ACTION[entry.action] ?? entry.action.replace("task.", "");
  const who = name ?? "Someone";
  const when = new Date(entry.at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <View style={styles.hist}>
      <Avatar name={who === "You" ? "You" : who} size="sm" style={{ width: 22, height: 22 }} />
      <T v="meta" color={c.ink2} style={{ flex: 1 }}><T v="meta" color={c.ink} style={{ fontWeight: "600" }}>{who}</T> {what}</T>
      <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{when}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, gap: 3, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  crowd: { gap: 10, padding: 14, borderRadius: 16, borderWidth: 1.5 },
  crowdHead: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  hist: { flexDirection: "row", alignItems: "center", gap: 9 },
});
