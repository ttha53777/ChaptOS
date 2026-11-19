/**
 * More → Dues (or the chapter's word for it): my tab, read-only, as a receipt. What I owe
 * and whether any of it is late, what's still open per charge, and every line: charges
 * add, payments and waivers take off (GET /api/dues/members/[me]). Paying happens off the
 * app (the treasurer records it), so the page says how, not a button.
 *
 * U9: the figure counts up to what I owe the first time the page opens in a session
 * (~/money/countUp); the receipt carries a running balance in mono after every line, and
 * a charge that's been fully covered gets a small PAID till stamp. The receipt is thermal paper,
 * light in both themes, so its print uses the thermal inks, never the page's.
 */
import { StyleSheet, View } from "react-native";
import type { MemberDuesBook } from "@/lib/api-types";
import { useMyDues } from "~/data/more";
import { useEntryOf } from "~/entry/EntryContext";
import { money } from "~/members/model";
import { useCountUp } from "~/money/countUp";
import { Receipt } from "~/paper/stationery";
import { TickingNumber } from "~/paper/TickingNumber";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { monthDay } from "~/today/time";
import { T } from "~/ui/T";

export default function DuesPage() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const q = useMyDues(entry?.me.id ?? 0, !!entry);
  const book = q.data;
  const s = book?.standing;
  const owes = useCountUp(`dues-${entry?.me.id ?? 0}`, s ? Math.max(0, s.owes) : null);
  if (!entry) return null;
  const word = entry.me.org?.vocabularyOverrides.Dues ?? "Dues";

  return (
    <Screen title={word} back="More" onRefresh={() => q.refetch()}>
      {book ? <StaleNote updatedAt={q.dataUpdatedAt} failed={q.isError} onRetry={() => void q.refetch()} /> : null}
      {!book ? (q.isError ? <ErrorState title={`Couldn't load your ${word.toLowerCase()}.`} error={q.error} onRetry={() => void q.refetch()} /> : <SkeletonCard height={280} />)
        : !book.entries.length ? (
          <EmptyState pictures={[{ icon: "receipt", tone: "peach", label: "Charges" }, { icon: "cash", tone: "mint", label: "Payments" }, { icon: "check", tone: "sky", label: "Paid up" }]}
            title={`No ${word.toLowerCase()} yet.`} line={`When the treasurer charges ${word.toLowerCase()}, your tab shows up here, line by line.`} />
        ) : (
          <>
            <View style={{ gap: 4 }}>
              {s!.owes > 0
                ? <TickingNumber value={money(owes ?? s!.owes)} v="hero" accessibilityLabel={`${money(s!.owes)} owed`} />
                : <T v="hero" style={{ fontSize: 44, lineHeight: 48 }} accessibilityRole="header">Paid up</T>}
              <T v="body" color={s!.overdue > 0 ? c.pastel.rose.ink : c.ink2}>
                {s!.owes <= 0 ? "Nothing owed. Thank you."
                  : s!.overdue > 0 ? `${money(s!.overdue)} of it is ${s!.lateDays} ${s!.lateDays === 1 ? "day" : "days"} late.`
                  : s!.nextDueDate ? `Next due ${monthDay(s!.nextDueDate)}.` : "Outstanding."}
              </T>
            </View>

            {book.open.length ? (
              <View style={[styles.open, { borderColor: c.pastel.peach.border, backgroundColor: c.pastel.peach.soft }]}>
                {book.open.map(o => (
                  <View key={o.chargeId} style={styles.openRow}>
                    <View style={{ flex: 1 }}>
                      <T v="callout">{o.name}</T>
                      {o.dueDate ? <T v="meta" color={c.ink3}>Due {monthDay(o.dueDate)}</T> : null}
                    </View>
                    <T v="mono" style={{ fontSize: 14 }}>{money(o.rest)}</T>
                  </View>
                ))}
              </View>
            ) : null}

            <Receipt>
              <BookLines book={book} />
            </Receipt>
            <T v="meta" color={c.ink3}>Pay the treasurer the way your chapter does (Venmo, cash, a link). They record it, and it comes off here.</T>
          </>
        )}
    </Screen>
  );
}

/** The tab line by line, newest first, with the balance after each line and PAID on covered charges. */
function BookLines({ book }: { book: MemberDuesBook }) {
  const { c } = useTheme();
  const th = c.thermal;
  let run = 0;
  const after = book.entries.map(e => (run += e.amount));
  const covered = new Set(book.standing.lines.filter(l => l.amount > 0 && l.rest <= 0).map(l => l.chargeId));
  const rows = book.entries.map((e, i) => ({ e, bal: after[i]! })).reverse();
  return (
    <View>
      <View style={[styles.head, { borderBottomColor: alpha(th.ink, 0.3) }]}>
        <T v="label" color={th.faint} style={{ flex: 1 }}>Your tab</T>
        <T v="label" color={th.faint} style={styles.amt}>Amount</T>
        <T v="label" color={th.faint} style={styles.bal}>Balance</T>
      </View>
      {rows.map(({ e, bal }, i) => {
        const paid = e.kind === "charge" && e.chargeId != null && covered.has(e.chargeId);
        return (
          <View key={`${e.kind}${e.refId}`} style={[styles.line, i > 0 && { borderTopColor: alpha(th.ink, 0.12), borderTopWidth: 1, borderStyle: "dashed" }]}
            accessible accessibilityLabel={`${e.title}, ${monthDay(e.date)}, ${e.amount > 0 ? "charged" : "taken off"} ${money(Math.abs(e.amount))}${paid ? ", paid" : ""}, ${bal < 0 ? `${money(-bal)} in credit` : `balance ${money(bal)}`}`}>
            <View style={{ flex: 1, gap: 1 }}>
              <T v="callout" color={th.ink} numberOfLines={1}>{e.title}</T>
              <T v="meta" color={th.faint} numberOfLines={1}>{monthDay(e.date)}{e.detail ? ` · ${e.detail}` : ""}</T>
            </View>
            {paid ? (
              <View style={[styles.paid, { borderColor: alpha(th.ink, 0.7) }]}>
                <T v="label" color={alpha(th.ink, 0.75)} style={{ fontSize: 9, letterSpacing: 1.2 }}>Paid</T>
              </View>
            ) : null}
            <T v="mono" color={e.amount > 0 ? th.ink : th.neg} style={[styles.amt, { fontSize: 13 }]}>{e.amount > 0 ? "" : "−"}{money(Math.abs(e.amount))}</T>
            <T v="mono" color={th.faint} style={[styles.bal, { fontSize: 12 }]}>{bal < 0 ? `−${money(-bal)}` : money(bal)}</T>
          </View>
        );
      })}
      <View style={[styles.total, { borderTopColor: th.ink }]}>
        <T v="label" color={th.ink}>Owed</T>
        <T v="mono" color={th.ink} style={{ fontSize: 15, fontWeight: "700" }}>{money(Math.max(0, book.standing.owes))}</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 6, borderBottomWidth: 1 },
  amt: { width: 70, textAlign: "right" },
  bal: { width: 66, textAlign: "right" },
  // a till stamp in the thermal ink: the page's pastel inks wash out on this paper at night
  paid: { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, transform: [{ rotate: "-8deg" }] },
  open: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  openRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  line: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  total: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingTop: 10, borderTopWidth: 2 },
});
