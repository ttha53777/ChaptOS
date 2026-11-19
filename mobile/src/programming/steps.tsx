/**
 * The sheets Programming opens. Each one is the step a lane asks for, never a bare
 * refusal (the web's EventFixStep / EventWrapUp / EventDemoteStep / NewIdeaComposer):
 *
 *   OwnerSheet     a person or a role (GET /api/roles); roles show who holds them today
 *   FixStep        a forward move that's missing something: just those fields, then the move
 *   WrapUp         Confirmed → Done: how it went (stars), what it cost, a note; all optional
 *   OffTimeline    a published event going back: says the chapter stops seeing it
 *   NewIdea        a title and a type (or one of the starter ideas)
 *   EditDetails    the rest of an unpublished event's fields
 *   AttachLink     a titled link on the event
 *
 * Every write here is MANAGE_EVENTS. One haptic per result: success when a move or
 * a save lands, error when it's refused (the refusal's words go under the button).
 */
import type { Brother, ProgrammingEvent, ProgrammingOwner, ProgrammingStage, RoleChip } from "@/lib/api-types";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { errorMessage } from "~/api/errors";
import { useCalendar, useEventTypes } from "~/data/calendar";
import { localDay } from "~/data/home";
import { attachDoc, createProgramming, moveStage, patchProgramming, useRoles, type ProgrammingPatch } from "~/data/programming";
import { useRoster } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { Clock, DayStrip } from "~/meetings/EventForm";
import { addDays, deviceZone, wallOf, wallToInstant } from "~/meetings/model";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Avatar } from "~/paper/bits";
import { Sheet } from "~/shell/sheets";
import { SkeletonList } from "~/shell/states";
import { toast } from "~/shell/toast";
import { alpha, type Tone } from "~/theme/palette";
import { resolveType } from "~/theme/type";
import { useFontScale, useMotion, useTheme } from "~/theme/PaperProvider";
import { toneOf } from "~/timeline/model";
import { Field } from "~/ui/Field";
import { Segmented } from "~/ui/Segmented";
import { Switch } from "~/ui/Switch";
import { T } from "~/ui/T";
import { FIELD, managedTypes, missingFor, RATING, STAGE, starterIdeas, type FieldKey } from "./model";

/* ── shared bits ───────────────────────────────────────────────────────────────── */

type Owner = { brotherId: number | null; roleId: number | null; label: string | null };
const ownerOf = (o: ProgrammingOwner): Owner =>
  !o ? { brotherId: null, roleId: null, label: null } : o.kind === "brother" ? { brotherId: o.id, roleId: null, label: o.name } : { brotherId: null, roleId: o.id, label: o.name };

/** The when, as the server's schedule: a timed start in the chapter's zone, or the whole day. */
function scheduleOf(date: string, minutes: number | null, zone: string): ProgrammingPatch["schedule"] {
  return minutes == null ? { kind: "allDay", start: date, end: addDays(date, 1) } : { kind: "timed", start: wallToInstant(date, minutes, zone), timeZone: zone };
}

function minutesOf(e: ProgrammingEvent, zone: string): number | null {
  if (e.schedule?.kind === "timed") return wallOf(e.schedule.start, e.schedule.timeZone || zone)?.minutes ?? null;
  return null;
}

function useOrgBits() {
  const me = useEntryOf("ready")?.me ?? null;
  return { me, term: me?.org?.activeTerm ?? null, zone: me?.org?.timeZone || deviceZone(), today: localDay() };
}

function Label({ icon, text }: { icon: Parameters<typeof Icon>[0]["name"]; text: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.label}>
      <Icon name={icon} size={14} color={c.ink3} />
      <T v="label" color={c.ink3}>{text}</T>
    </View>
  );
}

function Err({ text }: { text: string | null }) {
  const { c } = useTheme();
  return text ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{text}</T> : null;
}

/** "Who's on it": the chosen owner as a row; tap to pick. */
function OwnerRow({ owner, onPress }: { owner: Owner; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={owner.label ? `Owner, ${owner.label}. Change` : "Pick an owner"}
      style={({ pressed }) => [styles.pickRow, { borderColor: pressed ? c.ink : owner.label ? c.line2 : c.ink, borderStyle: owner.label ? "solid" : "dashed", backgroundColor: c.card }]}>
      {owner.brotherId ? <Avatar name={owner.label ?? "?"} tone="peach" style={styles.face} />
        : <View style={[styles.face, styles.roleFace, { borderColor: c.line2 }]}><Icon name={owner.roleId ? "people" : "plus"} size={13} color={c.ink3} /></View>}
      <T v="callout" color={owner.label ? c.ink : c.ink2} style={{ flex: 1 }} numberOfLines={1}>{owner.label ?? "Pick someone, or a role"}</T>
      <Icon name="chev-r" size={14} color={c.ink3} />
    </Pressable>
  );
}

/** Rooms this chapter has used for events of this kind, most used first. */
function useRooms(category: string, current: string) {
  const cal = useCalendar();
  return useMemo(() => {
    const n = new Map<string, number>();
    for (const e of cal.data ?? []) {
      if (e.category !== category) continue;
      const r = (e.location ?? "").trim();
      if (r) n.set(r, (n.get(r) ?? 0) + 1);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r).filter(r => r !== current.trim()).slice(0, 3);
  }, [cal.data, category, current]);
}

function RoomChips({ rooms, onPick }: { rooms: string[]; onPick: (r: string) => void }) {
  const { c } = useTheme();
  if (!rooms.length) return null;
  return (
    <View style={styles.rooms}>
      {rooms.map(r => (
        <Pressable key={r} onPress={() => { haptics.select(); onPick(r); }} accessibilityRole="button" accessibilityLabel={`Use ${r}`}
          style={({ pressed }) => [styles.room, { borderColor: pressed ? c.ink : c.line2, backgroundColor: c.card }]}>
          <Icon name="pin" size={12} color={c.ink3} />
          <T v="pill" color={c.ink2} numberOfLines={1} style={{ maxWidth: 180 }}>{r}</T>
        </Pressable>
      ))}
    </View>
  );
}

/* ── OwnerSheet ────────────────────────────────────────────────────────────────── */

export function OwnerSheet({ open, owner, canClear, onClose, onPick }: {
  open: boolean; owner: Owner; canClear: boolean; onClose: () => void; onPick: (o: Owner) => void;
}) {
  const { c } = useTheme();
  const roster = useRoster(open);
  const roles = useRoles(open);
  const [tab, setTab] = useState<"people" | "roles">(owner.roleId ? "roles" : "people");
  const [q, setQ] = useState("");
  useEffect(() => { if (open) { setQ(""); setTab(owner.roleId ? "roles" : "people"); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = q.trim().toLowerCase();
  const people = (roster.data ?? []).filter(b => !s || b.name.toLowerCase().includes(s)).sort((a, b) => a.name.localeCompare(b.name));
  const roleList = (roles.data ?? []).filter(r => !s || r.name.toLowerCase().includes(s));
  const holders = (r: RoleChip) => (roster.data ?? []).filter(b => b.roles?.some(x => x.id === r.id)).map(b => b.name.split(/\s+/)[0]);
  const pick = (o: Owner) => { haptics.select(); onPick(o); };

  return (
    <Sheet open={open} onClose={onClose} size="tall" tone="peach" icon="people" kicker="Owner" title="Who's on it?">
      <View style={{ gap: 12 }}>
        <Segmented<"people" | "roles"> label="Owner kind" value={tab} onChange={setTab} options={[{ value: "people", label: "A person" }, { value: "roles", label: "A role" }]} />
        <T v="meta" color={c.ink3}>{tab === "people" ? "One person accountable for it." : "A standing duty: it follows whoever holds the role."}</T>
        <View style={[styles.find, { borderColor: c.line2, backgroundColor: c.card }]}>
          <Icon name="search" size={15} color={c.ink3} />
          <TextInput value={q} onChangeText={setQ} placeholder={tab === "people" ? "Find someone" : "Find a role"} placeholderTextColor={c.faint} style={[styles.findIn, { color: c.ink }]} accessibilityLabel="Search" />
        </View>
        {(tab === "people" ? !roster.data : !roles.data) ? <SkeletonList count={5} /> : (
          <View style={[styles.list, { borderColor: c.line, backgroundColor: c.card }]}>
            {tab === "people"
              ? people.map((b: Brother, i) => (
                <PickLine key={b.id} first={i === 0} on={owner.brotherId === b.id} title={b.name} sub={b.role}
                  lead={<Avatar name={b.name} uri={b.avatarUrl ?? null} tone="peach" style={styles.face} />}
                  onPress={() => pick({ brotherId: b.id, roleId: null, label: b.name })} />
              ))
              : roleList.map((r, i) => {
                const h = holders(r);
                return (
                  <PickLine key={r.id} first={i === 0} on={owner.roleId === r.id} title={r.name} sub={h.length ? h.join(" / ") : "Nobody holds it right now"}
                    lead={<View style={[styles.face, styles.roleFace, { borderColor: c.line2 }]}><Icon name="people" size={13} color={c.ink3} /></View>}
                    onPress={() => pick({ brotherId: null, roleId: r.id, label: r.name })} />
                );
              })}
            {(tab === "people" ? people : roleList).length === 0 ? <T v="meta" color={c.ink3} style={{ padding: 14 }}>Nothing by that name.</T> : null}
          </View>
        )}
        {canClear && owner.label ? <Button label="Nobody yet" variant="soft" icon="x" onPress={() => pick({ brotherId: null, roleId: null, label: null })} /> : null}
      </View>
    </Sheet>
  );
}

function PickLine({ title, sub, lead, on, first, onPress }: { title: string; sub?: string | null; lead: React.ReactNode; on: boolean; first: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={title}
      style={({ pressed }) => [styles.pick, !first && { borderTopWidth: 1, borderTopColor: c.lineSoft }, (pressed || on) && { backgroundColor: on ? c.pastel.peach.soft : c.paper2 }]}>
      {lead}
      <View style={{ flex: 1 }}>
        <T v="callout" numberOfLines={1}>{title}</T>
        {sub ? <T v="meta" color={c.ink3} numberOfLines={1}>{sub}</T> : null}
      </View>
      {on ? <Icon name="check" size={15} color={c.ink} /> : null}
    </Pressable>
  );
}

/* ── FixStep ───────────────────────────────────────────────────────────────────── */

export function FixStep({ target, onClose }: { target: { e: ProgrammingEvent; stage: ProgrammingStage } | null; onClose: () => void }) {
  const { c } = useTheme();
  const { term, zone, today } = useOrgBits();
  const e = target?.e ?? null;
  const missing: FieldKey[] = target ? missingFor(target.e, target.stage) : [];
  const [owner, setOwner] = useState<Owner>(ownerOf(null));
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState<number | null>(19 * 60);
  const [loc, setLoc] = useState("");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rooms = useRooms(e?.category ?? "", loc);

  useEffect(() => {
    if (!target) return;
    setOwner(ownerOf(target.e.owner)); setErr(null); setBusy(false); setPicking(false);
    setDate(target.e.dueDate ?? (term && today < term.startDate ? term.startDate : today));
    setMinutes(minutesOf(target.e, zone) ?? 19 * 60);
    setLoc(target.e.location);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const ok = missing.every(k => k === "owner" ? !!owner.label : k === "location" ? !!loc.trim() : !!date);
  const to = target ? STAGE[target.stage].label : "";

  const go = async () => {
    if (!target || !ok || busy) return;
    setBusy(true); setErr(null);
    const patch: ProgrammingPatch = {};
    if (missing.includes("owner")) owner.roleId ? (patch.ownerRoleId = owner.roleId) : (patch.ownerBrotherId = owner.brotherId);
    if (missing.includes("date")) { patch.dueDate = date; patch.schedule = scheduleOf(date, minutes, zone); }
    if (missing.includes("location")) patch.location = loc.trim();
    try {
      const saved = await patchProgramming(target.e.id, patch);
      await moveStage(saved, target.stage);
      haptics.success();
      onClose();
      toast.show(target.stage === "confirmed" ? `${saved.title} is confirmed` : `Moved to ${to}`,
        { detail: target.stage === "confirmed" ? "It's on the chapter's Timeline now." : STAGE[target.stage].meaning });
    } catch (x) {
      haptics.error();
      setErr(errorMessage(x, "Couldn't move it. Try again."));
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet open={!!target} onClose={onClose} locked={busy} size="tall" tone={target ? STAGE[target.stage].tone : "peach"} icon="flag"
        kicker={e ? `${e.title} → ${to}` : ""} title={`Before it's ${to.toLowerCase()}`}
        footer={
          <View style={{ flex: 1, gap: 6 }}>
            <Err text={err} />
            <Button label={busy ? "Saving…" : target?.stage === "confirmed" ? "Confirm it" : `Move to ${to}`} icon="check" tone={target ? STAGE[target.stage].tone : "peach"} block onPress={() => void go()} disabled={!ok || busy} />
          </View>
        }>
        <View style={{ gap: 20 }}>
          <T v="body" color={c.ink2}>{target?.stage === "confirmed"
            ? "Confirming puts it on everyone's calendar. It needs these first:"
            : "A plan belongs to somebody. Who's on it?"}</T>
          {missing.includes("owner") ? (
            <View style={{ gap: 8 }}>
              <Label icon="people" text="Owner" />
              <OwnerRow owner={owner} onPress={() => setPicking(true)} />
              <T v="meta" color={c.ink3}>{FIELD.owner.hint}</T>
            </View>
          ) : null}
          {missing.includes("date") ? (
            <View style={{ gap: 8 }}>
              <Label icon="cal" text="Day" />
              <DayStrip value={date} onChange={setDate} today={today} term={term} usualDow={null} taken={new Set()} editing={false} open={!!target} />
              <Label icon="clock" text="Time" />
              <Clock minutes={minutes} onChange={setMinutes} tone="sky" />
            </View>
          ) : null}
          {missing.includes("location") ? (
            <View style={{ gap: 8 }}>
              <Field label="Where" value={loc} onChangeText={setLoc} placeholder="The room, the address" maxLength={200} />
              <RoomChips rooms={rooms} onPick={setLoc} />
            </View>
          ) : null}
        </View>
      </Sheet>
      <OwnerSheet open={!!target && picking} owner={owner} canClear={false} onClose={() => setPicking(false)} onPick={o => { setOwner(o); setPicking(false); }} />
    </>
  );
}

/* ── WrapUp ────────────────────────────────────────────────────────────────────── */

export function WrapUp({ e, editing, onClose }: { e: ProgrammingEvent | null; editing?: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const [stars, setStars] = useState<number | null>(null);
  const [spent, setSpent] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!e) return;
    setStars(e.successRating); setNotes(e.wrapUpNotes ?? ""); setErr(null); setBusy(false);
    setSpent(e.spendingCents ? (e.spendingCents / 100).toFixed(2).replace(/\.00$/, "") : "");
  }, [e?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cents = spent.trim() ? Math.round(Number(spent.replace(/[$,\s]/g, "")) * 100) : 0;
  const badSpend = !Number.isFinite(cents) || cents < 0;

  const go = async () => {
    if (!e || busy || badSpend) return;
    setBusy(true); setErr(null);
    try {
      const saved = await patchProgramming(e.id, {
        successRating: stars, wrapUpNotes: notes.trim() || null, ...(cents !== e.spendingCents ? { spendingCents: cents } : {}),
      });
      if (!editing) await moveStage(saved, "done");
      haptics.success();
      onClose();
      toast.show(editing ? "Wrap-up saved" : `${e.title} is wrapped`, { detail: stars ? `${stars} ★ · ${RATING[stars]}` : "On the record." });
    } catch (x) {
      haptics.error();
      setErr(errorMessage(x, "Couldn't save the wrap-up."));
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!e} onClose={onClose} locked={busy} size="tall" tone="mint" icon="star" kicker={e?.title ?? ""} title={editing ? "The wrap-up" : "How did it go?"}
      footer={
        <View style={{ flex: 1, gap: 6 }}>
          <Err text={err} />
          <Button label={busy ? "Saving…" : editing ? "Save" : "Wrap it up"} icon="check" tone="mint" block onPress={() => void go()} disabled={busy || badSpend} />
        </View>
      }>
      <View style={{ gap: 22 }}>
        <View style={{ gap: 10, alignItems: "center" }}>
          <StarPicker value={stars} onChange={setStars} />
          <T v="callout" color={stars ? c.ink : c.ink3}>{stars ? RATING[stars] : "Tap a star (tap it again to clear)"}</T>
        </View>
        <View style={{ gap: 6 }}>
          <Field label="What it cost" value={spent} onChangeText={setSpent} placeholder="$0" keyboardType="decimal-pad" maxLength={12} error={badSpend ? "A dollar amount, like 120 or 45.50." : null} />
        </View>
        <View style={{ gap: 6 }}>
          <T v="label" color={c.ink2}>Notes for next time</T>
          <TextInput value={notes} onChangeText={setNotes} multiline maxLength={500} placeholder="What worked, what to change" placeholderTextColor={c.faint}
            accessibilityLabel="Notes for next time" style={[styles.notes, { color: c.note.ink, backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }]} />
          <T v="meta" color={c.ink3} style={{ alignSelf: "flex-end" }}>{`${notes.length}/500`}</T>
        </View>
        {!editing ? <T v="meta" color={c.ink3}>All optional. This is just the one moment anybody still remembers how it went.</T> : null}
      </View>
    </Sheet>
  );
}

/** Five stars. A tap fills the run with a little pop; tapping the chosen star clears. */
export function StarPicker({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel="How it went">
      {[1, 2, 3, 4, 5].map(n => <StarBtn key={n} n={n} value={value} onPress={() => { haptics.select(); onChange(value === n ? null : n); }} />)}
    </View>
  );
}

function StarBtn({ n, value, onPress }: { n: number; value: number | null; onPress: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const lit = value != null && n <= value;
  const s = useSharedValue(1);
  useEffect(() => {
    if (!lit || m.reduced) { s.value = 1; return; }
    s.value = withSequence(withTiming(1, { duration: m.t((n - 1) * 35) }), withTiming(1.22, m.timing(90, "out")), withSpring(1, m.spring("pop")));
  }, [lit, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: value === n }} accessibilityLabel={`${n} ${n === 1 ? "star" : "stars"}, ${RATING[n]}`} hitSlop={4}>
      <Animated.View style={[styles.star, { borderColor: lit ? c.ink : c.line2, backgroundColor: lit ? c.note.fill.butter : c.card }, st]}>
        <Icon name="star" size={22} color={lit ? c.note.ink : c.line2} />
      </Animated.View>
    </Pressable>
  );
}

/* ── OffTimeline ───────────────────────────────────────────────────────────────── */

export function OffTimeline({ target, onClose }: { target: { e: ProgrammingEvent; stage: ProgrammingStage } | null; onClose: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (target) setBusy(false); }, [target]);
  const go = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      await moveStage(target.e, target.stage);
      haptics.soft();
      onClose();
      toast.show(`${target.e.title} is off the Timeline`, { detail: `Back in ${STAGE[target.stage].label}. Change what you need, then confirm it again.` });
    } catch (x) {
      haptics.error();
      toast.error("Couldn't move it", { detail: errorMessage(x) });
      setBusy(false);
    }
  };
  return (
    <Sheet open={!!target} onClose={onClose} locked={busy} tone="rose" icon="cal" kicker={target?.e.title ?? ""} title="Take it off the Timeline?"
      footer={
        <View style={[styles.acts, { flex: 1 }]}>
          <Button label="Keep it" variant="soft" onPress={onClose} style={{ flex: 1 }} disabled={busy} />
          <Button label={busy ? "Moving…" : `Back to ${target ? STAGE[target.stage].label : ""}`} tone="rose" onPress={() => void go()} style={{ flex: 1.3 }} disabled={busy} />
        </View>
      }>
      <T v="body" color={c.ink2}>
        {target?.e.stage === "done"
          ? "It comes off everyone's calendar and out of the record. Its wrap-up stays with it."
          : "The chapter stops seeing it on the Timeline and their calendars until it's confirmed again. While it's back, its date, place and details can change."}
      </T>
    </Sheet>
  );
}

/* ── NewIdea ───────────────────────────────────────────────────────────────────── */

export function NewIdea({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (e: ProgrammingEvent) => void }) {
  const { c } = useTheme();
  const scale = useFontScale();
  const { me } = useOrgBits();
  const types = useEventTypes();
  const list = useMemo(() => managedTypes(types.data, me?.org?.enabledWorkflows ?? []), [types.data, me]);
  const [title, setTitle] = useState("");
  const [cat, setCat] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setTitle(""); setErr(null); setBusy(false); setCat(list.find(t => t.slug !== "chapter")?.slug ?? list[0]?.slug ?? ""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const starters = starterIdeas(list);
  const tone: Tone = cat ? toneOf(cat) : "butter";

  const go = async () => {
    if (!title.trim() || !cat || busy) return;
    setBusy(true); setErr(null);
    try {
      const saved = await createProgramming({ title: title.trim(), category: cat });
      haptics.success();
      onClose();
      toast.show("Idea on the board", { detail: `${saved.title} · it belongs to the chapter until someone picks it up.` });
      onAdded?.(saved);
    } catch (x) {
      haptics.error();
      setErr(errorMessage(x, "Couldn't add it."));
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} locked={busy} tone={tone} icon="spark" kicker="Programming" title="New idea"
      footer={
        <View style={{ flex: 1, gap: 6 }}>
          <Err text={err} />
          <Button label={busy ? "Adding…" : "Put it on the board"} icon="plus" tone={tone} block onPress={() => void go()} disabled={!title.trim() || !cat || busy} />
        </View>
      }>
      <View style={{ gap: 18 }}>
        <View style={[styles.note, { backgroundColor: c.note.fill[tone] }]}>
          <TextInput value={title} onChangeText={setTitle} placeholder="What if we…" placeholderTextColor={alpha(c.note.ink, 0.45)} autoFocus maxLength={200}
            accessibilityLabel="Idea" returnKeyType="done" onSubmitEditing={() => void go()}
            style={[resolveType("title", scale), { color: c.note.ink, minHeight: 64, textAlignVertical: "top" }]} multiline blurOnSubmit />
        </View>
        {!title.trim() && starters.length ? (
          <View style={{ gap: 8 }}>
            <T v="label" color={c.ink3}>Or start from one</T>
            <View style={styles.rooms}>
              {starters.map(s => (
                <Pressable key={s.title} onPress={() => { haptics.select(); setTitle(s.title); setCat(s.category); }} accessibilityRole="button"
                  style={({ pressed }) => [styles.room, { borderColor: pressed ? c.ink : c.line2, backgroundColor: c.card }]}>
                  <View style={[styles.dot, { backgroundColor: c.pastel[toneOf(s.category)].ink }]} />
                  <T v="pill" color={c.ink2}>{s.title}</T>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <TypeChips list={list} value={cat} onChange={setCat} />
      </View>
    </Sheet>
  );
}

function TypeChips({ list, value, onChange }: { list: { slug: string; label: string }[]; value: string; onChange: (s: string) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Label icon="flag" text="Kind" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
        {list.map(t => {
          const on = t.slug === value;
          const p = c.pastel[toneOf(t.slug)];
          return (
            <Pressable key={t.slug} onPress={() => { if (!on) { haptics.select(); onChange(t.slug); } }} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={[styles.chip, { borderColor: on ? c.ink : p.border, backgroundColor: on ? p.soft : c.card }]}>
              <View style={[styles.dot, { backgroundColor: p.ink }]} />
              <T v="pill" color={on ? c.ink : c.ink2}>{t.label}</T>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ── EditDetails ───────────────────────────────────────────────────────────────── */

export function EditDetails({ e, onClose }: { e: ProgrammingEvent | null; onClose: () => void }) {
  const { c } = useTheme();
  const { me, term, zone, today } = useOrgBits();
  const types = useEventTypes();
  const list = useMemo(() => {
    const l = managedTypes(types.data, me?.org?.enabledWorkflows ?? []);
    return e && !l.some(t => t.slug === e.category) ? [{ slug: e.category, label: e.type } as (typeof l)[number], ...l] : l;
  }, [types.data, me, e]);
  const [title, setTitle] = useState("");
  const [cat, setCat] = useState("");
  const [dated, setDated] = useState(false);
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState<number | null>(19 * 60);
  const [loc, setLoc] = useState("");
  const [collab, setCollab] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rooms = useRooms(cat, loc);

  useEffect(() => {
    if (!e) return;
    setTitle(e.title); setCat(e.category); setDated(!!e.dueDate); setDate(e.dueDate ?? (term && today < term.startDate ? term.startDate : today));
    setMinutes(e.dueDate ? minutesOf(e, zone) : 19 * 60); setLoc(e.location); setCollab(e.collab ?? ""); setMandatory(e.mandatory); setErr(null); setBusy(false);
  }, [e?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async () => {
    if (!e || busy || !title.trim()) return;
    setBusy(true); setErr(null);
    const patch: ProgrammingPatch = {
      title: title.trim(), category: cat, location: loc.trim() || null, collab: collab.trim() || null, mandatory,
      ...(dated ? { dueDate: date, schedule: scheduleOf(date, minutes, zone) } : { dueDate: null, schedule: null, time: null }),
    };
    try {
      await patchProgramming(e.id, patch);
      haptics.success();
      onClose();
      toast.show("Saved", { detail: title.trim() });
    } catch (x) {
      haptics.error();
      setErr(errorMessage(x, "Couldn't save that."));
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!e} onClose={onClose} locked={busy} size="tall" tone={cat ? toneOf(cat) : "peach"} icon="pencil" kicker={e ? STAGE[e.stage].label : ""} title="Edit details"
      footer={
        <View style={{ flex: 1, gap: 6 }}>
          <Err text={err} />
          <Button label={busy ? "Saving…" : "Save"} icon="check" tone={cat ? toneOf(cat) : "peach"} block onPress={() => void go()} disabled={busy || !title.trim()} />
        </View>
      }>
      <View style={{ gap: 20 }}>
        <Field label="Name" value={title} onChangeText={setTitle} maxLength={200} />
        <TypeChips list={list} value={cat} onChange={setCat} />
        <View style={{ gap: 8 }}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <T v="callout">A day picked</T>
              <T v="meta" color={c.ink3}>{dated ? "Penciled in. It isn't on the Timeline until it's confirmed." : "Ideas and plans can wait for a day."}</T>
            </View>
            <Switch value={dated} onChange={setDated} tone="sky" label="Has a date" />
          </View>
          {dated ? (
            <View style={{ gap: 8 }}>
              <DayStrip value={date} onChange={setDate} today={today} term={term} usualDow={null} taken={new Set()} editing open={!!e} />
              <Clock minutes={minutes} onChange={setMinutes} tone="sky" />
            </View>
          ) : null}
        </View>
        <View style={{ gap: 8 }}>
          <Field label="Where" value={loc} onChangeText={setLoc} placeholder="The room, the address" maxLength={200} />
          <RoomChips rooms={rooms} onPick={setLoc} />
        </View>
        <Field label="With (another group, optional)" value={collab} onChangeText={setCollab} placeholder="Delta chapter, the alumni board" maxLength={200} />
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <T v="callout">Required attendance</T>
            <T v="meta" color={c.ink3}>{mandatory ? "Once confirmed, it counts toward standing." : "Optional: nobody's standing moves."}</T>
          </View>
          <Switch value={mandatory} onChange={setMandatory} tone="peach" label="Required attendance" />
        </View>
      </View>
    </Sheet>
  );
}

/* ── AttachLink ────────────────────────────────────────────────────────────────── */

export function AttachLink({ e, onClose }: { e: ProgrammingEvent | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (e) { setTitle(""); setUrl(""); setErr(null); setBusy(false); } }, [e?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const full = /^https?:\/\//i.test(url.trim()) ? url.trim() : url.trim() ? `https://${url.trim()}` : "";
  const go = async () => {
    if (!e || busy || !title.trim() || !full) return;
    setBusy(true); setErr(null);
    try {
      await attachDoc(e.id, title.trim(), full);
      haptics.success();
      onClose();
      toast.show("Link attached", { detail: `${title.trim()} · it's in Docs too.` });
    } catch (x) {
      haptics.error();
      setErr(errorMessage(x, "Couldn't attach that link."));
      setBusy(false);
    }
  };
  return (
    <Sheet open={!!e} onClose={onClose} locked={busy} tone="butter" icon="link" kicker={e?.title ?? ""} title="Attach a link"
      footer={
        <View style={{ flex: 1, gap: 6 }}>
          <Err text={err} />
          <Button label={busy ? "Attaching…" : "Attach"} icon="link" tone="butter" block onPress={() => void go()} disabled={busy || !title.trim() || !full} />
        </View>
      }>
      <View style={{ gap: 14 }}>
        <Field label="Link" value={url} onChangeText={setUrl} placeholder="docs.google.com/…" autoCapitalize="none" autoCorrect={false} keyboardType="url" autoFocus />
        <Field label="Call it" value={title} onChangeText={setTitle} placeholder="Run of show, budget sheet" maxLength={200} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { flexDirection: "row", alignItems: "center", gap: 6 },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  face: { width: 30, height: 30, borderRadius: 15 },
  roleFace: { borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  find: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, minHeight: 44 },
  findIn: { flex: 1, fontSize: 16, paddingVertical: 8 },
  list: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  pick: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 54 },
  rooms: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  room: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 11, minHeight: 32 },
  chip: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 13, minHeight: 38 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  star: { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  notes: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, lineHeight: 24, minHeight: 110, textAlignVertical: "top" },
  acts: { flexDirection: "row", gap: 8 },
  note: { borderTopLeftRadius: 5, borderTopRightRadius: 14, borderBottomRightRadius: 7, borderBottomLeftRadius: 12, padding: 16, transform: [{ rotate: "-0.8deg" }] },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
