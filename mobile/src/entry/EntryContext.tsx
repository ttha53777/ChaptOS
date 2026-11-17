import { createContext, useContext } from "react";
import type { Entry } from "./useEntry";

/** The root layout computes the entry state once and hands it to every screen. */
export const EntryContext = createContext<Entry>({ kind: "loading" });
export const useEntryState = () => useContext(EntryContext);

/** For a screen that only renders under one entry kind (its route is guarded). */
export function useEntryOf<K extends Entry["kind"]>(kind: K): Extract<Entry, { kind: K }> | null {
  const entry = useEntryState();
  return entry.kind === kind ? (entry as Extract<Entry, { kind: K }>) : null;
}
