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
  | "TransactionCategory"
  | "Budget"
  | "Role"
  | "BrotherRole"
  | "Brother"
  | "CalendarEvent"
  | "CalendarEventType"
  | "ProgrammingEvent"
  | "EventFieldDefinition"
  | "ServiceEvent"
  | "ServiceParticipation"
  | "PartyEvent"
  | "Task"
  | "Poll"
  | "InstagramTask"
  | "Doc"
  | "DocFolder"
  | "ChapterAnnouncement"
  | "Semester"
  | "Organization"
  | "OrgInvite"
  | "JoinRequest"
  | "OrgMetricDefinition"
  | "BrotherMetricValue"
  | "Reimbursement"
  | "DuesPayment"
  | "ChatApproval"
  | "Subscription"
  | "SalesLead";

// Metadata schemas per action. Each key is an Action; each value is the shape
// passed to emit() and received by handlers. Keep payloads small and stable —
// these get serialized to JSONB and queried for projections.
export interface EventMetadata {
  // Attendance / Excuses
  "excuse.submitted":   { brotherId: number; calendarEventId: number; semesterId: number; reason: string; isRetroactive: boolean; autoApproved: boolean };
  "excuse.approved":    { brotherId: number; brotherName: string; calendarEventId: number; semesterId: number; eventTitle: string };
  "excuse.rejected":    { brotherId: number; brotherName: string; calendarEventId: number; semesterId: number; eventTitle: string; rejectionNote: string | null };
  "attendance.recorded":{ calendarEventId: number; semesterId: number; eventTitle: string; presentCount: number; eligibleCount: number };
  "exemption.changed":  { brotherId: number; semesterId: number };

  // Transactions / Budget
  "transaction.created":      { type: "income" | "expense"; category: string; amount: number; description: string };
  "transaction.updated":      { description: string; changedFields: string[] };
  "transaction.soft_deleted": { description: string; amount: number };
  "budget.upserted":          { semester: string; allocationCount: number };
  "transaction_category.created": { kind: string; slug: string; label: string };
  "transaction_category.updated": { kind: string; slug: string; label: string; changedFields: string[] };
  "transaction_category.hidden":  { kind: string; slug: string; label: string; hidden: boolean };
  "transaction_category.deleted": { kind: string; slug: string; label: string };
  "treasury.opening_balance.set": { openingBalance: number };

  // Roles / Brothers
  "role.created":  { name: string; rank: number };
  "role.updated":  { name: string; changedFields: string[] };
  "role.deleted":  { name: string; affectedBrothers: number };
  "role.granted":  { roleName: string; brotherName: string; brotherId: number };
  "role.revoked":  { roleName: string; brotherName: string; brotherId: number };
  "brother.claimed":          { name: string; email: string | null; orgId: number };
  "brother.added":            { name: string; role: string };
  "brother.updated":          { name: string; changedFields: string[] };
  "brother.removed":          { name: string };
  "brother.admin_changed":    { name: string; isAdmin: boolean };
  "brother.account_unlinked": { name: string; bySelf: boolean };

  // Calendar / Events
  "calendar.created":  { title: string; date: string; category: string };
  "calendar.updated":  { title: string; changedFields: string[] };
  "calendar.deleted":  { title: string };
  "calendar_event_type.created": { slug: string; label: string };
  "calendar_event_type.updated": { slug: string; label: string; changedFields: string[] };
  "calendar_event_type.hidden":  { slug: string; label: string; hidden: boolean };
  "calendar_event_type.deleted": { slug: string; label: string };
  "programming.created": { title: string; stage: string };
  // Emitted on every programming edit, calendar-backed or not. Updates used to
  // ride on "calendar.updated" alone, which meant an Idea-stage edit emitted
  // nothing at all; moving the publish boundary from Planning to Confirmed
  // widened that silent window from one lane to two.
  "programming.updated": { title: string; stage: string; changedFields: string[] };
  "programming.stage_changed": { title: string; from: string; to: string; published: boolean };
  "programming.deleted": { title: string };
  "event_field.created": { slug: string; label: string; kind: string };
  "event_field.updated": { slug: string; label: string; changedFields: string[] };
  "event_field.deleted": { slug: string; label: string };
  "service_event.created": { title: string; date: string; calendarEventId: number };
  "service_event.updated": { title: string; changedFields: string[] };
  "service_event.deleted": { title: string };
  "service_participation.logged":  { serviceEventId: number; eventTitle: string; brotherIds: number[]; totalHours: number };
  "service_participation.removed": { serviceEventId: number; brotherId: number };
  "party.created":     { name: string; date: string };
  "party.updated":     { name: string; changedFields: string[] };
  "party.completed":   { name: string; date: string };
  "party.deleted":     { name: string };

  // Items
  "task.created":   { title: string; dueDate: string | null; assigneeCount: number };
  "task.updated":   { title: string; changedFields: string[] };
  "task.completed": { title: string };
  "task.reopened":  { title: string };
  "task.deleted":   { title: string };
  "poll.created":   { question: string; closeDate: string | null; assigneeCount: number };
  "poll.updated":   { question: string; changedFields: string[] };
  "poll.closed":    { question: string };
  "poll.reopened":  { question: string };
  "poll.deleted":   { question: string };
  "instagram_task.created": { title: string; dueDate: string };
  "instagram_task.updated": { title: string; changedFields: string[] };
  "instagram_task.deleted": { title: string };
  "doc.created": { title: string; url: string };
  "doc.updated": { title: string; changedFields: string[] };
  "doc.deleted": { title: string };
  "doc.moved":   { title: string; folderId: number | null };
  "doc.pinned":  { title: string; pinned: boolean };
  "doc.reordered": { folderId: number | null; count: number };
  "docFolder.created": { name: string };
  "docFolder.renamed": { name: string; changedFields: string[] };
  "docFolder.deleted": { name: string; releasedDocs: number };
  "docFolder.pinned":  { name: string; pinned: boolean };
  "docFolder.reordered": { count: number };

  // Misc
  "announcement.updated": { title: string };
  "semester.created":     { label: string };
  "semester.activated":   { label: string };

  // Onboarding
  "org.created": { name: string; slug: string; orgType: string; founderName: string };
  "org.config.updated": { enabledWorkflows?: string[]; vocabularyOverrides?: Record<string, string>; thresholds?: Record<string, number>; disabledFeatures?: Record<string, string[]>; customMemberFields?: string[]; navOrder?: string[] };
  "org.onboarding.completed": { orgType: string | null };
  "org.logo.updated": { cleared: boolean };

  // Membership
  "membership.left": { brotherId: number; name: string; orgName: string };

  // Invite links
  "invite.created":  { expiry: string };
  "invite.revoked":  Record<string, never>;

  // Join requests. Holding a link no longer grants anything, so there is no
  // "redeemed" event: opening a link SUBMITS, and an officer's APPROVAL is what
  // creates the roster spot. `submitted` is written directly as an
  // OperationalEvent by the pre-auth path (no ctx there, so no emit()).
  "join_request.submitted": { name: string; inviteId: number; orgId: number };
  "join_request.approved":  { name: string; brotherId: number; roleId: number | null; roleName: string | null; reused: boolean };
  "join_request.rejected":  { name: string };

  // Custom metrics
  "metric_definition.created": { slug: string; name: string };
  "metric_definition.updated": { slug: string; name: string; changedFields: string[] };
  "metric_definition.deleted": { slug: string; name: string };
  "metric_value.updated":      { brotherId: number; brotherName: string; updatedSlugs: string[] };

  // Reimbursements
  "reimbursement.created": { brotherId: number; amount: number; description: string };
  "reimbursement.updated": { status: string; brotherId: number; voidedTransactionId?: number };
  // Approval is money movement: it mints the ledger row identified by transactionId.
  // selfApproved records a treasurer approving their own request — permitted (they
  // are often the one who fronted the cash) but worth surfacing in the audit trail.
  "reimbursement.approved": { brotherId: number; amount: number; category: string; transactionId: number; selfApproved: boolean };

  // Dues. A payment is money movement: it mints the income row identified by
  // transactionId and decrements the balance in the same DB transaction, so these two
  // facts are never separable. remainingOwed is the post-write balance, from the row
  // itself — not a client's arithmetic. dues.paid now fires at APPROVAL time (see
  // dues_payment.submitted below for the staging step) — same action, same shape,
  // still means "money moved."
  "dues.paid":                { brotherId: number; amount: number; transactionId: number; remainingOwed: number };
  // An adjustment is a *receivable* change — a charge, a waiver, a correction — and
  // moves no cash, so it writes no ledger row. The reason is the audit trail that a
  // raw field overwrite never had.
  "dues.adjusted":            { brotherId: number; delta: number; reason: string | null; newOwed: number };
  "dues.payment_voided":      { brotherId: number; amount: number; transactionId: number; restoredOwed: number };
  "dues.payment_attributed":  { brotherId: number; transactionId: number };

  // A dues payment is staged here, not moved yet — see updateDuesPayment for the
  // approval that actually mints the ledger row (dues.paid, above).
  "dues_payment.submitted": { brotherId: number; amount: number; date: string };
  "dues_payment.rejected":  { brotherId: number; amount: number; rejectionNote: string | null };

  // Ask Chapt (the AI assistant). Both are emitted with { activity: false }:
  // proposal approval's feed story is already told by the underlying domain
  // event (transaction.created, task.created, …), and feedback is telemetry
  // members should never see in the feed.
  "assistant.proposal_approved": { action: string; kind: string; permission: string; subjectType: string | null; subjectId: number | null };
  "assistant.feedback":          { helpful: boolean; question: string; answerKind: string };

  // ── Platform billing ──────────────────────────────────────────────────────
  // What the org pays US. Nothing here touches the dues/treasury books.
  //
  // Most of these are emitted with { activity: false }: an org's subscription
  // state is admin business, and a "payment failed" line in the members' feed
  // would be both noise and an embarrassment. The two exceptions are
  // seats_blocked and quote_requested, which are the direct consequence of
  // something an admin just tried to do and need to be explicable afterwards.
  "billing.checkout_started":      { tier: string; priceCents: number | null; members: number };
  "billing.subscription_activated":{ tier: string; priceCents: number | null; members: number; stripeSubscriptionId: string };
  "billing.tier_changed":          { fromTier: string; toTier: string; members: number; priceCents: number | null };
  "billing.payment_failed":        { stripeInvoiceId: string | null; amountDueCents: number | null };
  // The bank wants the cardholder to authenticate (3-D Secure / SCA). Distinct
  // from payment_failed on purpose: the card is fine, a human just has to tap
  // something, and nothing retries its way out of that.
  "billing.payment_action_required": { stripeInvoiceId: string | null; amountDueCents: number | null; hostedInvoiceUrl: string | null };
  // A chargeback. Deliberately does NOT change entitlement — Stripe will send
  // the subscription events if it decides to act. This row exists so the
  // relationship ending is not invisible to us.
  "billing.dispute_opened":        { stripeDisputeId: string; amountCents: number | null; reason: string | null };
  "billing.subscription_canceled": { tier: string; atPeriodEnd: boolean };
  // The seat guard turned someone away. `action` mirrors PaymentRequiredDetails:
  // "checkout" (a card would fix it) or "quote" (past the self-serve ceiling).
  "billing.seats_blocked":         { members: number; requiredTier: string; action: string };
  "billing.quote_requested":       { kind: string; members: number; leadId: number };
  // Local count moved but the push to Stripe didn't land. Recorded because the
  // handler swallows the failure — this row is the only evidence a reconcile is
  // owed. { activity: false }: nothing a member should see.
  "billing.seat_sync_failed":      { members: number; reason: string };
}

export type Action = keyof EventMetadata;

const KNOWN_ACTIONS = new Set<Action>([
  "excuse.submitted", "excuse.approved", "excuse.rejected", "attendance.recorded", "exemption.changed",
  "transaction.created", "transaction.updated", "transaction.soft_deleted", "budget.upserted",
  "transaction_category.created", "transaction_category.updated", "transaction_category.hidden", "transaction_category.deleted",
  "treasury.opening_balance.set",
  "role.created", "role.updated", "role.deleted", "role.granted", "role.revoked",
  "brother.claimed", "brother.added", "brother.updated", "brother.removed", "brother.admin_changed", "brother.account_unlinked",
  "calendar.created", "calendar.updated", "calendar.deleted",
  "calendar_event_type.created", "calendar_event_type.updated", "calendar_event_type.hidden", "calendar_event_type.deleted",
  "programming.created", "programming.updated", "programming.stage_changed", "programming.deleted",
  "event_field.created", "event_field.updated", "event_field.deleted",
  "service_event.created", "service_event.updated", "service_event.deleted",
  "service_participation.logged", "service_participation.removed",
  "party.created", "party.updated", "party.completed", "party.deleted",
  "task.created", "task.updated", "task.completed", "task.reopened", "task.deleted",
  "poll.created", "poll.updated", "poll.closed", "poll.reopened", "poll.deleted",
  "instagram_task.created", "instagram_task.updated", "instagram_task.deleted",
  "doc.created", "doc.updated", "doc.deleted", "doc.moved", "doc.pinned", "doc.reordered",
  "docFolder.created", "docFolder.renamed", "docFolder.deleted", "docFolder.pinned", "docFolder.reordered",
  "announcement.updated", "semester.created", "semester.activated",
  "org.created", "org.config.updated", "org.onboarding.completed", "org.logo.updated",
  "membership.left",
  "invite.created", "invite.revoked",
  "join_request.submitted", "join_request.approved", "join_request.rejected",
  "metric_definition.created", "metric_definition.updated", "metric_definition.deleted",
  "metric_value.updated",
  "reimbursement.created", "reimbursement.updated", "reimbursement.approved",
  "dues.paid", "dues.adjusted", "dues.payment_voided", "dues.payment_attributed",
  "dues_payment.submitted", "dues_payment.rejected",
  "assistant.proposal_approved", "assistant.feedback",
  "billing.checkout_started", "billing.subscription_activated", "billing.tier_changed",
  "billing.payment_failed", "billing.payment_action_required", "billing.dispute_opened",
  "billing.subscription_canceled", "billing.seats_blocked",
  "billing.quote_requested", "billing.seat_sync_failed",
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
  // join_request.approved / .rejected fall out of the suffix rules already —
  // an approval reads as success, a rejection as a warning.
  if (action.endsWith(".approved") || action.endsWith(".completed") || action.endsWith(".granted") || action.endsWith(".activated") || action === "brother.added") return "success";
  return "info";
}
