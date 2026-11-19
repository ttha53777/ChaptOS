/**
 * The Timeline's delete slip (app/components/timeline/DeleteEventSlip.tsx): what goes with
 * the event, counted by the server (GET /api/calendar/[id]/delete-preview), and the web's
 * promise: "You'll have a few seconds to undo." Nothing is deleted here. Delete event hands
 * back to the Timeline, which tears the row off, holds an Undo for 6s, and only then sends
 * DELETE (see useDeferredDelete). A party ledger without MANAGE_PARTIES blocks it, in peach.
 *
 * Haptics: warn as the slip opens (a destructive confirm); the tear carries the action's one.
 */
import type { CalEventType, CalendarEvent, EventDeletePreview } from "@/lib/api-types";
import { DAY_NAMES, MONTH_NAMES } from "@/lib/timeline/rows";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { useDeletePreview } from "~/data/meetings";
import { catOf, timeText } from "~/dash/UpNextCard";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { catLabel, typeOf } from "./Line";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

interface Chip { icon: IconName; text: string; keeps?: boolean }

function chipsFor(p: EventDeletePreview): Chip[] {
  const out: Chip[] = [];
  if (p.attendance) out.push({ icon: "check", text: `${p.attendance} attendance mark${p.attendance === 1 ? "" : "s"}` });
  if (p.excuses) out.push({ icon: "doc", text: `${p.excuses} excuse request${p.excuses === 1 ? "" : "s"}` });
  if (p.party) {
    const m = [p.party.doorRevenue ? `${money(p.party.doorRevenue)} in` : "", p.party.expenses ? `${money(p.party.expenses)} out` : ""].filter(Boolean).join(" · ");
    out.push({ icon: "receipt", text: `Party ledger${m ? ` · ${m}` : ""}` });
  }
  if (p.serviceMembers) out.push({ icon: "hand", text: `Service hours for ${p.serviceMembers} member${p.serviceMembers === 1 ? "" : "s"}` });
  if (p.fundraiser) out.push({ icon: "receipt", text: `The fundraiser${p.fundraiser.supplies ? ` and its ${p.fundraiser.supplies}-item shopping list` : ""}${p.fundraiser.wrapped ? ", wrap-up included" : ""}` });
  if (p.programming) out.push({ icon: "board", text: "Its Programming card goes back to Ideas", keeps: true });
  return out;
}

/** Whether the delete takes records with it: the undo toast's second line. */
export const takesRecords = (p: EventDeletePreview | undefined) => !p || !!(p.attendance || p.excuses || p.party || p.serviceMembers);

export function DeleteSlip({ event, types, onKeep, onDelete }: {
  event: CalendarEvent | null; types: CalEventType[] | undefined; onKeep: () => void;
  onDelete: (e: CalendarEvent, records: boolean) => void;
}) {
  const { c } = useTheme();
  const q = useDeletePreview(event?.id ?? null);
  const p = q.data;
  const blocked = p?.blocked === "MANAGE_PARTIES";
  useEffect(() => { if (event) haptics.warn(); }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!event) return <Sheet open={false} onClose={onKeep}>{null}</Sheet>;

  const cat = catOf(event.category, typeOf(types, event.category), c);
  const dt = new Date(`${event.date}T12:00:00`);
  const sub = [catLabel(types, event.category), timeText(event)].filter(Boolean).join(" · ");
  const chips = p ? chipsFor(p) : [];

  return (
    <Sheet open onClose={onKeep} size="fit" tone={blocked ? "peach" : "rose"} icon={blocked ? "lock" : "trash"}
      kicker={blocked ? "Can’t delete" : "Delete event"} title={blocked ? `You can’t delete ${event.title}` : `Delete ${event.title}?`}
      footer={
        <View style={{ flex: 1, gap: 10 }}>
          <T v="meta" color={c.ink3}>{blocked ? "Nothing was deleted." : "You’ll have a few seconds to undo."}</T>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label={blocked ? "OK" : "Keep it"} variant="soft" onPress={onKeep} style={{ flex: 1 }} />
            {!blocked ? <Button label="Delete event" tone="rose" icon="trash" onPress={() => onDelete(event, takesRecords(p))} style={{ flex: 1.3 }} /> : null}
          </View>
        </View>
      }>
      <View style={[styles.ticket, { borderColor: c.ink, backgroundColor: c.card }]}>
        <View style={[styles.bar, { backgroundColor: cat.ink }]} />
        <View style={{ flex: 1, paddingVertical: 12, paddingLeft: 16, gap: 2 }}>
          <T v="bodyStrong" numberOfLines={1}>{event.title}</T>
          {sub ? <T v="meta" color={c.ink3} numberOfLines={1}>{sub}</T> : null}
        </View>
        <View style={[styles.stub, { borderLeftColor: c.line2 }]}>
          <T v="mono" size={9.5} color={c.ink3}>{MONTH_NAMES[dt.getMonth()]!.slice(0, 3).toUpperCase()}</T>
          <T v="hero" size={22} lh={1.1}>{dt.getDate()}</T>
          <T v="mono" size={9.5} color={c.ink3}>{DAY_NAMES[dt.getDay()]!.toUpperCase()}</T>
        </View>
      </View>

      {blocked ? (
        <T v="body" color={c.ink2} style={{ marginTop: 14 }}>It has a party ledger, and deleting that needs Manage parties. Ask an officer who has it.</T>
      ) : (
        <View style={{ marginTop: 16, gap: 8 }}>
          <T v="label" color={c.ink3}>Goes with it</T>
          <View style={styles.chips} accessibilityLiveRegion="polite">
            {!p ? (
              <Chip text={q.isError ? "Its attendance, excuses and any party ledger" : "Counting…"} quiet />
            ) : chips.length ? chips.map((ch, i) => (
              <Animated.View key={i} entering={FadeIn.duration(220).delay(i * 70).reduceMotion(ReduceMotion.System)}>
                <Chip icon={ch.icon} text={ch.text} keeps={ch.keeps} />
              </Animated.View>
            )) : <Chip text="Nothing yet: no attendance or excuses" quiet />}
          </View>
        </View>
      )}
    </Sheet>
  );
}

function Chip({ icon, text, quiet, keeps }: { icon?: IconName; text: string; quiet?: boolean; keeps?: boolean }) {
  const { c } = useTheme();
  const tone = keeps ? c.pastel.mint : c.pastel.rose;
  return (
    <View style={[styles.chip, quiet ? { borderColor: c.line2, borderStyle: "dashed" } : { backgroundColor: tone.soft, borderColor: tone.border }]}>
      {icon ? <Icon name={icon} size={13} color={tone.ink} /> : null}
      <T v="meta" size={12.5} color={quiet ? c.ink3 : tone.ink} style={{ fontWeight: quiet ? "400" : "600" }}>{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, overflow: "hidden" },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  stub: { width: 64, alignItems: "center", paddingVertical: 8, borderLeftWidth: 1.5, borderStyle: "dashed" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
});
