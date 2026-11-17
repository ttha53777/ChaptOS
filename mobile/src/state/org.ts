/**
 * The active org: the slug sent as x-org-slug on every org request, remembered
 * across launches. `null` until a stored value has been read, or when nothing is
 * remembered (then the server picks the person's first org, and the app adopts
 * whatever /api/auth/me reports).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createStore } from "./store";

const KEY = "chaptos.activeOrg";

export const activeOrg = createStore<{ ready: boolean; slug: string | null }>({ ready: false, slug: null });

AsyncStorage.getItem(KEY)
  .then(slug => activeOrg.set({ ready: true, slug }))
  .catch(() => activeOrg.set({ ready: true, slug: null }));

export function setActiveOrg(slug: string | null): void {
  if (activeOrg.get().slug === slug && activeOrg.get().ready) return;
  activeOrg.set({ ready: true, slug });
  (slug ? AsyncStorage.setItem(KEY, slug) : AsyncStorage.removeItem(KEY)).catch(() => {});
}

export const useActiveOrg = () => activeOrg.use();
