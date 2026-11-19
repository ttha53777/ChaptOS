/** A non-2xx answer, parsed from the server's `{ error, code?, details? }` body (lib/errors). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
    readonly details: unknown = null,
    /** The whole parsed body, for routes that add fields (request-join's `state`). */
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The network itself failed (offline, DNS, server down): no HTTP answer at all. */
export class NetworkError extends Error {
  constructor(readonly cause: unknown) {
    super("Can't reach ChaptOS. Check your connection.");
    this.name = "NetworkError";
  }
}

export const isApiError = (e: unknown, status?: number): e is ApiError =>
  e instanceof ApiError && (status === undefined || e.status === status);

/** What to tell a person about a failure: the server's own sentence when it sent one. */
export function errorMessage(e: unknown, fallback = "Something went wrong. Try again in a moment."): string {
  if (e instanceof ApiError || e instanceof NetworkError) return e.message || fallback;
  return fallback;
}
