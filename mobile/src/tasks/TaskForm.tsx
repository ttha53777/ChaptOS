/**
 * The new / edit task sheet for officers (MANAGE_TASKS), the web's PaperTaskSheet
 * (app/org/[slug]/tasks/TaskSheets.tsx) on the phone:
 *
 *   What needs doing   the title (200)
 *   When it's due      Today · Tomorrow · Next week · Pick a date (day stubs) · No date,
 *                      then a time on that day (the meetings Clock; none = any time). Days
 *                      outside the active term are off, as the server refuses them
 *   Who's on it        three tiles: People (faces, a search past 8), Roles (name tags with
 *                      who holds each, now and later) and Everyone, whose one switch is
 *                      the web's: everyone does their own (each) or just one person (any)
 *   Note               optional, behind "Add a note"
 *
 * The footer reads the task back the way the list will show it. Saving is POST /api/tasks
 * or PATCH /api/tasks/[id]; DeleteTask is the web's confirm. Both are MANAGE_TASKS.
 */
import type { Brother, RoleChip, Task } from "@/lib/api-types";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { localDay } from "~/data/home";
import { useRoles } from "~/data/programming";
import { createTask, deleteTask, editTask, useRoster, type NewTaskBody, type TaskEdit } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon, type IconName } from "~/icons/Icon";
import { Clock, DayStrip } from "~/meetings/EventForm";
import { addDays } from "~/meetings/model";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Avatar, AvatarStack } from "~/paper/bits";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { monthDay, weekdayShort } from "~/today/time";
import { Field } from "~/ui/Field";
import { Segmented } from "~/ui/Segmented";
import { T } from "~/ui/T";

type Who = "people" | "roles" | "all";
type DayKey = "today" | "tom" | "week" | "pick" | "none";

const toMin = (hhmm: string | null) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const clock12 = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`; };
const firstName = (n: string) => n.split(" ")[0] || n;
function names(xs: string[]): string {
  if (xs.length <= 2) return xs.join(" and ");
  return `${xs.slice(0, 2).join(", ")} and ${xs.length - 2} more`;
}

export function TaskForm({ open, task, onClose, onSaved }: { open: boolean; task: Task | null; onClose: () => void; onSaved?: (t: Task) => void }) {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const roster = useRoster(open);
  const roles = useRoles(open);
  const today = localDay();
  const term = me?.org?.activeTerm ?? null;
  const inTerm = (d: string) => !term || (d >= term.startDate && d <= term.endDate);
  const editing = !!task;
  const QUICK: { key: DayKey; label: string; iso: string }[] = [
    { key: "today", label: "Today", iso: today },
    { key: "tom", label: "Tomorrow", iso: addDays(today, 1) },
    { key: "week", label: "Next week", iso: addDays(today, 7) },
  ];

  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [picking, setPicking] = useState(false);
  const [time, setTime] = useState<number | null>(null);
  const [who, setWho] = useState<Who>("people");
  const [ids, setIds] = useState<number[]>([]);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [ev, setEv] = useState<"each" | "any">("each");
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const people = task?.assignments.flatMap(a => (a.brotherId != null ? [a.brotherId] : [])) ?? [];
    const rs = task?.assignments.flatMap(a => (a.roleId != null ? [a.roleId] : [])) ?? [];
    const tom = addDays(today, 1);
    const d = task ? task.dueDate ?? "" : inTerm(tom) ? tom : "";
    setTitle(task?.title ?? "");
    setDue(d);
    setPicking(!!d && !QUICK.some(x => x.iso === d));
    setTime(toMin(task?.dueTime ?? null));
    setWho(task?.everyone ? "all" : rs.length && !people.length ? "roles" : "people");
    setIds(task?.everyone ? [] : people);
    setRoleIds(task?.everyone ? [] : rs);
    setEv(task?.everyone ?? "each");
    setQ(""); setNotes(task?.notes ?? ""); setShowNote(!!task?.notes); setBusy(false); setErr(null);
  }, [open, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const brothers = roster.data ?? [];
  const byId = useMemo(() => new Map(brothers.map(b => [b.id, b] as const)), [brothers]);
  const members = useMemo(() => [...brothers].sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : a.name.localeCompare(b.name))), [brothers, me?.id]);
  const nameOf = (id: number) => (id === me?.id ? "You" : firstName(byId.get(id)?.name ?? "Someone"));
  const holders = (roleId: number) => brothers.filter(b => b.roles?.some(r => r.id === roleId));
  const reach = useMemo(() => {
    if (who === "all") return brothers.map(b => b.id);
    const set = new Set(ids);
    for (const b of brothers) if (b.roles?.some(r => roleIds.includes(r.id))) set.add(b.id);
    return [...set];
  }, [who, brothers, ids, roleIds]);

  const dayKey: DayKey = !due ? "none" : picking ? "pick" : QUICK.find(x => x.iso === due)?.key ?? "pick";
  const pickDay = (k: DayKey) => {
    if (k === dayKey && k !== "pick") return;
    haptics.select();
    setErr(null);
    if (k === "none") { setDue(""); setPicking(false); setTime(null); return; }
    if (k === "pick") { setPicking(true); if (!due || QUICK.some(x => x.iso === due)) { const two = addDays(today, 14); setDue(inTerm(two) ? two : term?.endDate ?? two); } return; }
    setPicking(false);
    setDue(QUICK.find(x => x.key === k)!.iso);
  };
  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const save = async () => {
    if (busy) return;
    let problem: string | null = null;
    if (!title.trim()) problem = "Say what needs doing.";
    else if (due && due !== task?.dueDate && !inTerm(due)) problem = "That date is outside this term.";
    else if (who !== "all" && ids.length + roleIds.length === 0) problem = who === "roles" ? "Pick at least one role, or choose People or Everyone." : "Pick at least one person, or choose Roles or Everyone.";
    if (problem) { haptics.error(); setErr(problem); return; }
    const all = who === "all";
    setBusy(true); setErr(null);
    try {
      let saved: Task;
      if (task) {
        const body: TaskEdit = {
          title: title.trim(),
          dueDate: due || null,
          dueTime: due && time != null ? toHHMM(time) : null,
          notes: notes.trim() || null,
          ...(all ? { everyone: ev } : { everyone: null, assigneeBrotherIds: ids, assigneeRoleIds: roleIds }),
        };
        saved = await editTask(task.id, body);
      } else {
        const body: NewTaskBody = {
          title: title.trim(),
          ...(due ? { dueDate: due } : {}),
          ...(due && time != null ? { dueTime: toHHMM(time) } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(all ? { everyone: ev } : { assigneeBrotherIds: ids, assigneeRoleIds: roleIds }),
        };
        saved = await createTask(body);
      }
      haptics.success();
      onClose();
      onSaved?.(saved);
      toast.show(task ? "Task saved" : "Task added", { detail: saved.title });
    } catch (x) {
      haptics.error();
      setErr(errorMessage(x));
      setBusy(false);
    }
  };

  const readback = due
    ? `Due ${weekdayShort(due)}, ${monthDay(due)}${time != null ? ` by ${clock12(time)}` : ""}`
    : "No due date";
  const say = who === "all"
    ? (ev === "each" ? `${brothers.length} people, each on their own` : `Any one of ${brothers.length}`)
    : reach.length ? `${reach.length} ${reach.length === 1 ? "person" : "people"}` : "Nobody yet";
  const needle = q.trim().toLowerCase();
  const shown = members.filter(b => !needle || `${b.name} ${b.role ?? ""}`.toLowerCase().includes(needle));
  const roleList = roles.data ?? [];

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone="peach" icon="box"
      kicker={editing ? task!.title : "Hand it out"} title={editing ? "Edit task" : "New task"}
      footer={
        <View style={{ gap: 8 }}>
          {err ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T> : null}
          <T v="meta" color={c.ink3} numberOfLines={1}>{`${readback} · ${say}`}</T>
          <Button label={busy ? "Saving…" : editing ? "Save" : "Add task"} icon="check" tone="peach" block onPress={() => void save()} disabled={busy} />
        </View>
      }>
      <View style={{ gap: 22 }}>
        <Field label="What needs doing" value={title} onChangeText={t => { setTitle(t); setErr(null); }} placeholder="Book the room for chapter" maxLength={200} autoFocus={!editing} />

        <View style={{ gap: 10 }}>
          <Head label="When it's due" say={readback} />
          <View style={styles.chips}>
            {QUICK.map(x => <Chip key={x.key} label={x.label} on={dayKey === x.key} disabled={!inTerm(x.iso)} onPress={() => pickDay(x.key)} tone="peach" />)}
            <Chip label="Pick a date" icon="cal" on={dayKey === "pick"} onPress={() => pickDay("pick")} tone="peach" />
            <Chip label="No date" on={dayKey === "none"} onPress={() => pickDay("none")} tone="peach" dashed />
          </View>
          {dayKey === "pick" ? (
            <DayStrip value={due} onChange={d => { setDue(d); setErr(null); }} today={today} term={term} usualDow={null} taken={new Set()} editing={editing} open={open} />
          ) : null}
          {due ? <Clock minutes={time} onChange={setTime} tone="peach" /> : null}
        </View>

        <View style={{ gap: 10 }}>
          <Head label="Who's on it" say={say} />
          <View style={styles.tiles} accessibilityRole="radiogroup">
            <WhoTile on={who === "people"} label="People" sub={ids.length ? `${ids.length} picked` : "Pick names"} onPress={() => { if (who !== "people") { haptics.select(); setWho("people"); setErr(null); } }}
              art={<AvatarStack people={members.filter(b => b.id !== me?.id).slice(0, 2).map(b => ({ name: b.name, uri: b.avatarUrl }))} size="sm" max={2} />} />
            <WhoTile on={who === "roles"} label="Roles" sub={roleIds.length ? `${roleIds.length} role${roleIds.length === 1 ? "" : "s"}` : "By title"} onPress={() => { if (who !== "roles") { haptics.select(); setWho("roles"); setErr(null); } }}
              art={<Icon name="key" size={22} color={c.pastel.mint.ink} />} />
            <WhoTile on={who === "all"} label="Everyone" sub={`All ${brothers.length}`} onPress={() => { if (who !== "all") { haptics.select(); setWho("all"); setErr(null); } }}
              art={<Icon name="people" size={22} color={c.pastel.sky.ink} />} />
          </View>

          <View style={[styles.panel, { borderColor: c.line2, backgroundColor: c.paper2 }]}>
            {who === "people" ? (
              <View style={{ gap: 8 }}>
                {brothers.length > 8 ? <Field label="Find someone" value={q} onChangeText={setQ} placeholder="Name or title" autoCorrect={false} /> : null}
                {!roster.data ? <T v="meta" color={c.ink3}>Loading the roster…</T> : null}
                {shown.map(b => (
                  <Face key={b.id} b={b} you={b.id === me?.id} on={ids.includes(b.id)} onPress={() => { haptics.select(); setIds(l => toggle(l, b.id)); setErr(null); }} />
                ))}
                {needle && !shown.length ? <T v="meta" color={c.ink3}>{`No one called "${q.trim()}".`}</T> : null}
                <T v="meta" color={c.ink3}>{ids.length ? `Picked: ${names(ids.map(nameOf))}` : "Tap people to pick them."}</T>
              </View>
            ) : who === "roles" ? (
              roleList.length === 0 ? (
                <T v="meta" color={c.ink3}>{roles.data ? "This chapter has no roles yet. Pick People or Everyone instead." : "Loading roles…"}</T>
              ) : (
                <View style={{ gap: 8 }}>
                  {roleList.map(r => (
                    <RoleTag key={r.id} r={r} on={roleIds.includes(r.id)} holders={holders(r.id).map(b => nameOf(b.id))}
                      onPress={() => { haptics.select(); setRoleIds(l => toggle(l, r.id)); setErr(null); }} />
                  ))}
                  <T v="meta" color={c.ink3}>
                    {roleIds.length
                      ? reach.length ? `Right now that's ${reach.length} ${reach.length === 1 ? "person" : "people"}: ${names(reach.map(nameOf))}.` : `Nobody holds ${roleIds.length === 1 ? "that role" : "those roles"} yet. It'll reach whoever does.`
                      : "Pick one or more roles. Everyone holding them gets it, now and later."}
                  </T>
                </View>
              )
            ) : (
              <View style={{ gap: 10 }}>
                <Segmented label="Who ticks it" value={ev} onChange={setEv}
                  options={[{ value: "each", label: "Everyone does it" }, { value: "any", label: "Just one person" }]} />
                <AvatarStack people={members.map(b => ({ name: b.name, uri: b.avatarUrl }))} size="sm" max={10} />
                <T v="callout" color={c.ink2} accessibilityLiveRegion="polite">
                  {ev === "each"
                    ? `${brothers.length} separate ticks. Each person ticks their own. It's done when all ${brothers.length} have. New members get it too.`
                    : "One tick for the whole chapter. Whoever gets to it first ticks it, and it's off everyone's list."}
                </T>
              </View>
            )}
          </View>
        </View>

        {showNote ? (
          <View style={{ gap: 6 }}>
            <Field label="Note (optional)" value={notes} onChangeText={setNotes} placeholder={"Links, details, what “done” looks like…"} maxLength={2000} multiline
              style={{ minHeight: 88, textAlignVertical: "top" }} autoFocus={!task?.notes} />
            <Button label="Remove the note" size="sm" variant="soft" icon="x" onPress={() => { setNotes(""); setShowNote(false); }} style={{ alignSelf: "flex-start" }} />
          </View>
        ) : (
          <Button label="Add a note" size="sm" variant="soft" icon="plus" onPress={() => setShowNote(true)} style={{ alignSelf: "flex-start" }} />
        )}
      </View>
    </Sheet>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────────────── */

function Head({ label, say }: { label: string; say: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.head}>
      <T v="label" color={c.ink2}>{label}</T>
      <T v="meta" color={c.ink3} numberOfLines={1} style={{ flexShrink: 1 }}>{say}</T>
    </View>
  );
}

function Chip({ label, icon, on, disabled, onPress, tone, dashed }: { label: string; icon?: IconName; on: boolean; disabled?: boolean; onPress: () => void; tone: Tone; dashed?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected: on, disabled }}
      style={[styles.chip, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel[tone].soft : c.card, borderStyle: dashed && !on ? "dashed" : "solid", opacity: disabled ? 0.35 : 1 }]}>
      {icon ? <Icon name={icon} size={13} color={on ? c.ink : c.ink3} /> : null}
      <T v="pill" color={on ? c.ink : c.ink2}>{label}</T>
    </Pressable>
  );
}

function WhoTile({ on, label, sub, art, onPress }: { on: boolean; label: string; sub: string; art: ReactNode; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${label}, ${sub}`}
      style={({ pressed }) => [styles.tile, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.card : c.paper, boxShadow: on ? `3px 3px 0 ${c.note.fill.peach}` : undefined }, pressed && { transform: [{ translateY: 1 }] }]}>
      <View style={styles.art}>{art}</View>
      <T v="callout" style={{ fontWeight: "700" }}>{label}</T>
      <T v="meta" color={c.ink3} numberOfLines={1} style={{ fontSize: 11.5 }}>{sub}</T>
      {on ? <View style={[styles.ok, { backgroundColor: c.ink }]}><Icon name="check" size={10} color={c.paper} /></View> : null}
    </Pressable>
  );
}

function Face({ b, you, on, onPress }: { b: Brother; you: boolean; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${you ? "You" : b.name}, ${b.role || "Member"}`}
      style={[styles.face, { borderColor: on ? c.ink : c.line, backgroundColor: on ? c.pastel.peach.soft : c.card }]}>
      <Avatar name={b.name} uri={b.avatarUrl} size="sm" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="callout" numberOfLines={1} style={{ fontWeight: on ? "700" : "500" }}>{you ? "You" : b.name}</T>
        <T v="meta" color={c.ink3} numberOfLines={1}>{b.role || "Member"}</T>
      </View>
      <View style={[styles.box, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : "transparent" }]}>{on ? <Icon name="check" size={11} color={c.paper} /> : null}</View>
    </Pressable>
  );
}

function RoleTag({ r, on, holders, onPress }: { r: RoleChip; on: boolean; holders: string[]; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${r.name}, ${holders.length ? names(holders) : "nobody holds it yet"}`}
      style={[styles.face, { borderColor: on ? c.ink : c.line, backgroundColor: on ? c.pastel.mint.soft : c.card }]}>
      <View style={[styles.swatch, { backgroundColor: r.color ?? c.note.fill.mint, borderColor: c.ink }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="callout" numberOfLines={1} style={{ fontWeight: "700" }}>{r.name}</T>
        <T v="meta" color={c.ink3} numberOfLines={1}>{holders.length ? names(holders) : "Nobody holds it yet"}</T>
      </View>
      <View style={[styles.box, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : "transparent" }]}>{on ? <Icon name="check" size={11} color={c.paper} /> : null}</View>
    </Pressable>
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
      toast.show("Task deleted", { detail: t.title });
    } catch (x) {
      haptics.error();
      setBusy(false);
      toast.error("Couldn't delete the task", { detail: errorMessage(x) });
    }
  };

  return (
    <Sheet open={!!task} onClose={onClose} locked={busy} size="fit" tone="rose" icon="trash" kicker={t?.title ?? ""} title="Delete task"
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
          <Button label={busy ? "Deleting…" : "Delete"} icon="trash" tone="rose" block style={{ flex: 1 }} onPress={() => void go()} disabled={busy} />
        </View>
      }>
      {t ? <T v="body" color={c.ink2}>{`Delete "${t.title}"? It comes off everyone's list. This can't be undone.`}</T> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, minHeight: 34 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 16, borderWidth: 1.5 },
  art: { height: 30, justifyContent: "center", alignItems: "center", marginBottom: 2 },
  ok: { position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  panel: { borderWidth: 1, borderRadius: 16, padding: 10 },
  face: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, minHeight: 48 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1 },
});
