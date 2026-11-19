/**
 * One event (the web's ProgrammingDetailPanel), as a tall sheet over the board:
 *
 *   the ladder    Idea · Planning · Confirmed · Done; an ink marker sits on this lane
 *                 and slides (settle spring) when it moves. Officers tap a rung to move;
 *                 the big button under it is the one forward move that makes sense now
 *   the facts     when, where, who, attendance, with. While it's published those are
 *                 locked (the server freezes them) except the owner
 *   the wrap-up   done: stars, what it cost, notes; confirmed and past: Wrap it up
 *   links         attached docs; officers attach and remove
 *   Delete        at the foot, behind a confirm
 *
 * A move routes like the web's moveStage: a forward move that's missing something
 * opens FixStep; Done goes through WrapUp (and only from Confirmed); leaving the
 * Timeline asks first (OffTimeline). Anything else moves at once with an Undo.
 * Members see all of it read-only.
 */
import type { ProgrammingEvent, ProgrammingStage } from "@/lib/api-types";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { errorMessage } from "~/api/errors";
import { localDay } from "~/data/home";
import { deleteProgramming, detachDoc, moveStage, patchProgramming, useProgramming, useProgrammingDocs } from "~/data/programming";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { toneOf } from "~/timeline/model";
import { clockLabel } from "~/today/time";
import { T } from "~/ui/T";
import { Stars } from "./Card";
import { canManage, isForward, isPublished, missingFor, money, needsConfirmFirst, needsWrapUp, ownerLabel, RATING, shortDate, STAGE, STAGES } from "./model";
import { AttachLink, EditDetails, FixStep, OffTimeline, OwnerSheet, WrapUp } from "./steps";

type Target = { e: ProgrammingEvent; stage: ProgrammingStage };

export function EventSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const me = useEntryOf("ready")?.me ?? null;
  const q = useProgramming();
  const docs = useProgrammingDocs(id);
  const officer = !!me && canManage(me);
  const live = q.data?.find(e => e.id === id) ?? null;
  // keep the last copy on screen while the sheet slides away after a delete
  const [last, setLast] = useState<ProgrammingEvent | null>(null);
  useEffect(() => { if (live) setLast(live); }, [live]);
  const e = live ?? last;
  const today = localDay();

  const [fix, setFix] = useState<Target | null>(null);
  const [off, setOff] = useState<Target | null>(null);
  const [wrap, setWrap] = useState<{ e: ProgrammingEvent; editing: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [owning, setOwning] = useState(false);
  const [linking, setLinking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!e) return <Sheet open={false} onClose={onClose} />;
  const pub = isPublished(e.stage);
  const tone = toneOf(e.category);

  const moveTo = (stage: ProgrammingStage) => {
    if (!officer || stage === e.stage) return;
    const fwd = isForward(e.stage, stage);
    if (needsConfirmFirst(e, stage)) {
      haptics.warn();
      toast.show("Confirm it first", { detail: "Done means it happened, and the chapter has to have seen it before it can be wrapped." });
      return;
    }
    if (fwd && missingFor(e, stage).length) { setFix({ e, stage }); return; }
    if (fwd && stage === "done") { setWrap({ e, editing: false }); return; }
    if (!fwd && pub && !isPublished(stage)) { setOff({ e, stage }); return; }
    const from = e.stage;
    moveStage(e, stage).then(
      saved => {
        if (fwd) haptics.success();
        toast.show(stage === "confirmed" ? `${saved.title} is confirmed` : `Moved to ${STAGE[stage].label}`, {
          detail: stage === "confirmed" ? "It's on the chapter's Timeline now." : STAGE[stage].meaning,
          undo: () => { void moveStage(saved, from).catch(x => toast.error("Couldn't undo that", { detail: errorMessage(x) })); },
        });
      },
      x => { haptics.error(); toast.error("Couldn't move it", { detail: errorMessage(x) }); },
    );
  };

  const next: { label: string; stage: ProgrammingStage; icon: IconName } | null =
    e.stage === "idea" ? { label: e.owner ? "Start planning" : "Pick it up", stage: "planning", icon: "arrow-r" }
      : e.stage === "planning" ? { label: "Confirm it", stage: "confirmed", icon: "check" }
        : e.stage === "confirmed" && needsWrapUp(e, today) ? { label: "Wrap it up", stage: "done", icon: "star" }
          : null;

  const setOwner = (o: { brotherId: number | null; roleId: number | null; label: string | null }) => {
    setOwning(false);
    const patch = o.roleId ? { ownerRoleId: o.roleId } : o.brotherId ? { ownerBrotherId: o.brotherId } : { ownerBrotherId: null, ownerRoleId: null };
    patchProgramming(e.id, patch).then(
      () => toast.show(o.label ? `${o.label} is on it` : "Nobody on it now", { detail: e.title }),
      x => { haptics.error(); toast.error("Couldn't change the owner", { detail: errorMessage(x) }); },
    );
  };

  const when = e.dueDate
    ? [new Date(`${e.dueDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
      e.schedule?.kind === "allDay" ? "all day" : clockLabel(e.time)].filter(Boolean).join(" · ")
    : null;

  return (
    <>
      <Sheet open={id != null} onClose={onClose} size="tall" tone={tone} icon="board" kicker={e.collab ? `${e.type} · with ${e.collab}` : e.type} title={e.title}
        actions={officer && !pub ? <Button label="Edit" size="sm" variant="soft" icon="pencil" onPress={() => setEditing(true)} /> : null}>
        <View style={{ gap: 22 }}>
          <View style={{ gap: 12 }}>
            <Ladder stage={e.stage} officer={officer} onPick={moveTo} />
            <T v="meta" color={c.ink3}>{STAGE[e.stage].meaning}</T>
            {officer && next ? <Button label={next.label} icon={next.icon} tone={STAGE[next.stage].tone} block onPress={() => moveTo(next.stage)} /> : null}
          </View>

          <View style={[styles.facts, { borderColor: c.line, backgroundColor: c.card }]}>
            <Fact icon="cal" label="When" value={when} empty="No day yet" locked={pub} onPress={officer && !pub ? () => setEditing(true) : undefined} first />
            <Fact icon="pin" label="Where" value={e.location || null} empty="Nowhere yet" locked={pub} onPress={officer && !pub ? () => setEditing(true) : undefined} />
            <Fact icon="people" label="Owner" value={ownerLabel(e.owner, true)} empty={e.ownerNote ? `Was "${e.ownerNote}" (not on the roster)` : "Nobody yet"} onPress={officer ? () => setOwning(true) : undefined} />
            <Fact icon="check" label="Attendance" value={e.mandatory ? "Required" : "Optional"} locked={pub} onPress={officer && !pub ? () => setEditing(true) : undefined} />
          </View>
          {pub && officer ? (
            <View style={styles.lockNote}>
              <Icon name="lock" size={13} color={c.ink3} />
              <T v="meta" color={c.ink3} style={{ flex: 1 }}>It's on the chapter's Timeline, so its details are locked. Move it back to Planning to change them; the owner can change any time.</T>
            </View>
          ) : null}

          {e.description ? <T v="body" color={c.ink2}>{e.description}</T> : null}

          {e.stage === "done" ? (
            <Animated.View entering={FadeIn.duration(m.t(200)).reduceMotion(ReduceMotion.Never)} style={[styles.wrap, { borderColor: c.pastel.mint.border, backgroundColor: c.pastel.mint.soft }]}>
              <View style={styles.wrapTop}>
                <T v="label" color={c.ink3} style={{ flex: 1 }}>How it went</T>
                {officer ? <Pressable onPress={() => setWrap({ e, editing: true })} hitSlop={8} accessibilityRole="button"><T v="callout" color={c.pastel.mint.ink}>Edit</T></Pressable> : null}
              </View>
              <View style={styles.wrapTop}>
                <Stars n={e.successRating} size={16} />
                {e.successRating ? <T v="callout">{RATING[e.successRating]}</T> : null}
                <View style={{ flex: 1 }} />
                <T v="mono" color={c.ink2}>{e.spendingCents ? money(e.spendingCents) : "No spend"}</T>
              </View>
              {e.wrapUpNotes ? <T v="body" color={c.note.ink}>{e.wrapUpNotes}</T> : null}
            </Animated.View>
          ) : null}

          <View style={{ gap: 10 }}>
            <View style={styles.wrapTop}>
              <T v="label" color={c.ink3} style={{ flex: 1 }}>Links</T>
              {officer ? <Pressable onPress={() => setLinking(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Attach a link"><T v="callout" color={c.pastel[tone].ink}>+ Attach</T></Pressable> : null}
            </View>
            {(docs.data ?? []).length ? (
              <View style={[styles.facts, { borderColor: c.line, backgroundColor: c.card }]}>
                {docs.data!.map((d, i) => <LinkRow key={d.id} title={d.title} url={d.url} first={i === 0} officer={officer} onRemove={() => {
                  detachDoc(e.id, d.id).then(() => toast.show("Link removed", { detail: d.title }), x => { haptics.error(); toast.error("Couldn't remove it", { detail: errorMessage(x) }); });
                }} />)}
              </View>
            ) : <T v="meta" color={c.ink3}>{docs.isPending ? "…" : "Nothing attached. A run of show or a budget sheet goes here."}</T>}
          </View>

          {officer ? (
            <Pressable onPress={() => setDeleting(true)} accessibilityRole="button" style={styles.del} hitSlop={6}>
              <Icon name="trash" size={14} color={c.pastel.rose.ink} />
              <T v="callout" color={c.pastel.rose.ink}>Delete event</T>
            </Pressable>
          ) : null}
        </View>
      </Sheet>

      {officer ? (
        <>
          <FixStep target={fix} onClose={() => setFix(null)} />
          <OffTimeline target={off} onClose={() => setOff(null)} />
          <WrapUp e={wrap?.e ?? null} editing={wrap?.editing} onClose={() => setWrap(null)} />
          <EditDetails e={editing ? e : null} onClose={() => setEditing(false)} />
          <OwnerSheet open={owning} owner={!e.owner ? { brotherId: null, roleId: null, label: null } : e.owner.kind === "brother" ? { brotherId: e.owner.id, roleId: null, label: e.owner.name } : { brotherId: null, roleId: e.owner.id, label: e.owner.name }}
            canClear={e.stage === "idea"} onClose={() => setOwning(false)} onPick={setOwner} />
          <AttachLink e={linking ? e : null} onClose={() => setLinking(false)} />
          <DeleteEvent e={deleting ? e : null} onClose={() => setDeleting(false)} onDeleted={onClose} />
        </>
      ) : null}
    </>
  );
}

/* ── the ladder ────────────────────────────────────────────────────────────────── */

export function Ladder({ stage, officer, onPick }: { stage: ProgrammingStage; officer: boolean; onPick: (s: ProgrammingStage) => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const [w, setW] = useState(0);
  const idx = STAGES.indexOf(stage);
  const x = useSharedValue(idx);
  useEffect(() => { x.value = m.reduced ? idx : withSpring(idx, m.spring("settle")); }, [idx, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const seg = w / 4;
  const mark = useAnimatedStyle(() => ({ opacity: w ? 1 : 0, transform: [{ translateX: seg * x.value }] }));
  return (
    <View style={[styles.ladder, { borderColor: c.ink, backgroundColor: c.paper2 }]} onLayout={ev => setW(ev.nativeEvent.layout.width - 3)} accessibilityRole="tablist">
      <Animated.View style={[styles.mark, { width: seg, backgroundColor: c.ink }, mark]} />
      {STAGES.map((s, i) => {
        const on = s === stage;
        const past = i < idx;
        return (
          <Pressable key={s} onPress={() => onPick(s)} disabled={!officer} style={styles.rung}
            accessibilityRole="tab" accessibilityState={{ selected: on, disabled: !officer }} accessibilityLabel={`${STAGE[s].label}${on ? ", current" : officer ? ", move here" : ""}`}>
            <View style={[styles.rungDot, { backgroundColor: on ? c.note.fill[STAGE[s].tone] : past ? c.ink3 : "transparent", borderColor: on ? c.paper : c.ink3 }]} />
            <T v="pill" color={on ? c.paper : past ? c.ink2 : c.ink3} numberOfLines={1}>{STAGE[s].label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

function Fact({ icon, label, value, empty, locked, onPress, first }: { icon: IconName; label: string; value: string | null; empty?: string; locked?: boolean; onPress?: () => void; first?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : "text"} accessibilityLabel={`${label}, ${value ?? empty ?? ""}`}
      style={({ pressed }) => [styles.fact, !first && { borderTopWidth: 1, borderTopColor: c.lineSoft }, pressed && { backgroundColor: c.paper2 }]}>
      <Icon name={icon} size={15} color={c.ink3} />
      <T v="meta" color={c.ink3} style={styles.factLabel}>{label}</T>
      <T v="callout" color={value ? c.ink : c.ink3} style={{ flex: 1 }} numberOfLines={2}>{value ?? empty ?? ""}</T>
      {locked ? <Icon name="lock" size={12} color={c.ink3} /> : onPress ? <Icon name="chev-r" size={13} color={c.ink3} /> : null}
    </Pressable>
  );
}

function LinkRow({ title, url, first, officer, onRemove }: { title: string; url: string; first: boolean; officer: boolean; onRemove: () => void }) {
  const { c } = useTheme();
  const [arming, setArming] = useState(false);
  useEffect(() => { if (!arming) return; const t = setTimeout(() => setArming(false), 3500); return () => clearTimeout(t); }, [arming]);
  const host = url.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0];
  return (
    <View style={[styles.fact, !first && { borderTopWidth: 1, borderTopColor: c.lineSoft }]}>
      <Pressable style={styles.linkMain} accessibilityRole="link" accessibilityLabel={`${title}, ${host}`}
        onPress={() => void WebBrowser.openBrowserAsync(url).catch(() => toast.error("Couldn't open that link"))}>
        <Icon name="link" size={15} color={c.ink3} />
        <View style={{ flex: 1 }}>
          <T v="callout" numberOfLines={1}>{title}</T>
          <T v="meta" color={c.ink3} numberOfLines={1}>{host}</T>
        </View>
      </Pressable>
      {officer ? (
        <Pressable onPress={() => { if (arming) { haptics.tap(); onRemove(); } else setArming(true); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={arming ? `Remove ${title}, tap to confirm` : `Remove ${title}`}
          style={[styles.rm, { borderColor: arming ? c.pastel.rose.border : c.line2, backgroundColor: arming ? c.pastel.rose.soft : "transparent" }]}>
          {arming ? <T v="pill" color={c.pastel.rose.ink}>Remove</T> : <Icon name="x" size={12} color={c.ink3} />}
        </Pressable>
      ) : null}
    </View>
  );
}

function DeleteEvent({ e, onClose, onDeleted }: { e: ProgrammingEvent | null; onClose: () => void; onDeleted: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (e) setBusy(false); }, [e?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    if (!e || busy) return;
    setBusy(true);
    try {
      await deleteProgramming(e.id);
      haptics.soft();
      onClose(); onDeleted();
      toast.show(`${e.title} deleted`, { detail: isPublished(e.stage) ? "It's off the Timeline too." : "Off the board." });
    } catch (x) {
      haptics.error();
      toast.error("Couldn't delete it", { detail: errorMessage(x) });
      setBusy(false);
    }
  };
  return (
    <Sheet open={!!e} onClose={onClose} locked={busy} tone="rose" icon="trash" kicker={e ? (e.dueDate ? shortDate(e.dueDate) : STAGE[e.stage].label) : ""} title={`Delete ${e?.title ?? ""}?`}
      footer={
        <View style={[styles.acts, { flex: 1 }]}>
          <Button label="Keep it" variant="soft" onPress={onClose} style={{ flex: 1 }} disabled={busy} />
          <Button label={busy ? "Deleting…" : "Delete"} tone="rose" icon="trash" onPress={() => void go()} style={{ flex: 1.3 }} disabled={busy} />
        </View>
      }>
      <T v="body" color={c.ink2}>{e && isPublished(e.stage)
        ? "It comes off the board and off the chapter's Timeline, with its attendance and links. This can't be undone."
        : "It comes off the board with its links. This can't be undone."}</T>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  ladder: { flexDirection: "row", borderWidth: 1.5, borderRadius: 14, padding: 0, overflow: "hidden", height: 46 },
  mark: { position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: 12 },
  rung: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  rungDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  facts: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  fact: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 13, minHeight: 50 },
  factLabel: { width: 78 },
  lockNote: { flexDirection: "row", gap: 7, marginTop: -12, paddingHorizontal: 2 },
  wrap: { gap: 10, padding: 14, borderRadius: 16, borderWidth: 1.5 },
  wrapTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  linkMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  rm: { minWidth: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  del: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  acts: { flexDirection: "row", gap: 8 },
});
