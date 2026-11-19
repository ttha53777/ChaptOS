/**
 * Whether the active chapter has no active term. Attendance, excuses and check-in count
 * toward the active term, and the server refuses those writes without one (400 "No active
 * semester"), so screens show a quiet note instead of offering them (U2: "never an error").
 * Only an explicit null counts: a /me cached from before `activeTerm` existed reads as
 * undefined, and is treated as having one.
 */
import { useEntryOf } from "~/entry/EntryContext";

export const NO_TERM_LINE = "The chapter hasn't started a term yet. Attendance and excuses open when it does.";

export function useNoTerm(): boolean {
  return useEntryOf("ready")?.me.org?.activeTerm === null;
}
