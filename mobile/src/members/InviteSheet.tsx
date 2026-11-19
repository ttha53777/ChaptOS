/**
 * Invite (MANAGE_SETTINGS): the web's InviteLinkSheet, as an admission ticket. The org's
 * newest usable link is the ticket: "Admit one · asks to join", the chapter's name, the
 * link itself, and on the stub what's left of it (expiry, uses) with Copy link and
 * Share. Older usable links sit under it as slim rows (up to three in all, as the web).
 *
 * With no working link: an empty slot and the web's "Create a link (expires in 7 days)".
 * Minting is only ever an explicit press: a link is a credential, so opening the sheet
 * never makes one. The new ticket prints in (slides out of the slot and settles).
 *
 * The web's promise stays word for word: the link alone never gets anyone in; every
 * request waits on Members for an officer. Labels, expiry choices, use limits and
 * revoking stay in Settings on the web.
 *
 * Haptics: success when a link is copied or minted (the result); none for opening the
 * sheet or the share sheet. Motion: the ticket prints in on a spring, Copy flips to
 * "Copied" with a pop for 1.8s. Reduced: fades, no travel.
 */
import type { InviteLink } from "@/lib/api-types";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import Animated, { FadeIn, Keyframe, ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { errorMessage } from "~/api/errors";
import { createInvite, joinUrl, useInvites } from "~/data/members";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Ticket } from "~/paper/Ticket";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";

const bare = (url: string) => url.replace(/^https?:\/\//, "");
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function expiryNote(l: InviteLink): string {
  const parts = [l.expiresAt ? `expires ${shortDate(l.expiresAt)}` : "never expires"];
  if (l.availableUses != null) parts.push(`${l.availableUses} use${l.availableUses === 1 ? "" : "s"} left`);
  return parts.join(" · ");
}

/** "6 days" / "today" / "never": how long the link has, for the stub. */
function timeLeft(l: InviteLink, now = Date.now()): { big: string; small: string } {
  if (!l.expiresAt) return { big: "∞", small: "never expires" };
  const ms = new Date(l.expiresAt).getTime() - now;
  const days = Math.round(ms / 86_400_000);
  if (days >= 1) return { big: String(days), small: `day${days === 1 ? "" : "s"} left · till ${shortDate(l.expiresAt)}` };
  const hrs = Math.max(1, Math.round(ms / 3_600_000));
  return { big: `${hrs}h`, small: `left · till ${new Date(l.expiresAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` };
}

/** The new ticket sliding out of the slot. */
const PRINT = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -28 }, { rotate: "-2deg" }, { scale: 0.96 }] },
  55: { opacity: 1, transform: [{ translateY: 4 }, { rotate: "0.6deg" }, { scale: 1.01 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { rotate: "-0.6deg" }, { scale: 1 }] },
}).duration(520).reduceMotion(ReduceMotion.System);

export function InviteSheet({ open, orgName, memberWord, seatsLeft, onClose }: {
  open: boolean; orgName: string;
  /** Plural, as the org says it ("Brothers"). */
  memberWord: string;
  seatsLeft: number | null;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const q = useInvites(open);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  useEffect(() => { if (open) { setErr(null); setFresh(null); } }, [open]);

  const links = (q.data ?? []).slice(0, 3);
  const [lead, ...rest] = links;

  const make = async () => {
    setBusy(true); setErr(null);
    try {
      const made = await createInvite();
      setFresh(made.id);
      haptics.success();
    } catch (e) {
      haptics.error();
      setErr(errorMessage(e, "Couldn't create a link."));
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} size="fit" tone="sky" icon="envelope" kicker="Invite" title={`Invite ${memberWord.toLowerCase()}`}
      footer={<Button label="Done" variant="soft" block onPress={onClose} style={{ flex: 1 }} />}>
      <View style={{ gap: 18 }}>
        {err || q.isError ? (
          <View accessibilityRole="alert" style={[styles.err, { backgroundColor: c.riskBg, borderColor: c.pastel.peach.border }]}>
            <T v="callout" size={13.5} color={c.risk}>{err ?? errorMessage(q.error, "Couldn't load invite links.")}</T>
          </View>
        ) : null}

        {!q.data && !q.isError ? (
          <View style={[styles.slotGhost, { borderColor: c.line2 }]} accessibilityRole="progressbar" accessibilityLabel="Loading links">
            <T v="mono" size={11.5} color={c.ink3}>Loading links…</T>
          </View>
        ) : lead ? (
          <Animated.View key={lead.id} entering={fresh === lead.id && !m.reduced ? PRINT : FadeIn.duration(200).reduceMotion(ReduceMotion.System)}>
            <AdmitTicket link={lead} orgName={orgName} />
          </Animated.View>
        ) : q.data ? (
          <EmptySlot busy={busy} onMake={make} />
        ) : null}

        {rest.length ? (
          <View style={{ gap: 8 }}>
            <T v="label" size={10.5} color={c.ink3}>Also working</T>
            {rest.map(l => <LinkRow key={l.id} link={l} />)}
          </View>
        ) : null}

        <T v="body" size={14} lh={1.55} color={c.ink2}>
          Anyone who opens it signs in with Google and asks to join. Each request waits at the top of Members until an officer approves it — the link alone never gets anyone in.
        </T>
        {seatsLeft != null ? (
          <View style={styles.seats}>
            <View style={[styles.seatDot, { backgroundColor: seatsLeft > 0 ? c.pastel.mint.fill : c.pastel.peach.fill, borderColor: c.ink }]} />
            <T v="meta" size={12.5} color={c.ink3} style={{ flex: 1 }}>
              {`${seatsLeft > 0 ? `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left on your plan.` : "Your plan is full."} Requests still queue when you’re full.`}
            </T>
          </View>
        ) : null}
        <T v="meta" size={12.5} color={c.ink3}>Labels, expiry & limits → Settings on the web.</T>
      </View>
    </Sheet>
  );
}

/* ── the ticket ───────────────────────────────────────────────────────────────── */

function AdmitTicket({ link, orgName }: { link: InviteLink; orgName: string }) {
  const { c } = useTheme();
  const url = joinUrl(link.token);
  const left = timeLeft(link);
  return (
    <Ticket tone="sky" ground={c.card} style={{ transform: [{ rotate: "-0.6deg" }] }}
      body={
        <View style={styles.body}>
          <View style={styles.admitRow}>
            <T v="kicker" size={10.5} color={c.pastel.sky.ink}>Admit one · asks to join</T>
            {link.label ? (
              <View style={[styles.label, { backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }]}>
                <T v="mono" size={10.5} color={c.pastel.butter.ink} numberOfLines={1}>{link.label}</T>
              </View>
            ) : null}
          </View>
          <T v="hero" size={27} lh={1.08} ls={-0.03} numberOfLines={2}>{orgName}</T>
          <View style={[styles.urlBox, { backgroundColor: c.paper2, borderColor: c.line }]}>
            <Icon name="link" size={13} color={c.ink3} />
            <T v="mono" size={12} color={c.ink2} numberOfLines={1} selectable style={{ flex: 1 }}>{bare(url)}</T>
          </View>
          {link.redemptionCount || link.pendingCount ? (
            <T v="meta" size={12} color={c.ink3}>
              {[link.redemptionCount ? `${link.redemptionCount} joined` : null, link.pendingCount ? `${link.pendingCount} waiting` : null].filter(Boolean).join(" · ")}
            </T>
          ) : null}
        </View>
      }
      stub={
        <View style={styles.stub}>
          <View style={styles.left}>
            <T v="measure" size={26} color={c.ink}>{left.big}</T>
            <T v="mono" size={10.5} lh={1.35} color={c.ink3} numberOfLines={2}>
              {link.availableUses != null ? `${left.small}\n${link.availableUses} use${link.availableUses === 1 ? "" : "s"} left` : left.small}
            </T>
          </View>
          <View style={styles.stubActs}>
            <CopyButton url={url} />
            <ShareButton url={url} orgName={orgName} />
          </View>
        </View>
      } />
  );
}

function CopyButton({ url, slim }: { url: string; slim?: boolean }) {
  const { c } = useTheme();
  const m = useMotion();
  const [copied, setCopied] = useState(false);
  const pop = useSharedValue(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(url);
      haptics.success();
      setCopied(true);
      if (!m.reduced) pop.value = withSequence(withTiming(0.92, { duration: 70 }), withSpring(1, m.spring("pop")));
      toast.show("Invite link copied", { detail: "Paste it in the group chat or the recruitment email." });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      haptics.error();
      toast.error("Couldn't copy to clipboard");
    }
  };
  return (
    <Animated.View style={style}>
      <Pressable accessibilityRole="button" accessibilityLabel={copied ? "Copied" : "Copy invite link"} onPress={copy}
        style={({ pressed }) => [slim ? styles.slimBtn : styles.copy,
          { borderColor: c.ink, backgroundColor: copied ? c.pastel.mint.fill : c.ink },
          pressed ? { transform: [{ translateX: 1 }, { translateY: 1 }] } : hard(copied ? c.ink : c.pastel.sky.fill, 2)]}>
        <Icon name={copied ? "check" : "copy"} size={slim ? 13 : 15} color={copied ? "#26211B" : c.paper} />
        <T v={slim ? "buttonSm" : "button"} size={slim ? 12.5 : 14} color={copied ? "#26211B" : c.paper}>{copied ? "Copied" : slim ? "Copy" : "Copy link"}</T>
      </Pressable>
    </Animated.View>
  );
}

function ShareButton({ url, orgName }: { url: string; orgName: string }) {
  const { c } = useTheme();
  const share = async () => {
    try {
      const r = await Share.share({ message: `Join ${orgName} on ChaptOS: ${url}`, url, title: `Join ${orgName}` });
      if (r.action === Share.sharedAction) haptics.success();
    } catch { toast.error("Couldn't open the share sheet"); }
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Share invite link" onPress={share}
      style={({ pressed }) => [styles.share, { borderColor: c.line2, backgroundColor: pressed ? c.paper2 : c.card }]}>
      <Icon name="out" size={15} color={c.ink} />
    </Pressable>
  );
}

function LinkRow({ link }: { link: InviteLink }) {
  const { c } = useTheme();
  const url = joinUrl(link.token);
  return (
    <View style={[styles.row, { borderColor: c.line, backgroundColor: c.card }]}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T v="mono" size={11.5} color={c.ink2} numberOfLines={1}>{bare(url)}</T>
        <T v="meta" size={12} color={c.ink3} numberOfLines={1}>
          <T v="meta" size={12} color={c.ink2} style={{ fontWeight: link.label ? "600" : "400" }}>{link.label ?? "Unlabelled link"}</T>{` · ${expiryNote(link)}`}
        </T>
      </View>
      <CopyButton url={url} slim />
    </View>
  );
}

/* ── no working link ──────────────────────────────────────────────────────────── */

function EmptySlot({ busy, onMake }: { busy: boolean; onMake: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.slot, { borderColor: c.line2, backgroundColor: c.paper2 }]}>
      <View style={[styles.slotMouth, { backgroundColor: c.ink }]} />
      <View style={[styles.slotTile, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.sky.fill, 3)]}>
        <Icon name="envelope" size={22} color={c.pastel.sky.ink} />
      </View>
      <T v="callout" size={14} color={c.ink2} style={{ textAlign: "center" }}>There’s no working invite link right now.</T>
      <Button label={busy ? "Creating…" : "Create a link (expires in 7 days)"} icon="link" disabled={busy} onPress={onMake} />
    </View>
  );
}

const styles = StyleSheet.create({
  err: { borderWidth: 1, borderRadius: 12, padding: 10 },
  slotGhost: { height: 150, borderRadius: 24, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  body: { paddingTop: 18, paddingBottom: 20, paddingHorizontal: 20, gap: 10 },
  admitRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  label: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, maxWidth: 140 },
  urlBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  stub: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, paddingHorizontal: 20 },
  left: { flex: 1, minWidth: 0 },
  stubActs: { flexDirection: "row", alignItems: "center", gap: 8 },
  copy: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5 },
  slimBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5 },
  share: { width: 44, height: 44, borderRadius: 999, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5 },
  seats: { flexDirection: "row", alignItems: "center", gap: 8 },
  seatDot: { width: 10, height: 10, borderRadius: 999, borderWidth: 1.5 },
  slot: { alignItems: "center", gap: 12, paddingTop: 0, paddingBottom: 20, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1.5, borderStyle: "dashed", overflow: "hidden" },
  slotMouth: { width: "62%", height: 6, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, opacity: 0.85, marginBottom: 8 },
  slotTile: { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
