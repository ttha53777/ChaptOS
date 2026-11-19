/**
 * Join requests (MANAGE_BROTHERS): the band at the top of Members, as the web's
 * JoinRequestsPanel at phone width. "1 person wants in" / "N people want in", the web's
 * promise ("Nothing is created until you approve."), seats left, then each request with
 * "via <label> link", how long it has waited, Review & approve and Decline.
 *
 *   ReviewSheet   "Approve X?": who, the web's paragraph, the role picker (roles ranked
 *                 below yours; "No role — just a member"), Decline / Cancel / Approve.
 *                 POST /api/join-requests/[id]/approve { roleId }
 *   DeclineSheet  the web's confirm; warn haptic as it opens. POST …/reject
 *
 * Outcomes as on the web: "X is now on the roster." (success haptic + toast, the row
 * leaves the band), "Declined X's request.", a 409 JOIN_REQUEST_DECIDED refreshes the
 * queue with "Already reviewed by another officer…", a 402 says the plan is full (the app
 * has no billing, so the server's message stands). Every decision refreshes /me, which
 * clears the Members tab badge.
 */
import type { JoinRequestPage, JoinRequestRow, RoleChip } from "@/lib/api-types";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { ApiError } from "~/api/errors";
import { errorMessage } from "~/api/errors";
import { approveJoinRequest, refreshJoinRequests, rejectJoinRequest } from "~/data/members";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Avatar, Tape } from "~/paper/bits";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";

export function waitedFor(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function JoinBand({ page, seatsLeft, onReview, onDecline }: {
  page: JoinRequestPage; seatsLeft: number | null;
  onReview: (r: JoinRequestRow) => void; onDecline: (r: JoinRequestRow) => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const n = page.pendingTotal;
  if (n === 0) return null;
  const layout = m.reduced ? undefined : LinearTransition.springify().damping(22).stiffness(240).reduceMotion(ReduceMotion.System);
  return (
    <Animated.View layout={layout} style={[styles.band, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}>
      <Tape width={58} rotate={-4} style={{ position: "absolute", top: -9, left: 26 }} />
      <View style={styles.bandHead}>
        <View style={[styles.bandTile, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.lilac.fill, 2)]}>
          <Icon name="door" size={17} color={c.pastel.lilac.ink} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <T v="heading" size={18}>{n === 1 ? "1 person wants in" : `${n} people want in`}</T>
          <T v="callout" size={13.5} lh={1.45} color={c.ink2}>They opened an invite link. Nothing is created until you approve.</T>
          {seatsLeft != null ? <T v="mono" size={11.5} color={c.pastel.lilac.ink}>{`${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left on your plan`}</T> : null}
        </View>
      </View>
      {!page.seats.allowed ? (
        <T v="callout" size={13} color={c.ink2} style={{ marginTop: 10 }}>Adding another member needs a billing update. You can still review requests.</T>
      ) : null}
      <View style={{ marginTop: 12, gap: 8 }}>
        {page.rows.map(r => (
          <Animated.View key={r.id} layout={layout} exiting={m.reduced ? undefined : FadeOut.duration(160).reduceMotion(ReduceMotion.System)}
            style={[styles.req, { backgroundColor: c.card, borderColor: c.line }]}>
            <View style={styles.reqWho}>
              <Avatar name={r.name} uri={r.avatarUrl} tone="lilac" px={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="bodyStrong" size={15} numberOfLines={1}>{r.name}</T>
                {r.email ? <T v="meta" size={12.5} color={c.ink3} numberOfLines={1}>{r.email}</T> : null}
              </View>
            </View>
            <View style={styles.reqMeta}>
              <Icon name="link" size={12} color={c.ink3} />
              <T v="meta" size={12.5} color={c.ink3} style={{ flex: 1 }} numberOfLines={1}>
                {r.inviteLabel ? <>via <T v="meta" size={12.5} color={c.ink2} style={{ fontWeight: "600" }}>{r.inviteLabel}</T> link</> : "via an invite link"}
              </T>
              <T v="mono" size={11} color={c.ink3}>{waitedFor(r.createdAt)}</T>
            </View>
            <View style={styles.reqActs}>
              <Button label="Review & approve" icon="check" size="sm" onPress={() => onReview(r)} style={{ flex: 1 }} />
              <Button label="Decline" variant="soft" size="sm" onPress={() => onDecline(r)} />
            </View>
          </Animated.View>
        ))}
      </View>
      {page.total > page.rows.length ? (
        <T v="meta" color={c.ink3} style={{ marginTop: 10 }}>{`${page.total - page.rows.length} more waiting — the rest are on the web.`}</T>
      ) : null}
    </Animated.View>
  );
}

/** What a decision's failure means, in the web's words; null = handled (queue refreshed). */
function decisionError(e: unknown, verb: "approve" | "decline"): string | null {
  if (e instanceof ApiError && e.code === "JOIN_REQUEST_DECIDED") {
    refreshJoinRequests(false);
    toast.show("Already reviewed by another officer. The queue has been refreshed.");
    return null;
  }
  if (e instanceof ApiError && e.status === 402) return errorMessage(e, "Your plan is out of seats. Adding another member needs a billing update.");
  return errorMessage(e, `Couldn't ${verb} this request. Try again.`);
}

export function ReviewSheet({ row, roles, rolesState, maxRank, memberWord, onClose, onDecline }: {
  row: JoinRequestRow | null; roles: RoleChip[]; rolesState: "loading" | "error" | "ok"; maxRank: number | null;
  memberWord: string; onClose: () => void; onDecline: (r: JoinRequestRow) => void;
}) {
  const { c } = useTheme();
  const [roleId, setRoleId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setRoleId(null); setErr(null); setBusy(false); }, [row?.id]);
  const grantable = roles.filter(r => maxRank == null || r.rank < maxRank).sort((a, b) => b.rank - a.rank);

  const approve = async () => {
    if (!row) return;
    setBusy(true); setErr(null);
    try {
      const done = await approveJoinRequest(row.id, roleId);
      haptics.success();
      toast.show(`${done.name} is now on the roster.`, { detail: done.roleName ? `As ${done.roleName}.` : undefined });
      refreshJoinRequests(true);
      onClose();
    } catch (e) {
      const msg = decisionError(e, "approve");
      if (msg) { haptics.error(); setErr(msg); } else onClose();
    } finally { setBusy(false); }
  };

  const options: { id: number | null; name: string }[] = [{ id: null, name: `No role — just a ${memberWord.toLowerCase()}` }, ...grantable];
  return (
    <Sheet open={row != null} onClose={() => (busy ? undefined : onClose())} size="fit" tone="lilac" icon="door" kicker="Join request"
      title={row ? `Approve ${row.name}?` : ""}
      footer={
        <View style={styles.footer}>
          <Button label="Decline" variant="soft" tone="rose" disabled={busy} onPress={() => row && onDecline(row)} />
          <View style={{ flex: 1 }} />
          <Button label="Cancel" variant="soft" disabled={busy} onPress={onClose} />
          <Button label={busy ? "Adding…" : "Approve"} icon="check" disabled={busy} onPress={approve} />
        </View>
      }>
      {row ? (
        <View style={{ gap: 14 }}>
          {err ? (
            <View accessibilityRole="alert" style={[styles.err, { backgroundColor: c.riskBg, borderColor: c.pastel.peach.border }]}>
              <T v="callout" size={13.5} color={c.risk}>{err}</T>
            </View>
          ) : null}
          <View style={styles.reqWho}>
            <Avatar name={row.name} uri={row.avatarUrl} tone="lilac" px={42} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong" size={16}>{row.name}</T>
              <T v="meta" color={c.ink3}>{row.email ?? "no email on their account"}</T>
            </View>
          </View>
          <T v="body" size={14.5} lh={1.5} color={c.ink2}>
            Approving creates their spot on the roster and lets them in immediately. They’ll start with no dues, no attendance and no recorded hours.
          </T>
          <View style={{ gap: 8 }}>
            <T v="label" color={c.ink2}>Role</T>
            <View style={styles.roles} accessibilityRole="radiogroup" accessibilityLabel="Role">
              {options.map(o => {
                const on = o.id === roleId;
                return (
                  <Pressable key={o.id ?? "none"} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: busy }} disabled={busy}
                    onPress={() => { if (!on) { haptics.select(); setRoleId(o.id); } }}
                    style={[styles.role, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel.lilac.soft : c.card }]}>
                    <View style={[styles.radio, { borderColor: on ? c.ink : c.line2 }]}>{on ? <View style={[styles.radioDot, { backgroundColor: c.ink }]} /> : null}</View>
                    <T v="callout" size={14} color={c.ink} style={{ fontWeight: on ? "600" : "500" }}>{o.name}</T>
                  </Pressable>
                );
              })}
            </View>
            {rolesState === "loading" ? <T v="meta" color={c.ink3}>Loading roles…</T> : null}
            {rolesState === "error" ? <T v="meta" color={c.ink3}>Couldn't load roles. You can still approve without a role.</T> : null}
            <T v="meta" size={12.5} lh={1.5} color={c.ink3}>
              A role carries real permissions. You can only hand out roles ranked below your own, and you can change this later from the roster.
            </T>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

export function DeclineSheet({ row, onClose, onDeclined }: { row: JoinRequestRow | null; onClose: () => void; onDeclined: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (row) { haptics.warn(); setErr(null); setBusy(false); } }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const decline = async () => {
    if (!row) return;
    setBusy(true); setErr(null);
    try {
      await rejectJoinRequest(row.id);
      haptics.success();
      toast.show(`Declined ${row.name}'s request.`);
      refreshJoinRequests(false);
      onDeclined();
    } catch (e) {
      const msg = decisionError(e, "decline");
      if (msg) { haptics.error(); setErr(msg); } else onDeclined();
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={row != null} onClose={() => (busy ? undefined : onClose())} size="fit" tone="rose" icon="x" kicker="Decline"
      title={row ? `Decline ${row.name}?` : ""}
      footer={
        <View style={styles.footer}>
          <Button label="Cancel" variant="soft" disabled={busy} onPress={onClose} style={{ flex: 1 }} />
          <Button label={busy ? "Declining…" : "Decline"} tone="rose" disabled={busy} onPress={decline} style={{ flex: 1 }} />
        </View>
      }>
      {err ? <T v="callout" size={13.5} color={c.risk} style={{ marginBottom: 10 }} accessibilityRole="alert">{err}</T> : null}
      <T v="body" size={14.5} lh={1.5} color={c.ink2}>
        They’ll be told the request wasn’t approved, and <T v="bodyStrong" size={14.5} color={c.ink}>this link will stop working for them</T>. If you change your mind, send them a new invite link and they can ask again.
      </T>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  band: { borderWidth: 1.5, borderRadius: 20, padding: 16, paddingTop: 18 },
  bandHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  bandTile: { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  req: { borderWidth: 1.5, borderRadius: 16, padding: 12, gap: 8 },
  reqWho: { flexDirection: "row", alignItems: "center", gap: 10 },
  reqMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  reqActs: { flexDirection: "row", gap: 8, marginTop: 2 },
  footer: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  err: { borderWidth: 1, borderRadius: 12, padding: 10 },
  roles: { gap: 6 },
  role: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5 },
  radio: { width: 18, height: 18, borderRadius: 999, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 8, height: 8, borderRadius: 999 },
});
