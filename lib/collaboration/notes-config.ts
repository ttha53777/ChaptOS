/** Server-controlled rollout: '*' enables every current and future organization. */
export function collaborativeNotesEnabled(orgId: number): boolean {
  return (process.env.COLLABORATIVE_NOTES_ORG_IDS ?? "").split(",").some(id => {
    const value = id.trim();
    return value === "*" || value === String(orgId);
  });
}

export function notesRealtimeEnabled(): boolean {
  return process.env.COLLABORATIVE_NOTES_REALTIME === "1";
}
