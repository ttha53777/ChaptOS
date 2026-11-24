/**
 * More → tap your row: you, at a glance, in a sheet. More itself is for getting
 * somewhere, so your own records wait here instead of on the page.
 *
 *   card      photo (or initials), name, office title, "since Mon YYYY", and standing as a
 *             tag plus its reason (members/model verdictOf, judged on `measured`)
 *   records   the Yours pages (yoursFor: Attendance, Excuses, <Dues>, Reimbursements) with
 *             their live lines; a dot when one needs you; a tap opens that page
 *   footer    Open my full card (the Member card: photo, name here, profile)
 *
 * The records' queries only start once the sheet has been opened (`active`), then stay
 * cached. Haptics: none (opening things is navigation).
 */
import type { Brother, MeResponse } from "@/lib/api-types";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "~/icons/Icon";
import { LEVEL_TONE, measuredOf, seesStanding, titleOf, trackedOf, verdictOf, vocab, type Level } from "~/members/model";
import type { Live, Page, PageId } from "~/more/model";
import { Button } from "~/paper/Button";
import { Avatar } from "~/paper/bits";
import { Sheet } from "~/shell/sheets";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";

const TAG: Record<Level, string> = { ok: "GOOD", warn: "WATCH", risk: "AT RISK", none: "NOT YET" };

/** Standing as a short tag and a one-line reason, from the card's sentence. */
function standingOf(me: MeResponse, mine: Brother, roster: Brother[]): { level: Level; reason: string } | null {
  const org = me.org;
  if (!org || !seesStanding(me, mine.id)) return null;
  const tracked = trackedOf(org.disabledFeatures);
  const v = verdictOf(mine, org.thresholds, tracked, measuredOf(tracked, roster), { self: true, dues: vocab(me, "Dues"), service: vocab(me, "Service") });
  const raw = v.level === "none" ? "Starts with the first record" : v.tail.replace(/^[:\s]+|\.$/g, "");
  return { level: v.level, reason: raw.charAt(0).toUpperCase() + raw.slice(1) };
}

export function YouSheet({ open, onClose, me, mine, roster, records, lives, onRecord, onCard }: {
  open: boolean;
  onClose: () => void;
  me: MeResponse;
  mine: Brother | null;
  roster: Brother[];
  records: Page[];
  lives: Partial<Record<PageId, Live>>;
  onRecord: (id: PageId) => void;
  onCard: () => void;
}) {
  const { c } = useTheme();
  const name = mine?.name ?? me.name;
  const title = mine ? titleOf(mine) : me.role;
  const since = mine?.joinedAt ? new Date(mine.joinedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : null;
  const standing = mine ? standingOf(me, mine, roster) : null;
  const tone = standing ? LEVEL_TONE[standing.level] : null;

  return (
    <Sheet open={open} onClose={onClose} kicker={me.org?.name ?? "You"} title="You" icon="people" tone="lilac"
      footer={mine ? <Button label="Open my full card" icon="arrow-r" block onPress={onCard} /> : undefined}>
      <View style={{ gap: 16 }}>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.peach.fill, 4)]}>
          <Avatar name={name} uri={me.avatarUrl ?? mine?.avatarUrl ?? null} tone="lilac" px={60} ring={c.ink} style={[{ transform: [{ rotate: "-3deg" }] }, hard(c.pastel.mint.fill, 3)]} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <T v="title" size={22} numberOfLines={2}>{name}</T>
            <T v="meta" color={c.ink3} numberOfLines={1}>{since ? `${title} · since ${since}` : title}</T>
            {standing ? (
              <View style={styles.standing}>
                <View style={[styles.tag, tone ? { backgroundColor: c.pastel[tone].soft, borderColor: c.pastel[tone].border } : { backgroundColor: c.paper2, borderColor: c.line2 }]}>
                  <T v="kicker" size={9.5} color={tone ? c.pastel[tone].ink : c.ink3}>{TAG[standing.level]}</T>
                </View>
                <T v="meta" size={12.5} color={c.ink3} numberOfLines={1} style={{ flex: 1 }}>{standing.reason}</T>
              </View>
            ) : null}
          </View>
        </View>

        {records.length ? (
          <View style={styles.grid}>
            {records.map(r => {
              const live = lives[r.id];
              const flag = (live?.badge ?? 0) > 0;
              return (
                <Pressable key={r.id} onPress={() => onRecord(r.id)} accessibilityRole="button"
                  accessibilityLabel={`${r.title}${live?.line ? `: ${live.line}` : ""}${flag ? ", needs you" : ""}`}
                  style={({ pressed }) => [styles.rec, { backgroundColor: pressed ? c.paper2 : c.card, borderColor: pressed ? c.ink : c.line }, pressed && styles.recDown]}>
                  <View style={styles.recHead}>
                    <Icon name={r.icon} size={14} color={c.pastel[r.tone].ink} />
                    <T v="kicker" size={9.5} color={c.ink3} numberOfLines={1} style={{ flex: 1 }}>{r.title}</T>
                    {flag ? <View style={[styles.dot, { backgroundColor: c.pastel.rose.ink }]} /> : null}
                  </View>
                  {live?.line != null
                    ? <T v="subhead" size={16.5} numberOfLines={1} color={live.started ? c.ink : c.ink3}>{live.line}</T>
                    : <View style={[styles.hold, { backgroundColor: c.skel }]} />}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 15, padding: 16, borderRadius: 22, borderWidth: 1.5 },
  standing: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 4 },
  tag: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rec: { flexGrow: 1, flexBasis: "40%", gap: 7, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5 },
  recDown: { transform: [{ translateX: 1 }, { translateY: 1 }] },
  recHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  hold: { width: 80, height: 12, borderRadius: 6, marginVertical: 3 },
});
