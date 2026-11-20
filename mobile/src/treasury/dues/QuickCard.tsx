/**
 * Overview → the short Dues card (DuesQuickCard.tsx on .du-dq): how dues stand, and a door
 * into the Dues tab. The whole card opens the tab; each row carries its filter through the
 * door and each square its member. Every figure is the board the tab reads, through
 * quickCardOf in @/lib/treasury/dues.
 */
import type { DuesBoard } from "@/lib/api-types";
import { STANDING, fmtDay, money, plural, quickCardOf, type DuesFilter, type DuesPerson } from "@/lib/treasury/dues";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "~/icons/Icon";
import { SkeletonCard } from "~/shell/states";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { Stack, Strip, useStanding } from "./bits";
import { pressedDim } from "~/motion/press";

// Module-level so React keeps one component type across renders: defined inside
// DuesQuickCard, every render remounted the whole card (and dropped its pressed state).
function Card({ onPress, label, children }: { onPress: () => void; label: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label}
      style={({ pressed }) => [styles.card, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.butter.fill, pressed ? 2 : 4)]}>
      {children}
    </Pressable>
  );
}
function Foot({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <View style={[styles.f, { borderTopColor: c.line2 }]}>{children}</View>;
}

export function DuesQuickCard({ board, error, people, duesWord, canTreasury, onGo, onHandOut }: {
  board: DuesBoard | null; error: string | null; people: Map<number, DuesPerson>; duesWord: string; canTreasury: boolean;
  onGo: (filter: DuesFilter, memberId?: number) => void; onHandOut: () => void;
}) {
  const { c } = useTheme();
  const sw = useStanding();

  const head = (pill: ReactNode) => (
    <View style={styles.h}>
      <View style={[styles.tile, { backgroundColor: c.note.fill.butter, borderColor: c.note.ink }]}><Icon name="jar" size={17} color={c.note.ink} /></View>
      <T v="title" size={18} ls={-0.025}>{duesWord}</T>
      {pill}
      <View style={[styles.goAr, { borderColor: c.ink }]}><Icon name="arrow-r" size={15} color={c.ink} /></View>
    </View>
  );
  const open = () => onGo("all");

  if (!board) {
    return <Card onPress={open} label={`Open ${duesWord}`}>{head(null)}{error ? <View style={styles.d1}><T v="body" size={14} color={c.ink2}>{error}</T></View> : <View style={{ marginHorizontal: 20, marginBottom: 20 }}><SkeletonCard height={150} /></View>}</Card>;
  }

  if (board.charges.length === 0) {
    return (
      <Card onPress={open} label={`Open ${duesWord}`}>
        {head(null)}
        <View style={styles.d1}>
          <T v="body" size={14} color={c.ink2}>
            Nobody’s been billed{board.term ? ` for ${board.term.label}` : ""}. {canTreasury
              ? `Hand out ${duesWord.toLowerCase()} to everyone, by role, or to a few people.`
              : `When your treasurer hands out ${duesWord.toLowerCase()}, who’s paid shows up here.`}
          </T>
          <View style={{ marginTop: 10 }}><Strip cols={18} items={board.members.map(m => ({ id: m.brotherId, s: "none" as const }))} /></View>
        </View>
        <Foot>
          <T v="meta" size={12.5} color={c.ink3} style={{ flex: 1 }}>{plural(board.members.length, "member")}, nothing billed</T>
          {canTreasury ? (
            <Pressable onPress={onHandOut} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.open, pressed && pressedDim]}>
              <Icon name="plus" size={14} color={c.ink} /><T v="buttonSm" size={13} color={c.ink}>Hand out {duesWord.toLowerCase()}</T>
            </Pressable>
          ) : null}
        </Foot>
      </Card>
    );
  }

  const nameOf = (id: number) => people.get(id)?.name ?? "Former member";
  const q = quickCardOf(board, nameOf);
  const toPeople = (ms: typeof board.members) => q.owingFirst(ms).map(m => people.get(m.brotherId)).filter((p): p is DuesPerson => !!p);

  return (
    <Card onPress={open} label={`Open ${duesWord}`}>
      {head(
        <View style={[styles.pill, q.owe ? { backgroundColor: c.pastel.rose.soft, borderColor: c.pastel.rose.border } : { backgroundColor: c.pastel.mint.soft, borderColor: c.pastel.mint.border }]}>
          <T v="pill" size={11.5} color={q.owe ? c.pastel.rose.ink : c.pastel.mint.ink}>{q.owe ? `${q.owe} owe` : "All paid"}</T>
        </View>,
      )}
      <View style={styles.sum}>
        <T v="figure" size={37} ls={-0.05} lh={1}>{q.pct}%</T>
        <T v="meta" size={13} color={c.ink3}>collected · <T v="bodyStrong" size={13}>{money(q.paid)}</T> of {money(q.billed)}</T>
      </View>
      <View style={{ paddingHorizontal: 20, marginTop: 6 }}>
        <Strip cols={18} onPress={id => onGo("all", id)}
          items={q.order.map(m => ({ id: m.brotherId, s: m.standing, label: `${nameOf(m.brotherId)}: ${STANDING[m.standing].chip}` }))} />
      </View>
      <View style={styles.rows}>
        {(["overdue", "due", "paid"] as const).map(s => q.by[s].length > 0 ? (
          <Pressable key={s} onPress={() => onGo(s)} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.paper2 }]}>
            <View style={[styles.sw, { backgroundColor: sw(s).fill, borderColor: c.ink }]} />
            <View style={styles.nm}>
              <T v="bodyStrong" size={13.5}>{STANDING[s].lane}</T>
              {s !== "paid" ? <Stack ps={toPeople(q.by[s])} max={3} /> : null}
            </View>
            <T v="mono" size={12} color={c.ink3}>{q.by[s].length}</T>
            <T v="mono" size={13} style={{ fontFamily: "PlexMono-600", minWidth: 56, textAlign: "right" }}>{s === "paid" ? "" : money(q.sum(s))}</T>
            <Icon name="chev-r" size={13} color={c.ink3} />
          </Pressable>
        ) : null)}
      </View>
      <Foot>
        <T v="meta" size={12.5} color={c.ink3} style={{ flex: 1 }} numberOfLines={1}>
          {q.next
            ? <>Next due · <T v="bodyStrong" size={12.5}>{q.next.name}</T> {fmtDay(q.next.dueDate!)}</>
            : `${plural(board.charges.length, "charge")}${board.term ? ` in ${board.term.label}` : ""}`}
        </T>
        <View style={styles.open}><T v="buttonSm" size={13} color={c.ink}>Open {duesWord}</T><Icon name="arrow-r" size={14} color={c.ink} /></View>
      </Foot>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 22 },
  h: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 },
  tile: { width: 34, height: 34, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  goAr: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginLeft: "auto" },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  sum: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 10, paddingHorizontal: 20 },
  rows: { marginTop: 14, marginHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 10 },
  sw: { width: 12, height: 12, borderRadius: 4, borderWidth: 1.5 },
  nm: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  f: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, marginTop: 12, borderTopWidth: 1.5, borderStyle: "dashed" },
  open: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto" },
  d1: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 4 },
});
