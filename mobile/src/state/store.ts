import { useSyncExternalStore } from "react";

/** A tiny external store: get/set/subscribe plus a hook. Enough for the few
 *  app-wide values that aren't server data (active org, update gate). */
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach(l => l());
    },
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    use(): T { return useSyncExternalStore(this.subscribe, this.get, this.get); },
  };
}
