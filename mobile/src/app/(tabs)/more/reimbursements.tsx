/**
 * More → Reimbursements (U9): paid for something out of pocket, get it back. My requests
 * as receipt stubs, newest first, each with where it stands:
 *
 *   Pending     pencilled: the treasurer hasn't looked yet. The receipt can still be added
 *               or swapped (the server lets the requester change it only while pending)
 *   Reimbursed  inked stamp: approved, which is the moment the treasurer records it as an
 *               expense in the books (the server has no separate "paid" step)
 *   Declined    rose stamp, with the treasurer's note when they left one
 *
 * New request (sheet): amount, the day, what it was for, the budget line (the web asks
 * the same four), and the receipt from the camera, a photo or a PDF, shown as a taped
 * print with an × to drop it. Send is the signature moment (~/moments/Envelope): the print
 * slides into the envelope and gets stamped SENT. POST /api/reimbursements, then the
 * receipt; if only the receipt fails the request still went, and its stub offers to add it.
 *
 * The list is GET /api/reimbursements (the whole org's); the phone shows only mine, and
 * approving is the treasurer's, on chaptos.com.
 */
import type { Reimbursement } from "@/lib/api-types";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { receiptUrl, useCategories, useReimbursements, visibleExpense } from "~/data/money";
import { useEntryOf } from "~/entry/EntryContext";
import { money } from "~/members/model";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Stamp } from "~/paper/Stamp";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonList, StaleNote } from "~/shell/states";
import { toast } from "~/shell/toast";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { monthDay } from "~/today/time";
import { AttachSheet, Pencil, RequestSheet } from "~/money/RequestSheet";
import { T } from "~/ui/T";

export default function ReimbursementsPage() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const q = useReimbursements();
  const cats = useCategories();
  const [asking, setAsking] = useState(false);
  const [attachFor, setAttachFor] = useState<Reimbursement | null>(null);
  if (!entry) return null;
  const meId = entry.me.id;
  const mine = (q.data ?? []).filter(r => r.brotherId === meId);
  const labelOf = (slug: string | null | undefined) => (slug ? cats.data?.find(x => x.kind === "expense" && x.slug === slug)?.label ?? null : null);

  return (
    <Screen title="Reimbursements" back="More" onRefresh={() => q.refetch()}>
      {q.data ? <StaleNote updatedAt={q.dataUpdatedAt} failed={q.isError} onRetry={() => void q.refetch()} /> : null}
      {!q.data ? (q.isError ? <ErrorState title="Couldn't load your requests." error={q.error} onRetry={() => void q.refetch()} /> : <SkeletonList count={3} />)
        : !mine.length ? (
          <EmptyState pictures={[{ icon: "receipt", tone: "sky", label: "The receipt" }, { icon: "envelope", tone: "butter", label: "Sent in" }, { icon: "cash", tone: "mint", label: "Paid back" }]}
            title="Nothing to pay back."
            line="Paid for something out of pocket? Send a request with the receipt and the treasurer settles it."
            action={{ label: "Request reimbursement", icon: "receipt", onPress: () => setAsking(true) }} />
        ) : (
          <>
            <T v="body" color={c.ink2}>Paid out of pocket? Send the receipt and the treasurer pays you back.</T>
            <Button label="Request reimbursement" icon="receipt" tone="sky" block onPress={() => setAsking(true)} />
            <View style={{ gap: 14 }}>
              {mine.map(r => <Stub key={r.id} r={r} category={labelOf(r.category)} onAttach={() => setAttachFor(r)} />)}
            </View>
          </>
        )}
      <RequestSheet open={asking} onClose={() => setAsking(false)} meId={meId} categories={visibleExpense(cats.data)} />
      <AttachSheet r={attachFor} onClose={() => setAttachFor(null)} />
    </Screen>
  );
}

/** Why a receipt didn't go, as a sentence (a 5xx says nothing useful on its own). */
function Stub({ r, category, onAttach }: { r: Reimbursement; category: string | null; onAttach: () => void }) {
  const { c } = useTheme();
  const [opening, setOpening] = useState(false);
  const pending = r.status === "pending";
  const open = async () => {
    if (opening) return;
    setOpening(true);
    try { await WebBrowser.openBrowserAsync(await receiptUrl(r.id)); } catch (e) {
      haptics.error();
      toast.error("Couldn't open the receipt", { detail: errorMessage(e) });
    } finally { setOpening(false); }
  };
  const said = r.status === "approved" ? "reimbursed" : r.status === "rejected" ? "declined" : "pending";

  return (
    <View style={[styles.stub, { backgroundColor: c.card, borderColor: c.ink }]}>
      <View style={styles.stubTop} accessible accessibilityLabel={`${r.description}, ${money(r.amount)}, ${monthDay(r.date)}, ${said}`}>
        <View style={{ flex: 1, gap: 3 }}>
          <T v="subhead" numberOfLines={2}>{r.description}</T>
          <T v="meta" color={c.ink3}>{[monthDay(r.date), category].filter(Boolean).join(" · ")}</T>
        </View>
        <T v="mono" style={{ fontSize: 18, fontWeight: "700" }}>{money(r.amount)}</T>
      </View>
      <View style={[styles.perf, { borderTopColor: alpha(c.ink, 0.25) }]} />
      <View style={styles.stubFoot}>
        <View style={{ flex: 1, gap: 6, alignItems: "flex-start" }}>
          {pending ? <Pencil label="Pending" />
            : <Stamp label={r.status === "approved" ? "Reimbursed" : "Declined"} tone={r.status === "approved" ? "mint" : "rose"} state="shown" size="sm" rotate={-6} splat={false} />}
          {r.status === "rejected" && r.rejectionNote ? <T v="meta" color={c.ink2}>“{r.rejectionNote}”</T> : null}
          {pending ? <T v="meta" color={c.ink3}>Waiting on the treasurer.</T> : null}
        </View>
        {r.hasReceipt ? (
          <Button label={opening ? "Opening…" : "Receipt"} icon="receipt" variant="soft" size="sm" onPress={() => void open()} disabled={opening} />
        ) : pending ? (
          <Button label="Add the receipt" icon="camera" variant="ghost" tone="sky" size="sm" onPress={onAttach} />
        ) : <T v="meta" color={c.ink3}>No receipt</T>}
      </View>
    </View>
  );
}

/** Pencil, not ink: the dashed, soft "Pending" the treasurer will ink over. */
const styles = StyleSheet.create({
  stub: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  stubTop: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  perf: { borderTopWidth: 1.5, borderStyle: "dashed", marginHorizontal: 10 },
  stubFoot: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
});
