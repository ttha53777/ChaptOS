/**
 * The event sheet: a ticket, then what's actually been posted about the event.
 *
 *   ticket       the calendar page (tilted, taped) · category · title · time and place;
 *                the stub carries Required as a stamp (or the category), a party's theme,
 *                and a live countdown (by the second inside a day; "2 days ago" once past)
 *   agenda       the agenda the event was created with, on a legal pad
 *   where        the location, with Directions (the phone's maps app)
 *   about        the description
 *   details      ./Details (supplies claims are the one write)
 *   attendance   ./Attendance, required events only (my line, excuse filing, who came)
 *   minutes      ./Minutes, when the meeting has a saved summary
 *   nothing yet  a quiet line when none of the above exists
 *
 * A deadline (a dated task folded into the timeline) opens a peach ticket instead: who
 * it's on, a countdown to the due time, and the tick footer. Ticking here is the same write
 * as Today's plate and Tasks (~/tasks/tick), so it ticks there too.
 *
 * Motion: the ticket drops in (rises 14pt and settles from -2deg) as the sheet lands, and
 * each section after it rises 12pt and fades, 60ms apart. Switching events replays it.
 * Reduced: everything fades in together. Transform and opacity only.
 *
 * Both read the row live from the cache, so writes update the sheet in place.
 */
import type { Brother, CalEventType, CalendarEvent, InstagramPost, Task } from "@/lib/api-types";
import type { ReactNode } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { withDelay, withTiming } from "react-native-reanimated";
import { useCalendarFeed } from "~/data/calendar";
import { Icon, type IconName } from "~/icons/Icon";
import { DUR } from "~/motion/motion";
import { Button } from "~/paper/Button";
import { Pill, Tape } from "~/paper/bits";
import { Ticket } from "~/paper/Ticket";
import { TickingNumber } from "~/paper/TickingNumber";
import { Sheet } from "~/shell/sheets";
import { ErrorState, SkeletonCard } from "~/shell/states";
import { canTick, whoLine, type Viewer } from "~/tasks/model";
import { tickTask } from "~/tasks/tick";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme, type Motion } from "~/theme/PaperProvider";
import { useNow } from "~/today/live";
import { clockLabel, countdown, daysFrom, dayStart, startOf } from "~/today/time";
import { agendaLines } from "~/today/UpNext";
import { T } from "~/ui/T";
import { AttendanceBlock } from "./Attendance";
import { Details, hasDetails } from "./Details";
import { Minutes } from "./Minutes";
import { inkOf, labelOf, toneOf } from "./model";

/** What an officer can do from the sheet (the web rail's Edit / Delete / Log attendance). */
export interface SheetOfficer {
  canEdit: boolean; canDelete: boolean; canLog: boolean;
  onEdit: () => void; onDelete: () => void; onLog: () => void;
}

/** Where the event came from, when another page owns it ("Open in Parties →"). */
export interface SheetLinks { party?: () => void; fundraiser?: () => void; programming?: () => void; media?: () => void }

export function EventSheet({ event, task, post, types, viewer, today, roster, officer, links, linkedPosts, managed, onClose }: {
  event: CalendarEvent | null; task: Task | null; post?: InstagramPost | null; types: CalEventType[] | undefined; viewer: Viewer; today: string;
  roster: Map<number, Brother>; officer?: SheetOfficer | null; links?: SheetLinks; linkedPosts?: InstagramPost[];
  /** Folded in from another list (a task, a post, a legacy deadline row): edited there, not here. */
  managed?: boolean;
  onClose: () => void;
}) {
  const open = event != null || task != null || post != null;
  const slug = event ? event.category : "deadline";
  const title = event?.title ?? task?.title ?? post?.title;
  const actions = event && officer?.canEdit ? (
    <View style={{ flexDirection: "row", gap: 6 }}>
      <HeadIcon icon="pencil" label="Edit event" onPress={officer.onEdit} />
      {officer.canDelete ? <HeadIcon icon="trash" label="Delete event" danger onPress={officer.onDelete} /> : null}
    </View>
  ) : undefined;
  return (
    <Sheet open={open} onClose={onClose} size="tall" tone={toneOf(slug)} kicker={post ? "Media post" : labelOf(slug, types)}
      icon={event ? "cal" : post ? "camera" : "flag"} accessibilityLabel={title} actions={actions}
      footer={task ? <DeadlineFooter task={task} viewer={viewer} /> : post && links?.media ? <Button label="Open in Media" icon="arrow-r" variant="ghost" block onPress={links.media} style={{ flex: 1 }} /> : undefined}>
      {event ? <EventBody key={`e${event.id}`} event={event} types={types} viewer={viewer} today={today} roster={roster} officer={officer ?? null} links={links} linkedPosts={linkedPosts} managed={!!managed} />
        : task ? <DeadlineBody key={`t${task.id}`} task={task} viewer={viewer} today={today} />
        : post ? <PostBody key={`p${post.id}`} post={post} today={today} /> : null}
    </Sheet>
  );
}

function HeadIcon({ icon, label, danger, onPress }: { icon: IconName; label: string; danger?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => [styles.headIcon, { borderColor: danger ? c.pastel.rose.border : c.line2, backgroundColor: pressed ? (danger ? c.pastel.rose.soft : c.paper2) : c.card }]}>
      <Icon name={icon} size={15} color={danger ? c.pastel.rose.ink : c.ink2} />
    </Pressable>
  );
}

/* ── motion ───────────────────────────────────────────────────────────────────── */

const LAND = 140, STEP = 60;

/** Section `i` after the ticket: rise 12pt + fade. Reduced: fade, all at once. */
function rise(m: Motion, i: number) {
  const cfg = m.timing(m.reduced ? DUR.fade : DUR.move + 60, "out");
  const delay = m.t(LAND + (m.reduced ? 0 : (i + 1) * STEP));
  const from = m.reduced ? 0 : 12;
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateY: from }] },
      animations: { opacity: withDelay(delay, withTiming(1, cfg)), transform: [{ translateY: withDelay(delay, withTiming(0, cfg)) }] },
    };
  };
}

/** The ticket: rises 14pt and settles from -2deg. Reduced: a fade. */
function drop(m: Motion) {
  const cfg = m.timing(m.reduced ? DUR.fade : 520, m.reduced ? "out" : "spring");
  const fade = m.timing(m.reduced ? DUR.fade : 260, "out");
  const delay = m.t(m.reduced ? 0 : LAND - 60);
  const y = m.reduced ? 0 : 14, r = m.reduced ? "0deg" : "-2deg";
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateY: y }, { rotate: r }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, fade)),
        transform: [{ translateY: withDelay(delay, withTiming(0, cfg)) }, { rotate: withDelay(delay, withTiming("0deg", cfg)) }],
      },
    };
  };
}

/** Wraps a body's sections so each rises in after the one before. */
function Sections({ hero, children }: { hero: ReactNode; children: ReactNode[] }) {
  const m = useMotion();
  const shown = children.filter(Boolean);
  return (
    <View style={{ gap: 20 }}>
      <Animated.View entering={drop(m)}>{hero}</Animated.View>
      {shown.map((ch, i) => <Animated.View key={i} entering={rise(m, i)}>{ch}</Animated.View>)}
    </View>
  );
}

/* ── the ticket ───────────────────────────────────────────────────────────────── */

function CalPage({ date, slug }: { date: string; slug: string }) {
  const { c } = useTheme();
  const d = dayStart(date);
  const ink = inkOf(slug, c);
  return (
    <View style={[styles.page, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `3px 3px 0 ${c.note.fill[toneOf(slug)]}` }]}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Tape width={30} rotate={-6} style={{ position: "absolute", top: -8, alignSelf: "center", zIndex: 2 }} />
      <View style={[styles.pageTop, { backgroundColor: ink }]}>
        <T v="label" color={c.card} style={{ fontSize: 9.5 }}>{d.toLocaleDateString(undefined, { month: "short" })}</T>
      </View>
      <T v="hero" style={{ fontSize: 30, lineHeight: 34 }}>{d.getDate()}</T>
      <T v="mono" color={c.ink3} style={{ fontSize: 10, marginBottom: 5 }}>{d.toLocaleDateString(undefined, { weekday: "short" })}</T>
    </View>
  );
}

function TicketHead({ date, slug, kicker, title, meta }: { date: string; slug: string; kicker: string; title: string; meta: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.head}>
      <CalPage date={date} slug={slug} />
      <View style={{ flex: 1, gap: 3 }}>
        <T v="kicker" color={inkOf(slug, c)} numberOfLines={1}>{kicker}</T>
        <T v="title" numberOfLines={3} accessibilityRole="header">{title}</T>
        {meta ? <T v="meta" color={c.ink2} numberOfLines={2}>{meta}</T> : null}
      </View>
    </View>
  );
}

/** Time to go, ticking; or how long ago. */
function Countdown({ date, time, today, done }: { date: string; time: string | null | undefined; today: string; done?: boolean }) {
  const { c } = useTheme();
  const start = startOf(date, time);
  const n = daysFrom(today, date);
  const ahead = !!start && start.getTime() > Date.now();
  const near = ahead && start!.getTime() - Date.now() < 86_400_000;
  const now = useNow(ahead && !done, near);
  const cd = start && !done ? countdown(start.getTime() - now) : null;
  let face: string, unit: string;
  if (done) { face = "Done"; unit = "ticked off"; }
  else if (cd) { face = cd.face; unit = cd.unit; }
  else if (n === 0) { face = start ? "Now" : "Today"; unit = start ? "under way" : "all day"; }
  else if (n === 1) { face = "Tmrw"; unit = "all day"; }
  else if (n > 1) { face = n < 14 ? `${n} days` : `${Math.round(n / 7)} wks`; unit = "to go"; }
  else { face = -n < 14 ? `${-n}d` : `${Math.round(-n / 7)}w`; unit = "ago"; }
  return (
    <View style={styles.cd} accessible accessibilityLabel={`${face.replace(/:/g, " ")} ${unit}`}>
      {cd ? <TickingNumber value={cd.face} v="monoLg" direction={-1} /> : <T v="monoLg" color={n < 0 && !done ? c.ink3 : c.ink}>{face}</T>}
      <T v="label" color={c.ink3}>{unit}</T>
    </View>
  );
}

function Stamp({ label, tone }: { label: string; tone: "rose" | "mint" }) {
  const { c } = useTheme();
  const ink = c.pastel[tone].ink;
  return (
    <View style={[styles.stamp, { borderColor: ink, backgroundColor: alpha(ink, 0.06) }]}>
      <T v="kicker" color={ink} style={{ fontSize: 10.5, letterSpacing: 1.4 }}>{label}</T>
    </View>
  );
}

/* ── sections ─────────────────────────────────────────────────────────────────── */

function Section({ label, children }: { label: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <T v="label" color={c.ink3} accessibilityRole="header">{label}</T>
      {children}
    </View>
  );
}

/** The agenda on a legal pad: butter sheet, a rose margin rule, blue lines. */
function Agenda({ lines }: { lines: string[] }) {
  const { c } = useTheme();
  return (
    <Section label="Agenda">
      <View style={[styles.pad, { backgroundColor: c.note.fill.butter, borderColor: c.pastel.butter.border }, { boxShadow: `3px 3px 0 ${c.pastel.butter.border}` }]}>
        <View style={[styles.margin, { backgroundColor: alpha(c.pastel.rose.ink, 0.45) }]} />
        {lines.map((l, i) => (
          <View key={i} style={[styles.padLine, i < lines.length - 1 && { borderBottomWidth: 1, borderBottomColor: alpha(c.pastel.sky.ink, 0.22) }]}>
            <T v="mono" color={c.pastel.rose.ink} style={styles.padNum}>{i + 1}</T>
            <T v="callout" color={c.ink} style={{ flex: 1 }}>{l}</T>
          </View>
        ))}
      </View>
    </Section>
  );
}

const mapsUrl = (q: string) => Platform.OS === "ios" ? `maps://?q=${encodeURIComponent(q)}` : `geo:0,0?q=${encodeURIComponent(q)}`;

function Where({ place }: { place: string }) {
  const { c } = useTheme();
  return (
    <Section label="Where">
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        <View style={[styles.icon, { backgroundColor: c.note.fill.sky }]}><Icon name="pin" size={16} color={c.pastel.sky.ink} /></View>
        <T v="callout" style={{ flex: 1 }} selectable>{place}</T>
        <Button label="Directions" size="sm" variant="ghost" tone="sky"
          onPress={() => { void Linking.openURL(mapsUrl(place)).catch(() => undefined); }} />
      </View>
    </Section>
  );
}

function About({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <Section label="About">
      <View style={[styles.about, { borderLeftColor: c.line2 }]}><T v="body" color={c.ink2}>{text}</T></View>
    </Section>
  );
}

function Quiet({ icon, line }: { icon: IconName; line: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.quiet, { borderColor: c.line2 }]}>
      <Icon name={icon} size={16} color={c.ink3} />
      <T v="meta" color={c.ink3} style={{ flex: 1 }}>{line}</T>
    </View>
  );
}

/* ── event ────────────────────────────────────────────────────────────────────── */

function EventBody({ event, types, viewer, today, roster, officer, links, linkedPosts, managed }: {
  event: CalendarEvent; types: CalEventType[] | undefined; viewer: Viewer; today: string; roster: Map<number, Brother>;
  officer: SheetOfficer | null; links?: SheetLinks; linkedPosts?: InstagramPost[]; managed: boolean;
}) {
  const { c } = useTheme();
  const clock = clockLabel(event.time);
  const day = dayStart(event.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const label = labelOf(event.category, types);
  const agenda = agendaLines(event);
  const desc = event.description?.trim() || null;
  const details = hasDetails(event.details);
  const anything = agenda.length || desc || details || event.mandatory || event.notesSummaryAt || event.location;

  const hero = (
    <Ticket tone={toneOf(event.category)} ground={c.card}
      body={<TicketHead date={event.date} slug={event.category} kicker={label} title={event.title} meta={clock ? `${day} · ${clock}` : day} />}
      stub={
        <View style={styles.stub}>
          <View style={{ flex: 1, gap: 6, alignItems: "flex-start" }}>
            {event.mandatory ? <Stamp label="Required" tone="rose" /> : <Pill label={label} tone={toneOf(event.category)} dot />}
            {event.partyTheme ? <T v="meta" color={c.ink2} numberOfLines={1}>Theme: {event.partyTheme}</T> : null}
            {event.partyCollabOrg ? <T v="meta" color={c.ink3} numberOfLines={1}>With {event.partyCollabOrg}</T> : null}
          </View>
          <Countdown date={event.date} time={event.time} today={today} />
        </View>
      } />
  );

  return (
    <Sections hero={hero}>
      {[
        agenda.length ? <Agenda key="agenda" lines={agenda} /> : null,
        event.location ? <Where key="where" place={event.location} /> : null,
        desc ? <About key="about" text={desc} /> : null,
        details ? <Details key="details" event={event} meId={viewer.id} roster={roster} /> : null,
        links?.party || links?.fundraiser || links?.programming ? <SourceLinks key="src" links={links} /> : null,
        linkedPosts?.length ? <LinkedPosts key="posts" posts={linkedPosts} onOpen={links?.media} /> : null,
        event.mandatory && officer?.canLog ? <TakeRow key="log" past={event.date < today} onPress={officer.onLog} /> : null,
        event.mandatory ? <AttendanceBlock key="att" event={event} meId={viewer.id} today={today} /> : null,
        event.notesSummaryAt ? <Minutes key="min" eventId={event.id} meId={viewer.id} /> : null,
        !anything ? <Quiet key="quiet" icon="note" line="That's everything posted so far. An agenda, details and minutes show up here when officers add them." /> : null,
        managed ? <T key="managed" v="meta" color={c.ink3} style={{ fontStyle: "italic" }}>Managed from its source list — edit there to update.</T> : null,
      ]}
    </Sections>
  );
}

function SourceLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed }) => [styles.link, { borderColor: c.line2, backgroundColor: pressed ? c.paper2 : c.card }]}>
      <T v="callout" color={c.ink} style={{ fontWeight: "600", flex: 1 }}>{label}</T>
      <Icon name="arrow-r" size={15} color={c.ink2} />
    </Pressable>
  );
}

function SourceLinks({ links }: { links: SheetLinks }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {links.party ? <SourceLink label="Open in Parties" onPress={links.party} /> : null}
      {links.fundraiser ? <SourceLink label="Open in Fundraisers" onPress={links.fundraiser} /> : null}
      {links.programming ? <SourceLink label="Open in Programming" onPress={links.programming} /> : null}
    </View>
  );
}

function LinkedPosts({ posts, onOpen }: { posts: InstagramPost[]; onOpen?: () => void }) {
  const { c } = useTheme();
  return (
    <Section label="Media posts">
      <View style={[styles.postList, { borderColor: c.line, backgroundColor: c.card }]}>
        {posts.map((p, i) => (
          <Pressable key={p.id} onPress={onOpen} disabled={!onOpen} accessibilityRole="button"
            style={({ pressed }) => [styles.postRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.lineSoft }, pressed && { backgroundColor: c.paper2 }]}>
            <View style={[styles.postType, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}><T v="mono" size={10} color={c.pastel.lilac.ink}>{p.type.toUpperCase()}</T></View>
            <T v="callout" numberOfLines={1} style={{ flex: 1 }}>{p.title}</T>
            <T v="mono" size={11} color={c.ink3}>{dayStart(p.dueDate).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}</T>
          </Pressable>
        ))}
      </View>
    </Section>
  );
}

/** An officer's way into the roll call for a required event. */
function TakeRow({ past, onPress }: { past: boolean; onPress: () => void }) {
  return <Button label={past ? "Log attendance" : "Take attendance"} icon="check" variant="ghost" tone="sky" block onPress={onPress} />;
}

/* ── media post ───────────────────────────────────────────────────────────────── */

function PostBody({ post, today }: { post: InstagramPost; today: string }) {
  const { c } = useTheme();
  const done = post.status === "posted";
  const day = dayStart(post.dueDate).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const hero = (
    <Ticket tone="peach" ground={c.card}
      body={<TicketHead date={post.dueDate} slug="deadline" kicker={`Instagram ${post.type}`} title={post.title} meta={`Due ${day}`} />}
      stub={
        <View style={styles.stub}>
          <View style={{ flex: 1, gap: 6, alignItems: "flex-start" }}>
            {done ? <Stamp label="Posted" tone="mint" /> : <Pill label="Deadline" tone="peach" dot />}
            <T v="meta" color={c.ink2}>{`Status: ${post.status}`}</T>
          </View>
          <Countdown date={post.dueDate} time={null} today={today} done={done} />
        </View>
      } />
  );
  return (
    <Sections hero={hero}>
      {[<T key="managed" v="meta" color={c.ink3} style={{ fontStyle: "italic" }}>Managed from its source list — edit there to update.</T>]}
    </Sections>
  );
}

/* ── deadline ─────────────────────────────────────────────────────────────────── */

function DeadlineBody({ task, viewer, today }: { task: Task; viewer: Viewer; today: string }) {
  const { c } = useTheme();
  const done = task.status === "done";
  const clock = clockLabel(task.dueTime);
  const day = dayStart(task.dueDate!).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const hero = (
    <Ticket tone="peach" ground={c.card}
      body={<TicketHead date={task.dueDate!} slug="deadline" kicker="Deadline" title={task.title} meta={clock ? `Due ${day} · ${clock}` : `Due ${day}`} />}
      stub={
        <View style={styles.stub}>
          <View style={{ flex: 1, gap: 6, alignItems: "flex-start" }}>
            {done ? <Stamp label="Done" tone="mint" /> : <Pill label="Deadline" tone="peach" dot />}
            <View style={styles.who}>
              <Icon name="people" size={14} color={c.ink3} />
              <T v="meta" color={c.ink2} numberOfLines={2} style={{ flexShrink: 1 }}>{whoLine(task, viewer)}</T>
            </View>
          </View>
          <Countdown date={task.dueDate!} time={task.dueTime} today={today} done={done} />
        </View>
      } />
  );
  return (
    <Sections hero={hero}>
      {[
        task.notes ? <About key="note" text={task.notes} /> : null,
        <Quiet key="how" icon="flag" line={canTick(task, viewer) ? "It's a task. Ticking it here ticks it on Today and in Tasks." : "It's a task for someone else. It shows here so the date's on everyone's radar."} />,
      ]}
    </Sections>
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
export function SubscribeSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: () => void }) {
  const { c } = useTheme();
  const q = useCalendarFeed(open);
  const url = q.data?.enabled ? q.data.url : null;
  const go = (href: string) => { void Linking.openURL(href).then(() => { onAdded?.(); onClose(); }, () => undefined); };
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
  headIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  link: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5 },
  postList: { borderRadius: 14, borderWidth: 1.5, overflow: "hidden" },
  postRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  postType: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, borderWidth: 1 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16 },
  page: { width: 64, alignItems: "center", borderWidth: 1.5, borderRadius: 10, transform: [{ rotate: "-3deg" }], marginTop: 2 },
  pageTop: { alignSelf: "stretch", alignItems: "center", paddingVertical: 3, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  stub: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 },
  cd: { alignItems: "flex-end", gap: 2, minWidth: 84 },
  stamp: { paddingHorizontal: 9, paddingVertical: 3, borderWidth: 2, borderRadius: 6, transform: [{ rotate: "-4deg" }] },
  who: { flexDirection: "row", alignItems: "center", gap: 6 },
  pad: { borderWidth: 1.5, borderRadius: 12, paddingLeft: 44, paddingRight: 14, paddingVertical: 4, overflow: "hidden" },
  margin: { position: "absolute", left: 34, top: 0, bottom: 0, width: 1.5 },
  padLine: { flexDirection: "row", alignItems: "baseline", paddingVertical: 9, gap: 0 },
  padNum: { position: "absolute", left: -32, width: 20, textAlign: "right", fontSize: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1.5 },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  about: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 2 },
  quiet: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" },
});
