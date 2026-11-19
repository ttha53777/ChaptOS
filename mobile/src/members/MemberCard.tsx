/**
 * The member card (Member Spotlight v3 on a phone): a calling card in a sheet.
 *
 *   print       the photo as a taped instant print (initials when there's none)
 *   who         name, office title + roles as inked tags, "since Mon YYYY", "you"
 *   standing    the one-sentence verdict and the measure tiles, judged on `measured`;
 *               only on your own card or for officers who manage people (./model)
 *   about       email (Email opens Mail; GET /api/brothers/[id]/profile), custom fields
 *   yours       on your own card: Change photo (take / pick / remove, the print develops
 *               while it uploads) and Your name here (this chapter's name for you)
 *
 *   officers    MANAGE_BROTHERS: GPA and service hours, one value at a time (the web card's
 *               rule), PATCH /api/brothers/[id], with Undo. Roles, dues and excuses stay
 *               on the web
 *   attendance  on your own card the Attendance tile opens Yours > Attendance
 *
 * Peers see the web's note: "Standing, GPA and dues are only visible to officers and to X."
 */
import type { Brother, MeResponse } from "@/lib/api-types";
import { useEffect, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { patchMe, refreshRoster, renameMe, updateMember, useMemberProfile } from "~/data/members";
import { router } from "expo-router";
import { Field } from "~/ui/Field";
import { Icon } from "~/icons/Icon";
import { DevelopingPrint } from "~/moments/Develop";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Tape, initials } from "~/paper/bits";
import { hard } from "~/theme/shadow";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { LEVEL_TONE, customOf, measuredOf, seesStanding, statsOf, titleOf, trackedOf, verdictOf, vocab, type Stat } from "./model";
import { useMyPhoto, type Source } from "./photo";

const PRINT = 148;

export function MemberCard({ member, me, roster, onClose }: { member: Brother | null; me: MeResponse; roster: Brother[]; onClose: () => void }) {
  const self = member?.id === me.id;
  return (
    <Sheet open={member != null} onClose={onClose} size="tall" tone={self ? "peach" : "lilac"} kicker={self ? "Your card" : "Member"} icon="people"
      accessibilityLabel={member ? `${member.name}'s card` : undefined}>
      {member ? <Body member={member} me={me} roster={roster} /> : null}
    </Sheet>
  );
}

function Body({ member: b, me, roster }: { member: Brother; me: MeResponse; roster: Brother[] }) {
  const { c } = useTheme();
  const self = b.id === me.id;
  const profile = useMemberProfile(b.id);
  const photo = useMyPhoto(me.id);
  const [pickOpen, setPickOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [editing, setEditing] = useState<EditKey | null>(null);
  const org = me.org;
  const officer = !self && (me.isAdmin || (me.permissions & 1) !== 0);
  const full = seesStanding(me, b.id) && org != null;
  const tracked = trackedOf(org?.disabledFeatures);
  const measured = measuredOf(tracked, roster);
  const words = { self, dues: vocab(me, "Dues"), service: vocab(me, "Service") };
  const verdict = full ? verdictOf(b, org.thresholds, tracked, measured, words) : null;
  const stats = full ? statsOf(b, org.thresholds, tracked, measured, words) : [];
  const custom = customOf(b, org?.customMemberFields);
  const roles = [...(b.roles ?? [])].sort((x, y) => y.rank - x.rank);
  const joined = profile.data?.joinedAt ?? b.joinedAt;
  const since = joined ? new Date(joined).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : null;
  const avatar = self ? (me.avatarUrl ?? b.avatarUrl ?? null) : (b.avatarUrl ?? null);
  const email = profile.data?.email ?? null;

  return (
    <View style={{ gap: 22 }}>
      {/* the print + who */}
      <View style={{ alignItems: "center", gap: 14 }}>
        <View style={[styles.print, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel[self ? "peach" : "lilac"].fill, 4)]}>
          <Tape width={58} rotate={-4} style={{ position: "absolute", top: -11, alignSelf: "center", zIndex: 2 }} />
          <View style={[styles.photo, { backgroundColor: c.note.fill.lilac }]}>
            <DevelopingPrint size={PRINT} state={self ? photo.state : "idle"} next={self ? photo.next : null} onDone={photo.onDone}>
              {avatar
                ? <Image source={{ uri: avatar }} style={{ width: PRINT, height: PRINT }} accessibilityIgnoresInvertColors />
                : <View style={styles.initials}><T v="hero" color={c.avInk} style={{ fontSize: 52, lineHeight: 60 }}>{initials(b.name)}</T></View>}
            </DevelopingPrint>
          </View>
          <T v="mono" color={c.ink3} style={{ fontSize: 10.5, marginTop: 8 }} numberOfLines={1}>
            {self && photo.state === "developing" ? "developing…" : since ? `since ${since}` : " "}
          </T>
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <T v="title" style={{ textAlign: "center" }} accessibilityRole="header">{b.name}</T>
          <T v="meta" color={c.ink3} style={{ textAlign: "center" }}>{[titleOf(b), self ? "you" : null].filter(Boolean).join(" · ")}</T>
        </View>
        {roles.length ? (
          <View style={styles.tags}>
            {roles.map(r => (
              <View key={r.id} style={[styles.tag, { borderColor: r.color ?? c.ink2, backgroundColor: alpha(r.color ?? c.ink2, 0.08) }]}>
                <View style={[styles.tagDot, { backgroundColor: r.color ?? c.ink2 }]} />
                <T v="pill" color={c.ink}>{r.name}</T>
              </View>
            ))}
          </View>
        ) : null}
        {self ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Change photo" icon="camera" size="sm" variant="ghost" tone="peach" onPress={() => setPickOpen(true)} disabled={photo.state === "developing"} />
            <Button label="Your name here" icon="pencil" size="sm" variant="ghost" onPress={() => setNameOpen(true)} />
          </View>
        ) : null}
      </View>

      {/* standing */}
      {verdict ? (
        <View style={{ gap: 12 }}>
          <T v="label" color={c.ink3} accessibilityRole="header">Standing</T>
          <T v="body" accessibilityLiveRegion="polite">
            {verdict.lead}
            <T v="body" color={LEVEL_TONE[verdict.level] ? c.pastel[LEVEL_TONE[verdict.level]!].ink : c.ink2} style={{ fontStyle: "italic", fontWeight: "700" }}>{verdict.em}</T>
            {verdict.tail}
          </T>
          {stats.length ? (
            <View style={styles.stats}>
              {stats.map(s => (
                <StatTile key={s.key} s={s}
                  onPress={self && s.key === "attendance" ? () => router.push("/more/attendance") : officer && (s.key === "gpa" || s.key === "serviceHours") ? () => setEditing(s.key as EditKey) : undefined}
                  action={self && s.key === "attendance" ? "Your attendance →" : officer && (s.key === "gpa" || s.key === "serviceHours") ? "Edit" : undefined} />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <T v="meta" color={c.ink3}>{`Standing, GPA and ${vocab(me, "Dues").toLowerCase()} are only visible to officers and to ${b.name.split(" ")[0]}.`}</T>
      )}

      {/* about */}
      <View style={{ gap: 10 }}>
        <T v="label" color={c.ink3} accessibilityRole="header">About</T>
        <View style={[styles.about, { borderColor: c.line, backgroundColor: c.card }]}>
          <View style={styles.aboutRow}>
            <Icon name="envelope" size={16} color={c.ink3} />
            <View style={{ flex: 1 }}>
              <T v="label" color={c.ink3} style={{ fontSize: 9.5 }}>Email</T>
              <T v="callout" color={email ? c.ink : c.ink3} numberOfLines={1} selectable>
                {profile.isError ? "Couldn't load" : profile.isPending ? "…" : email ?? "Not on file"}
              </T>
            </View>
            {email && !self ? <Button label="Email" size="sm" variant="ghost" tone="sky" onPress={() => void Linking.openURL(`mailto:${email}`)} /> : null}
          </View>
          {custom.map(f => (
            <View key={f.label} style={[styles.aboutRow, { borderTopColor: c.line, borderTopWidth: 1 }]}>
              <Icon name="note" size={16} color={c.ink3} />
              <View style={{ flex: 1 }}>
                <T v="label" color={c.ink3} style={{ fontSize: 9.5 }}>{f.label}</T>
                <T v="callout">{f.value}</T>
              </View>
            </View>
          ))}
        </View>
      </View>

      {officer ? <EditSheet member={b} field={editing} serviceWord={vocab(me, "Service")} onClose={() => setEditing(null)} /> : null}

      {self ? (
        <>
          <PhotoSheet open={pickOpen} hasCustom={me.hasCustomAvatar} onClose={() => setPickOpen(false)}
            onPick={(s: Source) => { setPickOpen(false); setTimeout(() => void photo.choose(s), 350); }}
            onRemove={() => { setPickOpen(false); void photo.remove(); }} />
          <NameSheet open={nameOpen} me={me} current={b.name} onClose={() => setNameOpen(false)} />
        </>
      ) : null}
    </View>
  );
}

function StatTile({ s, onPress, action }: { s: Stat; onPress?: () => void; action?: string }) {
  const { c } = useTheme();
  const tone = LEVEL_TONE[s.level];
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${s.label}: ${s.value}, ${s.caption}${action ? `. ${action.replace(" →", "")}` : ""}`}
      style={({ pressed }) => [styles.stat, { borderColor: tone ? c.pastel[tone].border : c.line, backgroundColor: tone ? c.pastel[tone].soft : c.card }, pressed && { opacity: 0.8 }]}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <T v="label" color={c.ink3} style={{ fontSize: 9.5, flex: 1 }}>{s.label}</T>
        {action === "Edit" ? <Icon name="pencil" size={12} color={c.ink3} /> : null}
      </View>
      <T v="title" color={tone ? c.pastel[tone].ink : c.ink3} style={{ fontSize: 22 }}>{s.value}</T>
      <T v="meta" color={c.ink3}>{s.caption}</T>
      {action && action !== "Edit" ? <T v="meta" color={c.ink} style={{ fontWeight: "600", marginTop: 2 }}>{action}</T> : null}
    </Pressable>
  );
}

/* ── officer edits: one value at a time ───────────────────────────────────────── */

type EditKey = "gpa" | "serviceHours";

function EditSheet({ member: b, field, serviceWord, onClose }: { member: Brother; field: EditKey | null; serviceWord: string; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (field) { setDraft(field === "gpa" ? b.gpa.toFixed(2) : String(b.serviceHours)); setErr(null); setBusy(false); } }, [field, b.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = field === "gpa" ? "GPA" : `${serviceWord} hours`;
  const save = async () => {
    if (!field) return;
    const n = Number(draft.trim());
    if (!draft.trim() || !Number.isFinite(n) || n < 0) { setErr(field === "gpa" ? "Enter a GPA like 3.40." : "Enter hours like 12 or 7.5."); return; }
    if (field === "gpa" && n > 5) { setErr("GPA tops out at 5.00."); return; }
    const before = b[field];
    if (n === before) { onClose(); return; }
    setBusy(true); setErr(null);
    try {
      await updateMember(b.id, { [field]: n });
      haptics.success();
      void refreshRoster();
      onClose();
      toast.show(`${label} saved`, {
        detail: `${b.name}: ${field === "gpa" ? n.toFixed(2) : `${n}h`}`,
        undo: () => { void updateMember(b.id, { [field]: before }).then(() => refreshRoster(), e => toast.error("Couldn't undo", { detail: errorMessage(e) })); },
      });
    } catch (e) {
      haptics.error();
      setErr(errorMessage(e, "Couldn't save. Your edit is still here — try again."));
    } finally { setBusy(false); }
  };
  return (
    <Sheet open={field != null} onClose={() => (busy ? undefined : onClose())} size="fit" title={label} kicker={b.name} tone="lilac" icon="pencil"
      footer={<Button label={busy ? "Saving…" : "Save"} icon="check" block disabled={busy} onPress={save} style={{ flex: 1 }} />}>
      <Field label={label} value={draft} onChangeText={t => { setDraft(t); if (err) setErr(null); }} autoFocus
        keyboardType="decimal-pad" inputMode="decimal" returnKeyType="done" onSubmitEditing={save} error={err} />
    </Sheet>
  );
}

/* ── my photo: take / pick / remove ───────────────────────────────────────────── */

function PhotoSheet({ open, hasCustom, onClose, onPick, onRemove }: {
  open: boolean; hasCustom: boolean; onClose: () => void; onPick: (s: Source) => void; onRemove: () => void;
}) {
  const { c } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} title="Your photo" kicker="Every chapter you're in sees it" tone="peach" icon="camera">
      <View style={{ gap: 10 }}>
        <Button label="Take a photo" icon="camera" tone="peach" block onPress={() => onPick("camera")} />
        <Button label="Choose from library" icon="upload" variant="ghost" block onPress={() => onPick("library")} />
        {hasCustom ? <Button label="Remove photo" icon="trash" variant="ghost" tone="rose" block onPress={onRemove} /> : null}
        <T v="meta" color={c.ink3}>You'll crop it square. {hasCustom ? "Removing it puts your Google picture back." : ""}</T>
      </View>
    </Sheet>
  );
}

/* ── my name in this chapter ──────────────────────────────────────────────────── */

function NameSheet({ open, me, current, onClose }: { open: boolean; me: MeResponse; current: string; onClose: () => void }) {
  const { c } = useTheme();
  const [draft, setDraft] = useState(current);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setDraft(current); setErr(null); } }, [open, current]);
  const save = () => {
    const name = draft.trim().replace(/\s+/g, " ");
    if (!name) { setErr("Your name can't be blank."); return; }
    if (name.length > 80) { setErr("Keep it under 80 characters."); return; }
    onClose();
    if (name === current) return;
    const undo = patchMe(me.id, { name });
    haptics.success();
    renameMe(me.id, name).then(
      () => { toast.show("Name saved", { detail: `${me.org?.name ?? "This chapter"} sees you as ${name}.` }); void refreshRoster(); },
      e => { undo(); haptics.error(); toast.error("Couldn't change your name", { detail: errorMessage(e) }); },
    );
  };
  return (
    <Sheet open={open} onClose={onClose} title="Your name here" kicker={me.org?.name} tone="lilac" icon="pencil"
      footer={<Button label="Save" icon="check" block onPress={save} style={{ flex: 1 }} />}>
      <View style={{ gap: 8 }}>
        <TextInput value={draft} onChangeText={t => { setDraft(t); if (err) setErr(null); }} autoFocus maxLength={120}
          returnKeyType="done" onSubmitEditing={save} accessibilityLabel="Your name in this chapter"
          style={[styles.input, { borderColor: err ? c.pastel.rose.ink : c.line2, color: c.ink, backgroundColor: c.card }]} />
        {err ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T>
          : <T v="meta" color={c.ink3}>Only this chapter. Other chapters you're in keep the name they know you by.</T>}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  print: { padding: 10, paddingBottom: 10, borderWidth: 1.5, borderRadius: 6, alignItems: "center", transform: [{ rotate: "-2deg" }] },
  photo: { width: PRINT, height: PRINT, overflow: "hidden", borderRadius: 2 },
  initials: { width: PRINT, height: PRINT, alignItems: "center", justifyContent: "center" },
  tags: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1.5 },
  tagDot: { width: 7, height: 7, borderRadius: 4 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { width: "48%", flexGrow: 1, gap: 2, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  about: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14 },
  aboutRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  input: { fontSize: 17, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
});
