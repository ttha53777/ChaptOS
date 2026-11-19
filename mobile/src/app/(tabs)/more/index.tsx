/**
 * More: the sidebar's replacement (the app has no sidebar, by decision; see
 * docs/mobile-web-parity-plan.md). Not a drawer and not grouped under headings:
 *
 *   Pages   one flat grid of the web sidebar's pages in the org's nav order, with the
 *           org's words and the sidebar's glyphs, in the Create sheet's tile look
 *           (~/web/TileGrid). Badges are the web's "Needs you" dots and the phone bar's
 *           More badge: my overdue tasks (rose), wrap-ups due, fundraisers to count up,
 *           reimbursements waiting. Each count comes from /me, already gated.
 *   Yours   (app-only keep) my own records: Attendance, Excuses, Dues, Reimbursements, as
 *           a second grid. Badged when something needs me (an excuse not accepted, dues
 *           late).
 *   You     what the web's SidebarProfile menu holds: your card (photo, name, standing),
 *           Appearance (On this phone), Sign out, then Leave and Delete account.
 *
 * Tapping a tile pushes its page on this tab's stack.
 */
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { config } from "~/config";
import { localDay } from "~/data/home";
import { useMyDues } from "~/data/more";
import { useMyExcuses } from "~/data/calendar";
import { useRoster, useTasks } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { signOutHere } from "~/entry/session";
import { MemberCard } from "~/members/MemberCard";
import { titleOf } from "~/members/model";
import { duesLive, excusesLive, overdueMine, pageBadges, pagesFor, yoursFor, type PageId } from "~/more/model";
import { Button } from "~/paper/Button";
import { Avatar, Kicker, Surface } from "~/paper/bits";
import { Screen } from "~/shell/Screen";
import { viewerOf } from "~/tasks/model";
import { useTheme } from "~/theme/PaperProvider";
import { NavRow } from "~/ui/NavRow";
import { T } from "~/ui/T";
import { GridTile, TileGrid } from "~/web/TileGrid";

export default function More() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const roster = useRoster();
  const [card, setCard] = useState(false);
  const me = entry?.me;
  const pages = useMemo(() => (me ? pagesFor(me) : []), [me]);
  const yours = useMemo(() => (me ? yoursFor(me) : []), [me]);
  const viewer = useMemo(() => (me ? viewerOf(me) : null), [me]);
  const today = localDay();
  const has = (id: PageId) => pages.some(p => p.id === id) || yours.some(p => p.id === id);

  const tasks = useTasks(has("tasks"));
  const excuses = useMyExcuses();
  const dues = useMyDues(me?.id ?? 0, !!me && has("dues"));

  if (!entry || !me) return null;
  const mine = roster.data?.find(b => b.id === me.id) ?? null;
  const badges: Partial<Record<PageId, number>> = {
    ...pageBadges(me, overdueMine(me, tasks.data, viewer, today), today),
    excuses: excusesLive(excuses.data).badge,
    dues: duesLive(dues.data).badge,
  };
  const go = (id: PageId) => router.push(`/more/${id}` as Href);
  const refresh = () => Promise.all([roster.refetch(), tasks.refetch(), excuses.refetch(), dues.refetch()]);

  return (
    <Screen title="More" toolbar={{ kicker: "More", title: me.org?.name ?? "Pages" }} onRefresh={refresh}>
      <TileGrid count={pages.length}>
        {pages.map((p, i) => (
          <GridTile key={p.id} label={p.title} icon={p.icon} tone={p.tone} i={i} onPress={() => go(p.id)}
            badge={badges[p.id] ?? 0} badgeTone={p.id === "tasks" ? "rose" : "peach"} />
        ))}
      </TileGrid>

      {yours.length ? (
        <View style={styles.section}>
          <Kicker label="Yours" tone="butter" />
          <TileGrid count={yours.length}>
            {yours.map((p, i) => (
              <GridTile key={p.id} label={p.title} icon={p.icon} tone={p.tone} i={i} onPress={() => go(p.id)} badge={badges[p.id] ?? 0} />
            ))}
          </TileGrid>
        </View>
      ) : null}

      <View style={styles.section}>
        <Kicker label="You" tone="mint" />
        <Surface style={styles.list}>
          <NavRow
            leading={<Avatar name={mine?.name ?? me.name} uri={me.avatarUrl} tone="mint" size="md" />}
            title={mine?.name ?? me.name}
            meta={`${mine ? titleOf(mine) : me.role} · ${me.org?.name ?? ""}`}
            onPress={() => setCard(true)}
          />
          <NavRow icon="sun" tone="butter" title="Appearance" meta="Dark, light or follow the system" onPress={() => router.push("/more/phone")} />
          <NavRow icon="out" tone="sky" title="Sign out" onPress={() => void signOutHere()} last />
        </Surface>
        <Surface style={styles.list}>
          <NavRow icon="door" tone="peach" title={`Leave ${me.org?.name ?? "this chapter"}`} meta="Come off this roster; your row here goes with you" onPress={() => router.push("/more/leave")} />
          <NavRow icon="trash" tone="rose" title="Delete my account" meta="Every chapter, for good" onPress={() => router.push("/more/account")} last />
        </Surface>
      </View>

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

const styles = StyleSheet.create({
  section: { gap: 10, marginTop: 6 },
  list: { overflow: "hidden", padding: 0 },
  dev: { padding: 16, gap: 10 },
});
