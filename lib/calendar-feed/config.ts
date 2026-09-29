export function feedRolloutAllowed(orgId: number): boolean {
  const ids = (process.env.CALENDAR_FEED_ORGS ?? "").split(",").map(id => id.trim());
  return process.env.CALENDAR_FEED_PATH_REDACTION_VERIFIED === "1" && process.env.RLS_SET_ORG_ID === "1" && (ids.includes("*") || ids.includes(String(orgId)));
}
export function feedOrigin(): string {
  const url = new URL(process.env.CALENDAR_FEED_ORIGIN ?? "https://invalid.invalid");
  if (url.protocol !== "https:" || url.hostname === "invalid.invalid" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Configure CALENDAR_FEED_ORIGIN as the canonical HTTPS origin");
  return url.origin;
}
