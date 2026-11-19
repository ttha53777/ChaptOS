/**
 * More: the website's sidebar on the phone (the web's phone bar opens the same drawer).
 * Your card at the top (mock `.mecard`: taped, tap for your card, where you change your
 * photo and name); then the sidebar's groups under the web's headings, in the web's order
 * and gating, with the org's words (~/more/model sidebarFor); then Yours, my own records
 * (yoursFor); then this phone, leaving the chapter, deleting your account and signing out
 * (plain on purpose).
 *
 * Every page is an index card (mock `.ix`: a tilted tile, the name, a mono live line, a
 * badge when something needs you; "Not started" while there's nothing yet). Each live
 * line reads the same query its page does, so opening a card shows it already filled.
 */
import { usePendingExcuses } from "~/data/meetings";
import { useProgramming } from "~/data/programming";
import { useMedia } from "~/data/media";
import { useParties } from "~/data/parties";
import { canManage as canParties } from "~/parties/model";
import { canManage as canMedia, mediaToday } from "~/media/model";
import { canManage } from "~/programming/model";
import { canAttendance } from "~/meetings/model";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useCalendar, useMyAttendance, useMyExcuses } from "~/data/calendar";
import { localDay } from "~/data/home";
import { useDocs, useFundraisers, useMyDues, useParticipation, useServiceEvents } from "~/data/more";
import { useReimbursements, useTreasury } from "~/data/money";
import { useRoster, useTasks } from "~/data/tasks";
import { config } from "~/config";
import { useEntryOf } from "~/entry/EntryContext";
import { signOutHere } from "~/entry/session";
import { Icon } from "~/icons/Icon";
import { MemberCard } from "~/members/MemberCard";
import { titleOf } from "~/members/model";
import {
  attendanceLive, docsLive, mediaLive, meetingsLive, partiesLive, programmingLive, duesLive, excusesLive, fundraisersLive, myMeetings, reimbursementsLive, serviceLive, sidebarFor, tasksLive, treasuryLive, yoursFor,
  type Live, type Page, type PageId,
} from "~/more/model";
import { viewerOf } from "~/tasks/model";
import { Button } from "~/paper/Button";
import { Avatar, Kicker, Surface, Tape, Tile } from "~/paper/bits";
import { Screen } from "~/shell/Screen";
import { useTheme } from "~/theme/PaperProvider";
import { NavRow } from "~/ui/NavRow";
import { T } from "~/ui/T";

export default function More() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const roster = useRoster();
  const [card, setCard] = useState(false);
  const me = entry?.me;
  const groups = useMemo(() => (me ? sidebarFor(me) : []), [me]);
  const yours = useMemo(() => (me ? yoursFor(me) : []), [me]);
  const viewer = useMemo(() => (me ? viewerOf(me) : null), [me]);
  const on = (id: PageId) => yours.some(p => p.id === id) || groups.some(g => g.pages.some(p => p.id === id));
  const today = localDay();

  const cal = useCalendar();
  const att = useMyAttendance();
  const excuses = useMyExcuses();
  const svc = useServiceEvents(on("service"));
  const parts = useParticipation(on("service"));
  const dues = useMyDues(me?.id ?? 0, !!me && on("dues"));
  const docs = useDocs(on("docs"));
  const funds = useFundraisers(on("fundraisers"));
  const reimb = useReimbursements(on("reimbursements"));
  const treasury = useTreasury(on("treasury"));
  const tasks = useTasks(on("tasks"));
  const prog = useProgramming(on("programming"));
  const parties = useParties(on("parties"));
  const media = useMedia(on("media"));
  const pending = usePendingExcuses(!!me && on("meetings") && canAttendance(me));

  if (!entry || !me) return null;
  const mine = roster.data?.find(b => b.id === me.id) ?? null;
  const meetings = cal.data && att.data && excuses.data ? myMeetings(cal.data, att.data.attendedEventIds, excuses.data, today) : null;
  const live: Partial<Record<PageId, Live>> = {
    tasks: tasksLive(tasks.data, viewer, today),
    programming: programmingLive(prog.data, today, !!me && canManage(me)),
    parties: partiesLive(parties.data, today, !!me && canParties(me)),
    media: mediaLive(media.data, mediaToday(me.org?.timeZone), canMedia(me)),
    meetings: meetingsLive(cal.data, today, (pending.data ?? []).filter(x => x.status === "pending").length),
    attendance: attendanceLive(meetings),
    service: serviceLive(svc.data, parts.data, me.id, me.org?.thresholds.serviceHoursGoal ?? 0),
    dues: duesLive(dues.data),
    reimbursements: reimbursementsLive(reimb.data, me.id),
    treasury: treasuryLive(treasury.data),
    excuses: excusesLive(excuses.data),
    docs: docsLive(docs.data),
    fundraisers: fundraisersLive(funds.data, today),
  };
  const refresh = () => Promise.all([roster.refetch(), cal.refetch(), att.refetch(), excuses.refetch(), svc.refetch(), parts.refetch(), dues.refetch(), docs.refetch(), funds.refetch(), reimb.refetch(), treasury.refetch(), tasks.refetch(), prog.refetch(), parties.refetch(), media.refetch()]);
  const sections = [...groups, ...(yours.length ? [{ label: "Yours", pages: yours }] : [])];
  // tilts keep alternating down the whole page, not restarting per group
  const offset = sections.map((_, i) => sections.slice(0, i).reduce((n, g) => n + g.pages.length, 0));

  return (
    <Screen title="More" large org onRefresh={refresh}>
      <MeCard name={mine?.name ?? me.name} title={mine ? titleOf(mine) : me.role} org={me.org?.name ?? ""} avatar={me.avatarUrl}
        onPress={() => setCard(true)} />

      {sections.map((g, gi) => (
        <View key={g.label} style={{ gap: 10 }}>
          <View style={styles.head}>
            <T v="label" color={c.ink3} accessibilityRole="header">{g.label}</T>
          </View>
          <View style={styles.grid}>
            {g.pages.map((p, i) => (
              <IndexCard key={p.id} page={p} live={live[p.id] ?? { line: null, badge: 0, started: true }} i={offset[gi]! + i}
                onPress={() => router.push(`/more/${p.id}` as Href)} />
            ))}
            {Array.from({ length: (3 - (g.pages.length % 3)) % 3 }, (_, k) => <View key={`f${k}`} style={styles.ixFill} />)}
          </View>
        </View>
      ))}

      <Surface style={styles.list}>
        <NavRow icon="sun" tone="butter" title="On this phone" meta="Day, night or follow the system" onPress={() => router.push("/more/phone")} />
        <NavRow icon="door" tone="peach" title={`Leave ${me.org?.name ?? "this chapter"}`} meta="Come off this roster; your row here goes with you" onPress={() => router.push("/more/leave")} />
        <NavRow icon="trash" tone="rose" title="Delete my account" meta="Every chapter, for good" onPress={() => router.push("/more/account")} last />
      </Surface>
      <Button label="Sign out" variant="ghost" icon="out" onPress={() => void signOutHere()} />

      {__DEV__ ? (
        <Surface dashed style={styles.dev}>
          <Kicker label="Dev" tone="sky" />
          <T v="meta" color={c.ink3}>{`${config.variant} · v${config.appVersion} · ${config.apiUrl}`}</T>
          <Button label="Motion Lab" variant="soft" icon="spark" onPress={() => router.push("/lab")} />
        </Surface>
      ) : null}

      {mine ? <MemberCard member={card ? mine : null} me={me} roster={roster.data ?? []} onClose={() => setCard(false)} /> : null}
    </Screen>
  );
}

function MeCard({ name, title, org, avatar, onPress }: { name: string; title: string; org: string; avatar: string | null; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Your card. ${name}, ${title}, ${org}`}
      style={({ pressed }) => [styles.me, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `${pressed ? 1 : 4}px ${pressed ? 1 : 4}px 0 ${c.pastel.peach.fill}`, transform: [{ rotate: pressed ? "-0.5deg" : "-0.8deg" }, { translateX: pressed ? 2 : 0 }, { translateY: pressed ? 2 : 0 }] }]}>
      <Tape width={62} rotate={2} style={{ position: "absolute", top: -9, alignSelf: "center" }} />
      <Avatar name={name} uri={avatar} tone="peach" style={{ width: 46, height: 46, borderRadius: 23, transform: [{ rotate: "-3deg" }] }} />
      <View style={{ flex: 1 }}>
        <T v="subhead" numberOfLines={1}>{name}</T>
        <T v="meta" color={c.ink3} numberOfLines={1}>{title} · {org}</T>
      </View>
      <Icon name="chev-r" size={16} color={c.ink3} />
    </Pressable>
  );
}

function IndexCard({ page, live, i, onPress }: { page: Page; live: Live; i: number; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${page.title}. ${live.line ?? "Loading"}${live.badge ? `. ${live.badge} needs you` : ""}`}
      style={({ pressed }) => [styles.ix, {
        backgroundColor: c.card, borderColor: c.line, boxShadow: c.sh1,
        transform: [{ rotate: `${[-0.6, 0.5, -0.3][i % 3]}deg` }, { scale: pressed ? 0.96 : 1 }],
      }]}>
      {live.badge ? (
        <View style={[styles.badge, { backgroundColor: c.pastel.peach.ink, borderColor: c.paper }]}>
          <T v="mono" color={c.card} style={{ fontSize: 10, fontWeight: "700" }}>{live.badge}</T>
        </View>
      ) : null}
      <Tile icon={page.icon} tone={page.tone} rotate={-5} />
      <T v="callout" numberOfLines={1} style={{ fontSize: 13.5 }}>{page.title}</T>
      <T v="mono" color={c.ink3} numberOfLines={1} style={{ fontSize: 10, opacity: live.started ? 1 : 0.7 }}>{live.line ?? " "}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  me: { flexDirection: "row", alignItems: "center", gap: 13, padding: 15, borderRadius: 16, borderWidth: 1.5, marginTop: 8 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ixFill: { width: "31%", flexGrow: 1 },
  ix: { width: "31%", flexGrow: 1, alignItems: "center", gap: 6, paddingTop: 15, paddingBottom: 11, paddingHorizontal: 6, borderWidth: 1.5,
    borderTopLeftRadius: 6, borderTopRightRadius: 14, borderBottomRightRadius: 8, borderBottomLeftRadius: 12 },
  badge: { position: "absolute", top: -7, right: -5, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 2, transform: [{ rotate: "6deg" }] },
  list: { overflow: "hidden", padding: 0 },
  dev: { padding: 16, gap: 10 },
});
