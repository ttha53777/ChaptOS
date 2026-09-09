/** Shared, browser-safe contract. Keep server configuration out of this module. */
export const NOTES_VERSION = 1 as const;
export const NOTES_TEXT_LIMIT = 50_000;
export const NOTES_BYTE_LIMIT = 1_500_000;
export const NOTES_BODY_LIMIT = 2_100_000;
export const NOTES_WIRE_LIMIT = 128 * 1024;

export interface NotesSnapshot {
  notesInitialized: true;
  id: number;
  organizationId: number;
  notesDoc: string;
  notesDocSeq: number;
  notesContentRevision: number;
  notesSummaryRevision: number | null;
  notesProtocolVersion: number;
  notesUpdatedAt: string | null;
  description: string;
}

export interface NotesSession extends NotesSnapshot {
  topic: string;
  realtime: boolean;
  actor: { id: number; authUserId: string; name: string };
}

export function notesTopic(orgId: number, eventId: number): string {
  return `notes:v1:org:${orgId}:event:${eventId}`;
}

export function notesSummaryStale(event: {
  notesInitialized?: boolean;
  notesContentRevision?: number;
  notesSummaryRevision?: number | null;
  notesUpdatedAt?: string | null;
  notesSummaryAt?: string | null;
}): boolean {
  if (event.notesInitialized && event.notesSummaryRevision == null) return true;
  if (event.notesSummaryRevision != null && event.notesContentRevision != null) {
    return event.notesSummaryRevision !== event.notesContentRevision;
  }
  return !!event.notesSummaryAt && !!event.notesUpdatedAt
    && new Date(event.notesUpdatedAt).getTime() > new Date(event.notesSummaryAt).getTime() + 2000;
}
