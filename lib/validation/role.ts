import { z } from "zod";

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_PERM_BITS = 0xffffffff;
const NAME_MAX = 60;

export const createRoleInput = z.object({
  name:        z.string().trim().min(1).max(NAME_MAX),
  color:       z.string().regex(COLOR_RE, "color must be #RRGGBB").optional().nullable(),
  rank:        z.number().int().nonnegative().default(0),
  permissions: z.number().int().min(0).max(MAX_PERM_BITS).default(0),
});
export type CreateRoleInput = z.infer<typeof createRoleInput>;

export const updateRoleInput = z.object({
  name:        z.string().trim().min(1).max(NAME_MAX).optional(),
  color:       z.union([z.string().regex(COLOR_RE), z.null()]).optional(),
  rank:        z.number().int().nonnegative().optional(),
  permissions: z.number().int().min(0).max(MAX_PERM_BITS).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleInput>;

export const grantRoleInput = z.object({
  roleId: z.number().int().positive(),
});
export type GrantRoleInput = z.infer<typeof grantRoleInput>;
