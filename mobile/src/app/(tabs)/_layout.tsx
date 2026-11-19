/**
 * The tabs, as the website's phone bar has them: Home · Timeline · [Create] · Members ·
 * More (Tasks and the other pages live in More). Create isn't a route: the bar draws it
 * between Timeline and Members and it opens a sheet. Each tab is its own stack
 * (src/shell/TabStack); switching tabs drops the stack you left (popToTopOnBlur), as the
 * mock's popAll does. The bar itself is src/shell/TabBar.
 */
import { Tabs } from "expo-router/js-tabs";
import { useLivePreload } from "~/data/home";
import { TabBar } from "~/shell/TabBar";
import { useTheme } from "~/theme/PaperProvider";

const TABS = [
  { name: "today", title: "Home" },
  { name: "timeline", title: "Timeline" },
  { name: "members", title: "Members" },
  { name: "more", title: "More" },
] as const;

export default function TabsLayout() {
  const { c } = useTheme();
  // The live check-in is fetched as the app comes to the foreground, so the band and the
  // ticket are already current when someone opens the app at a meeting.
  useLivePreload();
  return (
    <Tabs
      tabBar={props => <TabBar {...props} />}
      screenOptions={{ headerShown: false, popToTopOnBlur: true, sceneStyle: { backgroundColor: c.paper } }}
    >
      {TABS.map(t => <Tabs.Screen key={t.name} name={t.name} options={{ title: t.title }} />)}
    </Tabs>
  );
}
