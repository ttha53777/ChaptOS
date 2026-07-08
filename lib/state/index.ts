/**
 * Status enums for the domain.
 *
 * Each module exports: an `as const` object of values, a TS union type, an
 * array of allowed values for runtime lists, and a type guard.
 *
 * DB-side validation is via Postgres CHECK constraints (see
 * prisma/migrations/<ts>_phase25_state_checks/). We deliberately do NOT use
 * Prisma `enum` types — they require destructive migrations to add values,
 * which the Phase 3 workflow registry will need to do frequently.
 */

export * from "./excuse-status";
export * from "./exemption-reason";
export * from "./reimbursement-status";
export * from "./transaction-type";
export * from "./party-type";
export * from "./activity-type";
export * from "./calendar-category";
export * from "./invite-mode";
export * from "./task-status";
export * from "./poll-status";
