/**
 * "More details" as a member sees them (the server already stripped checklist and budget).
 * Read-only except one thing: a supplies list ("who's bringing what"), where anyone can
 * claim an open item and drop their own claim (PATCH /api/calendar/[id]/details).
 *
 * Claiming is optimistic: the pin drops at once (~/moments/Pin). Writes to one item queue
 * behind each other, so claim-unclaim-claim can't land out of order. A refusal (someone
 * else got there first: 400 "Someone else just claimed that.") restores the list, the
 * pin lifts back out, the toast says why, and the list is re-read so their name shows.
 */
import type { Brother, CalendarEvent, EventDetail } from "@/lib/api-types";
import type { ReactNode } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { claimItem, refreshCalendar, setEventDetails } from "~/data/calendar";
import { Icon, type IconName } from "~/icons/Icon";
import { PinnedTag } from "~/moments/Pin";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { monthDay } from "~/today/time";
import { T } from "~/ui/T";

type Of<K extends EventDetail["type"]> = Extract<EventDetail, { type: K }>;

const GUESTS: Record<Of<"guests">["mode"], string> = {
  members: "Members only", plus: "Members + guests", invite: "Invite-only", public: "Open to anyone",
};

/** True when there's anything here worth a heading. */
export function hasDetails(details: EventDetail[] | null | undefined): boolean {
  return (details ?? []).some(d => !isBlank(d));
}

function isBlank(d: EventDetail): boolean {
  switch (d.type) {
    case "supplies": case "links": case "collabs": return d.items.length === 0;
    case "contact": return d.who == null && !d.phone;
    case "dress": return d.pick == null && !d.note;
    case "directions": return !d.text && !d.code;
    case "theme": return !d.text;
    case "custom": return d.value == null || d.value === "";
    case "checklist": case "budget": return true; // never sent to members
    default: return false;
  }
}

export function Details({ event, meId, roster }: { event: CalendarEvent; meId: number; roster: Map<number, Brother> }) {
  const { c } = useTheme();
  const list = (event.details ?? []).filter(d => !isBlank(d));
  if (!list.length) return null;
  const nameOf = (id: number | null) => id == null ? null : id === meId ? "You" : roster.get(id)?.name ?? "Someone who left";
  const facts = list.filter(d => d.type !== "supplies" && d.type !== "links" && d.type !== "directions");
  return (
    <View style={{ gap: 14 }}>
      <T v="label" color={c.ink3} accessibilityRole="header">Details</T>
      {facts.length ? (
        <View style={[styles.facts, { borderColor: c.line, backgroundColor: c.card }]}>
          {facts.map((d, i) => <Fact key={d.id} d={d} nameOf={nameOf} first={i === 0} />)}
        </View>
      ) : null}
      {list.map(d =>
        d.type === "supplies" ? <Supplies key={d.id} event={event} d={d} meId={meId} nameOf={nameOf} />
        : d.type === "directions" ? <Directions key={d.id} d={d} />
        : d.type === "links" ? <Links key={d.id} d={d} />
        : null)}
    </View>
  );
}

/* ── one-line facts ───────────────────────────────────────────────────────────── */

function Fact({ d, nameOf, first }: { d: EventDetail; nameOf: (id: number | null) => string | null; first: boolean }) {
  const { c } = useTheme();
  let icon: IconName = "note", label = "", value = "", sub: string | null = null, action: ReactNode = null;
  switch (d.type) {
    case "contact": {
      icon = "chat"; label = "Questions to"; value = nameOf(d.who) ?? "The organizer"; sub = d.phone || null;
      if (d.phone) {
        const url = `${d.prefer === "call" ? "tel" : "sms"}:${d.phone.replace(/[^\d+]/g, "")}`;
        action = <Button label={d.prefer === "call" ? "Call" : "Text"} size="sm" variant="ghost" tone="sky" onPress={() => void Linking.openURL(url)} />;
      }
      break;
    }
    case "guests": icon = "people"; label = "Guests"; value = d.mode === "plus" ? `Members + ${d.plus}` : GUESTS[d.mode]; break;
    case "capacity": icon = "door"; label = "Capacity"; value = `${d.cap} people`; break;
    case "dress": icon = "bag"; label = "Dress"; value = d.pick ?? d.note; sub = d.pick && d.note ? d.note : null; break;
    case "theme": icon = "star"; label = "Theme"; value = d.text; break;
    case "collabs": icon = "hand"; label = "With"; value = d.items.map(x => x.name).join(", "); break;
    case "custom": {
      icon = "note"; label = d.label || "Note";
      value = d.kind === "yesno" ? (d.value ? "Yes" : "No") : d.kind === "date" && typeof d.value === "string" ? monthDay(d.value) : String(d.value);
      break;
    }
    default: return null;
  }
  return (
    <View style={[styles.fact, !first && { borderTopColor: c.line, borderTopWidth: 1 }]}>
      <Icon name={icon} size={16} color={c.ink3} />
      <View style={{ flex: 1, gap: 1 }}>
        <T v="label" color={c.ink3} style={{ fontSize: 9.5 }}>{label}</T>
        <T v="callout">{value}</T>
        {sub ? <T v="meta" color={c.ink3}>{sub}</T> : null}
      </View>
      {action}
    </View>
  );
}

/* ── who's bringing what ──────────────────────────────────────────────────────── */

const queue = new Map<string, Promise<unknown>>();
function after<R>(key: string, job: () => Promise<R>): Promise<R> {
  const prev = queue.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(job);
  queue.set(key, next);
  void next.finally(() => { if (queue.get(key) === next) queue.delete(key); });
  return next;
}

export function claim(eventId: number, detailId: string, itemId: string, meId: number, on: boolean) {
  const restore = setEventDetails(eventId, list => list.map(d =>
    d.id === detailId && d.type === "supplies" ? { ...d, items: d.items.map(i => (i.id === itemId ? { ...i, who: on ? meId : null } : i)) } : d));
  if (!on) haptics.tap();
  after(`${eventId}:${itemId}`, () => claimItem(eventId, detailId, itemId, on)).then(
    details => setEventDetails(eventId, () => details),
    e => {
      restore();
      haptics.error();
      toast.error(on ? "Couldn't sign you up" : "Couldn't take you off", { detail: errorMessage(e) });
      setTimeout(() => void refreshCalendar(), 900);
    },
  );
}

function Supplies({ event, d, meId, nameOf }: { event: CalendarEvent; d: Of<"supplies">; meId: number; nameOf: (id: number | null) => string | null }) {
  const { c } = useTheme();
  const open = d.items.filter(i => i.who == null).length;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <T v="subhead">Who's bringing what</T>
        <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{open ? `${open} still open` : "all covered"}</T>
      </View>
      <View style={[styles.board, { backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }]}>
        {d.items.map(i => {
          const mine = i.who === meId;
          const taken = i.who != null && !mine;
          const who = nameOf(i.who);
          return (
            <Pressable key={i.id} disabled={taken} onPress={() => claim(event.id, d.id, i.id, meId, !mine)}
              accessibilityRole="button" accessibilityState={{ selected: mine, disabled: taken }}
              accessibilityLabel={taken ? `${i.item}, ${who} is bringing it` : mine ? `${i.item}, you're bringing it. Tap to take yourself off.` : `${i.item}, open. Tap to bring it.`}
              accessibilityHint={taken ? undefined : mine ? "Takes you off this item" : "Signs you up to bring this"}
              style={({ pressed }) => [styles.item, { backgroundColor: c.card, borderColor: mine ? c.ink : c.line, transform: [{ rotate: `${(i.id.charCodeAt(0) % 3) - 1}deg` }, { scale: pressed && !taken ? 0.97 : 1 }] }]}>
              <T v="callout" numberOfLines={2} style={{ textAlign: "center" }}>{i.item}</T>
              <View style={styles.slot}>
                {i.who == null && !mine ? <T v="pill" color={c.ink3} style={styles.open}>I'll bring it</T> : null}
                <PinnedTag on={i.who != null} onPinned={() => { if (mine) haptics.soft(); }} ink={mine ? c.pastel.rose.ink : c.ink3}>
                  <View style={[styles.who, { backgroundColor: mine ? c.pastel.mint.soft : c.paper2, borderColor: mine ? c.pastel.mint.border : c.line }]}>
                    <T v="pill" color={mine ? c.pastel.mint.ink : c.ink2} numberOfLines={1}>{who ?? " "}</T>
                  </View>
                </PinnedTag>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ── directions + links ───────────────────────────────────────────────────────── */

function Directions({ d }: { d: Of<"directions"> }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { borderColor: c.line, backgroundColor: c.card }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="pin" size={16} color={c.ink3} />
        <T v="label" color={c.ink3} style={{ fontSize: 9.5 }}>Getting there</T>
      </View>
      {d.text ? <T v="body">{d.text}</T> : null}
      {d.code ? (
        <View style={[styles.code, { backgroundColor: c.paper2, borderColor: c.line2 }]}>
          <T v="label" color={c.ink3} style={{ fontSize: 9.5 }}>Door code</T>
          <T v="mono" style={{ fontSize: 18, letterSpacing: 3 }} selectable>{d.code}</T>
        </View>
      ) : null}
    </View>
  );
}

function Links({ d }: { d: Of<"links"> }) {
  const { c } = useTheme();
  const safe = d.items.filter(l => /^https?:\/\//i.test(l.url));
  if (!safe.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {safe.map(l => (
        <Pressable key={l.id} onPress={() => void Linking.openURL(l.url)} accessibilityRole="link" accessibilityLabel={l.label || l.url}
          style={({ pressed }) => [styles.link, { borderColor: c.line, backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
          <Icon name="link" size={16} color={c.pastel.sky.ink} />
          <View style={{ flex: 1 }}>
            <T v="callout" numberOfLines={1}>{l.label || l.url}</T>
            <T v="meta" color={c.ink3} numberOfLines={1}>{l.url.replace(/^https?:\/\//i, "")}</T>
          </View>
          <Icon name="out" size={14} color={c.ink3} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  facts: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14 },
  fact: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  board: { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 12, borderRadius: 16, borderWidth: 1.5 },
  item: { width: "47%", flexGrow: 1, minHeight: 92, alignItems: "center", justifyContent: "space-between", gap: 6, paddingTop: 12, paddingBottom: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5 },
  slot: { minHeight: 34, alignItems: "center", justifyContent: "flex-end" },
  open: { position: "absolute", bottom: 6 },
  who: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1.5, maxWidth: 140 },
  card: { gap: 8, padding: 14, borderRadius: 16, borderWidth: 1.5 },
  code: { alignSelf: "flex-start", gap: 2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed" },
  link: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5 },
});
