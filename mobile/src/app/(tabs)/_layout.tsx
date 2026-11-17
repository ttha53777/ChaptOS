/**
 * The member's tabs: Today · Timeline · Tasks · Members · More (build plan
 * Phase 3). Only the shell exists so far; each tab's content is UI phase U1/U2.
 */
import { Tabs } from "expo-router";
import { Icon, type IconName } from "~/icons/Icon";
import { useTheme } from "~/theme/PaperProvider";
import { resolveType } from "~/theme/type";
import { useFontScale } from "~/theme/PaperProvider";

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: "today", title: "Today", icon: "home" },
  { name: "timeline", title: "Timeline", icon: "timeline" },
  { name: "tasks", title: "Tasks", icon: "clip" },
  { name: "members", title: "Members", icon: "people" },
  { name: "more", title: "More", icon: "menu" },
];

export default function TabsLayout() {
  const { c } = useTheme();
  const scale = useFontScale();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.paper },
        tabBarActiveTintColor: c.ink,
        tabBarInactiveTintColor: c.ink3,
        tabBarStyle: { backgroundColor: c.paper, borderTopColor: c.line },
        tabBarLabelStyle: resolveType("tab", Math.min(scale, 1.2)),
        tabBarAllowFontScaling: false,
      }}
    >
      {TABS.map(t => (
        <Tabs.Screen key={t.name} name={t.name}
          options={{ title: t.title, tabBarIcon: ({ color, size }) => <Icon name={t.icon} color={String(color)} size={Math.min(size, 24)} /> }} />
      ))}
    </Tabs>
  );
}
