import { z } from "zod";

// Input for POST /api/orgs/leave — a member leaving the active org. Same
// confirm-slug posture as deletion: the client sends the org's slug, the service
// re-checks it against the active org so a malformed request can't drop the wrong
// membership. The UI makes the user type the org NAME; the slug is the stable token.
//
// Its own file (zod only) because the native app imports it; lib/validation/org
// re-exports it for the web.
export const leaveOrgInput = z.object({
  confirmSlug: z.string().trim().min(1, "Confirmation is required"),
});
