export const INSTAGRAM_STATUSES = ["open", "posted"] as const;
export type InstagramStatus = (typeof INSTAGRAM_STATUSES)[number];
export function isInstagramStatus(value: unknown): value is InstagramStatus {
  return typeof value === "string" && (INSTAGRAM_STATUSES as readonly string[]).includes(value);
}
