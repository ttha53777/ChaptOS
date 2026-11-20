/**
 * Treasury → Reimbursements, as the web phone draws ReimbursementsView (paper-treasury.css):
 * "Reimbursement Requests" + "2 pending · $160.50 to review"; each request a receipt with a
 * zig-zag foot (pending ones inked, on a sky shadow), the amount as the hero, the age, the
 * receipt link (requester or treasury), a PAID / DECLINED rubber stamp once settled.
 *
 * A treasurer's foot is Approve / Decline. Approve confirms inline first: "Posts a $42.50
 * expense to the ledger", the budget category, "Balance after $2,288 → $2,246", then
 * Approve & post. Decline takes an optional note shown to the submitter. Resolved requests
 * fold under "Show resolved (n)". Empty: the calm card with Request reimbursement.
 */
import type { Reimbursement } from "@/lib/api-types";
import { fmt$, fmtDate, fmtReimb, reimbEmpty, reimbQueue, relativeAge, type Catalog } from "@/lib/treasury/ledger";
import * as WebBrowser from "expo-web-browser";
import { memo, useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { errorMessage } from "~/api/errors";
import { receiptUrl, reviewReimbursement } from "~/data/money";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { Calm, TrBtn } from "./bits";

export interface ReimbEnv {
  canTreasury: boolean;
  selfId: number | null;
  balance: number;
  catalog: Catalog;
  onAttach: (r: Reimbursement) => void;
}

export function ReimbursementsView({ list, env, showArchived, onToggleArchived, onRequest }: {
  list: Reimbursement[]; env: ReimbEnv; showArchived: boolean; onToggleArchived: () => void; onRequest: () => void;
}) {
  const { c } = useTheme();
  const { pending, archived, pendingTotal } = reimbQueue(list);
  const empty = reimbEmpty(env.canTreasury, archived.length > 0);
  return (
    <View style={{ marginTop: 18 }}>
      <View style={styles.head}>
        <T v="title" size={22} ls={-0.03} accessibilityRole="header">Reimbursement Requests</T>
        {pending.length ? (
          <T v="meta" size={12} color={c.ink2}>{pending.length} pending · <T v="mono" size={12} color={c.pastel.peach.ink}>{fmtReimb(pendingTotal)} to review</T></T>
        ) : null}
      </View>

      {pending.length === 0 ? (
        <View style={[styles.empty, { borderColor: c.line2, backgroundColor: c.card }]}>
          <Calm icon="receipt" tone="peach" title={empty.title} actions={<TrBtn small label="Request reimbursement" icon="receipt" tone="peach" onPress={onRequest} />}>
            {empty.body}
          </Calm>
        </View>
      ) : (
        <View style={styles.list}>{pending.map((r, i) => <ReimbCard key={r.id} r={r} odd={i % 2 === 0} env={env} />)}</View>
      )}

      {archived.length ? (
        <View style={{ marginTop: 22 }}>
          <Pressable onPress={onToggleArchived} accessibilityRole="button" hitSlop={8}>
            <T v="buttonSm" size={13} color={c.ink3}>{showArchived ? "Hide" : "Show"} resolved ({archived.length})</T>
          </Pressable>
          {showArchived ? <View style={[styles.list, { marginTop: 16 }]}>{archived.map((r, i) => <ReimbCard key={r.id} r={r} odd={i % 2 === 0} env={env} archived />)}</View> : null}
        </View>
      ) : null}
    </View>
  );
}

/** The receipt's torn bottom edge. */
function ZigZag({ color, stroke }: { color: string; stroke: string }) {
  const [w, setW] = useState(0);
  const n = Math.max(1, Math.floor(w / 16));
  const step = w / n;
  let d = `M0 0 V2`;
  for (let i = 0; i < n; i++) d += ` L${(i + 0.5) * step} 10 L${(i + 1) * step} 2`;
  const fill = `${d} V0 Z`;
  return (
    <View style={{ height: 10 }} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {w ? <Svg width={w} height={11}><Path d={fill} fill={color} /><Path d={d.replace("M0 0 V2", "M0 2")} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" /></Svg> : null}
    </View>
  );
}

const ReimbCard = memo(function ReimbCard({ r, odd, env, archived }: { r: Reimbursement; odd: boolean; env: ReimbEnv; archived?: boolean }) {
  const { c } = useTheme();
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [note, setNote] = useState("");
  const [cat, setCat] = useState("");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const mine = env.selfId != null && r.brotherId === env.selfId;
  const pending = r.status === "pending";
  const showActions = !archived && env.canTreasury && !mode;
  const edge = pending ? c.ink : c.line2;

  const expenseCats = env.catalog.options("expense", cat || null);
  const startApprove = () => { setMode("approve"); setCat(r.category || env.catalog.options("expense")[0]?.slug || ""); };

  const act = async (status: "approved" | "rejected") => {
    setBusy(true);
    try {
      await reviewReimbursement(r.id, status, status === "rejected" ? { note: note.trim() || null } : { category: cat || undefined });
      haptics.success();
      setMode(null);
    } catch (e) {
      haptics.error();
      toast.error("Failed to update reimbursement", { detail: errorMessage(e) });
    } finally { setBusy(false); }
  };

  const openReceipt = async () => {
    if (opening) return;
    setOpening(true);
    try { await WebBrowser.openBrowserAsync(await receiptUrl(r.id)); }
    catch (e) { haptics.error(); toast.error("Couldn't open the receipt", { detail: errorMessage(e) }); }
    finally { setOpening(false); }
  };

  const pill = r.status === "pending" ? { t: "Pending", tone: c.pastel.sky } : r.status === "approved" ? { t: "Approved", tone: c.pastel.mint } : { t: "Declined", tone: c.pastel.rose };
  const [int, cents] = fmtReimb(r.amount).slice(1).split(".");

  return (
    <View style={[{ transform: [{ rotate: odd ? "-0.6deg" : "0.5deg" }] }, archived && { opacity: 0.86 }]}>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: edge }, pending ? hard(c.pastel.sky.fill, 5) : { boxShadow: "0 10px 14px rgba(38,33,27,0.09)" }]}>
        <View style={styles.body}>
          <View style={styles.top}>
            <View style={[styles.av, { backgroundColor: c.note.fill.lilac }]}>
              {r.brother.avatarUrl
                ? <Image source={{ uri: r.brother.avatarUrl }} style={{ width: 32, height: 32 }} accessibilityLabel={r.brother.name} />
                : <T v="pill" size={12} style={{ fontFamily: "Inter-700" }} color={c.note.ink}>{r.brother.name.charAt(0).toUpperCase()}</T>}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <T v="bodyStrong" size={14.5} numberOfLines={1}>{r.brother.name}{mine ? <T v="kicker" size={8.5} color={c.ink3}>{"  you"}</T> : null}</T>
              <T v="meta" size={11} color={c.ink3}>{fmtDate(r.date)}</T>
            </View>
            <View style={[styles.pill, { backgroundColor: pill.tone.soft, borderColor: pill.tone.border }]}>
              <View style={[styles.pdot, { backgroundColor: pill.tone.ink }]} />
              <T v="pill" color={pill.tone.ink}>{pill.t}</T>
            </View>
          </View>

          <View style={[styles.amount, { borderTopColor: c.line2 }]}>
            <T v="title" size={21} color={c.ink3} style={{ marginTop: 4 }}>$</T>
            <T v="figure" size={42}>{int}.{cents}</T>
          </View>
          <T v="body" size={14.5} color={c.ink2} align="center" style={{ marginTop: 8 }}>{r.description}</T>
          <T v="meta" size={11} color={c.ink3} align="center">submitted {relativeAge(r.createdAt, Date.now())}</T>
          {r.hasReceipt && (mine || env.canTreasury) ? (
            <Pressable onPress={() => void openReceipt()} accessibilityRole="link" style={styles.receipt} hitSlop={6}>
              <Icon name="receipt" size={13} color={c.ink2} />
              <T v="meta" size={12.5} color={c.ink2} style={{ textDecorationLine: "underline" }}>{opening ? "Opening…" : "View receipt"}</T>
            </Pressable>
          ) : null}
          {!r.hasReceipt && mine && pending ? (
            <Pressable onPress={() => env.onAttach(r)} accessibilityRole="button" style={styles.receipt} hitSlop={6}>
              <Icon name="receipt" size={13} color={c.ink2} />
              <T v="meta" size={12.5} color={c.ink2} style={{ textDecorationLine: "underline" }}>Attach receipt</T>
            </Pressable>
          ) : null}
          {!pending ? (
            <View style={[styles.rubber, { borderColor: r.status === "approved" ? c.pastel.mint.ink : c.pastel.rose.ink }]} pointerEvents="none" accessibilityElementsHidden>
              <T v="stamp" size={14} ls={0.16} color={r.status === "approved" ? c.pastel.mint.ink : c.pastel.rose.ink}>{r.status === "approved" ? "Paid" : "Declined"}</T>
            </View>
          ) : null}
        </View>

        <View style={[styles.tear, { borderTopColor: c.line2 }]} />

        <View style={styles.foot}>
          {showActions ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={startApprove} accessibilityRole="button" style={({ pressed }) => [styles.act, { backgroundColor: c.ink, borderColor: c.ink }, !pressed && hard(c.pastel.mint.fill, 2.5)]}>
                <Icon name="check" size={14} color={c.paper} /><T v="buttonSm" size={13.5} color={c.paper}>Approve</T>
              </Pressable>
              <Pressable onPress={() => { setMode("reject"); setNote(""); }} accessibilityRole="button" style={({ pressed }) => [styles.act, { backgroundColor: c.card, borderColor: c.pastel.rose.ink }, !pressed && hard(c.pastel.rose.fill, 2.5)]}>
                <Icon name="x" size={14} color={c.pastel.rose.ink} /><T v="buttonSm" size={13.5} color={c.pastel.rose.ink}>Decline</T>
              </Pressable>
            </View>
          ) : null}

          {mode === "reject" ? (
            <View style={{ gap: 8 }}>
              <TextInput value={note} onChangeText={setNote} autoFocus maxLength={500} placeholder="Reason for declining (optional — shown to submitter)" placeholderTextColor={c.ink3}
                style={[styles.input, { borderColor: c.line2, backgroundColor: c.paper, color: c.ink }]} />
              <View style={styles.confirmRow}>
                <TrBtn small kind="ghost" label="Cancel" onPress={() => setMode(null)} disabled={busy} />
                <Pressable onPress={() => void act("rejected")} disabled={busy} accessibilityRole="button"
                  style={({ pressed }) => [styles.confirm, { backgroundColor: c.card, borderColor: c.pastel.rose.ink }, !pressed && hard(c.pastel.rose.fill, 2), busy && { opacity: 0.5 }]}>
                  <T v="buttonSm" size={13} color={c.pastel.rose.ink}>Confirm decline</T>
                </Pressable>
              </View>
            </View>
          ) : null}

          {mode === "approve" ? (
            <View style={{ gap: 10 }}>
              <T v="meta" size={12.5} color={c.ink3}>
                Posts a <T v="bodyStrong" size={12.5}>{fmtReimb(r.amount)}</T> expense to the ledger
                {mine ? <T v="meta" size={12.5} color={c.pastel.butter.ink}> — this is your own request</T> : null}
              </T>
              <View style={{ gap: 6 }}>
                <T v="label" size={10} color={c.ink3}>Budget category</T>
                <View style={styles.cats}>
                  {expenseCats.map(o => {
                    const on = o.slug === cat;
                    return (
                      <Pressable key={o.slug} onPress={() => setCat(o.slug)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                        style={[styles.catChip, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.card }]}>
                        <T v="buttonSm" size={12.5} color={on ? c.paper : c.ink2}>{o.label}</T>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={{ gap: 2 }}>
                <T v="label" size={10} color={c.ink3}>Balance after</T>
                <T v="bodyStrong" size={14}>{fmt$(Math.round(env.balance))} → {fmt$(Math.round(env.balance - r.amount))}</T>
              </View>
              <View style={styles.confirmRow}>
                <TrBtn small kind="ghost" label="Cancel" onPress={() => setMode(null)} disabled={busy} />
                <Pressable onPress={() => void act("approved")} disabled={busy} accessibilityRole="button"
                  style={({ pressed }) => [styles.confirm, { backgroundColor: c.ink, borderColor: c.ink }, !pressed && hard(c.pastel.mint.fill, 2), busy && { opacity: 0.5 }]}>
                  <T v="buttonSm" size={13} color={c.paper}>Approve &amp; post</T>
                </Pressable>
              </View>
            </View>
          ) : null}

          {!showActions && !mode && r.status === "approved" ? (
            <View style={styles.outcome}>
              <Icon name="check" size={14} color={c.pastel.mint.ink} />
              <T v="meta" size={13} color={c.ink2} style={{ flex: 1 }}>Reimbursed{r.category ? ` — posted to ${env.catalog.labelFor("expense", r.category)}` : ""}</T>
            </View>
          ) : null}
          {!showActions && !mode && r.status === "rejected" ? (
            <View style={styles.outcome}>
              <T v="label" size={9.5} ls={0.13} color={c.pastel.rose.ink} style={{ marginTop: 2 }}>Note</T>
              <T v="meta" size={13} color={c.ink2} style={{ flex: 1 }}>{r.rejectionNote || "Declined."}</T>
            </View>
          ) : null}
        </View>
      </View>
      <ZigZag color={c.card} stroke={edge} />
    </View>
  );
});

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12, paddingHorizontal: 2, marginBottom: 14 },
  empty: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 22, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 4 },
  list: { gap: 26 },
  card: { borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  body: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 6, gap: 2 },
  top: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  av: { width: 32, height: 32, borderRadius: 16, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(38,33,27,0.08)" },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  pdot: { width: 5, height: 5, borderRadius: 3 },
  amount: { marginTop: 14, paddingTop: 12, borderTopWidth: 1.5, borderStyle: "dashed", flexDirection: "row", justifyContent: "center", alignItems: "flex-start", gap: 2 },
  receipt: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 8 },
  rubber: { position: "absolute", right: 14, top: 96, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 2.5, borderRadius: 8, transform: [{ rotate: "-9deg" }], opacity: 0.85 },
  tear: { marginTop: 7, marginBottom: 7, borderTopWidth: 2, borderStyle: "dashed" },
  foot: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16, gap: 8 },
  act: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Inter-400", fontSize: 14 },
  confirmRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  confirm: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5 },
  cats: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catChip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  outcome: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
});
