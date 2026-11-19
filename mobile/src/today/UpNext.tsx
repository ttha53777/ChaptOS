/**
 * Up next (web `_design/Up Next`, mock `.tonight`): the next Timeline entry as a ticket.
 *
 *   body   date stub (ink tile) · kicker · title · time and place · Mandatory
 *   stub   agenda peek (the agenda the event was created with, first three lines)
 *          · live countdown in mono figures
 *
 * The countdown ticks every second inside a day (by the minute beyond), and only the
 * digit that changed rolls down (TickingNumber, direction −1). Reduced: that digit
 * cross-fades. Events with no clock time (or one that doesn't parse) say the day
 * instead of counting. "After that" lists the next two, smaller.
 *
 * Event detail is U4 (Timeline); until then the ticket and rows open the Timeline tab.
 */
import type { CalendarEvent } from "@/lib/api-types";
import { Pressable, StyleSheet, View } from "react-native";
import { Pill } from "~/paper/bits";
import { Ticket } from "~/paper/Ticket";
import { TickingNumber } from "~/paper/TickingNumber";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { useNow } from "./live";
import { clockLabel, countdown, dayStart, daysFrom, relDay, startOf } from "./time";

/** The agenda lines a member would recognise: numbering and bullets stripped, blanks dropped. */
function agendaLines(e: CalendarEvent): string[] {
  const src = e.notesSeed ?? "";
  return src.split("\n").map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^#+\s*/, "").trim()).filter(Boolean);
}

export function UpNextTicket({ event, today, onPress }: { event: CalendarEvent; today: string; onPress?: () => void }) {
  const { c } = useTheme();
  const start = startOf(event.date, event.time);
  const n = daysFrom(today, event.date);
  // Tick by the second only inside a day of a timed start.
  const near = !!start && start.getTime() - Date.now() < 86_400_000;
  const now = useNow(!!start, near);
  const left = start ? start.getTime() - now : null;
  const cd = left != null ? countdown(left) : null;

  const d = dayStart(event.date);
  const dow = d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  const when = n === 0 ? "Tonight" : relDay(today, event.date);
  const meta = [clockLabel(event.time), event.location].filter(Boolean).join("  ·  ");
  const agenda = agendaLines(event);
  const desc = !agenda.length && event.description ? event.description.trim() : null;

  const startedToday = left != null && left <= 0 && n === 0;
  const a11yCount = cd ? `Starts in ${cd.face.replace(/:/g, " ")}` : startedToday ? "Under way" : when;

  const body = (
    <View style={styles.top}>
      <View style={[styles.date, { backgroundColor: c.ink }]}>
        <T v="kicker" color={c.paper} style={{ opacity: 0.75, letterSpacing: 1 }}>{dow}</T>
        <T v="title" color={c.paper} style={{ fontSize: 26, lineHeight: 28 }}>{String(d.getDate())}</T>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T v="kicker" color={c.pastel.lilac.ink}>{`Up next · ${n === 0 ? "today" : when}`}</T>
        <T v="title" numberOfLines={2}>{event.title}</T>
        {meta ? <T v="meta" color={c.ink3} numberOfLines={1}>{meta}</T> : null}
        {event.mandatory ? <View style={{ marginTop: 4 }}><Pill label="Mandatory" tone="peach" /></View> : null}
      </View>
    </View>
  );

  const stub = (
    <View style={styles.stub}>
      <View style={{ flex: 1, gap: 3 }}>
        {agenda.length ? (
          <>
            <T v="label" color={c.ink3}>Agenda</T>
            {agenda.slice(0, 3).map((l, i) => (
              <T key={i} v="meta" color={c.ink2} numberOfLines={1}>{`${i + 1}. ${l}`}</T>
            ))}
            {agenda.length > 3 ? <T v="meta" color={c.ink3}>{`+${agenda.length - 3} more`}</T> : null}
          </>
        ) : desc ? (
          <T v="meta" color={c.ink2} numberOfLines={3}>{desc}</T>
        ) : (
          <T v="meta" color={c.ink3}>No agenda yet.</T>
        )}
      </View>
      <View style={styles.cd} accessible accessibilityLabel={a11yCount}>
        {cd ? (
          <>
            <TickingNumber value={cd.face} v="monoLg" direction={-1} />
            <T v="label" color={c.ink3}>{cd.unit}</T>
          </>
        ) : (
          <>
            <T v="monoLg">{startedToday ? "Now" : when}</T>
            <T v="label" color={c.ink3}>{startedToday ? "under way" : n === 0 ? "today" : "all day"}</T>
          </>
        )}
      </View>
    </View>
  );

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Up next: ${event.title}, ${when}${meta ? `, ${meta}` : ""}. ${a11yCount}.`}
      accessibilityHint="Opens the Timeline" style={({ pressed }) => pressed && { transform: [{ translateY: 1 }] }}>
      <Ticket tone="lilac" body={body} stub={stub} />
    </Pressable>
  );
}

export function AfterThat({ events, today, onPress }: { events: CalendarEvent[]; today: string; onPress?: () => void }) {
  const { c } = useTheme();
  if (!events.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <T v="label" color={c.ink3}>After that</T>
      {events.map(e => {
        const d = dayStart(e.date);
        return (
          <Pressable key={e.id} onPress={onPress} accessibilityRole="button"
            accessibilityLabel={`${e.title}, ${relDay(today, e.date)}${e.time ? `, ${clockLabel(e.time)}` : ""}`}
            style={({ pressed }) => [styles.after, { borderColor: c.line, backgroundColor: c.card }, pressed && { opacity: 0.85 }]}>
            <View style={[styles.mini, { borderColor: c.line2 }]}>
              <T v="kicker" color={c.ink3}>{d.toLocaleDateString(undefined, { weekday: "short" })}</T>
              <T v="subhead">{String(d.getDate())}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T v="callout" numberOfLines={1}>{e.title}</T>
              <T v="meta" color={c.ink3} numberOfLines={1}>{[relDay(today, e.date), clockLabel(e.time), e.location].filter(Boolean).join(" · ")}</T>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 },
  date: { width: 56, alignItems: "center", borderRadius: 14, paddingTop: 6, paddingBottom: 7, transform: [{ rotate: "-3deg" }] },
  stub: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 },
  cd: { alignItems: "flex-end", gap: 2, minWidth: 88 },
  after: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5 },
  mini: { width: 44, alignItems: "center", paddingVertical: 4, borderRadius: 10, borderWidth: 1.5 },
});
