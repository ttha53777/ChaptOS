/**
 * Operational event registry.
 *
 * Naming: `subject.verb` (e.g. "excuse.approved", "transaction.created").
 * Each action declares its subject type + metadata shape — strong typing without
 * an exploding union. Add to this registry when introducing a new event.
 *
 * Used by: emit() (validates action exists, types metadata), on() (subscribes
 * handlers by action), Phase 3 workflow registry (declares transitions over
 * actions).
 */

export type SubjectType =
  | "AttendanceExcuse"
  | "AttendanceRecord"
  | "Transaction"
  | "Budget"
  | "Role"
  | "BrotherRole"
  | "Brother"
  | "CalendarEvent"
  | "ServiceEvent"
  | "PartyEvent"
  | "Deadline"
  | "InstagramTask"
  | "Doc"
  | "ChapterAnnouncement"
  | "Semester";

// Metadata schemas per action. Each key is an Action; each value is the shape
// passed to emit() and received by handlers. Keep payloads small and stable —
// these get serialized to JSONB and queried for projections.
export interface EventMetadata {
  // Attendance / Excuses
  "excuse.submitted":   { brotherId: number; calendarEventId: number; semesterId: number; reason: string; isRetroactive: boolean; autoApproved: boolean };
  "excuse.approved":    { brotherId: number; calendarEventId: number; semesterId: number; eventTitle: string };
  "excuse.rejected":    { brotherId: number; calendarEventId: number; semesterId: number; eventTitle: string; rejectionNote: string | null };
  "attendance.recorded":{ calendarEventId: number; semesterId: number; eventTitle: string; presentCount: number; eligibleCount: number };

  // Transactions / Budget
  "transaction.created":      { type: "income" | "expense"; category: string; amount: number; description: string };
  "transaction.updated":      { description: string; changedFields: string[] };
  "transaction.soft_deleted": { description: string; amount: number };
  "budget.upserted":          { semester: string; allocationCount: number };

  // Roles / Brothers
  "role.created":  { name: string; rank: number };
  "role.updated":  { name: string; changedFields: string[] };
  "role.deleted":  { name: string; affectedBrothers: number };
  "role.granted":  { roleName: string; brotherName: string; brotherId: number };
  "role.revoked":  { roleName: string; brotherName: string; brotherId: number };
  "brother.added":   { name: string; role: string };
  "brother.updated": { name: string; changedFields: string[] };
  "brother.removed": { name: string };
  "brother.admin_changed": { name: string; isAdmin: boolean };
  "brother.account_unlinked": { name: string; bySelf: boolean };

  // Calendar / Events
  "calendar.created":  { title: string; date: string; category: string };
  "calendar.updated":  { title: string; changedFields: string[] };
  "calendar.deleted":  { title: string };
  "service_event.created": { title: string; date: string; calendarEventId: number };
  "service_event.updated": { title: string; changedFields: string[] };
  "service_event.deleted": { title: string };
  "party.created":     { name: string; date: string };
  "party.updated":     { name: string; changedFields: string[] };
  "party.completed":   { name: string; date: string };
  "party.deleted":     { name: string };

  // Items
  "deadline.created":      { title: string; dueDate: string };
  "deadline.updated":      { title: string; changedFields: string[] };
  "deadline.deleted":      { title: string };
  "instagram_task.created": { title: string; dueDate: string };
  "instagram_task.updated": { title: string; changedFields: string[] };
  "instagram_task.deleted": { title: string };
  "doc.created": { title: string; url: string };
  "doc.updated": { title: string; changedFields: string[] };
  "doc.deleted": { title: string };

  // Misc
  "announcement.updated": { title: string };
  "semester.created":     { label: string };
  "semester.activated":   { label: string };
}

export type Action = keyof EventMetadata;

const KNOWN_ACTIONS = new Set<Action>([
  "excuse.submitted", "excuse.approved", "excuse.rejected", "attendance.recorded",
  "transaction.created", "transaction.updated", "transaction.soft_deleted", "budget.upserted",
  "role.created", "role.updated", "role.deleted", "role.granted", "role.revoked",
  "brother.added", "brother.updated", "brother.removed", "brother.admin_changed", "brother.account_unlinked",
  "calendar.created", "calendar.updated", "calendar.deleted",
  "service_event.created", "service_event.updated", "service_event.deleted",
  "party.created", "party.updated", "party.completed", "party.deleted",
  "deadline.created", "deadline.updated", "deadline.deleted",
  "instagram_task.created", "instagram_task.updated", "instagram_task.deleted",
  "doc.created", "doc.updated", "doc.deleted",
  "announcement.updated", "semester.created", "semester.activated",
]);

export function isKnownAction(action: string): action is Action {
  return KNOWN_ACTIONS.has(action as Action);
}

/**
 * Map an action to a default ActivityLog type + human-readable verb for the
 * dual-write shim. Lets us derive feed-friendly strings from structured events
 * during the Phase 2.5→3 transition.
 */
export function defaultActivityType(action: Action): "success" | "warning" | "info" {
  if (action.endsWith(".deleted") || action.endsWith(".soft_deleted") || action.endsWith(".rejected") || action === "brother.removed") return "warning";
  if (action.endsWith(".approved") || action.endsWith(".completed") || action.endsWith(".granted") || action.endsWith(".activated") || action === "brother.added") return "success";
  return "info";
}
