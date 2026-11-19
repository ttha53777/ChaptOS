/**
 * Media's sheets (the web page's detail rail, post form and confirm, on the phone):
 *
 *   PostSheet   one post: the large snapshot on its taped stage (POSTED stamped once
 *               it's up), the format chip, title, due pill, then Timing · Posted on ·
 *               Due date / Scheduled for · Format (with its hint) · Promoting (opens
 *               the Timeline's own sheet). Officers: Mark posted (plays ~/moments/Posted),
 *               Edit, Delete
 *   PostForm    add / edit: title, the three format cards (a retired format offers
 *               "Keep X"), due date (day stubs), posting date once it's posted, and the
 *               event it promotes (non-deadline events from two weeks back, nearest first)
 *   DeletePost  the web's confirm, word for word
 *   DayPosts    a month-view day with more than one post: pick which
 *
 * Every write is MANAGE_INSTAGRAM; members see PostSheet read-only.
 */
import type { CalendarEvent, InstagramPost } from "@/lib/api-types";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { errorMessage } from "~/api/errors";
import { createPost, deletePost, patchPost, type PostPatch } from "~/data/media";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon, type IconName } from "~/icons/Icon";
import { DayStrip } from "~/meetings/EventForm";
import { PostedPrint, type PostedPhase } from "~/moments/Posted";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { Field } from "~/ui/Field";
import { T } from "~/ui/T";
import { DuePill, FormatChip, Snap } from "./bits";
import {
  addDays, canManage, FORMAT_HINTS, FORMATS, formatTone, isFormat, LANE_TOAST, laneOf, mediaDate, mediaToday, postedOn, promotable, shortDay, timing,
} from "./model";

export function useMediaBits() {
  const me = useEntryOf("ready")?.me ?? null;
  return { me, today: mediaToday(me?.org?.timeZone), term: me?.org?.activeTerm ?? null, officer: !!me && canManage(me) };
}

function Err({ text }: { text: string | null }) {
  const { c } = useTheme();
  return text ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{text}</T> : null;
}

/* ── PostSheet ────────────────────────────────────────────────────────────────── */

export function PostSheet({ post, events, onClose, onEdit, onDelete, onTimeline }: {
  post: InstagramPost | null;
  events: CalendarEvent[];
  onClose: () => void;
  onEdit: (p: InstagramPost) => void;
  onDelete: (p: InstagramPost) => void;
  onTimeline: (eventId: number) => void;
}) {
  const { c } = useTheme();
  const { today, officer } = useMediaBits();
  const [last, setLast] = useState<InstagramPost | null>(null);
  const [phase, setPhase] = useState<PostedPhase>("idle");
  useEffect(() => { if (post) setLast(post); }, [post]);
  // a fresh open shows the post as it is; a mark-posted in flight keeps its own phase
  useEffect(() => { if (post) setPhase(post.status === "posted" ? "shown" : "idle"); }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = post ?? last;
  if (!p) return <Sheet open={false} onClose={onClose} />;
  const posted = p.status === "posted";
  const ev = p.calendarEventId == null ? null : events.find(e => e.id === p.calendarEventId) ?? null;
  const busy = phase === "posting";

  const markPosted = () => {
    setPhase("posting");
    patchPost(p.id, { status: "posted" }).then(
      () => { setPhase("posted"); toast.show("Marked posted", { detail: "Cadence resets to today." }); },
      e => { haptics.error(); setPhase("idle"); toast.error("Couldn't mark it posted", { detail: errorMessage(e) }); },
    );
  };

  return (
    <Sheet open={!!post} onClose={onClose} locked={busy} size="tall" tone={formatTone(p.type) ?? "lilac"} icon="camera" kicker={posted ? "On the feed" : "Content calendar"} title={p.title}
      actions={officer ? <Button label="Edit" size="sm" variant="soft" icon="pencil" onPress={() => onEdit(p)} disabled={busy} /> : null}>
      <View style={{ gap: 20 }}>
        <View style={[styles.stage, { backgroundColor: c.paper2, borderColor: c.line }]}>
          <View style={[styles.tape, { backgroundColor: c.note.fill.butter }]} />
          <PostedPrint type={p.type} phase={phase} onImpact={() => haptics.success()} />
        </View>

        <View style={styles.headRow}>
          <FormatChip type={p.type} />
          <DuePill post={p} today={today} />
        </View>

        {officer && !posted ? <Button label={busy ? "Marking posted…" : "Mark posted"} icon="check" tone="mint" block onPress={markPosted} disabled={busy} /> : null}

        <View style={[styles.dl, { borderColor: c.line }]}>
          <Fact icon="clock" label="Timing" value={timing(p, today)} />
          {posted ? <Fact icon="check" label="Posted on" value={mediaDate(postedOn(p), true)} /> : null}
          <Fact icon="cal" label={posted ? "Scheduled for" : "Due date"} value={mediaDate(p.dueDate, true)} />
          <Fact icon="camera" label="Format" value={isFormat(p.type) ? `${p.type} · ${FORMAT_HINTS[p.type]}` : `${p.type} (retired format)`} />
          {ev ? (
            <Pressable onPress={() => onTimeline(ev.id)} accessibilityRole="button" accessibilityHint="Opens it from the Timeline"
              style={({ pressed }) => [pressed && { backgroundColor: c.paper2 }]}>
              <Fact icon="timeline" label="Promoting" value={`${ev.title} · ${mediaDate(ev.date)}`} chev />
            </Pressable>
          ) : null}
        </View>

        {officer ? (
          <View style={styles.acts}>
            <Button label="Delete" size="sm" variant="ghost" icon="trash" tone="rose" onPress={() => onDelete(p)} disabled={busy} />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

function Fact({ icon, label, value, chev }: { icon: IconName; label: string; value: string; chev?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.fact, { borderBottomColor: c.line }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={14} color={c.ink3} />
      <T v="label" color={c.ink3} style={{ width: 98 }}>{label}</T>
      <T v="callout" color={c.ink} style={{ flex: 1 }}>{value}</T>
      {chev ? <Icon name="chev-r" size={14} color={c.ink3} /> : null}
    </View>
  );
}

/* ── PostForm: add / edit ─────────────────────────────────────────────────────── */

export interface PostSeed { title: string; type: string }

export function PostForm({ open, post, seed, events, onClose, onSaved }: {
  open: boolean;
  post: InstagramPost | null;
  /** Add with a title + format already in (the day-one ideas). */
  seed?: PostSeed | null;
  events: CalendarEvent[];
  onClose: () => void;
  onSaved?: (p: InstagramPost) => void;
}) {
  const { c } = useTheme();
  const { today, term } = useMediaBits();
  const editing = !!post;
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("Story");
  const [due, setDue] = useState(addDays(today, 3));
  const [postedDate, setPostedDate] = useState<string | null>(null);
  const [eventId, setEventId] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(post?.title ?? seed?.title ?? "");
    setType(post?.type ?? seed?.type ?? "Story");
    setDue(post?.dueDate ?? addDays(today, 3));
    setPostedDate(post ? (post.status === "posted" ? postedOn(post) : null) : null);
    setEventId(post?.calendarEventId ?? null);
    setAll(false); setBusy(false); setErr(null);
  }, [open, post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const choices = useMemo(() => promotable(events, today, post?.calendarEventId ?? null), [events, today, post?.calendarEventId]);
  const SHOWN = 6;
  const visible = all ? choices : choices.slice(0, SHOWN).concat(choices.slice(SHOWN).filter(e => e.id === eventId));
  const legacy = post && !isFormat(post.type) ? post.type : null;
  const canSave = !!title.trim() && !busy;

  const go = async () => {
    if (!canSave) return;
    setBusy(true); setErr(null);
    try {
      let saved: InstagramPost;
      let movedOnly = false;
      if (post) {
        const patch: PostPatch = {};
        if (title.trim() !== post.title) patch.title = title.trim();
        if (type !== post.type) patch.type = type;
        if (due !== post.dueDate) patch.dueDate = due;
        if (post.status === "posted" && postedDate && postedDate !== postedOn(post)) patch.postedDate = postedDate;
        if (eventId !== post.calendarEventId) patch.calendarEventId = eventId;
        const keys = Object.keys(patch);
        if (!keys.length) { onClose(); return; }
        movedOnly = keys.length === 1 && (keys[0] === "dueDate" || keys[0] === "postedDate");
        saved = await patchPost(post.id, patch);
      } else {
        saved = await createPost({ title: title.trim(), dueDate: due, type, calendarEventId: eventId });
      }
      haptics.success();
      onClose();
      onSaved?.(saved);
      if (!post) toast.show("Added", { detail: `${saved.title}: ${LANE_TOAST[laneOf(saved, today)]}.` });
      else if (movedOnly && saved.dueDate !== post.dueDate) toast.show(`Moved to ${shortDay(saved.dueDate)}, ${mediaDate(saved.dueDate)}`);
      else if (movedOnly) toast.show("Posting date changed");
      else toast.show("Post saved");
    } catch (x) {
      haptics.error();
      setErr(errorMessage(x));
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone="lilac" icon="camera" kicker={editing ? post!.title : "Content calendar"} title={editing ? "Edit post" : "Add post"}
      footer={
        <View style={{ gap: 8 }}>
          <Err text={err} />
          <Button label={busy ? "Saving…" : editing ? "Save changes" : "Add post"} icon="check" tone="lilac" block onPress={() => void go()} disabled={!canSave} />
        </View>
      }>
      <View style={{ gap: 20 }}>
        <Field label="Post title" value={title} onChangeText={setTitle} placeholder="Rush week is coming" maxLength={200} autoFocus={!editing && !seed} />

        <View style={{ gap: 8 }}>
          <T v="label" color={c.ink3}>Format</T>
          <View style={styles.formats} accessibilityRole="radiogroup">
            {FORMATS.map(f => <FormatCard key={f} type={f} on={type === f} onPress={() => { if (type !== f) { haptics.select(); setType(f); } }} />)}
          </View>
          {legacy ? (
            <Pressable onPress={() => { if (type !== legacy) { haptics.select(); setType(legacy); } }} accessibilityRole="radio" accessibilityState={{ selected: type === legacy }}
              style={[styles.keep, { borderColor: type === legacy ? c.ink : c.line2, backgroundColor: type === legacy ? c.card : "transparent" }]}>
              <View style={[styles.radio, { borderColor: type === legacy ? c.ink : c.line2 }]}>{type === legacy ? <View style={[styles.radioIn, { backgroundColor: c.ink }]} /> : null}</View>
              <T v="callout" color={c.ink2}>{`Keep ${legacy}`}</T>
              <T v="meta" color={c.ink3}>retired format</T>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <T v="label" color={c.ink3}>Due date</T>
          <DayStrip value={due} onChange={setDue} today={today} term={term} usualDow={null} taken={new Set()} editing={editing} open={open} />
        </View>

        {post?.status === "posted" && postedDate ? (
          <View style={{ gap: 8 }}>
            <T v="label" color={c.ink3}>Posting date</T>
            <DayStrip value={postedDate} onChange={setPostedDate} today={today} term={term} usualDow={null} taken={new Set()} editing open={open} />
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <T v="label" color={c.ink3}>Promoting (optional)</T>
          <View style={[styles.evList, { borderColor: c.line }]} accessibilityRole="radiogroup">
            <EventChoice label="No event" sub="A post of its own" on={eventId == null} onPress={() => setEventId(null)} />
            {visible.map(e => (
              <EventChoice key={e.id} label={e.title} sub={`${shortDay(e.date)}, ${mediaDate(e.date)}`} on={eventId === e.id} onPress={() => setEventId(e.id)} />
            ))}
          </View>
          {!all && choices.length > SHOWN ? <Button label={`Show ${choices.length - SHOWN} more`} size="sm" variant="ghost" icon="chev-d" onPress={() => setAll(true)} /> : null}
        </View>

        <T v="meta" color={c.ink3}>Lands in its lane by date, and on the month view.</T>
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
        <View style={[styles.card, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.card : c.paper }]}>
          <View style={{ height: 50, justifyContent: "center" }}><Snap type={type} developing={!on} size="sm" /></View>
          <T v="callout" color={c.ink} style={{ fontWeight: "600" }}>{type}</T>
          <T v="meta" color={c.ink3} align="center" style={{ fontSize: 11 }}>{FORMAT_HINTS[type]}</T>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function EventChoice({ label, sub, on, onPress }: { label: string; sub: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { if (!on) { haptics.select(); onPress(); } }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${label}, ${sub}`}
      style={({ pressed }) => [styles.evRow, { borderBottomColor: c.line, backgroundColor: on ? c.pastel.lilac.soft : pressed ? c.paper2 : "transparent" }]}>
      <View style={[styles.radio, { borderColor: on ? c.ink : c.line2 }]}>{on ? <View style={[styles.radioIn, { backgroundColor: c.ink }]} /> : null}</View>
      <T v="callout" color={c.ink} numberOfLines={1} style={{ flex: 1 }}>{label}</T>
      <T v="meta" color={c.ink3}>{sub}</T>
    </Pressable>
  );
}

/* ── DeletePost ───────────────────────────────────────────────────────────────── */

export function DeletePost({ post, onClose, onDeleted }: { post: InstagramPost | null; onClose: () => void; onDeleted: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<InstagramPost | null>(null);
  useEffect(() => { if (post) { setLast(post); setBusy(false); } }, [post]);
  const p = post ?? last;

  const go = async () => {
    if (!p) return;
    setBusy(true);
    try {
      await deletePost(p.id);
      haptics.soft();
      onClose();
      onDeleted();
      toast.show("Post deleted", { detail: p.title });
    } catch (x) {
      haptics.error();
      setBusy(false);
      toast.error("Couldn't delete the post", { detail: errorMessage(x) });
    }
  };

  return (
    <Sheet open={!!post} onClose={onClose} locked={busy} size="fit" tone="rose" icon="trash" kicker={p?.title ?? ""} title="Delete post"
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
          <Button label={busy ? "Deleting…" : "Delete"} icon="trash" tone="rose" block style={{ flex: 1 }} onPress={() => void go()} disabled={busy} />
        </View>
      }>
      {p ? <T v="body" color={c.ink2}>{`Delete "${p.title}" (${mediaDate(p.dueDate)})? This can't be undone.`}</T> : null}
    </Sheet>
  );
}

/* ── DayPosts: a busy month day ───────────────────────────────────────────────── */

export function DayPosts({ day, onClose, onPick }: { day: { date: string; posts: InstagramPost[] } | null; onClose: () => void; onPick: (p: InstagramPost) => void }) {
  const { c } = useTheme();
  const [last, setLast] = useState(day);
  useEffect(() => { if (day) setLast(day); }, [day]);
  const d = day ?? last;
  return (
    <Sheet open={!!day} onClose={onClose} size="fit" tone="lilac" icon="cal" kicker="Month view" title={d ? mediaDate(d.date, true) : ""}>
      <View style={{ gap: 8 }}>
        {(d?.posts ?? []).map(p => (
          <Pressable key={p.id} onPress={() => onPick(p)} accessibilityRole="button" accessibilityLabel={`${p.title}, ${p.type}${p.status === "posted" ? ", posted" : ""}`}
            style={({ pressed }) => [styles.dayRow, { borderColor: pressed ? c.ink : c.line, backgroundColor: c.card }]}>
            <Snap type={p.type} developing={p.status !== "posted"} />
            <T v="callout" numberOfLines={1} style={{ flex: 1 }}>{p.title}</T>
            <FormatChip type={p.type} />
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stage: { borderWidth: 1.5, borderRadius: 18, paddingVertical: 22, alignItems: "center", overflow: "visible" },
  tape: { position: "absolute", top: -8, width: 74, height: 20, opacity: 0.85, transform: [{ rotate: "-3deg" }] },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  dl: { borderTopWidth: 1.5 },
  fact: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, borderBottomWidth: 1 },
  acts: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },

  formats: { flexDirection: "row", gap: 8 },
  card: { alignItems: "center", gap: 4, paddingVertical: 12, paddingHorizontal: 6, borderWidth: 1.5, borderRadius: 14 },
  cardShadow: { borderRadius: 14, transform: [{ translateX: 3 }, { translateY: 3 }] },
  keep: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 },
  evList: { borderWidth: 1.5, borderRadius: 14, overflow: "hidden" },
  evRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, minHeight: 48, borderBottomWidth: 1 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radioIn: { width: 8, height: 8, borderRadius: 4 },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderRadius: 14 },
});
