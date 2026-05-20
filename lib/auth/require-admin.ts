import { requireUser } from "./require-user";

type RequireResult =
  | { user: NonNullable<Awaited<ReturnType<typeof requireUser>>>; error?: undefined }
  | { user?: undefined; error: Response };

/**
 * Returns { user } when the caller is an authenticated admin, otherwise { error: Response }
 * with a 401 (unauthenticated) or 403 (forbidden) status the caller should return verbatim.
 *
 * Usage:
 *   const { user, error } = await requireAdmin();
 *   if (error) return error;
 */
export async function requireAdmin(): Promise<RequireResult> {
  const user = await requireUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.isAdmin) return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

/**
 * Allows admins OR the brother whose id matches `selfBrotherId`. Use for actions that a
 * brother is allowed to perform on their own record (e.g. PATCH /api/brothers/[id] when
 * the target is themselves).
 */
export async function requireAdminOrSelf(selfBrotherId: number): Promise<RequireResult> {
  const user = await requireUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.isAdmin && user.id !== selfBrotherId) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}
