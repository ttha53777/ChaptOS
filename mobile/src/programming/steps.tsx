/**
 * The sheets Programming opens, each the web's own step (words from lib/programme/board):
 *
 *   OwnerPicker   Person | Role (+ Unassign): the roster with each member's title, the
 *                 roles with how many hold them now
 *   FixStep       a forward move that's missing something: "One step to …", just those
 *                 fields with their hints, "N left" / "All clear", then the move
 *   WrapUp        Confirmed → Done: How did it go? (stars), a note, what it cost
 *   NewIdea       a title and a type; lands in Idea with nobody on it
 *   EventForm     New event / Edit event: name, date, time, type, attendance, collab,
 *                 location, notes
 *   HelpSheet     How this board works, computed from the gates themselves
 *   DeleteEvent   Delete this event?
 *
 * Every write is MANAGE_EVENTS. One haptic per result: success once the server
 * confirms, error when it refuses (the refusal's words go to a toast or under the
 * button). Selection chips tap "select".
 */
import type { Brother, CalEventType, EventFieldRow, ProgrammingEvent, ProgrammingOwner, ProgrammingStage, RoleChip } from "@/lib/api-types";
import { roleTitle } from "@/lib/dashboard/roster";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { localDay } from "~/data/home";
import { createProgramming, deleteProgramming, moveStage, patchProgramming, setProgramming, type NewProgrammingBody, type ProgrammingPatch } from "~/data/programming";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon, type IconName } from "~/icons/Icon";
import { Clock, DayStrip } from "~/meetings/EventForm";
import { addDays, deviceZone, wallOf, wallToInstant, zoneName } from "~/meetings/model";
import { durationLabel, suspectLength } from "@/lib/timeline/schedule-length";
import { parseLegacyTime, timeIsClear } from "@/lib/calendar-feed/legacy-time";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { resolveType } from "~/theme/type";
import { useFontScale, useTheme } from "~/theme/PaperProvider";
import { Switch } from "~/ui/Switch";
import { T } from "~/ui/T";
import {
  FIX, HELP, IDEA, MAX_WRAP_NOTES, RATING_LABELS, SAY, STAGE_LABELS, STAGE_TONE, WRAP, attendanceText, canEnter, fixCopy, helpRows,
  ideaRemain, initialsOf, isForward, missingFor, needsConfirmFirst, zoneLine, type RequiredField,
  typeCat,
} from "./model";

/* ── moving lanes (the web's moveStage / commitStage) ─────────────────────────── */

export type Opened = { kind: "fix"; e: ProgrammingEvent; stage: ProgrammingStage } | { kind: "wrap"; e: ProgrammingEvent };

/** Write a stage change, no questions asked. True when the server took it. */
export async function commitStage(e: ProgrammingEvent, stage: ProgrammingStage): Promise<boolean> {
  try {
    await moveStage(e, stage);
    haptics.success();
    return true;
  } catch (x) {
    haptics.error();
    toast.error(SAY.moveFail, { detail: errorMessage(x) });
    return false;
  }
}

/**
 * Move an event, enforcing the gates the server does. Backward is always free;
 * a blocked forward move opens the step that fixes it (returned), Done goes through
 * the wrap-up, and an unconfirmed event can't be wrapped (the toast offers Confirm it).
 */
export function routeMove(e: ProgrammingEvent, stage: ProgrammingStage, open: (o: Opened) => void) {
  if (stage === e.stage) return;
  if (needsConfirmFirst(e, stage)) {
    toast.show(SAY.confirmFirst(e.title), { undoLabel: SAY.confirmIt, undo: () => routeMove(e, "confirmed", open) });
    return;
  }
  const fwd = isForward(e.stage, stage);
  if (fwd && !canEnter(e, stage)) { open({ kind: "fix", e, stage }); return; }
  if (fwd && stage === "done") { open({ kind: "wrap", e }); return; }
  void commitStage(e, stage);
}

/** Save a field edit; a refusal puts the board back and says so. */
export async function patchEvent(id: number, patch: ProgrammingPatch): Promise<boolean> {
  try {
    await patchProgramming(id, patch);
    return true;
  } catch (x) {
    haptics.error();
    toast.error(SAY.saveFail, { detail: errorMessage(x) });
    return false;
  }
}

/* ── shared bits ──────────────────────────────────────────────────────────────── */

function useOrgBits() {
  const me = useEntryOf("ready")?.me ?? null;
  return { me, term: me?.org?.activeTerm ?? null, zone: me?.org?.timeZone || deviceZone(), today: localDay() };
}

function Lab({ children }: { children: string }) {
  const { c } = useTheme();
  return <T v="label" color={c.ink2}>{children}</T>;
}

function Foot({ left, cancel, go, busy, ok, onCancel, onGo, danger }: {
  left?: React.ReactNode; cancel: string; go: string; busy?: boolean; ok: boolean; onCancel: () => void; onGo: () => void; danger?: boolean;
}) {
  return (
    <View style={styles.foot}>
      {left ?? null}
      <View style={{ flex: 1 }} />
      <Button label={cancel} variant="ghost" onPress={onCancel} disabled={busy} />
      <Button label={go} tone={danger ? "rose" : "lilac"} onPress={onGo} disabled={!ok || busy} />
    </View>
  );
}

function Input({ value, onChange, placeholder, label, multiline, maxLength, keyboardType, prefix }: {
  value: string; onChange: (t: string) => void; placeholder?: string; label: string; multiline?: boolean; maxLength?: number;
  keyboardType?: "default" | "decimal-pad"; prefix?: string;
}) {
  const { c } = useTheme();
  const scale = useFontScale();
  return (
    <View style={[styles.input, multiline && { minHeight: 96, alignItems: "flex-start" }, { borderColor: c.line2, backgroundColor: c.card }]}>
      {prefix ? <T v="mono" color={c.ink3}>{prefix}</T> : null}
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.faint} accessibilityLabel={label}
        multiline={multiline} maxLength={maxLength} keyboardType={keyboardType ?? "default"}
        style={[resolveType("body", scale), { flex: 1, color: c.ink, paddingVertical: 10 }, multiline && { textAlignVertical: "top" }]} />
    </View>
  );
}

/** The type chips (a type's own colour dot), single choice. */
export function TypeChips({ list, value, onChange, label }: { list: CalEventType[]; value: string; onChange: (s: string) => void; label: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {list.map(t => {
        const on = t.slug === value;
        const cat = typeCat(t.slug, list, c);
        return (
          <Pressable key={t.slug} onPress={() => { if (!on) { haptics.select(); onChange(t.slug); } }} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={[styles.chip, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? cat.soft : c.card }]}>
            <View style={[styles.dot, { backgroundColor: cat.ink }]} />
            <T v="pill" color={on ? c.ink : c.ink2}>{t.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── OwnerPicker ─────────────────────────────────────────────────────────────── */

export type OwnerPatch = { ownerBrotherId: number | null } | { ownerRoleId: number | null };

export function OwnerPicker({ value, roster, roles, onChange }: {
  value: ProgrammingOwner; roster: Brother[]; roles: RoleChip[]; onChange: (p: OwnerPatch) => void;
}) {
  const { c } = useTheme();
  const [mode, setMode] = useState<"person" | "role">(value?.kind === "role" ? "role" : "person");
  const key = value ? `${value.kind}:${value.id}` : "none";
  useEffect(() => { setMode(value?.kind === "role" ? "role" : "person"); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.tabsRow}>
        <View style={[styles.tabs, { backgroundColor: c.paper2, borderColor: c.line }]} accessibilityRole="tablist" accessibilityLabel="Owner kind">
          {(["person", "role"] as const).map(mk => {
            const on = mode === mk;
            return (
              <Pressable key={mk} onPress={() => { if (!on) { haptics.select(); setMode(mk); } }} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={[styles.tab, on && { backgroundColor: c.card }]}>
                <T v="buttonSm" color={on ? c.ink : c.ink3}>{mk === "person" ? "Person" : "Role"}</T>
              </Pressable>
            );
          })}
        </View>
        {value ? (
          <Pressable onPress={() => onChange(value.kind === "role" ? { ownerRoleId: null } : { ownerBrotherId: null })} accessibilityRole="button"
            style={({ pressed }) => [styles.unassign, pressed && pressedDim]}>
            <T v="buttonSm" color={c.ink3}>Unassign</T>
          </Pressable>
        ) : null}
      </View>
      {mode === "person" ? (
        <View style={{ gap: 6 }} accessibilityLabel="Roster">
          {!roster.length ? <T v="meta" color={c.ink3}>Nobody on the roster yet.</T> : null}
          {roster.map(b => {
            const on = value?.kind === "brother" && value.id === b.id;
            return (
              <PickOpt key={b.id} on={on} initials={initialsOf(b.name)} title={b.name} sub={roleTitle(b)}
                onPress={() => { haptics.select(); onChange({ ownerBrotherId: on ? null : b.id }); }} />
            );
          })}
        </View>
      ) : (
        <View style={{ gap: 6 }} accessibilityLabel="Roles">
          {!roles.length ? <T v="meta" color={c.ink3}>This chapter has no roles yet.</T> : null}
          {roles.map(r => {
            const on = value?.kind === "role" && value.id === r.id;
            const held = r.memberCount ?? 0;
            return (
              <PickOpt key={r.id} on={on} role initials={initialsOf(r.name)} title={r.name} sub={held === 0 ? "nobody holds it now" : `${held} now`}
                onPress={() => { haptics.select(); onChange({ ownerRoleId: on ? null : r.id }); }} />
            );
          })}
        </View>
      )}
    </View>
  );
}

function PickOpt({ on, role, initials, title, sub, onPress }: { on: boolean; role?: boolean; initials: string; title: string; sub: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[styles.opt, { borderColor: on ? c.ink : c.line, backgroundColor: on ? c.pastel.butter.soft : c.card }]}>
      <View style={[styles.av, { borderRadius: role ? 6 : 13, backgroundColor: role ? c.paper2 : c.pastel.butter.soft, borderColor: c.line2 }]}>
        <T v="mono" size={10} color={c.ink2} style={{ fontWeight: "700" }}>{initials}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T v="callout" numberOfLines={1}>{title}</T>
        <T v="meta" size={12} color={c.ink3} numberOfLines={1}>{sub}</T>
      </View>
      {on ? <Icon name="check" size={14} color={c.ink} /> : null}
    </Pressable>
  );
}

/* ── FixStep ─────────────────────────────────────────────────────────────────── */

type Draft = { title?: string; category?: string; ownerBrotherId?: number | null; ownerRoleId?: number | null; dueDate?: string | null; location?: string; mandatory?: boolean };

function answered(f: RequiredField, d: Draft, e: ProgrammingEvent): boolean {
  switch (f.key) {
    case "title": return (d.title ?? e.title).trim().length > 0;
    case "category": return (d.category ?? e.category).trim().length > 0;
    case "owner":
      if (d.ownerBrotherId !== undefined) return d.ownerBrotherId !== null;
      if (d.ownerRoleId !== undefined) return d.ownerRoleId !== null;
      return e.owner != null;
    case "date": return !!(d.dueDate !== undefined ? d.dueDate : e.dueDate);
    case "location": return (d.location ?? e.location).trim().length > 0;
    case "mandatory": return true;
  }
}

export function FixStep({ target, roster, roles, types, onClose }: {
  target: { e: ProgrammingEvent; stage: ProgrammingStage } | null; roster: Brother[]; roles: RoleChip[]; types: CalEventType[]; onClose: () => void;
}) {
  const { c } = useTheme();
  const { term, today } = useOrgBits();
  const [d, setD] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const id = target?.e.id ?? null;
  useEffect(() => { if (target) { setD({}); setBusy(false); } }, [id, target?.stage]); // eslint-disable-line react-hooks/exhaustive-deps
  const gaps = useMemo(() => (target ? missingFor(target.e, target.stage) : []), [id, target?.stage]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!target) return <Sheet open={false} onClose={onClose} />;
  const { e, stage } = target;
  const copy = fixCopy(stage);
  const left = gaps.filter(f => !answered(f, d, e)).length;
  const set = (p: Draft) => setD(x => ({ ...x, ...p }));

  const ownerValue: ProgrammingOwner = (() => {
    if (d.ownerBrotherId === undefined && d.ownerRoleId === undefined) return e.owner;
    const b = roster.find(x => x.id === d.ownerBrotherId);
    if (b) return { kind: "brother", id: b.id, name: b.name, initials: initialsOf(b.name) };
    const r = roles.find(x => x.id === d.ownerRoleId);
    return r ? { kind: "role", id: r.id, name: r.name, holders: [] } : null;
  })();

  const go = async () => {
    if (left > 0 || busy) return;
    setBusy(true);
    const patch: ProgrammingPatch = {};
    if (d.title !== undefined) patch.title = d.title.trim();
    if (d.category !== undefined) patch.category = d.category;
    if (d.ownerBrotherId !== undefined) { patch.ownerBrotherId = d.ownerBrotherId; patch.ownerRoleId = null; }
    if (d.ownerRoleId !== undefined) { patch.ownerRoleId = d.ownerRoleId; patch.ownerBrotherId = null; }
    if (d.dueDate !== undefined) patch.dueDate = d.dueDate;
    if (d.location !== undefined) patch.location = d.location.trim();
    if (d.mandatory !== undefined) patch.mandatory = d.mandatory;
    onClose();
    // Fields first, then the move: the server's gate reads persisted state.
    if (Object.keys(patch).length && !(await patchEvent(e.id, patch))) return;
    await commitStage({ ...e, ...ownerValueFields(ownerValue) }, stage);
  };

  return (
    <Sheet open onClose={onClose} locked={busy} size="tall" tone={STAGE_TONE[stage] ?? "butter"} icon="board" title={copy.kicker}
      footer={<Foot left={<T v="mono" size={12} color={left === 0 ? c.pastel.mint.ink : c.ink3}>{left === 0 ? FIX.allClear : FIX.left(left)}</T>}
        cancel={copy.cancel} go={busy ? FIX.saving : copy.go} busy={busy} ok={left === 0} onCancel={onClose} onGo={() => void go()} />}>
      <View style={{ gap: 14 }}>
        <T v="body" color={c.ink2}>{copy.sub}</T>
        <T v="callout" numberOfLines={1}><T v="label" color={c.ink3}>{WRAP.eventK}</T>{` ${e.title}`}</T>
        <View style={[styles.list, { borderColor: c.line }]}>
          {gaps.map((f, i) => (
            <View key={f.key} style={[styles.gap, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
              <View style={styles.gapHead}>
                <Lab>{f.label}</Lab>
                {answered(f, d, e) ? <T v="mono" size={11} color={c.pastel.mint.ink}>{FIX.answered}</T> : null}
              </View>
              <T v="meta" color={c.ink3}>{f.hint}</T>
              {f.kind === "person" ? (
                <OwnerPicker value={ownerValue} roster={roster} roles={roles}
                  onChange={p => set("ownerBrotherId" in p ? { ownerBrotherId: p.ownerBrotherId, ownerRoleId: undefined } : { ownerRoleId: p.ownerRoleId, ownerBrotherId: undefined })} />
              ) : f.kind === "type" ? (
                <TypeChips list={types} value={d.category ?? e.category} onChange={category => set({ category })} label={FIX.pickType} />
              ) : f.kind === "date" ? (
                <DayStrip value={d.dueDate ?? e.dueDate ?? today} onChange={dueDate => set({ dueDate })} today={today} term={term} usualDow={null} taken={new Set()} editing={!!e.dueDate} open />
              ) : f.kind === "bool" ? (
                <View style={{ gap: 6 }}>
                  {[true, false].map(v => {
                    const on = (d.mandatory ?? e.mandatory) === v;
                    return (
                      <Pressable key={String(v)} onPress={() => { haptics.select(); set({ mandatory: v }); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                        style={[styles.choice, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel.peach.soft : c.card }]}>
                        <T v="callout" color={on ? c.ink : c.ink2}>{attendanceText(v)}</T>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Input label={f.label} value={f.key === "title" ? d.title ?? e.title : d.location ?? e.location}
                  onChange={t => set(f.key === "title" ? { title: t } : { location: t })} placeholder={f.key === "title" ? FIX.titlePh : FIX.placePh}
                  maxLength={f.key === "title" ? 120 : 160} />
              )}
            </View>
          ))}
        </View>
      </View>
    </Sheet>
  );
}

const ownerValueFields = (o: ProgrammingOwner): Pick<ProgrammingEvent, "owner"> => ({ owner: o });

/* ── WrapUp ──────────────────────────────────────────────────────────────────── */

export function WrapUp({ e, onClose }: { e: ProgrammingEvent | null; onClose: () => void }) {
  const { c } = useTheme();
  const [stars, setStars] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [spent, setSpent] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!e) return;
    setStars(e.successRating ?? null); setNotes(e.wrapUpNotes ?? "");
    setSpent(e.spendingCents ? (e.spendingCents / 100).toFixed(2) : ""); setBusy(false);
  }, [e?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!e) return <Sheet open={false} onClose={onClose} />;

  const go = async () => {
    if (busy) return;
    setBusy(true);
    const cents = spent.trim() ? Math.round(parseFloat(spent) * 100) : NaN;
    const spendingCents = Number.isFinite(cents) && cents !== e.spendingCents ? Math.max(0, cents) : undefined;
    onClose();
    // The rating first: it lands on the still-confirmed event, so a refused move keeps it.
    if (!(await patchEvent(e.id, { successRating: stars, wrapUpNotes: notes.trim() || null, ...(spendingCents !== undefined ? { spendingCents } : {}) }))) return;
    await commitStage(e, "done");
  };

  return (
    <Sheet open onClose={onClose} locked={busy} size="tall" tone="mint" icon="star" title={WRAP.title}
      footer={<Foot cancel={WRAP.leave(e.stage)} go={busy ? WRAP.saving : WRAP.go} busy={busy} ok onCancel={onClose} onGo={() => void go()} />}>
      <View style={{ gap: 16 }}>
        <T v="body" color={c.ink2}>{WRAP.sub}</T>
        <T v="callout" numberOfLines={1}><T v="label" color={c.ink3}>{WRAP.eventK}</T>{` ${e.title}`}</T>
        <View style={{ gap: 8 }}>
          <Lab>{WRAP.how}</Lab>
          <View style={styles.starsRow}>
            <StarPicker value={stars} onChange={setStars} />
            <T v="meta" color={c.ink2}>{stars != null ? RATING_LABELS[stars] ?? "" : WRAP.noRating}</T>
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Lab>{WRAP.notes}</Lab>
          <Input label={WRAP.notes} value={notes} onChange={setNotes} placeholder={WRAP.notesPh} multiline maxLength={MAX_WRAP_NOTES} />
          <T v="mono" size={11} color={c.ink3} align="right">{`${notes.length}/${MAX_WRAP_NOTES}`}</T>
        </View>
        <View style={{ gap: 6 }}>
          <T v="label" color={c.ink2}>{`${WRAP.spent} `}<T v="meta" size={12} color={c.ink3}>{WRAP.spentHint}</T></T>
          <Input label={WRAP.spent} value={spent} onChange={t => setSpent(t.replace(/[^\d.]/g, ""))} placeholder="0" keyboardType="decimal-pad" prefix="$" />
        </View>
      </View>
    </Sheet>
  );
}

/** Five stars: tap one to set it, tap it again to clear (select haptic). */
export function StarPicker({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4 }} accessibilityRole="radiogroup" accessibilityLabel="How it went">
      {[1, 2, 3, 4, 5].map(n => (
        <Pressable key={n} onPress={() => { haptics.select(); onChange(value === n ? null : n); }} hitSlop={4}
          accessibilityRole="radio" accessibilityState={{ checked: value === n }} accessibilityLabel={WRAP.star(n)}>
          <T v="title" size={28} color={value != null && n <= value ? c.pastel.butter.ink : c.line2}>★</T>
        </Pressable>
      ))}
    </View>
  );
}

/* ── NewIdea ─────────────────────────────────────────────────────────────────── */

export function NewIdea({ open, types, onClose, onAdded }: { open: boolean; types: CalEventType[]; onClose: () => void; onAdded: (e: ProgrammingEvent) => void }) {
  const { c } = useTheme();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTitle(""); setCategory(""); setBusy(false); } }, [open]);
  const trimmed = title.trim();
  const remain = ideaRemain(trimmed, category);
  const ready = !!trimmed && !!category;
  const cat = category ? typeCat(category, types, c) : null;

  const go = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const body: NewProgrammingBody = { title: trimmed, category, dueDate: null, location: null, time: null, collab: null, status: "Upcoming", mandatory: false, description: null };
      const created = await createProgramming(body);
      haptics.success();
      onClose();
      toast.show(SAY.ideaAdded(created.title));
      onAdded(created);
    } catch (x) {
      haptics.error();
      toast.error(SAY.ideaFail, { detail: errorMessage(x) });
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone="butter" icon="note" title={IDEA.title}
      footer={<Foot left={<T v="mono" size={12} color={ready ? c.pastel.mint.ink : c.pastel.butter.ink} style={{ flexShrink: 1 }}>{remain}</T>}
        cancel={IDEA.cancel} go={busy ? IDEA.adding : IDEA.go} busy={busy} ok={ready} onCancel={onClose} onGo={() => void go()} />}>
      <View style={{ gap: 16 }}>
        <T v="body" color={c.ink2}>{IDEA.subParts[0]}<T v="bodyStrong">{IDEA.subParts[1]}</T>{` ${IDEA.subParts[2]}`}</T>
        <View style={{ gap: 6 }}>
          <Lab>{IDEA.titleK}</Lab>
          <Input label={IDEA.titleK} value={title} onChange={setTitle} placeholder={IDEA.titlePh} maxLength={120} />
        </View>
        <View style={{ gap: 6 }}>
          <Lab>{IDEA.categoryK}</Lab>
          <TypeChips list={types} value={category} onChange={setCategory} label={IDEA.categoryK} />
        </View>
        <View style={[styles.sticky, { backgroundColor: cat?.fill ?? c.note.fill.butter }]} accessibilityLabel={`${trimmed || IDEA.preview}. ${IDEA.noDate}. ${IDEA.needsOwner}`}>
          <T v="subhead" color={c.note.ink} numberOfLines={2}>{trimmed || IDEA.preview}</T>
          <T v="mono" size={11.5} color={c.note.ink}>{IDEA.noDate}</T>
          <T v="meta" size={12} color={c.pastel.butter.ink} style={{ fontWeight: "600" }}>{IDEA.needsOwner}</T>
        </View>
      </View>
    </Sheet>
  );
}

/* ── EventForm (New event / Edit event) ──────────────────────────────────────── */

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const minutesOfHhmm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** lib/event-time clock12, from minutes. */
const clock = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;

type Mode = "timed" | "allDay" | "legacy";

/** ScheduleFields.initialSchedule: a new event starts timed; a saved one opens as what it is (no times: all day). */
function initialWhen(e: ProgrammingEvent | null, today: string, zone: string) {
  const base = { mode: "timed" as Mode, date: e?.dueDate ?? today, start: null as number | null, end: null as number | null, lastDay: "", legacy: "" };
  const s = e?.schedule;
  if (s?.kind === "timed") {
    const z = s.timeZone || zone;
    const w = wallOf(s.start, z);
    const we = s.end ? wallOf(s.end, z) : null;
    return { ...base, date: w?.date ?? base.date, start: w?.minutes ?? null, end: we?.minutes ?? null };
  }
  if (s?.kind === "allDay") {
    const last = addDays(s.end, -1);
    return { ...base, mode: "allDay" as Mode, date: s.start, lastDay: last === s.start ? "" : last };
  }
  if (e?.time?.trim()) return { ...base, mode: "legacy" as Mode, legacy: e.time.trim() };
  return e ? { ...base, mode: "allDay" as Mode } : base;
}

function FormRow({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={styles.cefRow}><View style={styles.cefIc}><Icon name={icon} size={16} color={c.ink3} /></View><View style={{ flex: 1, gap: 8 }}>{children}</View></View>;
}

function QuietInput({ value, onChange, placeholder, label, multiline }: { value: string; onChange: (t: string) => void; placeholder: string; label: string; multiline?: boolean }) {
  const { c } = useTheme();
  const scale = useFontScale();
  return (
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.faint} accessibilityLabel={label} multiline={multiline}
      style={[resolveType("body", scale), styles.quiet, { color: c.ink, borderBottomColor: c.line }, multiline && { minHeight: 44, textAlignVertical: "top" }]} />
  );
}

export function EventForm({ open, editing, types, onClose, onSaved }: {
  open: boolean; editing: ProgrammingEvent | null; types: CalEventType[]; onClose: () => void; onSaved: (e: ProgrammingEvent) => void;
}) {
  const { c } = useTheme();
  const scale = useFontScale();
  const { term, zone, today } = useOrgBits();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(() => initialWhen(null, today, zone));
  const [several, setSeveral] = useState(false);
  const [category, setCategory] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [collab, setCollab] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [schedErr, setSchedErr] = useState("");

  // the event's own type stays choosable while editing, even if it's since been hidden
  const options = useMemo(() => {
    if (!editing || types.some(t => t.slug === editing.category)) return types;
    return [...types, { slug: editing.category, label: editing.type, mandatoryDefault: false } as CalEventType];
  }, [types, editing]);

  useEffect(() => {
    if (!open) return;
    setBusy(false); setSchedErr(""); setSeveral(false);
    setWhen(initialWhen(editing, term?.startDate && today < term.startDate ? term.startDate : term?.endDate && today > term.endDate ? term.endDate : today, zone));
    if (editing) {
      setTitle(editing.title); setCategory(editing.category); setMandatory(editing.mandatory);
      setCollab(editing.collab ?? ""); setLocation(editing.location); setDescription(editing.description ?? "");
      return;
    }
    const first = types[0];
    setTitle(""); setCategory(first?.slug ?? ""); setMandatory(first?.mandatoryDefault ?? false);
    setCollab(""); setLocation(""); setDescription("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<typeof when>) => setWhen(w => ({ ...w, ...p }));
  const selected = options.find(t => t.slug === category);
  const hint = category === "party" ? "Guest list and wrap-up live on the Parties page."
    : selected?.mandatoryDefault ? `${selected.label} events are required by default.` : "";
  const ok = !!title.trim();
  const timed = when.mode === "timed";
  const hasEnd = timed && when.start != null && when.end != null;
  const sameAsStart = hasEnd && when.end === when.start;
  const overnight = hasEnd && when.end! <= when.start!;
  const suspect = hasEnd ? suspectLength(hhmm(when.start!), hhmm(when.end!)) : null;
  const multiDay = when.mode === "allDay" && (several || !!when.lastDay);
  const legacyRead = when.mode === "legacy" ? parseLegacyTime(when.legacy).start : undefined;

  /** ScheduleFields.scheduleFromValue. */
  const schedule = (): { schedule: ProgrammingPatch["schedule"]; time: string | null } | { error: string } => {
    if (when.mode === "legacy") return { schedule: null, time: when.legacy.trim() || null };
    if (when.mode === "allDay") {
      if (when.lastDay && when.lastDay < when.date) return { error: "The last day can't be before the first." };
      return { schedule: { kind: "allDay", start: when.date, end: addDays(when.lastDay || when.date, 1) }, time: null };
    }
    if (when.start == null) return { error: "Add a start time, or make it an all-day event." };
    if (when.end != null && when.end === when.start) return { error: "The end time is the same as the start. Clear it or pick a later time." };
    const start = wallToInstant(when.date, when.start, zone);
    const end = when.end != null ? wallToInstant(when.end <= when.start ? addDays(when.date, 1) : when.date, when.end, zone) : undefined;
    return { schedule: { kind: "timed", start, ...(end ? { end } : {}), timeZone: zone }, time: hhmm(when.start) };
  };

  const save = async () => {
    if (!ok || busy) return;
    const r = schedule();
    if ("error" in r) { setSchedErr(r.error); return; }
    setSchedErr("");
    const body = {
      title: title.trim(), dueDate: when.date, schedule: r.schedule, time: r.time,
      location: location.trim() || null, collab: collab.trim() || null, category, mandatory, description: description.trim() || null,
    };
    if (editing) {
      // As the web: the form closes, and a refusal comes back as a toast.
      onClose();
      try {
        const saved = await patchProgramming(editing.id, body);
        haptics.success();
        onSaved(saved);
      } catch (x) {
        haptics.error();
        toast.error(SAY.saveFail, { detail: errorMessage(x) });
      }
      return;
    }
    setBusy(true);
    try {
      const saved = await createProgramming({ ...body, status: "Upcoming" });
      haptics.success();
      onClose();
      onSaved(saved);
    } catch (x) {
      haptics.error();
      toast.error(SAY.createFail, { detail: errorMessage(x) });
      setBusy(false);
    }
  };

  const bold = (t: string) => <T v="meta" color={c.ink} style={{ fontWeight: "700" }}>{t}</T>;
  const link = (t: string, onPress: () => void) => <T v="meta" color={c.pastel.lilac.ink} style={styles.u} onPress={onPress} accessibilityRole="button">{t}</T>;

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone="lilac" icon="cal" title={editing ? "Edit event" : "New event"}
      footer={<Foot cancel="Cancel" go={editing ? "Save changes" : "Add event"} busy={busy} ok={ok} onCancel={onClose} onGo={() => void save()} />}>
      <View style={{ gap: 18 }}>
        <TextInput value={title} onChangeText={setTitle} placeholder="Event name" placeholderTextColor={c.faint} maxLength={200} accessibilityLabel="Title" autoFocus={!editing}
          style={[resolveType("title", scale), { color: c.ink, paddingVertical: 6 }]} />

        <FormRow icon="clock">
          <View accessibilityLabel={multiDay ? "First day" : "Date"}>
            <DayStrip value={when.date} onChange={date => set({ date })} today={today} term={term} usualDow={null} taken={new Set()} editing={!!editing} open={open} />
          </View>
          {timed ? (
            <View style={styles.times}>
              {when.start == null ? (
                <Pressable onPress={() => set({ start: 19 * 60 })} accessibilityRole="button" accessibilityLabel="Starts"
                  style={({ pressed }) => [styles.pick, { borderColor: c.line2, backgroundColor: c.card }, pressed && pressedDim]}>
                  <T v="mono" color={c.faint}>--:-- --</T>
                </Pressable>
              ) : <View accessibilityLabel="Starts"><Clock minutes={when.start} onChange={m => set(m == null ? { start: null, end: null } : { start: m })} tone="lilac" /></View>}
              <T v="body" color={c.ink3}>→</T>
              {when.end == null ? (
                <Pressable disabled={when.start == null} onPress={() => set({ end: ((when.start ?? 1140) + 120) % 1440 })} accessibilityRole="button" accessibilityLabel="Ends (optional)"
                  style={({ pressed }) => [styles.pick, { borderColor: c.line2, backgroundColor: c.card }, pressed && pressedDim]}>
                  <T v="mono" color={c.faint}>--:-- --</T>
                </Pressable>
              ) : <View accessibilityLabel="Ends (optional)"><Clock minutes={when.end} onChange={m => set({ end: m })} tone="lilac" /></View>}
            </View>
          ) : null}
          {multiDay ? (
            <View style={{ gap: 6 }} accessibilityLabel="Last day (optional)">
              <T v="body" color={c.ink3}>→</T>
              <DayStrip value={when.lastDay || when.date} onChange={lastDay => set({ lastDay })} today={today} term={term} usualDow={null} taken={new Set()} editing open={open} />
            </View>
          ) : null}
          {when.mode === "legacy" ? (
            <QuietInput value={when.legacy} onChange={legacy => set({ legacy })} placeholder="" label="Time, as written" />
          ) : null}
          <View style={styles.meta}>
            <T v="meta" color={c.ink3} style={{ flex: 1 }} accessibilityLiveRegion="polite">
              {timed ? (
                when.start == null ? "Pick a start time"
                  : when.end == null ? <>{"Starts "}{bold(clock(when.start))}{" · no end time"}</>
                    : sameAsStart ? "End matches start"
                      : <>{bold(durationLabel(hhmm(when.start), hhmm(when.end)))}{overnight ? " · ends next day" : ""}</>
              ) : null}
              {when.mode === "allDay" ? <>{bold("All day")}{!multiDay ? <>{" · "}{link("Several days", () => setSeveral(true))}</> : null}</> : null}
              {when.mode === "legacy" ? bold("As written") : null}
              {timed ? ` · ${zoneLine(zone, zoneName(zone))}` : null}
            </T>
            <View style={styles.allDay}>
              <Switch value={when.mode === "allDay"} label="All day"
                onChange={v => { haptics.select(); if (v) set({ mode: "allDay" }); else if (when.mode === "allDay") set({ mode: "timed" }); }} />
              <T v="meta" color={c.ink2}>All day</T>
            </View>
          </View>
          {when.mode === "legacy" ? (
            <T v="meta" color={c.ink3}>
              {legacyRead
                ? `Calendars show this at ${clock(minutesOfHhmm(legacyRead))}${timeIsClear(when.legacy) ? "" : " (no AM/PM was typed, so it's read as PM)"}. `
                : "Calendar subscriptions show this as an all-day event until it has a start time. "}
              {link("Set a time", () => { const g = parseLegacyTime(when.legacy); set({ mode: "timed", start: g.start ? minutesOfHhmm(g.start) : null, end: g.end ? minutesOfHhmm(g.end) : null }); })}
            </T>
          ) : null}
          {sameAsStart ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">The end is the same as the start. Clear it or pick a later time.</T> : null}
          {suspect && when.end != null ? (
            <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">
              {`This runs ${suspect.hours} hours, ending the next day at ${clock(when.end)}. `}
              {suspect.suggest ? link(`Change to ${clock(minutesOfHhmm(suspect.suggest))}`, () => set({ end: minutesOfHhmm(suspect.suggest!) })) : null}
            </T>
          ) : null}
          {schedErr ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{schedErr}</T> : null}
        </FormRow>

        <FormRow icon="tack">
          <TypeChips list={options} value={category} label="Category"
            onChange={s => { setCategory(s); if (options.find(x => x.slug === s)?.mandatoryDefault) setMandatory(true); }} />
          {hint ? <T v="meta" color={c.ink3}>{hint}</T> : null}
        </FormRow>

        <FormRow icon="check">
          <View style={styles.reqRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="callout">Required attendance</T>
              <T v="meta" color={c.ink3}>Take attendance and track excuses.</T>
            </View>
            <Switch value={mandatory} onChange={v => { haptics.select(); setMandatory(v); }} tone="peach" label="Required attendance" />
          </View>
        </FormRow>
        <FormRow icon="people"><QuietInput value={collab} onChange={setCollab} placeholder="Add a collab org (KDF, DSP…)" label="Collab" /></FormRow>
        <FormRow icon="pin"><QuietInput value={location} onChange={setLocation} placeholder="Add location" label="Location" /></FormRow>
        <FormRow icon="note"><QuietInput value={description} onChange={setDescription} placeholder="Add notes, agenda, or links" label="Description" multiline /></FormRow>
      </View>
    </Sheet>
  );
}

/* ── HelpSheet ───────────────────────────────────────────────────────────────── */

export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { c } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} size="tall" tone="lilac" icon="board" title={HELP.title}>
      <View style={{ gap: 14 }}>
        <T v="body" color={c.ink2}>{HELP.lead}</T>
        <View style={[styles.list, { borderColor: c.line }]}>
          {helpRows().map((r, i) => {
            const tone = STAGE_TONE[r.stage];
            return (
              <View key={r.stage} style={[styles.gap, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
                <View style={styles.helpHead}>
                  <View style={[styles.dot, { backgroundColor: tone ? c.pastel[tone].ink : c.faint }]} />
                  <T v="callout" style={{ fontWeight: "700" }}>{r.label}</T>
                  <T v="meta" color={c.ink3} style={{ flex: 1 }}>{r.meaning}</T>
                </View>
                <T v="body" color={c.ink2} style={{ paddingLeft: 15 }}>{r.cost}</T>
              </View>
            );
          })}
        </View>
        <T v="meta" color={c.ink3}>{HELP.foot[0]}<T v="meta" color={c.ink} style={{ fontWeight: "700" }}>{HELP.foot[1]}</T>{` ${HELP.foot[2]} `}<T v="meta" color={c.ink} style={{ fontWeight: "700" }}>{HELP.foot[3]}</T>{` ${HELP.foot[4]}`}</T>
      </View>
    </Sheet>
  );
}

/* ── DeleteEvent ─────────────────────────────────────────────────────────────── */

export function DeleteEvent({ e, onClose, onDeleted }: { e: ProgrammingEvent | null; onClose: () => void; onDeleted: (id: number) => void }) {
  const { c } = useTheme();
  if (!e) return <Sheet open={false} onClose={onClose} />;
  const go = () => {
    onClose();
    onDeleted(e.id);
    // Off the board at once, as the web does; a refusal puts it back.
    const undo = setProgramming(l => l.filter(x => x.id !== e.id));
    deleteProgramming(e.id).then(
      () => haptics.success(),
      x => { undo(); haptics.error(); toast.error(SAY.deleteFail, { detail: errorMessage(x) }); },
    );
  };
  return (
    <Sheet open onClose={onClose} tone="rose" icon="trash" title={SAY.deleteTitle}
      footer={<Foot cancel={SAY.cancel} go={SAY.deleteGo} ok danger onCancel={onClose} onGo={go} />}>
      <T v="body" color={c.ink2}>{SAY.deleteMessage(e.title, !!e.dueDate)}</T>
    </Sheet>
  );
}

/* ── New field (the panel's FieldTogglePills "New field") ────────────────────── */

export const FIELD_KINDS: { kind: EventFieldRow["kind"]; label: string; eg: string }[] = [
  { kind: "text",   label: "Text",     eg: "Anything written — a contact, a note, a dress code." },
  { kind: "num",    label: "Number",   eg: "A count. Head count, buses, tables." },
  { kind: "money",  label: "Money",    eg: "A dollar amount, kept apart from what was actually spent." },
  { kind: "bool",   label: "Yes / no", eg: "A box that's either ticked or it isn't. Risk form filed?" },
  { kind: "date",   label: "Date",     eg: "A second date the event depends on — a deposit deadline." },
  { kind: "person", label: "Person",   eg: "Somebody on the roster who isn't the owner." },
  { kind: "file",   label: "File",     eg: "A link or an attachment." },
];

const styles = StyleSheet.create({
  foot: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "stretch" },
  input: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, minHeight: 36 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tabsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tabs: { flexDirection: "row", gap: 2, padding: 3, borderRadius: 999, borderWidth: 1.5 },
  tab: { paddingHorizontal: 14, minHeight: 32, borderRadius: 999, justifyContent: "center" },
  unassign: { paddingHorizontal: 8, minHeight: 32, justifyContent: "center" },
  opt: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  av: { width: 26, height: 26, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  list: { borderWidth: 1.5, borderRadius: 14, overflow: "hidden" },
  gap: { gap: 8, padding: 12 },
  gapHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  choice: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sticky: { gap: 6, padding: 14, borderRadius: 8, alignSelf: "center", width: 220, transform: [{ rotate: "-1.5deg" }] },
  allDay: { flexDirection: "row", alignItems: "center", gap: 12 },
  pick: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, paddingHorizontal: 12, minHeight: 44, justifyContent: "center" },
  helpHead: { flexDirection: "row", alignItems: "baseline", gap: 7 },
  cefRow: { flexDirection: "row", gap: 12 },
  cefIc: { width: 20, paddingTop: 10, alignItems: "center" },
  quiet: { borderBottomWidth: 1, paddingVertical: 8 },
  times: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  meta: { flexDirection: "row", alignItems: "center", gap: 10 },
  reqRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  u: { textDecorationLine: "underline" },
});
