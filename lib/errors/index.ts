/**
 * DomainError taxonomy.
 *
 * Services throw these; the route layer calls `toResponse()` to map to HTTP.
 * Replaces the ad-hoc `if (e.code === "P2025") return 404` blocks scattered
 * across ~30 route handlers — error mapping lives in exactly one place.
 *
 * Services should NEVER touch Response objects directly. Routes should NEVER
 * `instanceof PrismaClientKnownRequestError`.
 */

import { Prisma } from "@/app/generated/prisma/client";
import { ZodError } from "zod";

export type DomainErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "PAYMENT_REQUIRED"
  | "INTERNAL";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: DomainErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) {
    super("NOT_FOUND", `${what} not found`, 404);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

/**
 * A Google account is already linked to a Brother somewhere. Subclass of
 * ConflictError so it still maps to 409 for every existing caller, but the
 * org-create route catches it specifically: a founder whose previous POST
 * committed but lost its response shouldn't see a dead-end "already linked"
 * error — they should be routed into the org they already created.
 */
export class AlreadyLinkedError extends ConflictError {}

export class ForbiddenError extends DomainError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", message, 403);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Unauthorized") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION", message, 400, details);
  }
}

export class RateLimitedError extends DomainError {
  readonly retryAfterMs?: number;
  constructor(retryAfterMs?: number) {
    super("RATE_LIMITED", "Too many requests", 429);
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * The org has outgrown what it is paying for. Thrown only by the seat guard
 * (lib/billing/guard.ts) when adding a member would cross a price band the org
 * can't currently cover.
 *
 * Nothing the org already has is ever taken away by this error — it is raised on
 * *growth* paths only. Reads, exports and every existing member keep working.
 *
 * `details` carries what the client needs to render the right affordance:
 *
 *   { currentMembers: number
 *     limit:          number   the largest count the org can reach as things stand
 *     requiredTier:   "standard" | "pro" | "custom"
 *     priceCents:     number | null   null above the self-serve ceiling
 *     action:         "checkout" | "quote" }
 *
 * `action` is the fork: "checkout" means a card would fix it, "quote" means the
 * org is past the self-serve ceiling and needs a human.
 */
export interface PaymentRequiredDetails {
  currentMembers: number;
  limit: number;
  requiredTier: string;
  priceCents: number | null;
  action: "checkout" | "quote";
}

export class PaymentRequiredError extends DomainError {
  constructor(message: string, details: PaymentRequiredDetails) {
    super("PAYMENT_REQUIRED", message, 402, details);
  }
}

/**
 * Map any thrown value to a Response. Handles DomainError, ZodError, and
 * Prisma's known error codes. Anything else becomes a 500.
 *
 * Routes call this in a single try/catch at the end of the handler — replaces
 * per-route Prisma error switches and message formatting.
 */
export function toResponse(err: unknown): Response {
  if (err instanceof DomainError) {
    // `code` is emitted for every domain error, not just the ones that need it:
    // a client branching on failure should key off a stable machine-readable
    // symbol, not a prose message that may be reworded. Purely additive —
    // existing callers read `error`.
    const body: Record<string, unknown> = { error: err.message, code: err.code };
    if (err.details !== undefined) body.details = err.details;
    const headers: Record<string, string> = {};
    if (err instanceof RateLimitedError && err.retryAfterMs) {
      headers["Retry-After"] = String(Math.ceil(err.retryAfterMs / 1000));
    }
    return Response.json(body, { status: err.status, headers });
  }

  if (err instanceof ZodError) {
    return Response.json(
      { error: "Validation failed", details: err.issues },
      { status: 400 },
    );
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return Response.json({ error: "Not found" }, { status: 404 });
    if (err.code === "P2002") return Response.json({ error: "Duplicate entry" }, { status: 409 });
    if (err.code === "P2003") return Response.json({ error: "Foreign key constraint" }, { status: 409 });
  }

  // Anything else is a real server error. Caller should logError() before
  // throwing if they have ctx; toResponse keeps the response generic.
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
