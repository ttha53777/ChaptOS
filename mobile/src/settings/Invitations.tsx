/**
 * Settings → Invitations (the web's sections/InvitationsSection.tsx at phone width).
 * Every word and rule from @/lib/settings/invites:
 *
 *   lede, "Review join requests" (MANAGE_BROTHERS → Members, where the band is)
 *   ready card  after a create: the link, Copy link, Share… (the system share sheet), Done
 *   form        Label (optional), Expires after, Limit how many people can use it (+ uses),
 *               the forever-warning, Create invite link
 *   links       Active links / All links with "Show inactive links"; each: status pill,
 *               counts, label, meter, the date line, the URL with Copy and Revoke (live
 *               links only), Review N waiting, Create replacement link, View joins
 *
 * MANAGE_SETTINGS only (the index hides the row otherwise; this renders nothing too).
 */
import type { InviteRow } from "@/lib/api-types";
import {
  EXPIRY_LABELS, INVITE_COPY as C, capOf, capWarns, countsLine, dateParts, formatDate, isDead, joinPath, meterOf, pillOf, type PillTone,
} from "@/lib/settings/invites";
import { INVITE_EXPIRY_PRESETS, INVITE_LABEL_MAX, type InviteExpiry } from "@/lib/validation/invite";
import * as Clipboard from "expo-clipboard";
import { router, type Href } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, Share, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { createInvite, revokeInvite, useInviteJoins, useInvites } from "~/data/settings";
import { ConfirmSheet } from "~/docs/Sheets";
import { useEntryOf } from "~/entry/EntryContext";
import { haptics } from "~/motion/haptics";
import { plural } from "~/more/model";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { CheckRow, PillBtn } from "./bits";
import { useScrollTop } from "./frame";
import { can, webOrigin } from "./model";

const joinUrl = (token: string) => `${webOrigin()}${joinPath(token)}`;

export function InvitationsSection() {
  const { c } = useTheme();
  const onScrollTop = useScrollTop();
  const me = useEntryOf("ready")?.me ?? null;
  const [showInactive, setShowInactive] = useState(false);
  const canManage = !!me && can(me, "MANAGE_SETTINGS");
  const q = useInvites(showInactive, canManage);
  const [fresh, setFresh] = useState<InviteRow | null>(null);
  const [expiry, setExpiry] = useState<InviteExpiry>("7d");
  const [label, setLabel] = useState("");
  const [capOn, setCapOn] = useState(false);
  const [maxUses, setMaxUses] = useState("25");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InviteRow | null>(null);
  const [openJoins, setOpenJoins] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const labelRef = useRef<ComponentRef<typeof TextInput>>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };

  if (!me || !canManage) return null;
  const memberWord = plural(me.org?.vocabularyOverrides.Member || "Member").toLowerCase();
  const lede = C.lede(memberWord);
  const reviews = can(me, "MANAGE_BROTHERS");

  const create = async () => {
    if (creating) return;
    const capped = capOf(capOn, maxUses);
    if ("error" in capped) { haptics.error(); toast.error(capped.error); return; }
    setCreating(true);
    try {
      const created = await createInvite({ expiry, label: label.trim() || undefined, maxUses: capped.cap });
      haptics.success();
      setFresh(created);
      toast.show(C.created);
      setLabel("");
      setFlashId(created.id);
      later(() => setFlashId(f => (f === created.id ? null : f)), 2200);
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.createFailed));
    } finally {
      setCreating(false);
    }
  };

  const copy = async (row: InviteRow) => {
    try {
      await Clipboard.setStringAsync(joinUrl(row.token));
      haptics.success();
      setCopiedId(row.id);
      later(() => setCopiedId(x => (x === row.id ? null : x)), 2000);
    } catch {
      haptics.error();
      toast.error(C.copyFailed);
    }
  };

  const share = async (row: InviteRow) => {
    try { await Share.share({ title: "Request to join", message: joinUrl(row.token), url: joinUrl(row.token) }); }
    catch { toast.error(C.shareFailed); }
  };

  const revoke = async (row: InviteRow) => {
    try {
      await revokeInvite(row.id);
      haptics.success();
      setFresh(f => (f?.id === row.id ? null : f));
      toast.show(C.revoked);
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, C.revokeFailed));
    }
  };

  const replace = (row: InviteRow) => {
    setLabel(row.label ?? "");
    setCapOn(row.maxUses !== null);
    setMaxUses(String(row.maxUses ?? 25));
    setExpiry("7d");
    setFresh(null);
    onScrollTop();
    later(() => labelRef.current?.focus(), 350);
    toast.show(C.replacementNote);
  };

  const invites = q.data ?? [];

  return (
    <View style={{ gap: 16 }}>
      <T v="body" size={15} color={c.ink2}>{lede.a}<T v="bodyStrong" size={15}>{lede.b}</T>{lede.c}</T>

      {reviews ? <PillBtn label={C.review} onPress={() => router.push("/members" as Href)} /> : null}

      {fresh ? (
        <View style={[styles.card, { borderColor: c.ink, backgroundColor: c.card, boxShadow: `3px 3px 0 ${c.note.fill.mint}` }]} accessibilityLiveRegion="polite">
          <T v="kicker" color={c.ink2}>{C.readyTitle}</T>
          <T v="meta" size={13} color={c.ink3}>{C.readyNote}</T>
          <T v="bodyStrong" size={13}>{C.readyLabel}</T>
          <TextInput value={joinUrl(fresh.token)} editable={false} selectTextOnFocus accessibilityLabel={C.readyLabel}
            style={[styles.input, styles.mono, { borderColor: c.line2, backgroundColor: c.paper2, color: c.ink2 }]} />
          <View style={styles.acts}>
            <PillBtn label={copiedId === fresh.id ? C.copied : C.copy} kind="ink" onPress={() => void copy(fresh)} />
            <PillBtn label={C.share} onPress={() => void share(fresh)} />
            <PillBtn label={C.done} onPress={() => setFresh(null)} />
          </View>
        </View>
      ) : null}

      {/* generate */}
      <View style={[styles.card, { borderColor: c.line2, backgroundColor: c.card }]}>
        <View style={{ gap: 6 }}>
          <T v="meta" size={12} color={c.ink2}>{`${C.label} `}<T v="meta" size={12} color={c.ink3}>{C.optional}</T></T>
          <TextInput ref={labelRef} value={label} onChangeText={setLabel} maxLength={INVITE_LABEL_MAX} placeholder={C.labelPlaceholder}
            placeholderTextColor={c.ink3} accessibilityLabel={C.label} style={[styles.input, { borderColor: c.line2, backgroundColor: c.card, color: c.ink }]} />
        </View>
        <View style={{ gap: 6 }}>
          <T v="meta" size={12} color={c.ink2}>{C.expires}</T>
          <View style={styles.acts} accessibilityRole="radiogroup" accessibilityLabel={C.expires}>
            {INVITE_EXPIRY_PRESETS.map(p => {
              const on = expiry === p;
              return (
                <Pressable key={p} onPress={() => { haptics.tap(); setExpiry(p); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  style={[styles.opt, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.card }]}>
                  <T v="buttonSm" size={13} color={on ? c.paper : c.ink2}>{EXPIRY_LABELS[p]}</T>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <CheckRow on={capOn} onChange={setCapOn} label={C.limit} small />
          {capOn ? (
            <TextInput value={maxUses} onChangeText={setMaxUses} keyboardType="number-pad" maxLength={3} accessibilityLabel={C.maxUses}
              style={[styles.input, { width: 84, height: 38, borderColor: c.line2, backgroundColor: c.card, color: c.ink }]} />
          ) : null}
        </View>
        {capWarns(expiry, capOn) ? <T v="meta" size={13} color={c.pastel.butter.ink}>{C.capWarning}</T> : null}
        <PillBtn label={creating ? C.creating : C.create} kind="ink" small={false} disabled={creating} onPress={() => void create()} />
      </View>

      {/* links */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <T v="kicker" color={c.ink2}>{showInactive ? C.allLinks : C.activeLinks}</T>
          <CheckRow on={showInactive} onChange={v => { setShowInactive(v); setOpenJoins(null); }} label={C.showInactive} small />
        </View>
        {q.isPending ? (
          <T v="meta" color={c.ink3}>{C.loading}</T>
        ) : q.isError ? (
          <T v="meta" color={c.pastel.rose.ink}>{errorMessage(q.error, C.loadFailed)}</T>
        ) : invites.length === 0 ? (
          <View style={[styles.empty, { borderColor: c.line2 }]}>
            <T v="bodyStrong" size={14}>{showInactive ? C.emptyAll : C.emptyActive}</T>
            <T v="meta" color={c.ink3}>{C.emptyHint(memberWord)}</T>
          </View>
        ) : invites.map(row => {
          const dead = isDead(row);
          const pill = pillOf(row);
          const meter = meterOf(row);
          return (
            <View key={row.id} style={[styles.card, { borderColor: flashId === row.id ? c.ink : c.line2, backgroundColor: flashId === row.id ? c.pastel.mint.soft : c.card, opacity: dead ? 0.72 : 1 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pill tone={pill.tone} label={pill.label} />
                <T v="meta" size={12} color={c.ink3} style={{ marginLeft: "auto", flexShrink: 1 }} align="right">{countsLine(row)}</T>
              </View>
              {row.label ? <T v="bodyStrong" size={14}>{row.label}</T> : null}
              {meter != null ? (
                <View style={[styles.meter, { backgroundColor: c.paper2, borderColor: c.line2 }]}>
                  <View style={{ width: `${meter}%`, height: "100%", backgroundColor: c.pastel.lilac.ink, borderRadius: 3 }} />
                </View>
              ) : null}
              <T v="meta" size={12} color={c.ink3}>{dateParts(row).join(" · ")}</T>
              {!dead ? (
                <View style={{ gap: 8 }}>
                  <View style={[styles.url, { borderColor: c.line, backgroundColor: c.paper2 }]}>
                    <T v="mono" size={12} color={c.ink2} numberOfLines={1}>{joinUrl(row.token)}</T>
                  </View>
                  <View style={styles.acts}>
                    <PillBtn label={copiedId === row.id ? C.copied : C.copyShort} disabled={row.status === "reserved"} onPress={() => void copy(row)} />
                    <PillBtn label={C.revoke} kind="rose" onPress={() => { haptics.warn(); setRevokeTarget(row); }} />
                  </View>
                </View>
              ) : null}
              {row.pendingCount > 0 && reviews ? <PillBtn label={C.reviewWaiting(row.pendingCount)} onPress={() => router.push("/members" as Href)} /> : null}
              {dead ? <PillBtn label={C.replacement} onPress={() => replace(row)} /> : null}
              {row.redemptionCount > 0 ? (
                <View style={{ gap: 6 }}>
                  <PillBtn label={openJoins === row.id ? C.hideJoins : C.viewJoins} onPress={() => setOpenJoins(o => (o === row.id ? null : row.id))} />
                  {openJoins === row.id ? <Joins id={row.id} /> : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <ConfirmSheet open={!!revokeTarget} title={C.revokeTitle} message={revokeTarget ? C.revokeMessage(revokeTarget) : ""} confirmLabel={C.revoke}
        onClose={() => setRevokeTarget(null)} onConfirm={() => { if (revokeTarget) void revoke(revokeTarget); }} />
    </View>
  );
}

function Joins({ id }: { id: number }) {
  const { c } = useTheme();
  const q = useInviteJoins(id);
  if (q.isPending) return <T v="meta" color={c.ink3}>{C.loading}</T>;
  if (q.isError) return (
    <View style={{ gap: 6 }}>
      <T v="meta" color={c.pastel.rose.ink}>{C.joinsFailed}</T>
      <PillBtn label={C.retry} onPress={() => void q.refetch()} />
    </View>
  );
  if (q.data.length === 0) return <T v="meta" color={c.ink3}>{C.noJoins}</T>;
  return (
    <View style={[styles.joins, { borderColor: c.line, backgroundColor: c.paper2 }]}>
      {q.data.map((r, i) => (
        <View key={r.brotherId} style={[styles.join, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
          <T v="callout" size={13.5} style={{ flex: 1 }} numberOfLines={1}>{r.name}</T>
          <T v="meta" size={12} color={c.ink3}>{formatDate(r.redeemedAt)}</T>
        </View>
      ))}
    </View>
  );
}

function Pill({ tone, label }: { tone: PillTone; label: string }) {
  const { c } = useTheme();
  const t = { ok: "mint", muted: null, rose: "rose", gold: "butter", vio: "lilac" } as const;
  const p = t[tone] ? c.pastel[t[tone]!] : null;
  return (
    <View style={[styles.pill, { backgroundColor: p ? p.soft : c.paper2, borderColor: p ? p.border : c.line2 }]}>
      <T v="pill" size={11.5} color={p ? p.ink : c.ink3}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 16, padding: 16, gap: 12 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, height: 44, fontSize: 15 },
  mono: { fontFamily: "PlexMono-500", fontSize: 12.5 },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  opt: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13 },
  empty: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16, padding: 18, alignItems: "center", gap: 4 },
  meter: { height: 7, borderRadius: 4, borderWidth: 1, overflow: "hidden" },
  url: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  pill: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 9 },
  joins: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  join: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 12 },
});
