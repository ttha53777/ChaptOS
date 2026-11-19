/**
 * The full-width bands between the briefing and the numbers, as the web phone stacks
 * them (app/org/[slug]/page.tsx):
 *
 *   BillingAlert     admin-only, self-gating on /me's org.billingAlert (the server sends
 *                    null to anyone who can't act on it). Not dismissible, as on the web.
 *                    Billing isn't in the app (store payment rules), so the alert keeps
 *                    the web's words but has no button; it says where it's fixed.
 *   LiveOfficer      the officer row under the live check-in band (web LiveCheckIn's
 *                    live-alt buttons, MANAGE_ATTENDANCE): Fix a mark / Take attendance,
 *                    End check-in… (the did-it-happen sheet), Reopen check-in, and after
 *                    a cancel Undo (10 s) and Open the right event.
 *   CalendarInvite   "Get chapter events in your own calendar", while the feed is on and
 *                    this phone hasn't added it or said "Not now" (remembered per device
 *                    and org, like the web's localStorage).
 *
 * Haptics: `warn` once when the end-check-in sheet opens (a destructive choice shown);
 * results buzz through runWindow. Nothing else here buzzes.
 */
import type { LiveCheckIn, MeResponse } from "@/lib/api-types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useCalendarFeedLive } from "~/data/calendar";
import { Icon } from "~/icons/Icon";
import { OpenCheckInSheet, runWindow } from "~/meetings/CheckIn";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { useActiveOrg } from "~/state/org";
import { useTheme } from "~/theme/PaperProvider";
import { SubscribeSheet } from "~/timeline/EventSheet";
import { windowView } from "~/today/live";
import { T } from "~/ui/T";

/* ── billing ──────────────────────────────────────────────────────────────────── */

type Alert = NonNullable<NonNullable<MeResponse["org"]>["billingAlert"]>;

/** The web's BillingAlert copy, word for word. */
const BILLING: Record<Alert, { title: string; body: string }> = {
  past_due: {
    title: "Your last payment didn't go through",
    body: "Everything still works and nobody has been removed — but you won't be able to add new "
      + "members until the card is sorted. Stripe will retry on its own; updating the card is faster.",
  },
  unpaid: {
    title: "We couldn't collect your last invoice",
    body: "Stripe has finished retrying. Nothing has been deleted and every page still works, but "
      + "adding members is blocked until there's a working card on file.",
  },
  canceled: {
    title: "Your subscription has ended",
    body: "Nothing was taken away — every member and every record is where you left it. You're above "
      + "the free plan's size, though, so adding anyone new needs a card again.",
  },
};

export function BillingAlert({ me }: { me: MeResponse }) {
  const { c } = useTheme();
  const alert = me.org?.billingAlert ?? null;
  if (!alert) return null;
  const { title, body } = BILLING[alert];
  const rose = c.pastel.rose;
  return (
    <View accessibilityRole="alert" style={[styles.billing, { backgroundColor: rose.soft, borderColor: rose.border }]}>
      <View style={[styles.rail, { backgroundColor: rose.ink }]} />
      <T v="bodyStrong" size={15}>{title}</T>
      <T v="meta" lh={1.55} color={c.ink2}>{body}</T>
      <T v="mono" size={11} color={rose.ink}>Billing lives on chaptos.com.</T>
    </View>
  );
}

/* ── the officer row under the live band ──────────────────────────────────────── */

/** Same as the web's CANCEL_UNDO_MS (EndCheckIn.tsx). */
const CANCEL_UNDO_MS = 10_000;

function Alt({ label, onPress, disabled, tone }: { label: string; onPress: () => void; disabled?: boolean; tone?: "rose" }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" hitSlop={6}
      style={({ pressed }) => [styles.alt, { borderColor: c.line2, backgroundColor: c.card }, pressed && { borderColor: c.ink }, disabled && { opacity: 0.5 }]}>
      <T v="buttonSm" size={12.5} color={tone ? c.pastel[tone].ink : c.ink2}>{label}</T>
    </Pressable>
  );
}

export function LiveOfficer({ live, fetchedAt, now }: { live: LiveCheckIn; fetchedAt: number; now: number }) {
  const { c } = useTheme();
  const [ending, setEnding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<null | "record" | "cancel" | "window">(null);
  const { win } = windowView(live, fetchedAt, now);
  const cancelled = win === "void";
  const closed = win === "closed";
  const open = win === "open" || win === "closing";
  const undoLeft = live.cancelledAt ? Math.max(0, CANCEL_UNDO_MS - (now - Date.parse(live.cancelledAt))) : 0;

  // Another officer (or the clock) can end the window while the sheet is up.
  useEffect(() => { if (!open) setEnding(false); }, [open]);

  const meeting = () => router.push(`/more/meeting/${live.event.id}` as Href);
  const act = async (kind: "record" | "cancel" | "window", action: "close" | "cancel" | "reopen" | "restore") => {
    setBusy(kind);
    await runWindow(live.event, action);
    setBusy(null);
    setEnding(false);
  };
  const startEnd = () => { haptics.warn(); setEnding(true); };

  const present = live.presentCount, eligible = live.eligibleCount, absent = Math.max(0, eligible - present);

  return (
    <View style={{ gap: 8 }}>
      {open && win === "closing" ? (
        <T v="meta" color={c.ink2}>
          {"Closing soon — "}
          <T v="meta" color={c.ink} style={{ fontWeight: "700" }}>anyone who hasn't checked in will be marked absent</T>
          {" when it ends."}
        </T>
      ) : null}
      {cancelled ? (
        <T v="meta" color={c.ink2}>{`${present} ${present === 1 ? "check-in" : "check-ins"} thrown out · nobody's attendance changed`}</T>
      ) : null}
      <View style={styles.alts}>
        {!cancelled ? <Alt label={closed ? "Take attendance" : "Fix a mark"} onPress={meeting} /> : null}
        {open ? <Alt label="End check-in…" onPress={startEnd} disabled={busy !== null} /> : null}
        {closed ? <Alt label={busy === "window" ? "Reopening…" : "Reopen check-in"} onPress={() => void act("window", "reopen")} disabled={busy !== null} /> : null}
        {cancelled && undoLeft > 0 ? (
          <Alt label={busy === "window" ? "Undoing…" : `Undo · ${Math.ceil(undoLeft / 1000)}s`} onPress={() => void act("window", "restore")} disabled={busy !== null} />
        ) : null}
        {cancelled ? <Alt label="Open the right event" onPress={() => setPicking(true)} /> : null}
      </View>

      <Sheet open={ending && open} onClose={() => { if (!busy) setEnding(false); }} locked={busy !== null} tone="mint" icon="check"
        kicker={live.event.title} title="Did it happen?"
        footer={<Button label="Keep it open" variant="soft" block onPress={() => setEnding(false)} disabled={busy !== null} style={{ flex: 1 }} />}>
        <View style={{ gap: 12 }}>
          <T v="meta" color={c.ink2}>Check-ins keep coming in until you pick.</T>
          <View style={[styles.slip, { borderColor: c.ink, backgroundColor: c.card }]}>
            <View style={styles.slipTop}>
              <Icon name="doc" size={18} color={c.pastel.mint.ink} />
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">Yes — close & record</T>
                <T v="meta" color={c.ink3}>The meeting happened. File the roll.</T>
              </View>
            </View>
            <T v="meta" color={c.ink2}>{`${present} present · ${absent} marked absent`}</T>
            <T v="meta" color={c.ink2}>Counts toward <T v="meta" color={c.ink} style={{ fontWeight: "700" }}>everyone's attendance</T> this semester.</T>
            <Button label={busy === "record" ? "Recording…" : "Close & record"} icon="check" tone="mint" block onPress={() => void act("record", "close")} disabled={busy !== null} />
          </View>
          <View style={[styles.slip, { borderColor: c.line2, backgroundColor: c.card }]}>
            <View style={styles.slipTop}>
              <Icon name="x" size={18} color={c.pastel.rose.ink} />
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">No — cancel, don't record</T>
                <T v="meta" color={c.ink3}>Wrong event, a test, or it got called off.</T>
              </View>
            </View>
            <T v="meta" color={c.ink2}>{`0 absences · ${present} ${present === 1 ? "check-in" : "check-ins"} thrown out`}</T>
            <T v="meta" color={c.ink2}><T v="meta" color={c.ink} style={{ fontWeight: "700" }}>Nobody's attendance changes.</T>{` You can undo for ${CANCEL_UNDO_MS / 1000} seconds.`}</T>
            <Button label={busy === "cancel" ? "Cancelling…" : "Cancel check-in"} icon="x" variant="ghost" tone="rose" block onPress={() => void act("cancel", "cancel")} disabled={busy !== null} />
          </View>
        </View>
      </Sheet>
      <OpenCheckInSheet open={picking} onClose={() => setPicking(false)} onOpened={() => setPicking(false)} />
    </View>
  );
}

/* ── calendar invite ──────────────────────────────────────────────────────────── */

const dismissedKey = (slug: string) => `chaptos:calendar-invite-dismissed:${slug}`;
const addedKey = (slug: string) => `chaptos:calendar-added:${slug}`;

export function CalendarInvite() {
  const { c } = useTheme();
  const { slug } = useActiveOrg();
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    AsyncStorage.multiGet([dismissedKey(slug), addedKey(slug)])
      .then(pairs => { if (alive) setEligible(pairs.every(([, v]) => v == null)); })
      .catch(() => { if (alive) setEligible(false); });
    return () => { alive = false; };
  }, [slug]);
  const live = useCalendarFeedLive(eligible === true);
  if (!slug || !eligible || live.data !== true) return null;

  const remember = (key: string) => { AsyncStorage.setItem(key, new Date().toISOString()).catch(() => {}); setEligible(false); };
  const today = new Date();
  const sky = c.pastel.sky;
  return (
    <View style={[styles.invite, { backgroundColor: c.card, borderColor: c.line, boxShadow: c.sh1 }]}>
      <View style={styles.inviteTop}>
        <View style={[styles.page, { borderColor: c.ink, backgroundColor: c.card }]} accessible={false}>
          <View style={[styles.pageTop, { backgroundColor: sky.fill }]}>
            <T v="kicker" size={9} color={c.ink}>{today.toLocaleDateString(undefined, { month: "short" })}</T>
          </View>
          <T v="subhead" size={20} style={{ paddingVertical: 2 }}>{String(today.getDate())}</T>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="subhead" accessibilityRole="header">Get chapter events in your own calendar</T>
          <T v="meta" color={c.ink2}>Meetings and deadlines show up in Google or Apple Calendar and stay up to date on their own. It takes about a minute.</T>
        </View>
      </View>
      <View style={styles.inviteActs}>
        <Button label="Add to my calendar" icon="cal" tone="sky" size="sm" onPress={() => setOpen(true)} style={{ flex: 1.4 }} />
        <Button label="Not now" variant="soft" size="sm" onPress={() => remember(dismissedKey(slug))} style={{ flex: 1 }} />
      </View>
      <SubscribeSheet open={open} onClose={() => setOpen(false)} onAdded={() => remember(addedKey(slug))} />
    </View>
  );
}

const styles = StyleSheet.create({
  billing: { gap: 6, paddingVertical: 16, paddingLeft: 19, paddingRight: 16, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  rail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  alts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  alt: { minHeight: 36, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5 },
  slip: { gap: 8, padding: 14, borderRadius: 16, borderWidth: 1.5 },
  slipTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  invite: { gap: 14, padding: 16, borderRadius: 20, borderWidth: 1.5 },
  inviteTop: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  inviteActs: { flexDirection: "row", gap: 8 },
  page: { width: 52, alignItems: "center", borderWidth: 1.5, borderRadius: 10, overflow: "hidden", transform: [{ rotate: "-3deg" }] },
  pageTop: { alignSelf: "stretch", alignItems: "center", paddingVertical: 2 },
});
