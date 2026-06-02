import { requireUser } from "./require-user";

type RequireResult =
  | { user: NonNullable<Awaited<ReturnType<typeof requireUser>>>; error?: undefined }
  | { user?: undefined; error: Response };

/**
 * Returns { user } when the caller is an authenticated platform admin,
 * otherwise { error: Response } with a 401 or 403 to return verbatim.
 *
 * Usage:
 *   const { user, error } = await requireAdmin();
 *   if (error) return error;
 */
export async function requireAdmin(): Promise<RequireResult> {
  const user = await requireUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.isPlatformAdmin) return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}
