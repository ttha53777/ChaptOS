/**
 * More → Excuses: every excuse I've filed (GET /api/excuses/mine), newest first, as
 * notes: waiting for review, not accepted (struck through, with the officer's note and
 * Resubmit), excused. Resubmitting reuses the Timeline's excuse sheet and write
 * (~/timeline/Attendance), so it's the same optimistic filing and the same refusals.
 */
import type { CalendarEvent, MyExcuseItem } from "@/lib/api-types";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useCalendar, useMyExcuses } from "~/data/calendar";
import { NO_TERM_LINE, useNoTerm } from "~/entry/term";
import { Icon } from "~/icons/Icon";
import { Button } from "~/paper/Button";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonList, StaleNote } from "~/shell/states";
import { alpha, type Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { ExcuseSheet, fileExcuse } from "~/timeline/Attendance";
import { monthDay } from "~/today/time";
import { T } from "~/ui/T";

const LOOK: Record<string, { tone: Tone; label: string }> = {
  pending: { tone: "butter", label: "Waiting for review" },
  rejected: { tone: "rose", label: "Not accepted" },
  approved: { tone: "mint", label: "Excused" },
};

export default function ExcusesPage() {
  const { c } = useTheme();
  const q = useMyExcuses();
  const cal = useCalendar();
  const [again, setAgain] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState("");
  const noTerm = useNoTerm();
  const list = q.data ? [...q.data].sort((a, b) => b.eventDate.localeCompare(a.eventDate)) : null;

  const eventOf = (x: MyExcuseItem): CalendarEvent =>
    cal.data?.find(e => e.id === x.calendarEventId) ?? { id: x.calendarEventId, title: x.eventTitle, date: x.eventDate, category: "chapter", mandatory: true };

  return (
    <Screen title="Excuses" back="More" onRefresh={() => Promise.all([q.refetch(), cal.refetch()])}>
      {list ? <StaleNote updatedAt={q.dataUpdatedAt} failed={q.isError} onRetry={() => void q.refetch()} /> : null}
      {noTerm ? <T v="meta" color={c.ink3}>{NO_TERM_LINE}</T> : null}
      {!list ? (q.isError ? <ErrorState title="Couldn't load your excuses." error={q.error} onRetry={() => void q.refetch()} /> : <SkeletonList count={3} />)
        : !list.length ? (
          <EmptyState pictures={[{ icon: "note", tone: "butter", label: "A line on why" }, { icon: "clip", tone: "sky", label: "Filed under the meeting" }, { icon: "check", tone: "mint", label: "Excused" }]}
            title="No excuses filed." line="Can't make a required meeting? Open it on the Timeline and file one. It shows up here while an officer looks at it." />
        ) : list.map(x => {
          const look = LOOK[x.status] ?? LOOK.pending!;
          const p = c.pastel[look.tone];
          const rejected = x.status === "rejected";
          return (
            <View key={x.id} style={[styles.note, { backgroundColor: p.soft, borderColor: p.border, borderStyle: rejected ? "dashed" : "solid" }]}>
              <View style={[styles.margin, { backgroundColor: alpha(c.pastel.rose.ink, 0.4) }]} />
              <View style={styles.top}>
                <Icon name={x.status === "approved" ? "check" : rejected ? "x" : "pencil"} size={13} color={p.ink} />
                <T v="kicker" color={p.ink} style={{ fontSize: 10, flex: 1 }}>{look.label}</T>
                <T v="mono" color={c.ink3} style={{ fontSize: 10.5 }}>filed {monthDay(x.submittedAt.slice(0, 10))}</T>
              </View>
              <T v="callout">{x.eventTitle} · {monthDay(x.eventDate)}</T>
              <T v="body" color={c.note.ink} style={rejected ? { textDecorationLine: "line-through", opacity: 0.8 } : undefined}>“{x.reason}”</T>
              {rejected && x.rejectionNote ? (
                <View style={{ gap: 2, marginTop: 4 }}>
                  <T v="label" color={c.ink3}>Officer's note</T>
                  <T v="body">{x.rejectionNote}</T>
                </View>
              ) : null}
              {rejected && !noTerm ? <Button label="Resubmit" icon="refresh" size="sm" variant="ghost" tone="rose" style={{ alignSelf: "flex-start", marginTop: 6 }}
                onPress={() => { setDraft(x.reason); setAgain(eventOf(x)); }} /> : null}
            </View>
          );
        })}
      {again ? (
        <ExcuseSheet open event={again} draft={draft} setDraft={setDraft} onClose={() => setAgain(null)}
          onSubmit={reason => { const ev = again; setAgain(null); fileExcuse(ev, reason, { ok: () => setDraft("") }); }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { gap: 4, paddingVertical: 12, paddingRight: 14, paddingLeft: 30, borderWidth: 1.5, borderTopLeftRadius: 6, borderTopRightRadius: 14, borderBottomRightRadius: 8, borderBottomLeftRadius: 12 },
  margin: { position: "absolute", left: 20, top: 0, bottom: 0, width: 1.5 },
  top: { flexDirection: "row", alignItems: "center", gap: 6 },
});
