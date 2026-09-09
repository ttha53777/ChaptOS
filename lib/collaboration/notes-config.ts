/** Server-controlled pilot. Empty by default; existing UI stays on legacy notes. */
export function collaborativeNotesEnabled(orgId: number): boolean {
  return (process.env.COLLABORATIVE_NOTES_ORG_IDS ?? "").split(",").some(id => id.trim() === String(orgId));
}

export function notesRealtimeEnabled(): boolean {
  return process.env.COLLABORATIVE_NOTES_REALTIME === "1";
}
