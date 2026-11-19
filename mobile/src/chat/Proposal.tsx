/**
 * A drafted write Ask Chapt wants confirmed (the web's "writ" card). The phone confirms
 * only self-service cards (perm.name === null: your own excuse, hours, vote, task tick):
 * Confirm calls the card's endpoint with its payload, exactly as the web does, and with no
 * approval to record. A card that spends officer authority shows what it would do and
 * sends you to chaptos.com, where the four-eyes record is kept. Settled cards stamp:
 * mint (done), rose (failed), crossed out (discarded).
 */
import type { ProposalCard } from "./types";
import { StyleSheet, View } from "react-native";
import { api } from "~/api/client";
import { ApiError } from "~/api/errors";
import { queryClient } from "~/data/query";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { patchProposal } from "./thread";

const DONE_BY_KIND: Record<string, string> = {
  excuse: "Submitted. Your excuse is filed.",
  service: "Logged. Your hours are recorded.",
  poll: "Voted. Your pick is in.",
  reimbursement: "Submitted. Sent to the treasurer.",
};
const doneText = (c: ProposalCard) => (c.action === "propose_complete_task" ? "Done. Marked complete." : DONE_BY_KIND[c.display.kind] ?? "Done.");

async function confirm(msgId: string, card: ProposalCard) {
  if (!card.endpoint.startsWith("/api/")) { patchProposal(msgId, card.id, { state: "error", resultMessage: "This card can't be confirmed here." }); return; }
  haptics.tap();
  patchProposal(msgId, card.id, { state: "confirming" });
  try {
    await api(card.endpoint, { method: card.method, body: card.payload });
    haptics.success();
    patchProposal(msgId, card.id, { state: "approved", resultMessage: doneText(card) });
    void queryClient.invalidateQueries();
  } catch (e) {
    haptics.error();
    const msg = e instanceof ApiError ? (e.status === 403 ? "Your account can't do this." : e.message) : "Couldn't reach the server. Try again.";
    patchProposal(msgId, card.id, { state: "error", resultMessage: msg });
  }
}

export function Proposal({ msgId, card }: { msgId: string; card: ProposalCard }) {
  const { c } = useTheme();
  const self = card.perm.name === null;
  const settled = card.state === "approved" || card.state === "discarded" || card.state === "error";
  const stamp = card.state === "approved" ? c.pastel.mint : card.state === "error" ? c.pastel.rose : null;
  return (
    <View style={[styles.card, { borderColor: c.ink, backgroundColor: c.card, opacity: card.state === "discarded" ? 0.55 : 1 }]}>
      <T v="kicker" color={c.ink3} style={{ fontSize: 10 }}>{self ? "Confirm to file" : "Needs an officer"}</T>
      <T v="subhead" style={card.state === "discarded" ? { textDecorationLine: "line-through" } : undefined}>{card.display.title}</T>
      <View style={[styles.rows, { borderColor: c.line }]}>
        {card.display.rows.map((r, i) => (
          <View key={i} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.lineSoft }]}>
            <T v="meta" color={c.ink3} style={{ width: 92 }}>{r.k}</T>
            <T v="callout" style={{ flex: 1, fontWeight: r.em ? "700" : undefined }}>{r.v}</T>
          </View>
        ))}
      </View>
      {settled ? (
        stamp ? (
          <View style={[styles.stamp, { borderColor: stamp.ink, backgroundColor: stamp.soft }]} accessibilityLiveRegion="polite">
            <T v="callout" color={stamp.ink}>{card.resultMessage ?? (card.state === "approved" ? "Done." : "That didn't go through.")}</T>
          </View>
        ) : <T v="meta" color={c.ink3}>Discarded. Nothing was filed.</T>
      ) : self ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label={card.state === "confirming" ? "Filing…" : "Confirm"} icon="check" size="sm" disabled={card.state === "confirming"} onPress={() => void confirm(msgId, card)} />
          <Button label="Discard" variant="soft" size="sm" disabled={card.state === "confirming"} onPress={() => { haptics.select(); patchProposal(msgId, card.id, { state: "discarded" }); }} />
        </View>
      ) : (
        <T v="meta" color={c.ink2}>
          {card.perm.label} {card.perm.canApprove ? "can be approved on chaptos.com, where the approval is recorded." : `is needed${card.perm.holders?.roleTitles.length ? ` (${card.perm.holders.roleTitles.join(", ")})` : ""}. Ask an officer who has it.`}
        </T>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 10 },
  rows: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10 },
  row: { flexDirection: "row", gap: 10, paddingVertical: 7 },
  stamp: { alignSelf: "flex-start", borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, transform: [{ rotate: "-1.5deg" }] },
});
