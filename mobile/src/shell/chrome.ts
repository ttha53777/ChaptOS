/**
 * App-wide chrome state that more than one host reads:
 *   stacked   a sheet is open, so the canvas has scaled back (status bar goes light,
 *             toasts drop to the bottom edge over the sheet, as in the mock)
 *   tabBar    height of the tab bar while the tabs are mounted (0 elsewhere), so the
 *             snackbar rides just above it
 */
import { createStore } from "~/state/store";

export const chrome = createStore<{ stacked: boolean; tabBar: number }>({ stacked: false, tabBar: 0 });

export function setChrome(patch: Partial<ReturnType<typeof chrome.get>>): void {
  const prev = chrome.get();
  const next = { ...prev, ...patch };
  if (next.stacked === prev.stacked && next.tabBar === prev.tabBar) return;
  chrome.set(next);
}

export const useChrome = () => chrome.use();
