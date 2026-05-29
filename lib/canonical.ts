/**
 * Canonical domain vocabulary.
 *
 * The DB schema uses "Brother", "Organization", "Semester" — established names
 * that the codebase, history, and contributors expect. These aliases give new
 * code a path to "platform-neutral" terms (Member, Org, Period) without a
 * destructive rename. Use the aliases in new service/event/registry code
 * where vocabulary matters; existing identifiers stay as-is.
 *
 * Mapping (see CLAUDE.md):
 *   Member       = Brother
 *   Org          = Organization
 *   Period       = Semester
 *   Permission   = (unchanged)
 *   Role         = (unchanged)
 *   Transaction  = (unchanged)
 */

import type {
  Brother,
  Organization,
  Membership,
  Role,
  Semester,
  Transaction,
} from "@/app/generated/prisma/client";

export type Member       = Brother;
export type Org          = Organization;
export type Period       = Semester;

// Re-exports for ergonomics: import { Membership, Role, Transaction } from "@/lib/canonical".
export type { Membership, Role, Transaction };
