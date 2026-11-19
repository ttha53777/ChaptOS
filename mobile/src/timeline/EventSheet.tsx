/**
 * The event sheet (mock `.evh`): a tilted calendar page with the date, the category and
 * Required tags, when / where / how far off, the description, then in order:
 *   details      ./Details (supplies claims are the one write)
 *   attendance   ./Attendance, required events only (my line, excuse filing, who came)
 *   minutes      ./Minutes, when the meeting has a saved summary
 *
 * A deadline (a dated task folded into the timeline) opens the same sheet with a deadline
 * box instead: ticking it here is the same write as Today's plate and Tasks (~/tasks/tick),
 * so it ticks there too.
 *
 * Both read the row live from the cache, so writes update the sheet in place.
 */
import type { Brother, CalEventType, CalendarEvent, Task } from "@/lib/api-types";
import { Linking, StyleSheet, View } from "react-native";
import { useCalendarFeed } from "~/data/calendar";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Pill, Tape } from "~/paper/bits";
import { Sheet } from "~/shell/sheets";
import { ErrorState, SkeletonCard } from "~/shell/states";
import { canTick, whoLine, type Viewer } from "~/tasks/model";
import { tickTask } from "~/tasks/tick";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { clockLabel, dayStart } from "~/today/time";
import { T } from "~/ui/T";
import { AttendanceBlock } from "./Attendance";
import { Details, hasDetails } from "./Details";
import { Minutes } from "./Minutes";
import { inkOf, labelOf, relWords, toneOf, whenLabel } from "./model";

export function EventSheet({ event, task, types, viewer, today, roster, onClose }: {
  event: CalendarEvent | null; task: Task | null; types: CalEventType[] | undefined; viewer: Viewer; today: string;
  roster: Map<number, Brother>; onClose: () => void;
}) {
  const open = event != null || task != null;
  const slug = event ? event.category : "deadline";
  const title = event?.title ?? task?.title;
  return (
    <Sheet open={open} onClose={onClose} size="tall" tone={toneOf(slug)} kicker={labelOf(slug, types)} title={title}
      icon={event ? "cal" : "flag"} footer={task ? <DeadlineFooter task={task} viewer={viewer} /> : undefined}>
      {event ? <EventBody event={event} types={types} viewer={viewer} today={today} roster={roster} />
        : task ? <DeadlineBody task={task} viewer={viewer} today={today} roster={roster} /> : null}
    </Sheet>
  );
}

/* ── the calendar page ────────────────────────────────────────────────────────── */

function CalPage({ date, slug }: { date: string; slug: string }) {
  const { c } = useTheme();
  const d = dayStart(date);
  const ink = inkOf(slug, c);
  return (
    <View style={[styles.page, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `3px 3px 0 ${alpha(c.ink, 0.9)}` }]}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Tape width={34} rotate={-6} style={{ position: "absolute", top: -9, alignSelf: "center" }} />
      <View style={[styles.pageTop, { backgroundColor: ink }]}>
        <T v="label" color={c.card} style={{ fontSize: 10 }}>{d.toLocaleDateString(undefined, { month: "short" })}</T>
      </View>
      <T v="hero" style={{ fontSize: 32, lineHeight: 36 }}>{d.getDate()}</T>
      <T v="mono" color={c.ink3} style={{ fontSize: 10, marginBottom: 6 }}>{d.toLocaleDateString(undefined, { weekday: "short" })}</T>
    </View>
  );
}

function Fact({ icon, children }: { icon: "clock" | "pin" | "cal" | "people"; children: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={15} color={c.ink3} />
      <T v="callout" color={c.ink2} style={{ flex: 1 }}>{children}</T>
    </View>
  );
}

/* ── event ────────────────────────────────────────────────────────────────────── */

function EventBody({ event, types, viewer, today, roster }: {
  event: CalendarEvent; types: CalEventType[] | undefined; viewer: Viewer; today: string; roster: Map<number, Brother>;
}) {
  const { c } = useTheme();
  const clock = clockLabel(event.time);
  const day = dayStart(event.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <View style={{ gap: 22 }}>
      <View style={styles.hero}>
        <CalPage date={event.date} slug={event.category} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={styles.tags}>
            <Pill label={labelOf(event.category, types)} tone={toneOf(event.category)} dot />
            {event.mandatory ? <Pill label="Required" tone="rose" /> : null}
          </View>
          <View style={{ gap: 4 }}>
            <Fact icon="clock">{clock ? `${day} · ${clock}` : day}</Fact>
            {event.location ? <Fact icon="pin">{event.location}</Fact> : null}
            <T v="meta" color={c.ink3} style={{ paddingLeft: 23 }}>{relWords(event.date, today).replace(/^\w/, ch => ch.toUpperCase())}</T>
          </View>
        </View>
      </View>

      {event.description ? <T v="body" color={c.ink2}>{event.description}</T> : null}
      {hasDetails(event.details) ? <Details event={event} meId={viewer.id} roster={roster} /> : null}
      {event.mandatory ? <AttendanceBlock event={event} meId={viewer.id} today={today} /> : null}
      {event.notesSummaryAt ? <Minutes eventId={event.id} meId={viewer.id} /> : null}
    </View>
  );
}

/* ── deadline ─────────────────────────────────────────────────────────────────── */

function DeadlineBody({ task, viewer, today, roster }: { task: Task; viewer: Viewer; today: string; roster: Map<number, Brother> }) {
  const { c } = useTheme();
  const done = task.status === "done";
  void roster;
  return (
    <View style={{ gap: 22 }}>
      <View style={styles.hero}>
        <CalPage date={task.dueDate!} slug="deadline" />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={styles.tags}>
            <Pill label="Deadline" tone="peach" dot />
            {done ? <Pill label="Done" tone="mint" /> : null}
          </View>
          <Fact icon="clock">{whenLabel({ kind: "deadline", key: "", date: task.dueDate!, task }, today)}</Fact>
          <Fact icon="people">{whoLine(task, viewer)}</Fact>
        </View>
      </View>
      {task.notes ? <T v="body" color={c.ink2}>{task.notes}</T> : null}
      <View style={[styles.box, { borderColor: c.pastel.peach.border, backgroundColor: c.pastel.peach.soft }]}>
        <Icon name="flag" size={16} color={c.pastel.peach.ink} />
        <T v="meta" color={c.ink2} style={{ flex: 1 }}>
          {canTick(task, viewer) ? "It's a task. Ticking it here ticks it on Today and in Tasks." : "It's a task for someone else. It shows here so the date's on everyone's radar."}
        </T>
      </View>
    </View>
  );
}

function DeadlineFooter({ task, viewer }: { task: Task; viewer: Viewer }) {
  const { c } = useTheme();
  if (!canTick(task, viewer)) return <T v="meta" color={c.ink3} style={{ flex: 1 }}>Only the people on it can tick this off.</T>;
  const each = task.everyone === "each";
  return task.status === "done"
    ? <Button label={each ? "Undo my part" : "Reopen"} icon="refresh" variant="ghost" tone="butter" block onPress={() => tickTask(task, false)} style={{ flex: 1 }} />
    : <Button label={each ? "Done my part" : "Done"} icon="check" tone="mint" block onPress={() => tickTask(task, true)} style={{ flex: 1 }} />;
}

/* ── Add to Calendar ──────────────────────────────────────────────────────────── */

/**
 * GET /api/calendar/subscription?view=member. When the chapter's feed is on: open it in
 * the phone's calendar app (webcal:) or in Google Calendar's add-by-URL screen. The URL is
 * a secret, so it's never shown as text. When it's off, say who can turn it on.
 */
export function SubscribeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const q = useCalendarFeed(open);
  const url = q.data?.enabled ? q.data.url : null;
  const go = (href: string) => { haptics.tap(); void Linking.openURL(href).then(onClose, () => undefined); };
  return (
    <Sheet open={open} onClose={onClose} title="Add to your calendar" kicker="Calendar feed" tone="sky" icon="cal"
      footer={url ? (
        <View style={{ flex: 1, gap: 8 }}>
          <Button label="Open in Calendar" icon="cal" tone="sky" block onPress={() => go(url.replace(/^https?:/, "webcal:"))} />
          <Button label="Add to Google Calendar" icon="out" variant="ghost" block
            onPress={() => go(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https?:/, "webcal:"))}`)} />
        </View>
      ) : undefined}>
      {q.isPending ? <SkeletonCard lines={2} title={false} />
        : q.isError ? <ErrorState compact title="Couldn't load the feed." error={q.error} onRetry={() => void q.refetch()} />
        : url ? (
          <View style={{ gap: 10 }}>
            <T v="body">Every {q.data.orgName} event and deadline, in the calendar app you already use. It keeps itself up to date.</T>
            <T v="meta" color={c.ink3}>The link is personal to the chapter. Don't post it anywhere public.</T>
          </View>
        ) : (
          <T v="body" color={c.ink2}>
            {q.data.available ? "Your chapter hasn't turned the calendar feed on yet. An officer can turn it on from Timeline on the web."
              : "The calendar feed isn't available for your chapter yet."}
          </T>
        )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  page: { width: 76, alignItems: "center", borderWidth: 1.5, borderRadius: 10, overflow: "visible", transform: [{ rotate: "-3deg" }], marginTop: 6 },
  pageTop: { alignSelf: "stretch", alignItems: "center", paddingVertical: 4, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fact: { flexDirection: "row", alignItems: "center", gap: 8 },
  box: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" },
});
