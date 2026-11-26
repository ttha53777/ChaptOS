/**
 * More → Settings → one page. `section` is either a section id (the web's focus page:
 * back to the group, the title, the italic lede, the section) or a group in lowercase
 * (the group page: every visible section in that intent, stacked; Identity's group page
 * is the Identity section under "How your chapter looks & talks").
 *
 * A section this viewer can't see, or that isn't in the app yet, falls back to the
 * index (the web's sectionFromParam + isVisible redirect). Old ?section=general /
 * vocabulary links land on Identity.
 */
import { GROUP_LEDE, GROUP_TITLE, INTENT_ORDER, sectionFromParam, type Intent } from "@/lib/settings/nav";
import { Redirect, router, useLocalSearchParams, type Href } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { queryClient } from "~/data/query";
import { useEntryOf } from "~/entry/EntryContext";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { AccountsSection } from "~/settings/Accounts";
import { DetailHead, PathIcon } from "~/settings/bits";
import { SettingsFrame } from "~/settings/frame";
import { IdentitySection } from "~/settings/Identity";
import { InvitationsSection } from "~/settings/Invitations";
import { GROUP_TONE, visibleItems, type SectionId } from "~/settings/model";
import { RolesSection } from "~/settings/Roles";
import { CalendarSection } from "~/settings/Calendar";
import { MetricsSection } from "~/settings/Metrics";
import { SemestersSection } from "~/settings/Semesters";
import { ThresholdsSection } from "~/settings/Thresholds";
import { WorkflowsSection } from "~/settings/Workflows";

const BODY: Partial<Record<SectionId, () => ReactNode>> = {
  identity: () => <IdentitySection />,
  accounts: () => <AccountsSection />,
  invitations: () => <InvitationsSection />,
  roles: () => <RolesSection />,
  thresholds: () => <ThresholdsSection />,
  semesters: () => <SemestersSection />,
  "custom-metrics": () => <MetricsSection />,
  calendar: () => <CalendarSection />,
  workflows: () => <WorkflowsSection />,
};

export default function SettingsSectionPage() {
  const { c } = useTheme();
  const { section } = useLocalSearchParams<{ section: string }>();
  const me = useEntryOf("ready")?.me ?? null;
  if (!me) return null;
  const items = visibleItems(me);
  const refresh = () => queryClient.invalidateQueries();

  const group = INTENT_ORDER.find(g => g.toLowerCase() === section) as Intent | undefined;
  if (group) {
    const rows = items.filter(n => n.group === group);
    if (rows.length === 0) return <Redirect href={"/more/settings" as Href} />;
    const tone = GROUP_TONE[group];
    if (group === "Identity") {
      return (
        <SettingsFrame title="Identity" back="Settings" onRefresh={refresh}>
          <View style={{ gap: 26 }}>
            <DetailHead kicker="Settings" tone={tone} title="How your chapter looks & talks" lede={GROUP_LEDE.Identity} />
            <IdentitySection />
          </View>
        </SettingsFrame>
      );
    }
    return (
      <SettingsFrame title={GROUP_TITLE[group]} back="Settings" onRefresh={refresh}>
        <View style={{ gap: 30 }}>
          <DetailHead kicker="Settings" tone={tone} title={GROUP_TITLE[group]} lede={GROUP_LEDE[group]} />
          {rows.map(n => (
            <View key={n.id} style={{ gap: 16 }}>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, borderColor: c.pastel[tone].border, backgroundColor: c.pastel[tone].soft, alignItems: "center", justifyContent: "center" }}>
                  <PathIcon d={n.icon} color={c.pastel[tone].ink} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="title" size={21} accessibilityRole="header" onPress={() => router.push(`/more/settings/${n.id}` as Href)}>{n.label}</T>
                  <T v="meta" size={13.5} color={c.ink3}>{n.lede}</T>
                </View>
              </View>
              {BODY[n.id]?.()}
            </View>
          ))}
        </View>
      </SettingsFrame>
    );
  }

  const id = sectionFromParam(section);
  const item = id ? items.find(n => n.id === id) : undefined;
  if (!item) return <Redirect href={"/more/settings" as Href} />;
  return (
    <SettingsFrame title={item.label} back={GROUP_TITLE[item.group]} onRefresh={refresh}>
      <View style={{ gap: 24 }}>
        <DetailHead tone={GROUP_TONE[item.group]} title={item.label} lede={item.lede} />
        {item.id === "identity" ? BODY[item.id]?.() : (
          <View style={{ borderWidth: 1.5, borderColor: c.ink, borderRadius: 18, backgroundColor: c.card, padding: 14, boxShadow: `3px 3px 0 ${c.note.fill[GROUP_TONE[item.group]]}` }}>
            {BODY[item.id]?.()}
          </View>
        )}
      </View>
    </SettingsFrame>
  );
}
