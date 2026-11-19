import { TabStack } from "~/shell/TabStack";

// A page reached from another tab (Today's dues row opens the dues book) keeps More's
// index under it, so its back button lands on More rather than leaving the tab.
export const unstable_settings = { initialRouteName: "index" };

export default TabStack;
