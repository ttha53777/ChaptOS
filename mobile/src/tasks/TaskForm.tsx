/**
 * The new / edit task sheet for officers (MANAGE_TASKS), the web's PaperTaskSheet
 * (app/org/[slug]/tasks/TaskSheets.tsx) on the phone, with its words and checks from
 * @/lib/tasks/list:
 *
 *   What needs doing   the title (200)
 *   When it's due      Day: Today · Tomorrow · Next week · Pick a date · No date (days outside
 *                      the term are off); Time: Any time or a time (the meetings Clock)
 *   Who's on it        three picture tiles: People (faces in two columns, a search past 8,
 *                      the picked tray), Roles (name tags with who holds each, and who that
 *                      reaches now) and Everyone, whose one switch is each / any, with the
 *                      crowd strip acting the rule out
 *   Note               optional, behind "Add a note"
 *
 * The footer previews the row as it will land on the list, then Delete (editing) · Cancel
 * · Add task / Save. Saving is POST /api/tasks or PATCH /api/tasks/[id]; DeleteTask is the
 * web's confirm. Also opened from Create and the Timeline's Add deadline.
 */
import type { Brother, Task } from "@/lib/api-types";
import {
  MON, avTone, dateOf, dFrom, first, fmtDay, fmtDueTime, inTermOf, isoOf, names, plusDays, reachOf, startOfToday,
  taskQuickDays, validateTask, whoSub, type WhoMode,
} from "@/lib/tasks/list";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { useRoles } from "~/data/programming";
import { createTask, deleteTask, editTask, useRoster, type NewTaskBody, type TaskEdit } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon, type IconName } from "~/icons/Icon";
import { Clock, DayStrip } from "~/meetings/EventForm";
import { haptics } from "~/motion/haptics";
import { Avatar } from "~/paper/bits";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import type { Tone } from "~/theme/palette";
import { useFontScale, useTheme } from "~/theme/PaperProvider";
import { resolveType } from "~/theme/type";
import { T } from "~/ui/T";
import { TBtn } from "./List";

type DayKey = "today" | "tom" | "week" | "pick" | "none";

const toMin = (hhmm: string | null) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const CROWD_MAX = 12;

export function TaskForm({ open, task, onClose, onSaved }: { open: boolean; task: Task | null; onClose: () => void; onSaved?: (t: Task) => void }) {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const roster = useRoster(open);
  const roles = useRoles(open);
  const todayD = startOfToday();
  const today = isoOf(todayD);
  const term = me?.org?.activeTerm ?? null;
  const inTerm = inTermOf(term?.startDate, term?.endDate);
  const editing = !!task;
  const QUICK = taskQuickDays(todayD) as { key: DayKey; label: string; iso: string }[];

  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [picking, setPicking] = useState(false);
  const [time, setTime] = useState<number | null>(null);
  const [mode, setMode] = useState<WhoMode>("people");
  const [ids, setIds] = useState<number[]>([]);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [ev, setEv] = useState<"each" | "any">("each");
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<Task | null>(null);

  useEffect(() => {
    if (!open) return;
    const people = task?.assignments.flatMap(a => (a.brotherId != null ? [a.brotherId] : [])) ?? [];
    const rs = task?.assignments.flatMap(a => (a.roleId != null ? [a.roleId] : [])) ?? [];
    const tom = QUICK[1]!.iso;
    const d = task ? task.dueDate ?? "" : inTerm(tom) ? tom : "";
    setTitle(task?.title ?? "");
    setDue(d);
    setPicking(!!d && !QUICK.some(x => x.iso === d));
    setTime(toMin(task?.dueTime ?? null));
    setMode(task?.everyone ? "all" : rs.length && !people.length ? "roles" : "people");
    setIds(task?.everyone ? [] : people);
    setRoleIds(task?.everyone ? [] : rs);
    setEv(task?.everyone ?? "each");
    setQ(""); setNotes(task?.notes ?? ""); setShowNote(!!task?.notes); setBusy(false); setErr(null);
  }, [open, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const brothers = roster.data ?? [];
  const byId = useMemo(() => new Map(brothers.map(b => [b.id, b] as const)), [brothers]);
  const members = useMemo(() => [...brothers].sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : a.name.localeCompare(b.name))), [brothers, me?.id]);
  const nameOf = (id: number) => (id === me?.id ? "You" : first(byId.get(id)?.name ?? "Someone"));
  const holders = (roleId: number) => brothers.filter(b => b.roles?.some(r => r.id === roleId));
  const reach = useMemo(() => reachOf(mode, brothers, ids, roleIds), [mode, brothers, ids, roleIds]);
  const roleList = roles.data ?? [];

  const dayKey: DayKey = !due ? "none" : picking ? "pick" : QUICK.find(x => x.iso === due)?.key ?? "pick";
  const pickDay = (k: DayKey) => {
    if (k === dayKey && k !== "pick") return;
    haptics.select();
    setErr(null);
    if (k === "none") { setDue(""); setPicking(false); setTime(null); return; }
    if (k === "pick") {
      setPicking(true);
      if (!due || QUICK.some(x => x.iso === due)) { const two = isoOf(plusDays(todayD, 14)); setDue(inTerm(two) ? two : term?.endDate ?? two); }
      return;
    }
    setPicking(false);
    setDue(QUICK.find(x => x.key === k)!.iso);
  };
  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const setWho = (m: WhoMode) => { if (m !== mode) { haptics.select(); setMode(m); setErr(null); } };

  const save = async () => {
    if (busy) return;
    const problem = validateTask({ title, due, initialDue: task?.dueDate ?? "", mode, people: ids.length, roles: roleIds.length }, inTerm);
    if (problem) { haptics.error(); setErr(problem); return; }
    const all = mode === "all";
    setBusy(true); setErr(null);
    try {
      let saved: Task;
      if (task) {
        // As on the web: the date goes only when it changed (the server re-checks any date
        // it's sent against this term, which would refuse a rename that keeps last term's).
        const dateChanged = due !== (task.dueDate ?? "");
        const hhmm = due && time != null ? toHHMM(time) : "";
        const timeChanged = hhmm !== (task.dueTime ?? "");
        const body: TaskEdit = {
          title: title.trim(),
          assigneeBrotherIds: all ? [] : ids,
          assigneeRoleIds: all ? [] : roleIds,
          everyone: all ? ev : null,
          ...(dateChanged ? { dueDate: due || null } : {}),
          ...(timeChanged && due ? { dueTime: hhmm || null } : {}),
          notes: notes.trim() || null,
        };
        saved = await editTask(task.id, body);
      } else {
        const body: NewTaskBody = {
          title: title.trim(),
          assigneeBrotherIds: all ? [] : ids,
          assigneeRoleIds: all ? [] : roleIds,
          ...(all ? { everyone: ev } : {}),
          ...(due ? { dueDate: due } : {}),
          ...(due && time != null ? { dueTime: toHHMM(time) } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        };
        saved = await createTask(body);
      }
      haptics.success();
      onClose();
      onSaved?.(saved);
      toast.show(task ? "Task saved" : "Task added", { detail: saved.title });
    } catch {
      haptics.error();
      setErr("Could not save the task. Please try again.");
      setBusy(false);
    }
  };

  const d = due ? dateOf(due) : null;
  const readback = d
    ? <>Due <B>{`${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}, ${fmtDay(due)}`}</B>{time != null ? <> at <B>{fmtDueTime(toHHMM(time))}</B></> : null}</>
    : <>No due date</>;
  const say = mode === "all"
    ? (ev === "each" ? <><B>{String(brothers.length)}</B> people, each on their own</> : <>Any <B>one</B> of {brothers.length}</>)
    : reach.length ? <><B>{String(reach.length)}</B> {reach.length === 1 ? "person" : "people"}</> : <>Nobody yet</>;
  const needle = q.trim().toLowerCase();
  const shown = members.filter(b => !needle || `${b.name} ${b.role ?? ""}`.toLowerCase().includes(needle));
  const past = due ? dFrom(due, todayD) < 0 : false;

  return (
    <>
      <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone="butter" icon="box" title={editing ? "Edit task" : "New task"}
        footer={
          <View style={{ gap: 10 }}>
            {err ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T> : null}
            <T v="kicker" size={10.2} color={c.ink3}>{editing ? "How it’ll look" : "How it’ll look on the list"}</T>
            <PreviewRow tone={past ? "peach" : "sky"} title={title.trim()} placeholder="Your task" stub={d ? { mon: MON[d.getMonth()]!, day: String(d.getDate()), today: dFrom(due, todayD) === 0 } : null}>
              {mode === "all"
                ? ev === "each"
                  ? <><WhoTag icon="people" label="Everyone" strong /><T v="mono" size={10.9} color={c.ink3}>{`0 of ${brothers.length}`}</T></>
                  : <WhoTag icon="hand" label="Anyone · one tick" strong />
                : reach.length
                  ? <WhoTag faces={reach.slice(0, 3).flatMap(id => { const b = byId.get(id); return b ? [b] : []; })}
                      label={mode === "roles" && !ids.length ? roleList.filter(r => roleIds.includes(r.id)).map(r => r.name).join(", ") : names(reach.map(nameOf))} />
                  : <WhoTag label="Nobody yet" muted />}
              {due && time != null ? <T v="mono" size={10.9} color={c.ink3}>{`by ${fmtDueTime(toHHMM(time))}`}</T> : null}
              {notes.trim() ? <View style={styles.nt}><Icon name="doc" size={12} color={c.ink3} /><T v="meta" size={11.5} color={c.ink3}>Note</T></View> : null}
            </PreviewRow>
            <View style={styles.acts}>
              {editing ? <TBtn soft icon="trash" label="Delete" onPress={() => { onClose(); setDoomed(task); }} /> : null}
              <View style={{ flex: 1 }} />
              <TBtn soft label="Cancel" onPress={onClose} />
              <TBtn label={busy ? "Saving…" : editing ? "Save" : "Add task"} disabled={busy} onPress={() => void save()} />
            </View>
          </View>
        }>
        <View style={{ gap: 22 }}>
          <View style={{ gap: 8 }}>
            <Lab>What needs doing</Lab>
            <BigInput value={title} onChangeText={t => { setTitle(t); setErr(null); }} placeholder="Book the room for chapter" maxLength={200} autoFocus={!editing} tone="butter" />
          </View>

          <View style={{ gap: 10 }}>
            <Head label="When it’s due" say={readback} />
            <View style={styles.whenRow}>
              <T v="kicker" size={10.2} color={c.ink3} style={styles.whenLab}>Day</T>
              <View style={styles.chips}>
                {QUICK.map(x => <Chip key={x.key} label={x.label} on={dayKey === x.key} disabled={!inTerm(x.iso)} onPress={() => pickDay(x.key)} />)}
                <Chip label="Pick a date" icon="cal" on={dayKey === "pick"} onPress={() => pickDay("pick")} />
                <Chip label="No date" on={dayKey === "none"} onPress={() => pickDay("none")} dashed />
              </View>
            </View>
            {dayKey === "pick" ? (
              <DayStrip value={due} onChange={v => { setDue(v); setErr(null); }} today={today} term={term} usualDow={null} taken={new Set()} editing={editing} open={open} />
            ) : null}
            {due ? (
              <View style={styles.whenRow}>
                <T v="kicker" size={10.2} color={c.ink3} style={styles.whenLab}>Time</T>
                <View style={{ flex: 1, gap: 10 }}>
                  <View style={styles.chips} accessibilityLabel="Due time">
                    <Chip label="Any time" on={time == null} onPress={() => { haptics.select(); setTime(null); }} />
                    <Chip label={time != null ? fmtDueTime(toHHMM(time)) : "--:--"} icon="clock" on={time != null} dashed
                      onPress={() => { if (time == null) { haptics.select(); setTime(19 * 60); } }} />
                  </View>
                  {time != null ? <Clock minutes={time} onChange={setTime} tone="butter" /> : null}
                </View>
              </View>
            ) : null}
          </View>

          <View style={{ gap: 10 }}>
            <Head label="Who’s on it" say={say} />
            <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel="Who’s on it">
              <WhoTile on={mode === "people"} label="People" sub={whoSub("people", ids.length, roleIds.length, brothers.length)} onPress={() => setWho("people")}
                art={<View style={{ flexDirection: "row" }}>{members.filter(b => b.id !== me?.id).slice(0, 2).map((b, i) => (
                  <View key={b.id} style={{ marginLeft: i ? -8 : 0 }}><Avatar name={b.name} uri={b.avatarUrl} tone={avTone(b.id)} px={28} ring={c.card} /></View>))}</View>} />
              <WhoTile on={mode === "roles"} label="Roles" sub={whoSub("roles", ids.length, roleIds.length, brothers.length)} onPress={() => setWho("roles")}
                art={<View style={{ gap: 3 }}>{(roleList.length ? roleList.slice(0, 2) : [{ id: -1, name: "Treasurer", color: null }, { id: -2, name: "Secretary", color: null }]).map((r, i) => (
                  <View key={r.id} style={[styles.tagMini, { backgroundColor: r.color ?? (i ? c.note.fill.rose : c.note.fill.mint), borderColor: c.ink, transform: [{ rotate: i ? "3deg" : "-3deg" }] }]}>
                    <T v="pill" size={10} color={c.note.ink} numberOfLines={1}>{r.name}</T>
                  </View>))}</View>} />
              <WhoTile on={mode === "all"} label="Everyone" sub={whoSub("all", ids.length, roleIds.length, brothers.length)} onPress={() => setWho("all")}
                art={<View style={styles.dots}>{Array.from({ length: 12 }, (_, i) => <View key={i} style={[styles.dotP, { backgroundColor: c.note.fill[(["peach", "sky", "mint", "butter", "lilac", "rose"] as const)[i % 6]!], borderColor: c.ink }]} />)}</View>} />
            </View>

            <View style={[styles.panel, { borderColor: c.ink, backgroundColor: c.paper2 }]}>
              {mode === "people" ? (
                !roster.data ? <View style={styles.faces}>{[0, 1, 2, 3].map(i => <View key={i} style={[styles.face, { backgroundColor: c.skel, borderColor: "transparent" }]} />)}</View> : (
                  <View style={{ gap: 10 }}>
                    {brothers.length > 8 ? <Find value={q} onChangeText={setQ} /> : null}
                    <View style={styles.faces}>
                      {shown.map(b => <Face key={b.id} b={b} you={b.id === me?.id} on={ids.includes(b.id)} onPress={() => { haptics.select(); setIds(l => toggle(l, b.id)); setErr(null); }} />)}
                    </View>
                    {needle && !shown.length ? <T v="meta" color={c.ink3}>{`No one called “${q.trim()}”.`}</T> : null}
                    <View style={styles.tray}>
                      {ids.length ? (
                        <>
                          {ids.map(id => { const b = byId.get(id); return b ? (
                            <View key={id} style={[styles.pk, { borderColor: c.ink, backgroundColor: c.card }]}>
                              <Avatar name={b.name} uri={b.avatarUrl} tone={avTone(id)} px={20} />
                              <T v="pill" size={12}>{nameOf(id)}</T>
                              <Pressable onPress={() => setIds(l => l.filter(x => x !== id))} accessibilityRole="button" accessibilityLabel={`Remove ${b.name}`} hitSlop={8}><Icon name="x" size={12} color={c.ink3} /></Pressable>
                            </View>
                          ) : null; })}
                          {ids.length > 1 ? <Pressable onPress={() => setIds([])} accessibilityRole="button" hitSlop={6}><T v="buttonSm" size={12} color={c.ink3} style={{ textDecorationLine: "underline" }}>Clear</T></Pressable> : null}
                        </>
                      ) : <T v="meta" color={c.ink3}>Tap faces above to pick people.</T>}
                    </View>
                  </View>
                )
              ) : mode === "roles" ? (
                roleList.length === 0 ? (
                  <T v="meta" color={c.ink3}>{roles.data ? "This chapter has no roles yet. Pick People or Everyone instead." : "…"}</T>
                ) : (
                  <View style={{ gap: 10 }}>
                    {roleList.map(r => {
                      const hs = holders(r.id);
                      const on = roleIds.includes(r.id);
                      return (
                        <Pressable key={r.id} onPress={() => { haptics.select(); setRoleIds(l => toggle(l, r.id)); setErr(null); }}
                          accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityHint={`Whoever holds ${r.name}, now and later`}
                          style={[styles.tag, { borderColor: on ? c.ink : c.line2, backgroundColor: c.card }]}>
                          <View style={[styles.ok, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : "transparent" }]}>{on ? <Icon name="check" size={10} color={c.paper} /> : null}</View>
                          <View style={[styles.sw, { backgroundColor: r.color ?? c.note.fill.mint, borderColor: c.ink }]} />
                          <T v="bodyStrong" size={14.4}>{r.name}</T>
                          <View style={styles.hold}>
                            <View style={{ flexDirection: "row" }}>{hs.slice(0, 4).map((b, i) => <View key={b.id} style={{ marginLeft: i ? -6 : 0 }}><Avatar name={b.name} uri={b.avatarUrl} tone={avTone(b.id)} px={20} ring={c.card} /></View>)}</View>
                            <T v="meta" size={11.8} color={c.ink3} numberOfLines={1} style={{ flexShrink: 1 }}>{hs.length ? names(hs.map(b => nameOf(b.id))) : "Nobody holds it yet"}</T>
                          </View>
                        </Pressable>
                      );
                    })}
                    <View style={styles.reach}>
                      {roleIds.length
                        ? reach.length
                          ? <>
                              <View style={{ flexDirection: "row" }}>{reach.slice(0, 8).map((id, i) => { const b = byId.get(id); return b ? <View key={id} style={{ marginLeft: i ? -8 : 0 }}><Avatar name={b.name} uri={b.avatarUrl} tone={avTone(id)} px={26} ring={c.paper2} /></View> : null; })}</View>
                              <T v="meta" size={13} color={c.ink2} style={{ flex: 1 }}>Right now that’s <B s={13}>{`${reach.length} ${reach.length === 1 ? "person" : "people"}`}</B>{`: ${names(reach.map(nameOf))}`}</T>
                            </>
                          : <T v="meta" color={c.ink2}>{`Nobody holds ${roleIds.length === 1 ? "that role" : "those roles"} yet. It’ll reach whoever does.`}</T>
                        : <T v="meta" color={c.ink3}>Pick one or more roles. Everyone holding them gets it, now and later.</T>}
                    </View>
                  </View>
                )
              ) : (
                <View style={{ gap: 12 }}>
                  <View style={styles.swRow}>
                    <Pressable onPress={() => setEv("each")} style={styles.swLab} accessibilityRole="button">
                      <Icon name="people" size={15} color={ev === "each" ? c.ink : c.ink3} />
                      <T v="bodyStrong" size={13.4} color={ev === "each" ? c.ink : c.ink3}>Everyone does it</T>
                    </Pressable>
                    <Pressable onPress={() => { haptics.tap(); setEv(ev === "each" ? "any" : "each"); }} accessibilityRole="switch" accessibilityState={{ checked: ev === "any" }} accessibilityLabel="Just one person"
                      style={[styles.sw2, { borderColor: c.ink, backgroundColor: ev === "any" ? c.note.fill.butter : c.note.fill.lilac }]}>
                      <View style={[styles.knob, { backgroundColor: c.card, borderColor: c.ink, alignSelf: ev === "any" ? "flex-end" : "flex-start" }]} />
                    </Pressable>
                    <Pressable onPress={() => setEv("any")} style={styles.swLab} accessibilityRole="button">
                      <Icon name="hand" size={15} color={ev === "any" ? c.ink : c.ink3} />
                      <T v="bodyStrong" size={13.4} color={ev === "any" ? c.ink : c.ink3}>Just one person</T>
                    </Pressable>
                  </View>
                  <Crowd people={members} mode={ev} />
                  <T v="callout" size={14} color={c.ink2} accessibilityLiveRegion="polite">
                    {ev === "each"
                      ? <><B s={14}>{`${brothers.length} separate ticks.`}</B>{` Each person ticks their own. It’s done when all ${brothers.length} have. `}<T v="callout" size={14} color={c.ink3}>New members get it too.</T></>
                      : <><B s={14}>One tick for the whole chapter.</B> Whoever gets to it first ticks it, and it’s off everyone’s list.</>}
                  </T>
                </View>
              )}
            </View>
          </View>

          {showNote ? (
            <View style={{ gap: 8 }}>
              <View style={styles.head}>
                <T v="label" color={c.ink2}>Note <T v="label" color={c.ink3}>· optional</T></T>
                <Pressable onPress={() => { setNotes(""); setShowNote(false); }} accessibilityRole="button" hitSlop={6}><T v="buttonSm" size={12} color={c.ink3}>Remove</T></Pressable>
              </View>
              <BigInput value={notes} onChangeText={setNotes} placeholder="Links, details, what “done” looks like…" maxLength={2000} multiline autoFocus={!task?.notes} tone="butter" small />
            </View>
          ) : (
            <Pressable onPress={() => setShowNote(true)} accessibilityRole="button" style={styles.addnote}>
              <Icon name="plus" size={15} color={c.ink2} /><T v="bodyStrong" size={14.4} color={c.ink2}>Add a note</T>
            </Pressable>
          )}
        </View>
      </Sheet>
      <DeleteTask task={doomed} onClose={() => setDoomed(null)} />
    </>
  );
}

/* ── shared form pieces (the poll sheet uses them too) ────────────────────────── */

export function B({ children, s = 13 }: { children: string; s?: number }) {
  return <T v="bodyStrong" size={s}>{children}</T>;
}

export function Lab({ children }: { children: string }) {
  const { c } = useTheme();
  return <T v="label" color={c.ink2}>{children}</T>;
}

export function Head({ label, say }: { label: string; say: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.head}>
      <T v="label" color={c.ink2}>{label}</T>
      <T v="meta" color={c.ink3} numberOfLines={1} style={{ flexShrink: 1 }}>{say}</T>
    </View>
  );
}

export function BigInput({ tone, small, style, ...rest }: React.ComponentProps<typeof TextInput> & { tone: Tone; small?: boolean }) {
  const { c } = useTheme();
  const scale = useFontScale();
  return (
    <TextInput placeholderTextColor={c.faint} selectionColor={c.ink} allowFontScaling={false} {...rest}
      style={[resolveType("body", scale), styles.big, small ? styles.bigSm : null,
        { color: c.ink, backgroundColor: c.paper, borderColor: c.ink, boxShadow: `3px 3px 0 ${c.pastel[tone].fill}` }, rest.multiline ? { minHeight: 88, textAlignVertical: "top" } : null, style]} />
  );
}

export function Chip({ label, small, icon, on, disabled, onPress, dashed }: { label: string; small?: string; icon?: IconName; on: boolean; disabled?: boolean; onPress: () => void; dashed?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected: on, disabled }}
      style={[styles.chip, { borderColor: on ? c.ink : c.line2, backgroundColor: c.card, borderStyle: dashed && !on ? "dashed" : "solid", opacity: disabled ? 0.35 : 1 },
        on && { boxShadow: `2.5px 2.5px 0 ${c.pastel.butter.fill}` }]}>
      {icon ? <Icon name={icon} size={14} color={on ? c.ink : c.ink2} /> : null}
      <T v="bodyStrong" size={14.4} color={on ? c.ink : dashed ? c.ink3 : c.ink2}>{label}</T>
      {small ? <T v="meta" size={11.5} color={c.ink3}>{small}</T> : null}
    </Pressable>
  );
}

function Find({ value, onChangeText }: { value: string; onChangeText: (s: string) => void }) {
  const { c } = useTheme();
  const scale = useFontScale();
  return (
    <View style={[styles.find, { borderColor: c.line2, backgroundColor: c.paper }]}>
      <Icon name="search" size={15} color={c.ink3} />
      <TextInput value={value} onChangeText={onChangeText} placeholder="Find someone" accessibilityLabel="Find someone" autoCorrect={false}
        placeholderTextColor={c.faint} allowFontScaling={false} style={[resolveType("body", scale), { flex: 1, color: c.ink, paddingVertical: 10 }]} />
    </View>
  );
}

function WhoTile({ on, label, sub, art, onPress }: { on: boolean; label: string; sub: string; art: ReactNode; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${label}, ${sub}`}
      style={({ pressed }) => [styles.tile, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.card : c.paper }, on && { boxShadow: `3px 3px 0 ${c.pastel.peach.fill}` }, pressed && { transform: [{ translateY: 1 }] }]}>
      <View style={styles.art}>{art}</View>
      <T v="title" size={17} ls={-0.02} color={on ? c.ink : c.ink2}>{label}</T>
      <T v="meta" color={c.ink3} numberOfLines={1}>{sub}</T>
      {on ? <View style={[styles.okTile, { backgroundColor: c.ink }]}><Icon name="check" size={10} color={c.paper} /></View> : null}
    </Pressable>
  );
}

function Face({ b, you, on, onPress }: { b: Brother; you: boolean; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${you ? "You" : b.name}, ${b.role || "Member"}`}
      style={[styles.face, { borderColor: on ? c.ink : "transparent", backgroundColor: on ? c.pastel.peach.soft : c.card }]}>
      <Avatar name={b.name} uri={b.avatarUrl} tone={avTone(b.id)} px={30} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="bodyStrong" size={14.4} numberOfLines={1}>{you ? "You" : b.name}</T>
        <T v="meta" size={12} color={c.ink3} numberOfLines={1}>{b.role || "Member"}</T>
      </View>
    </Pressable>
  );
}

/** The roster as faces, then an arrow to "1 · first one in" (`.tsh-crowd`). */
export function Crowd({ people, mode }: { people: Brother[]; mode: "each" | "any" }) {
  const { c } = useTheme();
  const shown = people.length > CROWD_MAX ? people.slice(0, CROWD_MAX - 1) : people;
  const more = people.length - shown.length;
  return (
    <View style={styles.crowd} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.crowdPpl}>
        {shown.map(b => (
          <View key={b.id} style={{ alignItems: "center", gap: 2 }}>
            <Avatar name={b.name} uri={b.avatarUrl} tone={avTone(b.id)} px={24} />
            <View style={[styles.tick, { borderColor: c.ink, backgroundColor: mode === "each" ? c.note.fill.mint : "transparent", opacity: mode === "each" ? 1 : 0.3 }]} />
          </View>
        ))}
        {more > 0 ? <View style={[styles.more, { backgroundColor: c.paper3 }]}><T v="pill" size={10}>{`+${more}`}</T></View> : null}
      </View>
      <View style={{ opacity: mode === "any" ? 1 : 0.3, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="arrow-r" size={14} color={c.ink3} />
        <View style={{ alignItems: "center" }}>
          <View style={[styles.one, { borderColor: c.ink, backgroundColor: c.note.fill.butter }]}><T v="bodyStrong" size={12} color={c.note.ink}>1</T></View>
          <T v="meta" size={10} color={c.ink3}>first one in</T>
        </View>
      </View>
    </View>
  );
}

/** The footer's preview row (`.tsh-prow`). */
export function PreviewRow({ tone, title, placeholder, stub, box, stubLabel = "ANY", children }: {
  tone: Tone; title: string; placeholder: string; stub: { mon: string; day: string; today?: boolean } | null; box?: boolean; stubLabel?: string; children: ReactNode;
}) {
  const { c } = useTheme();
  const sc: Tone = stub?.today ? "butter" : tone;
  return (
    <View style={[styles.prow, { borderColor: c.ink, backgroundColor: c.card }]}>
      <View style={[box ? styles.prowBx : styles.prowCk, { borderColor: c.ink }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="bodyStrong" size={14.4} color={title ? c.ink : c.faint} numberOfLines={1}>{title || placeholder}</T>
        <View style={styles.prowMeta}>{children}</View>
      </View>
      {stub ? (
        <View style={[styles.stub, { borderColor: c.ink, backgroundColor: c.card }]}>
          <View style={[styles.stubTop, { borderBottomColor: c.ink, backgroundColor: c.note.fill[sc] }]}><T v="kicker" size={8.5} color={c.note.ink}>{stub.mon}</T></View>
          <T v="title" size={15} align="center" style={{ paddingVertical: 2 }}>{stub.day}</T>
        </View>
      ) : (
        <View style={[styles.stub, { borderColor: c.line2, borderStyle: "dashed", backgroundColor: c.card }]}>
          <View style={[styles.stubTop, { borderBottomColor: c.line2, borderStyle: "dashed" }]}><T v="kicker" size={8.5} color={c.ink3}>{stubLabel}</T></View>
          <T v="title" size={15} align="center" color={c.ink3} style={{ paddingVertical: 2 }}>—</T>
        </View>
      )}
    </View>
  );
}

export function WhoTag({ icon, label, strong, muted, faces }: { icon?: IconName; label: string; strong?: boolean; muted?: boolean; faces?: Brother[] }) {
  const { c } = useTheme();
  return (
    <View style={[styles.who, { borderColor: strong ? c.ink : c.line, backgroundColor: c.paper }]}>
      {icon ? <Icon name={icon} size={12} color={c.ink} /> : null}
      {faces?.map((b, i) => <View key={b.id} style={{ marginLeft: i ? -6 : 0 }}><Avatar name={b.name} uri={b.avatarUrl} tone={avTone(b.id)} px={18} ring={c.paper} /></View>)}
      <T v="pill" size={11.5} color={muted ? c.ink3 : strong ? c.ink : c.ink2} numberOfLines={1}>{label}</T>
    </View>
  );
}

/* ── delete ───────────────────────────────────────────────────────────────────── */

export function DeleteTask({ task, onClose, onDeleted }: { task: Task | null; onClose: () => void; onDeleted?: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Task | null>(null);
  useEffect(() => { if (task) { setLast(task); setBusy(false); } }, [task]);
  const t = task ?? last;

  const go = async () => {
    if (!t) return;
    setBusy(true);
    try {
      await deleteTask(t.id);
      haptics.soft();
      onClose();
      onDeleted?.();
    } catch (x) {
      haptics.error();
      setBusy(false);
      toast.error("Could not delete the task.", { detail: errorMessage(x) });
    }
  };

  return (
    <Sheet open={!!task} onClose={onClose} locked={busy} size="fit" tone="rose" icon="trash" title="Delete task"
      footer={
        <View style={styles.acts}>
          <View style={{ flex: 1 }} />
          <TBtn soft label="Cancel" onPress={onClose} disabled={busy} />
          <TBtn label={busy ? "Deleting…" : "Delete"} tone="rose" onPress={() => void go()} disabled={busy} />
        </View>
      }>
      {t ? <T v="body" color={c.ink2}>{`Delete "${t.title}"? This can't be undone.`}</T> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  big: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18 },
  bigSm: { fontSize: 15 },
  whenRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  whenLab: { width: 44, paddingTop: 11 },
  chips: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, minHeight: 40 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 14, paddingHorizontal: 6, borderRadius: 16, borderWidth: 1.5 },
  art: { height: 38, justifyContent: "center", alignItems: "center", marginBottom: 4 },
  okTile: { position: "absolute", top: 7, right: 7, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tagMini: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6, borderWidth: 1.3, maxWidth: 92 },
  dots: { flexDirection: "row", flexWrap: "wrap", width: 76, gap: 3, justifyContent: "center" },
  dotP: { width: 9, height: 9, borderRadius: 5, borderWidth: 1 },
  panel: { borderWidth: 1.5, borderRadius: 20, padding: 12 },
  faces: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  face: { width: "48.5%", flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1.5, minHeight: 56 },
  find: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14 },
  tray: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, minHeight: 28 },
  pk: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2, paddingLeft: 2, paddingRight: 8, borderRadius: 999, borderWidth: 1.3 },
  tag: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5 },
  ok: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  sw: { width: 10, height: 10, borderRadius: 3, borderWidth: 1.2 },
  hold: { flexDirection: "row", alignItems: "center", gap: 6, flexBasis: "100%", paddingLeft: 26 },
  reach: { flexDirection: "row", alignItems: "center", gap: 10 },
  swRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  swLab: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  sw2: { width: 46, height: 26, borderRadius: 13, borderWidth: 1.5, padding: 2, justifyContent: "center" },
  knob: { width: 19, height: 19, borderRadius: 10, borderWidth: 1.5 },
  crowd: { flexDirection: "row", alignItems: "center", gap: 10 },
  crowdPpl: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tick: { width: 10, height: 10, borderRadius: 3, borderWidth: 1.2 },
  more: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  one: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  addnote: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingVertical: 4 },
  prow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5 },
  prowCk: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.8 },
  prowBx: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.6 },
  prowMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 4 },
  stub: { width: 38, borderRadius: 8, borderWidth: 1.5, overflow: "hidden" },
  stubTop: { alignItems: "center", paddingVertical: 1, borderBottomWidth: 1.5 },
  who: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 1, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1.3, maxWidth: 220 },
  nt: { flexDirection: "row", alignItems: "center", gap: 3 },
  acts: { flexDirection: "row", alignItems: "center", gap: 10 },
});
