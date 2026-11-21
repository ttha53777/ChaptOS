/**
 * One event (the web's ProgrammingDetailPanel), as a tall sheet over the board, in the
 * web's order:
 *
 *   head       STAGE · TYPE pills, Edit · Delete (officers), the close; the title; the
 *              when line; UNOWNED + Give it an owner while nobody has it; whether the
 *              chapter can see it (an eye, or a padlock)
 *   ladder     Idea · Planning · Confirmed · Done (officers tap a step to move), and the
 *              stage line: what this lane means, what the next one still needs (the
 *              fields are links to their rows), the published padlock and its way out
 *   wrap-up    a wrapped event's record: stars, notes
 *   required   GATES THE BOARD: title, type, owner, date, location, attendance; the
 *              owner picks inline, date and place edit inline until it's published,
 *              and a locked row says why (with Move to Planning)
 *   optional   NEVER BLOCKS: the org's fields this event collects; officers flip a
 *              field on or off for this event, or add a new one
 *   spending   the manual total; Linked Transactions once it's on the Timeline
 *   gate bar   (officers) can this move yet, and the button that does it, or that
 *              goes to the first thing in its way
 *
 * Every move routes like the web's moveStage (steps.routeMove). Members see it all
 * read-only.
 */
import type { Brother, CalEventType, Doc, EventFieldRow, ProgrammingEvent, RoleChip } from "@/lib/api-types";
import * as WebBrowser from "expo-web-browser";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type ScrollViewInstance } from "react-native";
import { localDay } from "~/data/home";
import { useDocs } from "~/data/more";
import { createEventField, useEventFields, useEventTransactions, useProgramming } from "~/data/programming";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { DayStrip } from "~/meetings/EventForm";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { Button } from "~/paper/Button";
import { CloseX, Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { resolveType } from "~/theme/type";
import { useFontScale, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { fieldsForEvent, MAX_EVENT_FIELDS } from "@/lib/event-fields";
import { CardStars, OwnerFace } from "./Card";
import {
  LOCKED_ACTION, PANEL, SAY, hasOptionalAnswer, STAGES, STAGE_LABELS, STAGE_SAY, STAGE_TONE, attendanceText, canManage, eventTime, gateBar, gateTargetOf,
  hasRequiredField, lockedFieldToast, money, ownerLabel, panelRequired, requiredEmpty, stageCanMove, stageSay, stepLocked, whenLine,
  type RequiredField,
  typeCat,
} from "./model";
import { FIELD_KINDS, OwnerPicker, patchEvent, routeMove, type Opened } from "./steps";

export function EventSheet({ id, roster, roles, types, onClose, onEdit, onDelete, onOpen, onLogTx }: {
  id: number | null; roster: Brother[]; roles: RoleChip[]; types: CalEventType[] | undefined;
  onClose: () => void; onEdit: (e: ProgrammingEvent) => void; onDelete: (e: ProgrammingEvent) => void; onOpen: (o: Opened) => void;
  onLogTx: (e: ProgrammingEvent) => void;
}) {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const q = useProgramming();
  const officer = !!me && canManage(me);
  const live = q.data?.find(e => e.id === id) ?? null;
  // keep the last copy on screen while the sheet slides away after a delete
  const [last, setLast] = useState<ProgrammingEvent | null>(null);
  useEffect(() => { if (live) setLast(live); }, [live]);
  const e = live ?? last;
  const fields = useEventFields(id != null);
  const docs = useDocs(id != null && officer);
  const txns = useEventTransactions(e?.calendarEventId ?? null);
  const [editingOwner, setEditingOwner] = useState(false);
  const [hunt, setHunt] = useState<string | null>(null);
  const [newField, setNewField] = useState(false);
  const rows = useRef(new Map<string, number>());
  const scroll = useRef<ScrollViewInstance | null>(null);
  useEffect(() => { setEditingOwner(false); setHunt(null); }, [id]);
  useEffect(() => {
    if (!hunt) return;
    const t = setTimeout(() => setHunt(null), 1600);
    return () => clearTimeout(t);
  }, [hunt]);

  const defs = useMemo(() => fields.data ?? [], [fields.data]);
  const detached = e?.detachedFields;
  const enabled = useMemo(() => fieldsForEvent(defs, detached ?? []) as EventFieldRow[], [defs, detached]);
  if (!e) return <Sheet open={false} onClose={onClose} />;

  const today = localDay();
  const published = e.stage === "confirmed" || e.stage === "done";
  const canEdit = officer && !published;
  const cat = typeCat(e.category, types, c);
  const required = panelRequired(e.stage);
  const got = required.filter(f => hasRequiredField(e, f.key)).length;
  const optGot = enabled.filter(d => hasOptionalAnswer(e, d)).length;
  const gate = gateBar(e);
  const say = stageSay(e);
  const canMove = stageCanMove(e);
  const move = (s: ProgrammingEvent["stage"]) => routeMove(e, s, onOpen);
  const jump = (key: string) => {
    if (key === "owner") setEditingOwner(true);
    setHunt(key);
    const y = rows.current.get(key);
    if (y != null) scroll.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
  };
  const refuse = (label: string) => {
    if (e.stage === "done") { toast.show(lockedFieldToast(label, true)); return; }
    toast.show(lockedFieldToast(label, false), { undoLabel: LOCKED_ACTION, undo: () => move("planning") });
  };

  return (
    <>
      <Sheet open={id != null} onClose={onClose} size="tall" ownClose accessibilityLabel="Event details">
        <View style={{ gap: 18 }}>
          <View style={{ gap: 10 }}>
            <View style={styles.top}>
              <View style={[styles.pill, { borderColor: e.stage === "idea" ? c.line2 : stageInk(c, e.stage), borderStyle: e.stage === "idea" ? "dashed" : "solid" }]}>
                <T v="kicker" size={10.5} color={stageInk(c, e.stage)}>{STAGE_LABELS[e.stage]}</T>
              </View>
              <View style={[styles.pill, { borderColor: "transparent", backgroundColor: cat.soft }]}>
                <T v="kicker" size={10.5} color={cat.ink}>{e.type}</T>
              </View>
              <View style={{ flex: 1 }} />
              {officer ? (
                <>
                  <Button label={PANEL.edit} size="sm" variant="soft" onPress={() => onEdit(e)} />
                  <Button label={PANEL.delete} size="sm" variant="soft" tone="rose" onPress={() => onDelete(e)} />
                </>
              ) : null}
              <CloseX onPress={onClose} label={PANEL.close} />
            </View>
            <T v="title" size={26}>{e.title}</T>
            <T v="meta" color={c.ink3}>{whenLine(e, eventTime(e))}</T>
            {!e.owner && !e.ownerNote ? (
              <View style={[styles.lead, { borderColor: c.pastel.rose.border, backgroundColor: c.pastel.rose.soft }]}>
                <T v="kicker" size={10.5} color={c.pastel.rose.ink}>{PANEL.unowned}</T>
                {officer ? (
                  <Pressable onPress={() => jump("owner")} accessibilityRole="button" hitSlop={6} style={({ pressed }) => [pressed && pressedDim]}>
                    <T v="callout" color={c.pastel.rose.ink}>{PANEL.giveOwner}</T>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <View style={[styles.vis, e.calendarEventId != null
              ? { borderColor: c.pastel.lilac.border, backgroundColor: c.pastel.lilac.soft }
              : { borderColor: c.line2, borderStyle: "dashed" }]}>
              <Icon name={e.calendarEventId != null ? "eye" : "lock"} size={12} color={e.calendarEventId != null ? c.pastel.lilac.ink : c.ink3} />
              <T v="meta" size={12.5} color={e.calendarEventId != null ? c.pastel.lilac.ink : c.ink3}>{e.calendarEventId != null ? PANEL.onTimeline : PANEL.offTimeline}</T>
            </View>
          </View>

          <View style={[styles.band, { borderColor: c.line }]}>
            <Ladder stage={e.stage} officer={officer} lockedOf={s => stepLocked(e, s)} onPick={move} />
            <T v="body" color={c.ink2} style={{ lineHeight: 22 }}>
              <T v="bodyStrong">{`${say.label}.`}</T>{` ${say.meaning}`}
              {say.gap ? (
                <T v="body" color={c.pastel.butter.ink}>
                  {" Needs "}
                  {say.gap.fields.map((f, i, all) => (
                    <T key={f.key} v="body" color={c.pastel.butter.ink}>
                      {i > 0 ? (i === all.length - 1 ? " and " : ", ") : ""}
                      <T v="body" color={c.pastel.rose.ink} style={styles.link} onPress={() => jump(f.key)} accessibilityRole="link">{f.label}</T>
                    </T>
                  ))}
                  {` to reach ${say.gap.next}.`}
                </T>
              ) : null}
              {say.ready ? ` ${say.ready}` : ""}
              {canMove ? ` ${canMove}` : ""}
              {say.locked ? (
                <>
                  {` ${STAGE_SAY.lockedBefore} `}
                  <T v="body" color={c.pastel.rose.ink} style={styles.link} onPress={officer ? () => move("planning") : undefined} accessibilityRole="link">{STAGE_SAY.lockedLink}</T>
                  {` ${STAGE_SAY.lockedAfter}`}
                </>
              ) : null}
              {say.done ? ` ${say.done}` : ""}
              {say.confirmFirst ? <><T v="body" color={c.pastel.butter.ink}>{` ${STAGE_SAY.confirmFirst}`}</T>{` ${STAGE_SAY.confirmFirstTail}`}</> : null}
            </T>
          </View>

          {e.stage === "done" ? (
            <View style={[styles.wrap, { borderColor: c.line2, backgroundColor: c.paper2 }]}>
              <View style={[styles.stamp, { borderColor: c.pastel.mint.ink }]}><T v="kicker" size={10} color={c.pastel.mint.ink}>{PANEL.wrapStamp}</T></View>
              <View style={styles.wrapHead}>
                <T v="kicker" size={10.5} color={c.ink3}>{PANEL.wrapK}</T>
                {e.successRating != null ? <CardStars value={e.successRating} size={14} /> : <T v="meta" color={c.ink3}>{PANEL.notRated}</T>}
              </View>
              <T v="body" color={e.wrapUpNotes ? c.ink : c.ink3}>{e.wrapUpNotes || PANEL.noNotes}</T>
            </View>
          ) : null}

          <View style={{ gap: 4 }}>
            <SecHead title={PANEL.required} why={PANEL.gates} gates n={`${got}/${required.length}`} ready={got === required.length} />
            {required.map(f => (
              <View key={f.key} onLayout={ev => { rows.current.set(f.key, ev.nativeEvent.layout.y); }}>
                <RequiredRow f={f} e={e} officer={officer} locked={published && f.key !== "owner"} hunted={hunt === f.key}
                  editingOwner={editingOwner} onToggleOwner={() => setEditingOwner(v => !v)} roster={roster} roles={roles} today={today}
                  onRefuse={officer ? () => refuse(f.label) : undefined} />
              </View>
            ))}
          </View>

          {enabled.length > 0 || (officer && defs.length > 0) ? (
            <View style={{ gap: 4 }}>
              <SecHead title={PANEL.optional} why={PANEL.never} n={`${optGot}/${enabled.length}`} />
              {enabled.map(d => (
                <OptionalRow key={d.slug} def={d} e={e} canEdit={canEdit} docs={docs.data ?? []}
                  onRefuse={officer && published ? () => refuse(d.label) : undefined} />
              ))}
              {!enabled.length ? <T v="meta" color={c.ink3}>{PANEL.noOptional}</T> : null}
              {officer ? <TogglePills e={e} defs={defs.filter(d => d.enabled)} onNew={() => setNewField(true)} /> : null}
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <T v="subhead">{PANEL.spending}</T>
            {officer ? <SpendInput e={e} /> : <T v="mono" size={18}>{money(e.spendingCents / 100)}</T>}
            <T v="meta" size={12} color={c.ink3}>{PANEL.spendingNote}</T>
          </View>

          {e.calendarEventId ? (
            <View style={{ gap: 8 }}>
              <View style={styles.rowBetween}>
                <T v="subhead">{PANEL.linked}</T>
                {officer ? (
                  <Pressable onPress={() => onLogTx(e)} accessibilityRole="button" hitSlop={6} style={({ pressed }) => [pressed && pressedDim]}>
                    <T v="callout" color={c.pastel.lilac.ink}>{PANEL.logTx}</T>
                  </Pressable>
                ) : null}
              </View>
              {txns.isLoading ? <T v="meta" size={12} color={c.ink3}>{PANEL.loadingTx}</T>
                : !(txns.data ?? []).length ? <T v="meta" size={12} color={c.ink3}>{PANEL.noTx}</T>
                  : (
                    <>
                      {(txns.data ?? []).map(t => (
                        <View key={t.id} style={[styles.tx, { borderColor: c.line, backgroundColor: c.paper2 }]}>
                          <View style={{ flex: 1 }}>
                            <T v="callout" numberOfLines={1}>{t.description || t.category}</T>
                            <T v="meta" size={12} color={c.ink3}>{`${shortOf(t.date)} · ${t.category}`}</T>
                          </View>
                          <T v="mono" color={t.type === "income" ? c.pastel.mint.ink : c.pastel.rose.ink}>{`${t.type === "income" ? "+" : "−"}${money(t.amount)}`}</T>
                        </View>
                      ))}
                      <View style={[styles.tx, { borderColor: c.line, backgroundColor: c.paper3 }]}>
                        <T v="kicker" size={10.5} color={c.ink3} style={{ flex: 1 }}>{PANEL.totalExpenses}</T>
                        <T v="mono" color={c.pastel.rose.ink} style={{ fontWeight: "700" }}>{money((txns.data ?? []).filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0))}</T>
                      </View>
                    </>
                  )}
            </View>
          ) : null}

          {officer ? (
            <View style={[styles.gate, { borderColor: gate.ready ? c.pastel.mint.border : c.pastel.butter.border, backgroundColor: gate.ready ? c.pastel.mint.soft : c.pastel.butter.soft }]}>
              <View style={styles.gateText}>
                <Icon name={gate.ready ? "check" : "alert"} size={15} color={gate.ready ? c.pastel.mint.ink : c.pastel.butter.ink} />
                <T v="callout" color={gate.ready ? c.pastel.mint.ink : c.pastel.butter.ink} style={{ flex: 1 }}>{gate.text}</T>
              </View>
              {gate.go ? (
                <Button label={gate.go.label} tone={gate.ready ? "mint" : "butter"} block onPress={() => {
                  const go = gate.go;
                  if (go?.field) { jump(go.field); return; }
                  move(gateTargetOf(e.stage));
                }} />
              ) : null}
            </View>
          ) : null}
        </View>
      </Sheet>
      <NewField open={newField} e={e} defs={defs} onClose={() => setNewField(false)} />
    </>
  );
}

const shortOf = (iso: string) => {
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${M[Number(iso.slice(5, 7)) - 1] ?? ""} ${Number(iso.slice(8, 10))}`;
};

function stageInk(c: ReturnType<typeof useTheme>["c"], s: ProgrammingEvent["stage"]): string {
  const tone = STAGE_TONE[s];
  return tone ? c.pastel[tone].ink : c.ink3;
}


/* ── the ladder ────────────────────────────────────────────────────────────────── */

/** Idea · Planning · Confirmed · Done: past steps checked, this one filled, locked ones dashed. */
export function Ladder({ stage, officer, onPick, lockedOf }: {
  stage: ProgrammingEvent["stage"]; officer: boolean; onPick: (s: ProgrammingEvent["stage"]) => void; lockedOf?: (s: ProgrammingEvent["stage"]) => boolean;
}) {
  const { c } = useTheme();
  const at = STAGES.indexOf(stage);
  return (
    <View style={styles.ladder} accessibilityRole="radiogroup" accessibilityLabel="Stage">
      {STAGES.map((s, i) => {
        const on = s === stage;
        const past = i < at;
        const locked = lockedOf?.(s) ?? false;
        const tone = STAGE_TONE[s];
        const fill = tone ? c.pastel[tone].fill : c.paper3;
        return (
          <Pressable key={s} disabled={!officer || on} onPress={() => onPick(s)} accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: !officer || on }} accessibilityLabel={`${STAGE_LABELS[s]}${locked ? " — locked" : ""}`}
            style={({ pressed }) => [styles.step, pressed && pressedDim]}>
            {i > 0 ? <View style={[styles.rail, { borderColor: i <= at ? c.ink : c.line2, borderStyle: i <= at ? "solid" : "dashed" }]} /> : null}
            <View style={[styles.node, {
              width: on ? 32 : 26, height: on ? 32 : 26,
              backgroundColor: on || past ? fill : c.card,
              borderColor: on || past ? c.ink : c.line2,
              borderStyle: locked ? "dashed" : "solid",
            }]}>
              {past ? <Icon name="check" size={13} color={c.ink} /> : null}
            </View>
            <T v="meta" size={12} color={on ? c.ink : c.ink3} style={on ? { fontWeight: "700" } : null}>{STAGE_LABELS[s]}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── rows ──────────────────────────────────────────────────────────────────────── */

function SecHead({ title, why, n, gates, ready }: { title: string; why: string; n: string; gates?: boolean; ready?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={styles.secHead}>
      <T v="subhead">{title}</T>
      <View style={[styles.why, gates ? { borderColor: c.pastel.butter.border, backgroundColor: c.pastel.butter.soft } : { borderColor: c.line2 }]}>
        <T v="kicker" size={9.5} color={gates ? c.pastel.butter.ink : c.ink3}>{why}</T>
      </View>
      <View style={{ flex: 1 }} />
      <T v="mono" size={12} color={ready ? c.pastel.mint.ink : c.ink3}>{n}</T>
    </View>
  );
}

function Mark({ state }: { state: "set" | "miss" | "empty" }) {
  const { c } = useTheme();
  return (
    <View style={[styles.mark, state === "set" ? { backgroundColor: c.pastel.mint.fill, borderColor: c.pastel.mint.ink }
      : state === "miss" ? { borderColor: c.pastel.butter.ink, borderStyle: "dashed" } : { borderColor: c.line2 }]}>
      {state === "set" ? <Icon name="check" size={11} color={c.pastel.mint.ink} /> : null}
    </View>
  );
}

const RequiredRow = memo(function RequiredRow({ f, e, officer, locked, hunted, editingOwner, onToggleOwner, roster, roles, today, onRefuse }: {
  f: RequiredField; e: ProgrammingEvent; officer: boolean; locked: boolean; hunted: boolean; editingOwner: boolean; onToggleOwner: () => void;
  roster: Brother[]; roles: RoleChip[]; today: string; onRefuse?: () => void;
}) {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const has = hasRequiredField(e, f.key);
  const state = has ? "set" : e.stage === "done" ? "empty" : "miss";
  const [dateOpen, setDateOpen] = useState(false);
  const isOwner = f.key === "owner";
  const inline = (f.key === "date" || f.key === "location") && officer && !locked;
  let value: string | null = null;
  if (f.key === "title") value = e.title;
  else if (f.key === "category") value = e.type;
  else if (f.key === "date") value = e.dueDate ? shortOf(e.dueDate) : null;
  else if (f.key === "location") value = e.location || null;
  else if (f.key === "mandatory") value = attendanceText(e.mandatory);
  else if (isOwner) value = e.owner ? ownerLabel(e.owner) : e.ownerNote ? `${e.ownerNote} (not on the roster)` : null;

  const tap = locked ? onRefuse : isOwner && officer ? onToggleOwner : undefined;
  return (
    <View style={[styles.fld, { borderBottomColor: c.line }, hunted && { backgroundColor: c.pastel.butter.soft }]}>
      <Mark state={state} />
      <View style={{ flex: 1, gap: 4 }}>
        {(() => {
          const head = (
            <View style={styles.rowBetween}>
              <T v="kicker" size={10.5} color={c.ink3}>{f.label}</T>
              {locked ? <Icon name="lock" size={12} color={c.ink3} /> : isOwner && officer ? <Icon name="pencil" size={12} color={c.ink3} /> : null}
            </View>
          );
          const shown = (
            <View style={styles.valRow}>
              {isOwner && e.owner ? <OwnerFace owner={e.owner} size={18} /> : null}
              <T v="body" color={has ? c.ink : c.pastel.butter.ink} style={{ flexShrink: 1 }}>{has ? value : requiredEmpty(e.stage, f)}</T>
            </View>
          );
          if (inline) {
            return (
              <View style={{ gap: 3 }}>
                {head}
                {f.key === "location" ? (
                  <InlineText value={e.location} label={f.label} onCommit={v => void patchEvent(e.id, { location: v })} />
                ) : (
                  <Pressable onPress={() => setDateOpen(o => !o)} accessibilityRole="button" accessibilityLabel={f.label}
                    style={({ pressed }) => [styles.inlineBox, { borderColor: c.line2, backgroundColor: c.card }, pressed && pressedDim]}>
                    {e.dueDate ? <T v="mono" color={c.ink}>{shortOf(e.dueDate)}</T> : null}
                  </Pressable>
                )}
              </View>
            );
          }
          if (!tap) return <View style={{ gap: 3 }}>{head}{shown}</View>;
          return (
            <Pressable onPress={tap} accessibilityRole="button"
              accessibilityLabel={locked ? `${f.label} — locked while ${e.stage}` : `Edit ${f.label}`}
              style={({ pressed }) => [{ gap: 3 }, pressed && pressedDim]}>
              {head}{shown}
            </Pressable>
          );
        })()}
        {inline && f.key === "date" && dateOpen ? (
          <DayStrip value={e.dueDate ?? today} onChange={d => { void patchEvent(e.id, { dueDate: d }); }} today={today}
            term={me?.org?.activeTerm ?? null} usualDow={null} taken={new Set()} editing={!!e.dueDate} open />
        ) : null}
        {isOwner && editingOwner && officer ? (
          <OwnerPicker value={e.owner} roster={roster} roles={roles}
            onChange={p => { void patchEvent(e.id, "ownerBrotherId" in p ? { ownerBrotherId: p.ownerBrotherId } : { ownerRoleId: p.ownerRoleId }); onToggleOwner(); }} />
        ) : null}
      </View>
    </View>
  );
});

function InlineText({ value, label, onCommit, multiline, keyboardType, prefix }: {
  value: string; label: string; onCommit: (v: string) => void; multiline?: boolean; keyboardType?: "default" | "decimal-pad" | "number-pad"; prefix?: string;
}) {
  const { c } = useTheme();
  const scale = useFontScale();
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <View style={[styles.inlineBox, { borderColor: c.line2, backgroundColor: c.card, flexDirection: "row", alignItems: multiline ? "flex-start" : "center", gap: 4 }, multiline && { minHeight: 76 }]}>
      {prefix ? <T v="mono" color={c.ink3}>{prefix}</T> : null}
      <TextInput value={v} onChangeText={setV} onBlur={() => { if (v.trim() !== value) onCommit(v.trim()); }} accessibilityLabel={label}
        multiline={multiline} keyboardType={keyboardType ?? "default"} placeholderTextColor={c.faint}
        style={[resolveType("body", scale), { flex: 1, color: c.ink, paddingVertical: 4 }, multiline && { textAlignVertical: "top" }]} />
    </View>
  );
}

function OptionalRow({ def, e, canEdit, docs, onRefuse }: { def: EventFieldRow; e: ProgrammingEvent; canEdit: boolean; docs: Doc[]; onRefuse?: () => void }) {
  const { c } = useTheme();
  const has = hasOptionalAnswer(e, def);
  const raw = e.fieldValues?.[def.slug] ?? null;
  const commit = (value: string | number | boolean | null) => void patchEvent(e.id, { fieldValues: { ...e.fieldValues, [def.slug]: value } });
  let body: React.ReactNode;
  if (def.slug === "attachment") {
    body = <Attachment e={e} docs={docs} canEdit={canEdit} />;
  } else if (def.slug === "description") {
    body = canEdit ? <InlineText value={e.description ?? ""} label={def.label} multiline onCommit={v => void patchEvent(e.id, { description: v || null })} /> : <Read text={e.description} />;
  } else if (def.slug === "cohost") {
    body = canEdit ? <InlineText value={e.collab ?? ""} label={def.label} onCommit={v => void patchEvent(e.id, { collab: v || null })} /> : <Read text={e.collab} />;
  } else if (def.kind === "bool") {
    body = canEdit ? (
      <Pressable onPress={() => { haptics.select(); commit(!raw); }} accessibilityRole="switch" accessibilityState={{ checked: !!raw }}
        style={[styles.bool, { borderColor: raw ? c.ink : c.line2, backgroundColor: raw ? c.pastel.mint.soft : c.card }]}>
        <T v="buttonSm" color={raw ? c.ink : c.ink2}>{raw ? PANEL.yes : PANEL.no}</T>
      </Pressable>
    ) : <Read text={raw ? PANEL.yes : PANEL.no} />;
  } else if (def.kind === "num" || def.kind === "money") {
    const n = typeof raw === "number" ? raw : null;
    body = canEdit ? (
      <InlineText value={n == null ? "" : String(n)} label={def.label} keyboardType={def.kind === "money" ? "decimal-pad" : "number-pad"} prefix={def.kind === "money" ? "$" : undefined}
        onCommit={v => { const x = v === "" ? null : Number(v); commit(x != null && Number.isFinite(x) ? x : null); }} />
    ) : <Read text={n == null ? null : def.kind === "money" ? money(n) : String(n)} />;
  } else {
    const text = raw == null ? "" : String(raw);
    body = canEdit ? <InlineText value={text} label={def.label} onCommit={v => commit(v || null)} /> : <Read text={text || null} />;
  }
  const inner = (
    <>
      <Mark state={has ? "set" : "empty"} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.rowBetween}>
          <T v="kicker" size={10.5} color={c.ink3}>{def.label}</T>
          {onRefuse ? <Icon name="lock" size={12} color={c.ink3} /> : null}
        </View>
        {body}
      </View>
    </>
  );
  // Only a locked row is a button (its tap says why it's locked); an open one holds its input.
  return onRefuse ? (
    <Pressable onPress={onRefuse} style={[styles.fld, { borderBottomColor: c.line }]} accessibilityRole="button" accessibilityLabel={`${def.label} — locked`}>{inner}</Pressable>
  ) : <View style={[styles.fld, { borderBottomColor: c.line }]}>{inner}</View>;
}

function Read({ text }: { text: string | null | undefined }) {
  const { c } = useTheme();
  return <T v="body" color={text ? c.ink : c.ink3}>{text || PANEL.notSet}</T>;
}

/** The attachment: a link or one of the chapter's docs (type "/" to pick one), as the web's AttachmentField. */
function Attachment({ e, docs, canEdit }: { e: ProgrammingEvent; docs: Doc[]; canEdit: boolean }) {
  const { c } = useTheme();
  const scale = useFontScale();
  const [q, setQ] = useState("");
  const doc = e.attachmentDocId != null ? docs.find(d => d.id === e.attachmentDocId) ?? null : null;
  const url = e.attachmentUrl ?? doc?.url ?? null;
  if (url || e.attachmentDocId != null) {
    return (
      <View style={styles.valRow}>
        <Pressable onPress={() => { if (url) void WebBrowser.openBrowserAsync(url); }} accessibilityRole="link" style={({ pressed }) => [{ flexShrink: 1 }, pressed && pressedDim]}>
          <T v="body" color={c.pastel.lilac.ink} numberOfLines={1} style={styles.link}>{doc?.title ?? "Open attachment"}</T>
        </Pressable>
        {canEdit ? (
          <Pressable onPress={() => void patchEvent(e.id, { attachmentUrl: null, attachmentDocId: null })} accessibilityRole="button" accessibilityLabel="Remove attachment" hitSlop={8}
            style={({ pressed }) => [pressed && pressedDim]}>
            <Icon name="x" size={13} color={c.ink3} />
          </Pressable>
        ) : null}
      </View>
    );
  }
  if (!canEdit) return <T v="body" color={c.ink3}>—</T>;
  const picking = q.startsWith("/");
  const matches = picking ? docs.filter(d => d.title.toLowerCase().includes(q.slice(1).toLowerCase())).slice(0, 8) : [];
  const commitUrl = () => {
    const v = q.trim();
    if (!v || v.startsWith("/")) return;
    if (v.startsWith("http://") || v.startsWith("https://")) { setQ(""); void patchEvent(e.id, { attachmentUrl: v, attachmentDocId: null }); }
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.inlineBox, { borderColor: c.line2, backgroundColor: c.card }]}>
        <TextInput value={q} onChangeText={setQ} onSubmitEditing={commitUrl} onBlur={commitUrl} placeholder="https://… or type / to pick a doc" placeholderTextColor={c.faint}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel="Attachment"
          style={[resolveType("body", scale), { color: c.ink, paddingVertical: 4 }]} />
      </View>
      {picking ? (
        <View style={[styles.picker, { borderColor: c.line2, backgroundColor: c.card }]}>
          {!matches.length ? <T v="meta" size={12} color={c.ink3}>No docs match — add one in Resources first.</T> : null}
          {matches.map(d => (
            <Pressable key={d.id} onPress={() => { setQ(""); void patchEvent(e.id, { attachmentDocId: d.id, attachmentUrl: null }); }} accessibilityRole="button"
              style={({ pressed }) => [styles.pickRow, pressed && pressedDim]}>
              <Icon name="sheet" size={13} color={c.ink3} />
              <T v="callout" numberOfLines={1} style={{ flex: 1 }}>{d.title}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The org's enabled fields as pills: on = collected on this event. "New field" adds one for every event. */
function TogglePills({ e, defs, onNew }: { e: ProgrammingEvent; defs: EventFieldRow[]; onNew: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<EventFieldRow | null>(null);
  const off = new Set(e.detachedFields);
  const atCeiling = defs.length >= MAX_EVENT_FIELDS;
  /** Write the opt-out set with one slug flipped. Sent whole, never as a delta. */
  const setAttached = async (d: EventFieldRow, attached: boolean) => {
    const next = new Set(off);
    if (attached) next.delete(d.slug); else next.add(d.slug);
    setBusy(true);
    const ok = await patchEvent(e.id, { detachedFields: [...next].sort() });
    setBusy(false);
    if (ok) toast.show(attached ? `${d.label} is collected on this event.` : `${d.label} is off for this event. Other events keep it.`);
  };
  const toggle = (d: EventFieldRow) => {
    if (busy) return;
    haptics.select();
    const attached = !off.has(d.slug);
    // Detaching an ANSWERED field destroys that answer, so it asks first.
    if (attached && hasOptionalAnswer(e, d)) { setConfirm(d); return; }
    void setAttached(d, !attached);
  };
  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      <View style={styles.pills}>
        {defs.map(d => {
          const on = !off.has(d.slug);
          return (
            <Pressable key={d.slug} onPress={() => toggle(d)} accessibilityRole="switch" accessibilityState={{ checked: on }} disabled={busy}
              accessibilityHint={on ? (hasOptionalAnswer(e, d) ? `Takes ${d.label} off this event. Its answer here is cleared.` : `Takes ${d.label} off this event`) : `Collects ${d.label} on this event`}
              style={[styles.fp, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.paper3 : c.card, borderStyle: on ? "solid" : "dashed" }]}>
              <T v="pill" color={on ? c.ink : c.ink3}>{d.label}</T>
            </Pressable>
          );
        })}
        <Pressable onPress={onNew} disabled={atCeiling || busy} accessibilityRole="button"
          accessibilityHint={atCeiling ? `A chapter can collect at most ${MAX_EVENT_FIELDS} fields.` : undefined}
          style={({ pressed }) => [styles.fp, { borderColor: c.line2, borderStyle: "dashed", opacity: atCeiling ? 0.5 : 1 }, pressed && pressedDim]}>
          <Icon name="plus" size={12} color={c.ink3} />
          <T v="pill" color={c.ink3}>{PANEL.newField}</T>
        </Pressable>
      </View>
      <T v="meta" size={12} color={c.ink3}>{PANEL.fieldNote}</T>
      <Sheet open={confirm != null} onClose={() => setConfirm(null)} tone="peach" icon="alert" title={confirm ? `Take “${confirm.label}” off this event?` : ""}
        footer={
          <View style={styles.newFoot}>
            <View style={{ flex: 1 }} />
            <Button label={SAY.cancel} variant="ghost" onPress={() => setConfirm(null)} />
            <Button label="Take it off" tone="peach" onPress={() => { const d = confirm; setConfirm(null); if (d) void setAttached(d, false); }} />
          </View>
        }>
        <T v="body" color={c.ink2}>{confirm ? `${confirm.label} is answered on this event, and that answer is deleted. Other events keep the field and their own answers.` : ""}</T>
      </Sheet>
    </View>
  );
}

function NewField({ open, e, defs, onClose }: { open: boolean; e: ProgrammingEvent; defs: EventFieldRow[]; onClose: () => void }) {
  const { c } = useTheme();
  const scale = useFontScale();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<EventFieldRow["kind"]>("text");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setLabel(""); setKind("text"); setBusy(false); } }, [open]);
  const name = label.trim();
  const clash = !!name && defs.some(d => d.label.toLowerCase() === name.toLowerCase());
  const copy = FIELD_KINDS.find(k => k.kind === kind) ?? FIELD_KINDS[0]!;
  const save = async () => {
    if (!name || clash || busy) return;
    setBusy(true);
    try {
      await createEventField(name, kind);
      haptics.success();
      onClose();
      toast.show(`${name} added, and collected on this event.`);
    } catch (x) {
      haptics.error();
      toast.error("Could not save the change.", { detail: x instanceof Error ? x.message : undefined });
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} locked={busy} tone="lilac" icon="plus" title="New field for every event"
      footer={
        <View style={styles.newFoot}>
          <View style={{ flex: 1 }} />
          <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
          <Button label="Add field" tone="lilac" onPress={() => void save()} disabled={!name || clash || busy} />
        </View>
      }>
      <View style={{ gap: 12 }}>
        <View style={[styles.inlineBox, { borderColor: c.line2, backgroundColor: c.card }]}>
          <TextInput value={label} onChangeText={setLabel} maxLength={48} placeholder="Beneficiary, Bus company, DJ contact…" placeholderTextColor={c.faint}
            accessibilityLabel="Field name" autoFocus style={[resolveType("body", scale), { color: c.ink, paddingVertical: 6 }]} />
        </View>
        <T v="label" color={c.ink2}>What kind of answer</T>
        <View style={styles.pills}>
          {FIELD_KINDS.map(k => {
            const on = k.kind === kind;
            return (
              <Pressable key={k.kind} onPress={() => { if (!on) { haptics.select(); setKind(k.kind); } }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={[styles.fp, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel.lilac.soft : c.card }]}>
                <T v="pill" color={on ? c.ink : c.ink2}>{k.label}</T>
              </Pressable>
            );
          })}
        </View>
        <T v="meta" color={c.ink2}><T v="meta" color={c.ink} style={{ fontWeight: "700" }}>{`${copy.label}.`}</T>{` ${copy.eg}`}</T>
        <T v="meta" color={c.ink3}>A field&apos;s type is fixed once events start answering it.</T>
        {clash ? <T v="meta" color={c.pastel.rose.ink}>{`There's already a field called “${name}”.`}</T> : null}
        <T v="meta" size={12} color={c.ink3}>{e.title}</T>
      </View>
    </Sheet>
  );
}

function SpendInput({ e }: { e: ProgrammingEvent }) {
  return (
    <View style={{ maxWidth: 180 }}>
      <InlineText value={(e.spendingCents / 100).toFixed(2)} label="Spending" keyboardType="decimal-pad" prefix="$"
        onCommit={v => { const cents = Math.round(parseFloat(v || "0") * 100); if (Number.isFinite(cents) && cents !== e.spendingCents) void patchEvent(e.id, { spendingCents: Math.max(0, cents) }); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: 6 },
  pill: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  lead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  vis: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  band: { gap: 12, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 14 },
  link: { textDecorationLine: "underline" },
  ladder: { flexDirection: "row", alignItems: "flex-start" },
  step: { flex: 1, alignItems: "center", gap: 6, minHeight: 56 },
  rail: { position: "absolute", top: 15, right: "50%", width: "100%", borderTopWidth: 1.5 },
  node: { borderRadius: 999, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 0 },
  wrap: { gap: 8, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  stamp: { position: "absolute", right: 10, top: -9, borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, transform: [{ rotate: "6deg" }] },
  wrapHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  secHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  why: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  fld: { flexDirection: "row", gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  mark: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 2 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  valRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  inlineBox: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, minHeight: 40, justifyContent: "center" },
  bool: { alignSelf: "flex-start", borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, minHeight: 32, justifyContent: "center" },
  picker: { borderWidth: 1.5, borderRadius: 10, padding: 6, gap: 2 },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6, minHeight: 36 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fp: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, minHeight: 30 },
  tx: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  gate: { gap: 10, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  gateText: { flexDirection: "row", alignItems: "center", gap: 8 },
  newFoot: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "stretch" },
});
