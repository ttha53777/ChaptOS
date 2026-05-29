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
 * Map any thrown value to a Response. Handles DomainError, ZodError, and
 * Prisma's known error codes. Anything else becomes a 500.
 *
 * Routes call this in a single try/catch at the end of the handler — replaces
 * per-route Prisma error switches and message formatting.
 */
export function toResponse(err: unknown): Response {
  if (err instanceof DomainError) {
    const body: Record<string, unknown> = { error: err.message };
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
