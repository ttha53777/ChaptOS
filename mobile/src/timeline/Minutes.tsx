/**
 * A meeting's minutes summary (GET /api/calendar/[id]/summary), on a legal pad: the gist,
 * what was decided, and the action items. Mine (the summary resolved the owner to me) are
 * tickable; an officer who manages events can tick any (`canTickAll`). Everyone else's
 * read as a plain list with the owner's name.
 *
 * Ticking (PATCH /api/calendar/[id]/action-items) is optimistic: the box fills and a strike
 * draws through the line left to right (~/tasks/bits StrikeTitle). A refusal (say the item
 * was handed to someone else: 403) undraws it, restores the box and says why.
 */
import type { MeetingActionItem } from "@/lib/api-types";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { patchActionItem, putSummaryBody, refreshSummary, setSummaryItem, useMeetingSummary } from "~/data/calendar";
import { haptics } from "~/motion/haptics";
import { LegalPad, PAD_LINE } from "~/paper/stationery";
import { ErrorState, SkeletonCard } from "~/shell/states";
import { toast } from "~/shell/toast";
import { CheckBox, StrikeTitle } from "~/tasks/bits";
import { useTheme } from "~/theme/PaperProvider";
import { monthDay } from "~/today/time";
import { T } from "~/ui/T";

const queue = new Map<string, Promise<unknown>>();

export function tickActionItem(eventId: number, item: MeetingActionItem, done: boolean) {
  const restore = setSummaryItem(eventId, item.id, done);
  if (done) haptics.success(); else haptics.tap();
  const key = `${eventId}:${item.id}`;
  const next = (queue.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => patchActionItem(eventId, item.id, done));
  queue.set(key, next);
  next.then(
    body => putSummaryBody(eventId, body),
    e => {
      restore();
      haptics.error();
      toast.error(done ? "Couldn't tick that off" : "Couldn't reopen that", { detail: errorMessage(e) });
      setTimeout(() => void refreshSummary(eventId), 900);
    },
  ).finally(() => { if (queue.get(key) === next) queue.delete(key); });
}

export function Minutes({ eventId, meId }: { eventId: number; meId: number }) {
  const { c } = useTheme();
  const q = useMeetingSummary(eventId);
  if (q.isPending) return <SkeletonCard lines={3} />;
  if (q.isError) return <ErrorState compact title="Couldn't load the minutes." error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data.summary;
  if (!s) return null;
  const canTick = (a: MeetingActionItem) => q.data.canTickAll || a.brotherId === meId;
  const mine = s.actions.filter(a => a.brotherId === meId);
  const rest = s.actions.filter(a => a.brotherId !== meId);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <T v="label" color={c.ink3} accessibilityRole="header">From the minutes</T>
        {q.data.summarizedAt ? <T v="mono" color={c.ink3} style={{ fontSize: 10.5 }}>{monthDay(q.data.summarizedAt.slice(0, 10))}</T> : null}
      </View>
      <LegalPad>
        <View style={{ gap: 0 }}>
          {s.gist ? <T v="body" style={{ lineHeight: PAD_LINE }}>{s.gist}</T> : null}
          {s.decisions.length ? (
            <View>
              <T v="label" color={c.ink3} style={{ lineHeight: PAD_LINE }}>Decided</T>
              {s.decisions.map((d, i) => <T key={i} v="body" style={{ lineHeight: PAD_LINE }}>· {d}</T>)}
            </View>
          ) : null}
        </View>
      </LegalPad>

      {s.actions.length ? (
        <View style={[styles.list, { borderColor: c.line, backgroundColor: c.card }]}>
          {[...mine, ...rest].map((a, i) => (
            <View key={a.id} style={[styles.row, i > 0 && { borderTopColor: c.line, borderTopWidth: 1 }]}>
              {canTick(a)
                ? <CheckBox done={a.done} tone="mint" label={a.text} onPress={() => tickActionItem(eventId, a, !a.done)} />
                : <View style={[styles.dot, { borderColor: a.done ? c.pastel.mint.ink : c.line2, backgroundColor: a.done ? c.pastel.mint.soft : "transparent" }]} />}
              <View style={{ flex: 1, gap: 2 }}>
                <StrikeTitle struck={a.done} color={a.done ? c.ink3 : c.ink}>{a.text}</StrikeTitle>
                <T v="meta" color={c.ink3}>
                  {a.brotherId === meId ? "You" : a.owner ?? "Nobody named"}{a.due ? ` · by ${monthDay(a.due)}` : ""}
                </T>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 11 },
  dot: { width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, borderStyle: "dashed" },
});
