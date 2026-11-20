/**
 * Media's sheets (the web page's detail rail, Add post composer and delete confirm,
 * app/org/[slug]/media), on the phone:
 *
 *   PostSheet   "Post detail": the snapshot on its taped stage (POSTED stamped once it's
 *               up), the format chip, title, due pill, then Timing · Posted on · Scheduled
 *               for / Due date · Format (with its hint) · Promoting (opens the Timeline's
 *               own sheet). Officers change a date in place (tap it: the day strip opens
 *               and the pick saves at once, as the web's date input does), and get Mark
 *               posted (plays ~/moments/Posted), Edit, and the trash button
 *   PostForm    "Add post" / "Edit post": Post title, the three format cards (a retired
 *               format offers "Keep X"), Due date, Posting date once it's posted, and the
 *               Linked event (non-deadline events from two weeks back, in the feed's order)
 *   DeletePost  the web's confirm, word for word
 *
 * Every write is MANAGE_INSTAGRAM; members see PostSheet read-only. A refused save keeps
 * the sheet open with the server's words inline and in a toast, as the web does.
 */
import type { CalendarEvent, InstagramPost } from "@/lib/api-types";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { errorMessage } from "~/api/errors";
import { createPost, deletePost, patchPost, type PostPatch } from "~/data/media";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { DayStrip } from "~/meetings/EventForm";
import { PostedPrint, type PostedPhase } from "~/moments/Posted";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { TrBtn } from "~/treasury/bits";
import { Field } from "~/ui/Field";
import { T } from "~/ui/T";
import { DuePill, FormatChip, Snap } from "./bits";
import {
  canManage, deleteMessage, eventOption, FORMAT_HINTS, FORMATS, formatTone, instagramDate, instagramLane, isFormat, mediaToday, newDraft, postedOn, promotable, SAY, timingLine,
} from "./model";

export function useMediaBits() {
  const me = useEntryOf("ready")?.me ?? null;
  return { me, today: mediaToday(me?.org?.timeZone), term: me?.org?.activeTerm ?? null, officer: !!me && canManage(me) };
}

function Err({ text, retry }: { text: string | null; retry?: () => void }) {
  const { c } = useTheme();
  if (!text) return null;
  return (
    <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">
      {text}
      {retry ? <T v="meta" color={c.pastel.rose.ink} onPress={retry} accessibilityRole="button" style={{ textDecorationLine: "underline" }}> Try again</T> : null}
    </T>
  );
}

const failText = (e: unknown) => errorMessage(e, SAY.fail);

/* ── PostSheet ────────────────────────────────────────────────────────────────── */

export function PostSheet({ post, events, eventsError, onRetryEvents, onClose, onEdit, onDelete, onTimeline }: {
  post: InstagramPost | null;
  events: CalendarEvent[];
  eventsError?: boolean;
  onRetryEvents?: () => void;
  onClose: () => void;
  onEdit: (p: InstagramPost) => void;
  onDelete: (p: InstagramPost) => void;
  onTimeline: (eventId: number) => void;
}) {
  const { c } = useTheme();
  const { today, term, officer } = useMediaBits();
  const [last, setLast] = useState<InstagramPost | null>(null);
  const [phase, setPhase] = useState<PostedPhase>("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState<"due" | "posted" | null>(null);
  useEffect(() => { if (post) setLast(post); }, [post]);
  // a fresh open shows the post as it is; a mark-posted in flight keeps its own phase
  useEffect(() => { if (post) { setPhase(post.status === "posted" ? "shown" : "idle"); setErr(null); setPicking(null); setBusy(false); } }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = post ?? last;
  if (!p) return <Sheet open={false} onClose={onClose} />;
  const posted = p.status === "posted";
  const ev = p.calendarEventId == null ? null : events.find(e => e.id === p.calendarEventId) ?? null;
  const locked = busy || phase === "posting";

  const save = (patch: PostPatch, say: string) => {
    setBusy(true); setErr(null);
    patchPost(p.id, patch).then(
      () => { setBusy(false); haptics.success(); toast.show(say); },
      e => { setBusy(false); haptics.error(); const t = failText(e); setErr(t); toast.error(t); },
    );
  };
  const markPosted = () => {
    setPhase("posting"); setErr(null);
    patchPost(p.id, { status: "posted" }).then(
      () => { setPhase("posted"); toast.show(SAY.posted); },
      e => { haptics.error(); setPhase("idle"); const t = failText(e); setErr(t); toast.error(t); },
    );
  };
  const pickDate = (which: "due" | "posted", value: string, date: string) => {
    setPicking(null);
    if (date === value) return;
    if (which === "due") save({ dueDate: date }, SAY.moved(date));
    else save({ postedDate: date }, SAY.postedDate);
  };

  const dateRow = (which: "due" | "posted", label: string, value: string) => (
    <View style={[styles.fact, { borderBottomColor: c.line }]}>
      <View style={styles.factRow}>
        <T v="kicker" size={10.5} color={c.ink3} style={styles.dt}>{label}</T>
        {officer ? (
          <Pressable onPress={() => setPicking(x => (x === which ? null : which))} disabled={locked} accessibilityRole="button"
            accessibilityLabel={`${which === "due" ? "Change due date" : "Change posting date"}: ${instagramDate(value, true)}`}
            style={({ pressed }) => [styles.editDate, { borderBottomColor: c.ink3 }, pressed && pressedDim]}>
            <T v="callout" color={c.ink}>{instagramDate(value, true)}</T>
            <Icon name="pencil" size={12} color={c.ink3} />
          </Pressable>
        ) : <T v="callout" color={c.ink} style={{ flex: 1 }}>{instagramDate(value, true)}</T>}
      </View>
      {picking === which ? (
        <View style={{ marginTop: 10 }}>
          <DayStrip value={value} onChange={d => pickDate(which, value, d)} today={today} term={term} usualDow={null} taken={new Set()} editing open />
        </View>
      ) : null}
    </View>
  );

  return (
    <Sheet open={!!post} onClose={onClose} locked={locked} size="tall" tone={formatTone(p.type) ?? "lilac"} icon="camera" title="Post detail"
      footer={officer ? (
        <View style={styles.foot}>
          {!posted ? <TrBtn label={phase === "posting" ? "Saving…" : "Mark posted"} icon="check" onPress={markPosted} disabled={locked} /> : null}
          <View style={{ flex: 1 }}><TrBtn kind="card" tone="lilac" block label="Edit" icon="pencil" onPress={() => onEdit(p)} disabled={locked} /></View>
          <Pressable onPress={() => onDelete(p)} disabled={locked} accessibilityRole="button" accessibilityLabel="Delete post"
            style={({ pressed }) => [styles.trash, { borderColor: c.pastel.rose.border, backgroundColor: c.card }, pressed && pressedDim]}>
            <Icon name="trash" size={16} color={c.pastel.rose.ink} />
          </Pressable>
        </View>
      ) : undefined}>
      <View style={{ gap: 14 }}>
        <View style={[styles.stage, { backgroundColor: c.paper2, borderColor: c.line }]}>
          <View style={[styles.tape, { backgroundColor: c.note.fill.butter }]} />
          <PostedPrint type={p.type} phase={phase} onImpact={() => haptics.success()} />
        </View>

        <View style={{ alignItems: "flex-start", gap: 8 }}>
          <FormatChip type={p.type} />
          <T v="title" size={24} accessibilityRole="header">{p.title}</T>
          <DuePill post={p} today={today} />
        </View>

        <View>
          <Fact label="Timing" value={timingLine(p, today)} />
          {posted ? dateRow("posted", "Posted on", postedOn(p)) : null}
          {dateRow("due", posted ? "Due date" : "Scheduled for", p.dueDate)}
          <View style={[styles.fact, styles.factRow, { borderBottomColor: c.line }]} accessible accessibilityLabel={`Format: ${p.type}${FORMAT_HINTS[p.type] ? ` · ${FORMAT_HINTS[p.type]}` : ""}`}>
            <T v="kicker" size={10.5} color={c.ink3} style={styles.dt}>Format</T>
            <T v="callout" color={c.ink} style={{ flex: 1 }}>{p.type}{FORMAT_HINTS[p.type] ? <T v="callout" color={c.ink3}>{` · ${FORMAT_HINTS[p.type]}`}</T> : null}</T>
          </View>
          {ev ? (
            <View style={[styles.fact, styles.factRow, { borderBottomColor: c.line }]}>
              <T v="kicker" size={10.5} color={c.ink3} style={styles.dt}>Promoting</T>
              <Pressable onPress={() => onTimeline(ev.id)} accessibilityRole="link" style={({ pressed }) => [styles.evLink, { borderColor: c.line2 }, pressed && pressedDim]}>
                <Icon name="cal" size={12} color={c.ink2} />
                <T v="callout" color={c.ink} numberOfLines={2} style={{ flexShrink: 1 }}>{eventOption(ev)}</T>
              </Pressable>
            </View>
          ) : null}
        </View>
        {eventsError && p.calendarEventId != null ? <Err text="Couldn't load the linked event." retry={onRetryEvents} /> : null}
        <Err text={err} />
      </View>
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.fact, styles.factRow, { borderBottomColor: c.line }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <T v="kicker" size={10.5} color={c.ink3} style={styles.dt}>{label}</T>
      <T v="callout" color={c.ink} style={{ flex: 1 }}>{value}</T>
    </View>
  );
}

/* ── PostForm: add / edit ─────────────────────────────────────────────────────── */

export interface PostSeed { title: string; type: string }

export function PostForm({ open, post, seed, events, eventsError, eventsLoading, onRetryEvents, onClose, onSaved }: {
  open: boolean;
  post: InstagramPost | null;
  /** Add with a title + format already in (the day-one ideas). */
  seed?: PostSeed | null;
  events: CalendarEvent[];
  eventsError?: boolean;
  eventsLoading?: boolean;
  onRetryEvents?: () => void;
  onClose: () => void;
  onSaved?: (p: InstagramPost) => void;
}) {
  const { c } = useTheme();
  const { today, term } = useMediaBits();
  const editing = !!post;
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("Story");
  const [due, setDue] = useState(today);
  const [postedDate, setPostedDate] = useState<string | null>(null);
  const [eventId, setEventId] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const d = newDraft(today, seed ?? undefined);
    setTitle(post?.title ?? d.title);
    setType(post?.type ?? d.type);
    setDue(post?.dueDate ?? d.dueDate);
    setPostedDate(post?.postedDate ?? null);
    setEventId(post?.calendarEventId ?? null);
    setChoosing(false); setBusy(false); setErr(null);
  }, [open, post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const choices = useMemo(() => promotable(events, today, eventId), [events, today, eventId]);
  const legacy = post && !isFormat(post.type) ? post.type : null;
  const current = eventId == null ? "— None —" : choices.find(e => e.id === eventId) ? eventOption(choices.find(e => e.id === eventId)!) : "Current linked event";
  const canSave = !!title.trim() && !busy;

  const go = async () => {
    if (!canSave) return;
    setBusy(true); setErr(null);
    try {
      const draft = { title: title.trim(), type, dueDate: due, calendarEventId: eventId };
      const saved = post
        ? await patchPost(post.id, { ...draft, postedDate })
        : await createPost(draft);
      haptics.success();
      onClose();
      onSaved?.(saved);
      toast.show(post ? SAY.saved : SAY.added(instagramLane(saved, today)));
    } catch (x) {
      haptics.error();
      const t = failText(x);
      setErr(t); toast.error(t);
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone="rose" icon={editing ? "pencil" : "camera"} kicker="Instagram" title={editing ? "Edit post" : "Add post"}
      footer={
        <View style={{ gap: 10 }}>
          <Err text={err} />
          {!editing ? <T v="meta" color={c.ink3}>Lands in its lane by date — and on the month view.</T> : null}
          <View style={styles.foot}>
            <View style={{ flex: 1 }}><TrBtn kind="card" tone="lilac" block label="Cancel" onPress={onClose} disabled={busy} /></View>
            <View style={{ flex: 1 }}><TrBtn block label={busy ? "Saving…" : editing ? "Save changes" : "Add post"} onPress={() => void go()} disabled={!canSave} /></View>
          </View>
        </View>
      }>
      <View style={{ gap: 20 }}>
        <Field label="Post title" value={title} onChangeText={setTitle} placeholder="Meet the brothers reel" maxLength={200} autoFocus={!editing && !seed} />

        <View style={{ gap: 8 }}>
          <T v="label" color={c.ink2}>Format</T>
          {legacy ? (
            <Pressable onPress={() => { if (type !== legacy) { haptics.select(); setType(legacy); } }} accessibilityRole="radio" accessibilityState={{ selected: type === legacy }}
              style={[styles.keep, { borderColor: type === legacy ? c.ink : c.line2, backgroundColor: type === legacy ? c.card : "transparent" }]}>
              <View style={styles.keepRow}>
                <View style={[styles.radio, { borderColor: type === legacy ? c.ink : c.line2 }]}>{type === legacy ? <View style={[styles.radioIn, { backgroundColor: c.ink }]} /> : null}</View>
                <T v="callout" color={c.ink}>{`Keep ${legacy}`}</T>
              </View>
              <T v="meta" color={c.ink3}>Choose a format below only if you want to change it.</T>
            </Pressable>
          ) : null}
          <View style={styles.formats} accessibilityRole="radiogroup">
            {FORMATS.map(f => <FormatCard key={f} type={f} on={type === f} onPress={() => { if (type !== f) { haptics.select(); setType(f); } }} />)}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <T v="label" color={c.ink2}>Due date</T>
          <DayStrip value={due} onChange={setDue} today={today} term={term} usualDow={null} taken={new Set()} editing={editing} open={open} />
        </View>

        {post?.status === "posted" ? (
          <View style={{ gap: 8 }}>
            <T v="label" color={c.ink2}>Posting date</T>
            <DayStrip value={postedDate ?? postedOn(post)} onChange={setPostedDate} today={today} term={term} usualDow={null} taken={new Set()} editing open={open} />
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <View style={styles.lbl}>
            <T v="label" color={c.ink2}>Linked event</T>
            <T v="meta" size={11.5} color={c.ink3}>— optional, the event this post promotes</T>
          </View>
          <Pressable onPress={() => setChoosing(x => !x)} disabled={eventsLoading} accessibilityRole="button" accessibilityState={{ expanded: choosing, disabled: eventsLoading }}
            style={({ pressed }) => [styles.select, { borderColor: c.line2, backgroundColor: c.card }, pressed && pressedDim]}>
            <T v="body" color={c.ink} numberOfLines={1} style={{ flex: 1 }}>{current}</T>
            <Icon name="chev-d" size={14} color={c.ink2} />
          </Pressable>
          {choosing ? (
            <View style={[styles.evList, { borderColor: c.line }]} accessibilityRole="radiogroup">
              <EventChoice label="— None —" on={eventId == null} onPress={() => { setEventId(null); setChoosing(false); }} />
              {eventId != null && !choices.some(e => e.id === eventId) ? <EventChoice label="Current linked event" on onPress={() => setChoosing(false)} /> : null}
              {choices.map(e => <EventChoice key={e.id} label={eventOption(e)} on={eventId === e.id} onPress={() => { setEventId(e.id); setChoosing(false); }} />)}
            </View>
          ) : null}
          {eventsError ? <Err text="Couldn't load events." retry={onRetryEvents} /> : null}
        </View>
      </View>
    </Sheet>
  );
}

function FormatCard({ type, on, onPress }: { type: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const tone = formatTone(type) ?? "lilac";
  const s = useSharedValue(on ? 1 : 0);
  useEffect(() => { s.value = m.reduced ? withTiming(on ? 1 : 0, m.timing(140, "out")) : on ? withSpring(1, m.spring("pop")) : withTiming(0, m.timing(160, "out")); }, [on, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const lift = useAnimatedStyle(() => (m.reduced ? {} : { transform: [{ translateY: -2 * s.value }] }));
  const shadow = useAnimatedStyle(() => ({ opacity: s.value }));
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${type}: ${FORMAT_HINTS[type]}`}>
      <Animated.View style={lift}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.cardShadow, { backgroundColor: c.note.fill[tone] }, shadow]} />
        <View style={[styles.card, { borderColor: on ? c.ink : c.line2, backgroundColor: c.card }]}>
          <View style={{ height: 50, justifyContent: "center" }}><Snap type={type} size="sm" /></View>
          <T v="callout" color={c.ink} style={{ fontWeight: "600" }}>{type}</T>
          <T v="meta" color={c.ink3} align="center" style={{ fontSize: 11 }}>{FORMAT_HINTS[type]}</T>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function EventChoice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { if (!on) haptics.select(); onPress(); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label}
      style={({ pressed }) => [styles.evRow, { borderBottomColor: c.line, backgroundColor: on ? c.pastel.lilac.soft : pressed ? c.paper2 : "transparent" }]}>
      <View style={[styles.radio, { borderColor: on ? c.ink : c.line2 }]}>{on ? <View style={[styles.radioIn, { backgroundColor: c.ink }]} /> : null}</View>
      <T v="callout" color={c.ink} numberOfLines={1} style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );
}

/* ── DeletePost ───────────────────────────────────────────────────────────────── */

export function DeletePost({ post, onClose, onDeleted }: { post: InstagramPost | null; onClose: () => void; onDeleted: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<InstagramPost | null>(null);
  useEffect(() => { if (post) { setLast(post); setBusy(false); setErr(null); } }, [post]);
  const p = post ?? last;
  const msg = p ? deleteMessage(p) : null;

  const go = async () => {
    if (!p) return;
    setBusy(true); setErr(null);
    try {
      await deletePost(p.id);
      haptics.success();
      onClose();
      onDeleted();
      toast.show(SAY.deleted(p.title));
    } catch (x) {
      haptics.error();
      setBusy(false);
      const t = failText(x);
      setErr(t); toast.error(t);
    }
  };

  return (
    <Sheet open={!!post} onClose={onClose} locked={busy} size="fit" tone="rose" icon="trash" kicker="Instagram" title="Delete post"
      footer={
        <View style={styles.foot}>
          <View style={{ flex: 1 }}><TrBtn kind="card" tone="lilac" block label="Cancel" onPress={onClose} disabled={busy} /></View>
          <Button label={busy ? "Deleting…" : "Delete"} tone="rose" block style={{ flex: 1 }} onPress={() => void go()} disabled={busy} />
        </View>
      }>
      <View style={{ gap: 10 }}>
        {msg ? <T v="body" color={c.ink2}>{msg.lead}<T v="bodyStrong" color={c.ink}>{msg.title}</T>{msg.tail}</T> : null}
        <Err text={err} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stage: { borderWidth: 1.5, borderRadius: 18, paddingVertical: 22, alignItems: "center", overflow: "visible" },
  tape: { position: "absolute", top: -8, width: 74, height: 20, opacity: 0.85, transform: [{ rotate: "-3deg" }] },
  fact: { paddingVertical: 12, borderBottomWidth: 1 },
  factRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dt: { width: 108 },
  editDate: { flexDirection: "row", alignItems: "center", gap: 6, borderBottomWidth: 1.5, borderStyle: "dashed", paddingBottom: 2 },
  evLink: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  foot: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10 },
  trash: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },

  formats: { flexDirection: "row", gap: 8 },
  card: { alignItems: "center", gap: 4, paddingVertical: 12, paddingHorizontal: 6, borderWidth: 1.5, borderRadius: 14 },
  cardShadow: { borderRadius: 14, transform: [{ translateX: 3 }, { translateY: 3 }] },
  keep: { gap: 4, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  keepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  lbl: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 6 },
  select: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, minHeight: 48 },
  evList: { borderWidth: 1.5, borderRadius: 14, overflow: "hidden" },
  evRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, minHeight: 46, borderBottomWidth: 1 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radioIn: { width: 8, height: 8, borderRadius: 4 },
});
