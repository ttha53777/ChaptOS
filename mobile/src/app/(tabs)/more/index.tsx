/**
 * More: the sidebar's replacement (the app has no sidebar, by decision; see
 * docs/mobile-web-parity-plan.md). Its one job is getting you to a page with as little
 * in the way as possible, so every page sits above the fold.
 *
 *   you        one row: your photo, name and "<title> · <chapter>". Tapping it opens the
 *              You sheet (~/more/YouSheet): standing and your own records (Attendance,
 *              Excuses, Dues, Reimbursements), which are not on the page itself. With more
 *              than one chapter, the chapter's stamp beside it opens the switcher
 *   map        "Where to?" over every page the web sidebar would show, in its groups
 *              (Chapter · Operations) and the org's nav order, with the org's words. Each
 *              page is a door (~/more/PageDoor) with its live line, and a badge when
 *              something there needs you: overdue tasks (rose), wrap-ups due, fundraisers
 *              to count up, reimbursements waiting (all already gated on /me)
 *   settings   under its own "Settings" rule: Chapter settings (everyone; its line names the
 *              sections you can open) and Invite people (MANAGE_SETTINGS; "approve requests"
 *              only with MANAGE_BROTHERS, which is what reviewing a join request needs)
 *   this phone Appearance (System · Day · Night) inline, Sign out; then Leave and Delete
 *              account, quiet, at the bottom
 *
 * Haptics: only on commits: an appearance change (Segmented) and a chapter switch
 * (OrgSheet). Opening a page, a sheet, a card or a Settings row is navigation and stays silent.
 */
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { config } from "~/config";
import { useCalendar, useMyAttendance, useMyExcuses } from "~/data/calendar";
import { localDay } from "~/data/home";
import { useMedia } from "~/data/media";
import { useReimbursements, useTreasury } from "~/data/money";
import { useDocs, useFundraisers, useMyDues, useParticipation, useServiceEvents } from "~/data/more";
import { useParties } from "~/data/parties";
import { useProgramming } from "~/data/programming";
import { useRoster, useTasks } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { signOutHere } from "~/entry/session";
import { Icon, type IconName } from "~/icons/Icon";
import { MemberCard } from "~/members/MemberCard";
import { titleOf } from "~/members/model";
import {
  attendanceLive, docsLive, duesLive, excusesLive, fundraisersLive, mediaLive, meetingsLive, myMeetings, overdueMine, pageBadges,
  pageGroupsFor, partiesLive, programmingLive, reimbursementsLive, serviceLive, tasksLive, treasuryLive, yoursFor, type Live, type PageId,
} from "~/more/model";
import { DoorGrid, PageDoor } from "~/more/PageDoor";
import { YouSheet } from "~/more/YouSheet";
import { canManage as managesParties } from "~/parties/model";
import { Button } from "~/paper/Button";
import { Avatar, Kicker, Surface } from "~/paper/bits";
import { OrgSheet, StampFace } from "~/shell/OrgStamp";
import { Screen } from "~/shell/Screen";
import { can, settingsLine } from "~/settings/model";
import { viewerOf } from "~/tasks/model";
import type { Tone } from "~/theme/palette";
import { usePaperSettings, useTheme } from "~/theme/PaperProvider";
import { Segmented } from "~/ui/Segmented";
import { T } from "~/ui/T";

export default function More() {
  const { c } = useTheme();
  const settings = usePaperSettings();
  const entry = useEntryOf("ready");
  const me = entry?.me;
  const [card, setCard] = useState(false);
  const [you, setYou] = useState(false);
  const [youSeen, setYouSeen] = useState(false);
  const [orgs, setOrgs] = useState(false);

  const groups = useMemo(() => (me ? pageGroupsFor(me) : []), [me]);
  const yours = useMemo(() => (me ? yoursFor(me) : []), [me]);
  const viewer = useMemo(() => (me ? viewerOf(me) : null), [me]);
  const has = useMemo(() => {
    const ids = new Set<PageId>(groups.flatMap(g => g.pages.map(p => p.id)));
    return (id: PageId) => ids.has(id);
  }, [groups]);
  const mineHas = (id: PageId) => yours.some(p => p.id === id);
  const today = localDay();

  // Each door's live line, only for the pages this chapter has. Most are already cached
  // from the pages themselves.
  const roster = useRoster();
  const tasks = useTasks(has("tasks"));
  const cal = useCalendar();
  const docs = useDocs(has("docs"));
  const media = useMedia(has("media"));
  const programming = useProgramming(has("programming"));
  const svcEvents = useServiceEvents(has("service"));
  const svcRows = useParticipation(has("service"));
  const parties = useParties(has("parties"));
  const fundraisers = useFundraisers(has("fundraisers"));
  const treasury = useTreasury(has("treasury"));
  // The You sheet's records: started the first time it opens.
  const att = useMyAttendance();
  const excuses = useMyExcuses();
  const dues = useMyDues(me?.id ?? 0, !!me && youSeen && mineHas("dues"));
  const reimb = useReimbursements(youSeen && mineHas("reimbursements"));

  if (!entry || !me) return null;
  const mine = roster.data?.find(b => b.id === me.id) ?? null;
  const name = mine?.name ?? me.name;
  const org = me.org;
  const many = me.memberships.length > 1;
  const canInvite = can(me, "MANAGE_SETTINGS");
  const canReview = can(me, "MANAGE_BROTHERS");

  const badges: Partial<Record<PageId, number>> = pageBadges(me, overdueMine(me, tasks.data, viewer, today), today);
  const lives: Partial<Record<PageId, Live>> = {
    tasks: tasksLive(tasks.data, viewer, today),
    meetings: meetingsLive(cal.data, today, 0),
    docs: docsLive(docs.data),
    media: mediaLive(media.data, today, false),
    programming: programmingLive(programming.data, today, false),
    service: serviceLive(svcEvents.data, svcRows.data, me.id, org?.thresholds.serviceHoursGoal ?? 10),
    parties: partiesLive(parties.data, today, managesParties(me)),
    fundraisers: fundraisersLive(fundraisers.data, today),
    treasury: treasuryLive(treasury.data),
  };
  const meetingsMine = cal.data && att.data && excuses.data ? myMeetings(cal.data, att.data.attendedEventIds, excuses.data, today) : null;
  const records: Partial<Record<PageId, Live>> = {
    attendance: attendanceLive(meetingsMine),
    excuses: excusesLive(excuses.data),
    dues: duesLive(dues.data),
    reimbursements: reimbursementsLive(reimb.data, me.id),
  };

  const go = (id: PageId) => router.push(`/more/${id}` as Href);
  const openYou = () => { setYouSeen(true); setYou(true); };
  const refresh = () => Promise.all([
    roster.refetch(), cal.refetch(),
    has("tasks") ? tasks.refetch() : null, has("docs") ? docs.refetch() : null, has("media") ? media.refetch() : null,
    has("programming") ? programming.refetch() : null, has("service") ? Promise.all([svcEvents.refetch(), svcRows.refetch()]) : null,
    has("parties") ? parties.refetch() : null, has("fundraisers") ? fundraisers.refetch() : null, has("treasury") ? treasury.refetch() : null,
  ]);

  let n = 0; // running index across groups: the arrival stagger and the tiles' tilts
  return (
    <Screen title="More" onRefresh={refresh}>
      {/* you, in one row */}
      <View style={styles.youRow}>
        <Pressable onPress={openYou} accessibilityRole="button" accessibilityLabel={`${name}, ${mine ? titleOf(mine) : me.role}`} accessibilityHint="Shows your standing and records"
          style={({ pressed }) => [styles.you, { backgroundColor: pressed ? c.paper2 : c.card, borderColor: pressed ? c.ink : c.line, boxShadow: c.sh1 }]}>
          <Avatar name={name} uri={me.avatarUrl ?? mine?.avatarUrl ?? null} tone="lilac" px={42} ring={c.ink} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="subhead" numberOfLines={1}>{name}</T>
            <T v="meta" size={12.5} color={c.ink3} numberOfLines={1}>{`${mine ? titleOf(mine) : me.role} · ${org?.name ?? ""}`}</T>
          </View>
          <Icon name="chev-r" size={16} color={c.ink3} />
        </Pressable>
        {many ? (
          <Pressable onPress={() => setOrgs(true)} accessibilityRole="button" accessibilityLabel={`${org?.name ?? "Chapter"}. Switch chapter`} hitSlop={6}
            style={({ pressed }) => [styles.stampBtn, pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
            <StampFace org={{ name: org?.name ?? "Chapter", logoUrl: org?.logoUrl ?? null }} size={50} />
            <View style={[styles.swap, { backgroundColor: c.paper, borderColor: c.ink }]} pointerEvents="none">
              <Icon name="swap" size={11} color={c.ink} />
            </View>
          </Pressable>
        ) : null}
      </View>

      {/* where to */}
      <View style={styles.head}>
        <Kicker label="More" tone="peach" />
        <T v="hero" size={34} accessibilityRole="header">Where to<T v="hero" size={34} color={c.pastel.peach.ink}>{"\u200A?"}</T></T>
      </View>

      {groups.map(g => (
        <View key={g.label} style={styles.group}>
          <View style={styles.groupHead} accessibilityRole="header">
            <T v="kicker" color={c.ink3}>{g.label}</T>
            <View style={[styles.rule, { borderTopColor: c.line2 }]} />
          </View>
          <DoorGrid>
            {g.pages.map((p, i) => {
              const live = lives[p.id];
              const odd = g.pages.length % 2 === 1 && i === g.pages.length - 1;
              return (
                <PageDoor key={p.id} title={p.title} icon={p.icon} tone={p.tone} i={n++} wide={odd}
                  line={live?.line ?? null} warn={!!live?.line && /overdue/.test(live.line)}
                  badge={badges[p.id] ?? 0} badgeTone={p.id === "tasks" ? "rose" : "peach"} onPress={() => go(p.id)} />
              );
            })}
          </DoorGrid>
        </View>
      ))}

      {/* settings: everyone, as in the web's profile menu; Invite people with MANAGE_SETTINGS */}
      <View style={[styles.group, { marginTop: 18 }]}>
        <View style={styles.groupHead} accessibilityRole="header">
          <T v="kicker" color={c.ink3}>Settings</T>
          <View style={[styles.rule, { borderTopColor: c.line2 }]} />
        </View>
        <Surface style={styles.list}>
          <SettingsRow icon="gear" tone="lilac" title="Chapter settings" line={settingsLine(me, org?.name ?? "your chapter")}
            onPress={() => router.push("/more/settings" as Href)} />
          {canInvite ? (
            <SettingsRow icon="envelope" tone="peach" title="Invite people" line={canReview ? "Send a join link · approve requests" : "Send a join link"}
              divided onPress={() => router.push("/more/settings/invitations" as Href)} />
          ) : null}
        </Surface>
      </View>

      {/* this phone */}
      <View style={[styles.group, { marginTop: 18 }]}>
        <View style={styles.groupHead} accessibilityRole="header">
          <T v="kicker" color={c.ink3}>This phone</T>
          <View style={[styles.rule, { borderTopColor: c.line2 }]} />
        </View>
        <Surface style={styles.list}>
          <View style={styles.row}>
            <Icon name="sun" size={18} color={c.pastel.butter.ink} />
            <T v="callout" style={{ flex: 1 }}>Appearance</T>
            <Segmented label="Appearance" value={settings.appearance} onChange={v => settings.set({ appearance: v })}
              options={[{ value: "system", label: "System" }, { value: "day", label: "Day" }, { value: "night", label: "Night" }]} />
          </View>
          <Pressable onPress={() => void signOutHere()} accessibilityRole="button"
            style={({ pressed }) => [styles.row, { borderTopWidth: 1, borderTopColor: c.line, backgroundColor: pressed ? c.paper2 : "transparent" }]}>
            <Icon name="out" size={18} color={c.pastel.sky.ink} />
            <T v="callout" style={{ flex: 1 }}>Sign out</T>
          </Pressable>
        </Surface>
        <Surface dashed style={styles.list}>
          <Pressable onPress={() => router.push("/more/leave")} accessibilityRole="button" accessibilityHint="Come off this roster; your row here goes with you"
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.paper2 }]}>
            <Icon name="door" size={17} color={c.ink3} />
            <T v="callout" color={c.ink2} style={{ flex: 1 }} numberOfLines={1}>{`Leave ${org?.name ?? "this chapter"}`}</T>
          </Pressable>
          <Pressable onPress={() => router.push("/more/account")} accessibilityRole="button" accessibilityHint="Every chapter, for good"
            style={({ pressed }) => [styles.row, { borderTopWidth: 1.5, borderTopColor: c.line2, borderStyle: "dashed" }, pressed && { backgroundColor: c.paper2 }]}>
            <Icon name="trash" size={17} color={c.pastel.rose.ink} />
            <T v="callout" color={c.pastel.rose.ink} style={{ flex: 1 }}>Delete my account</T>
          </Pressable>
        </Surface>
      </View>

      {__DEV__ ? (
        <Surface dashed style={styles.dev}>
          <Kicker label="Dev" tone="sky" />
          <T v="meta" color={c.ink3}>{`${config.variant} · v${config.appVersion} · ${config.apiUrl}`}</T>
          <Button label="Motion Lab" variant="soft" icon="spark" onPress={() => router.push("/lab")} />
        </Surface>
      ) : null}

      <YouSheet open={you} onClose={() => setYou(false)} me={me} mine={mine} roster={roster.data ?? []} records={yours} lives={records}
        onRecord={id => { setYou(false); go(id); }} onCard={() => { setYou(false); setCard(true); }} />
      {many ? <OrgSheet me={me} open={orgs} onClose={() => setOrgs(false)} /> : null}
      {mine ? <MemberCard member={card ? mine : null} me={me} roster={roster.data ?? []} onClose={() => setCard(false)} /> : null}
    </Screen>
  );
}

/** A Settings row: tinted glyph chip, title, one grey line, chevron. Navigation, so no haptic. */
function SettingsRow({ icon, tone, title, line, divided, onPress }: {
  icon: IconName; tone: Tone; title: string; line: string; divided?: boolean; onPress: () => void;
}) {
  const { c } = useTheme();
  const p = c.pastel[tone];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${line}`}
      style={({ pressed }) => [styles.row, styles.setRow, divided && { borderTopWidth: 1, borderTopColor: c.line }, pressed && { backgroundColor: c.paper2 }]}>
      <View style={[styles.chip, { backgroundColor: p.soft, borderColor: p.border }]}>
        <Icon name={icon} size={18} color={p.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T v="bodyStrong" numberOfLines={1}>{title}</T>
        <T v="meta" size={12.5} color={c.ink3} numberOfLines={1}>{line}</T>
      </View>
      <Icon name="chev-r" size={16} color={c.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  youRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  you: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6, paddingLeft: 6, paddingRight: 14, borderRadius: 999, borderWidth: 1.5 },
  stampBtn: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  swap: { position: "absolute", right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  head: { gap: 6, marginTop: 14, marginBottom: 2, paddingHorizontal: 4 },
  group: { gap: 10 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
  rule: { flex: 1, borderTopWidth: 1.5, borderStyle: "dashed" },
  list: { overflow: "hidden", padding: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 54 },
  setRow: { minHeight: 62 },
  chip: { width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  dev: { padding: 16, gap: 10 },
});
