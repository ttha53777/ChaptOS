/**
 * Settings, the index (the web's settings/page.tsx at 390px, dest = "index"):
 *
 *   briefing   CONFIGURATION · "Everything, arranged." · the sub line
 *   org strip  the chapter's mark, name, "N Brothers · N Tasks · N Parties"
 *   groups     Identity / Membership / Operations / System as binder tabs (tap the tab →
 *              the group page), each a ruled sheet: lede, then a row per visible section
 *              (icon, label, blurb, chevron → the section page)
 *
 * Which rows show: sectionVisible (the web's gates), minus Billing (never in the app),
 * minus sections whose sub-phase hasn't landed (model.BUILT).
 */
import { orgInitials } from "@/lib/org-initials";
import { GROUP_LEDE, INDEX_COPY } from "@/lib/settings/nav";
import { router, type Href } from "expo-router";
import { Image, StyleSheet, View } from "react-native";
import { useParties } from "~/data/parties";
import { useRoster, useTasks } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { PageBrief } from "~/ui/PageBrief";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { DividerTab, IxRow, IxSheet } from "./bits";
import { GROUP_TONE, visibleGroups, visibleItems } from "./model";

export function SettingsIndex() {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const roster = useRoster();
  const tasks = useTasks();
  const parties = useParties();
  if (!me) return null;
  const items = visibleItems(me);
  const groups = visibleGroups(items);
  const orgName = me.org?.name ?? "Your chapter";
  const logo = me.org?.logoUrl ?? null;

  return (
    <View style={{ gap: 26 }}>
      <PageBrief kicker={INDEX_COPY.kicker} lead={INDEX_COPY.lead} mark={INDEX_COPY.mark} tail={INDEX_COPY.tail} markTone="butter" sub={INDEX_COPY.sub} />

      <View style={[styles.strip, { backgroundColor: c.card, borderColor: c.line2 }]}>
        <View style={[styles.mark, { borderColor: c.ink, backgroundColor: c.note.fill.lilac }]}>
          {logo ? <Image source={{ uri: logo }} style={{ width: 44, height: 44 }} /> : <T v="buttonSm" size={15} color={c.note.ink}>{orgInitials(orgName)}</T>}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="subhead" size={16} numberOfLines={1}>{orgName}</T>
          <T v="meta" size={12.5} color={c.ink3}>{`${roster.data?.length ?? 0} Brothers · ${tasks.data?.length ?? 0} Tasks · ${parties.data?.length ?? 0} Parties`}</T>
        </View>
      </View>

      {groups.map(g => {
        const tone = GROUP_TONE[g];
        const rows = items.filter(n => n.group === g);
        return (
          <View key={g}>
            <View style={{ alignSelf: "flex-start", marginLeft: 14 }}>
              <DividerTab label={g} tone={tone} onPress={() => router.push(`/more/settings/${g.toLowerCase()}` as Href)} />
            </View>
            <IxSheet tone={tone} lede={GROUP_LEDE[g]}>
              {rows.map((n, i) => (
                <IxRow key={n.id} icon={n.icon} label={n.label} blurb={n.blurb} tone={tone} last={i === rows.length - 1}
                  onPress={() => router.push(`/more/settings/${n.id}` as Href)} />
              ))}
            </IxSheet>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 12 },
  mark: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
