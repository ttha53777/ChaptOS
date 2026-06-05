import { z } from "zod";
import { httpsUrl } from "./shared";

const urlSchema = httpsUrl("URL must be valid http(s)");

export const createDocInput = z.object({
  title:       z.string().trim().min(1).max(200),
  url:         urlSchema,
  description: z.string().max(2000).optional().nullable(),
});
export type CreateDocInput = z.infer<typeof createDocInput>;

export const updateDocInput = z.object({
  title:       z.string().trim().min(1).max(200).optional(),
  url:         urlSchema.optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type UpdateDocInput = z.infer<typeof updateDocInput>;
