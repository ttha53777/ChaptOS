/**
 * Delete an event (the web's DeleteEventSlip): first what goes with it, counted by the
 * server (GET /api/calendar/[id]/delete-preview: attendance records, excuses, a party
 * ledger, service hours, a programming card, a fundraiser), or why it can't go (a party
 * ledger needs MANAGE_PARTIES). Delete stamps the slip OFF THE TIMELINE in rose
 * (~/paper/Stamp: drop + ink; reduced = fade), then the sheet closes and `onDeleted` runs.
 * A refusal smears the stamp and says why. MANAGE_EVENTS.
 */
import type { CalendarEvent, EventDeletePreview } from "@/lib/api-types";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { deleteEvent, useDeletePreview } from "~/data/meetings";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Stamp, type StampState } from "~/paper/Stamp";
import { Sheet } from "~/shell/sheets";
import { SkeletonCard } from "~/shell/states";
import { toast } from "~/shell/toast";
import { T } from "~/ui/T";
import { shortDate } from "./model";

function consequences(p: EventDeletePreview): string[] {
  const out: string[] = [];
  if (p.attendance) out.push(`${p.attendance} attendance ${p.attendance === 1 ? "record" : "records"}`);
  if (p.excuses) out.push(`${p.excuses} ${p.excuses === 1 ? "excuse" : "excuses"}`);
  if (p.serviceMembers) out.push(`service hours for ${p.serviceMembers} ${p.serviceMembers === 1 ? "member" : "members"}`);
  if (p.party) out.push(`the ${p.party.name} party ledger${p.party.completed ? " (wrapped up)" : ""}`);
  if (p.fundraiser) out.push(`its fundraiser${p.fundraiser.supplies ? ` and ${p.fundraiser.supplies}-item shopping list` : ""}`);
  if (p.programming) out.push("its programming card goes back to Ideas");
  return out;
}

export function DeleteSheet({ event, onClose, onDeleted }: { event: CalendarEvent | null; onClose: () => void; onDeleted: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const preview = useDeletePreview(event?.id ?? null);
  const [stamp, setStamp] = useState<StampState>("hidden");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (event) { setStamp("hidden"); setBusy(false); } }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = preview.data;
  const list = p ? consequences(p) : [];
  const blocked = p?.blocked === "MANAGE_PARTIES";

  const go = async () => {
    if (!event || busy || blocked) return;
    setBusy(true);
    try {
      await deleteEvent(event.id);
      setStamp("in");
      setTimeout(() => {
        onClose();
        onDeleted();
        toast.show(`${event.title} deleted`, { detail: shortDate(event.date) });
      }, m.t(m.reduced ? 420 : 760));
    } catch (e) {
      setStamp("smear");
      haptics.error();
      toast.error("Couldn't delete it", { detail: errorMessage(e) });
      setBusy(false);
    }
  };

  return (
    <Sheet open={event != null} onClose={onClose} locked={busy} tone="rose" icon="trash" kicker={event ? shortDate(event.date) : ""} title={`Delete ${event?.title ?? ""}?`}
      footer={
        <View style={styles.acts}>
          <Button label="Keep it" variant="soft" onPress={onClose} style={{ flex: 1 }} disabled={busy} />
          <Button label={busy ? "Deleting…" : "Delete"} tone="rose" icon="trash" onPress={() => void go()} style={{ flex: 1.3 }} disabled={busy || blocked || !p} />
        </View>
      }>
      <View style={styles.slip}>
        {!p ? (preview.isError ? <T v="meta" color={c.pastel.rose.ink}>{errorMessage(preview.error)}</T> : <SkeletonCard lines={2} title={false} />)
          : blocked ? <T v="body" color={c.ink2}>It has a party ledger, and deleting that needs the parties permission. Ask whoever runs parties.</T>
          : list.length ? (
            <View style={{ gap: 6 }}>
              <T v="body" color={c.ink2}>It goes off the Timeline and everyone's calendar, with:</T>
              {list.map(l => <T key={l} v="callout" color={c.ink}>{`·  ${l}`}</T>)}
              <T v="meta" color={c.ink3}>This can't be undone.</T>
            </View>
          ) : <T v="body" color={c.ink2}>It goes off the Timeline and everyone's calendar. Nothing else is attached to it.</T>}
        <Stamp label="Off the timeline" tone="rose" state={stamp} size="md" rotate={-9} onImpact={() => haptics.soft()} style={styles.stamp} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  acts: { flex: 1, flexDirection: "row", gap: 8 },
  slip: { minHeight: 110, justifyContent: "center" },
  stamp: { position: "absolute", right: 6, top: 10 },
});
