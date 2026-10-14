import { mobileConfig } from "@/lib/mobile-config";

// GET /api/mobile/config — public, no auth. The native app reads it at launch
// to learn the supported version floor before it makes any other call. It's
// also exempt from the proxy's version gate (lib/mobile-config.ts), so a build
// below the floor can still find out what to update to.
//
// Set MOBILE_MIN_VERSION when an API change is about to break builds already
// in people's hands; MOBILE_LATEST_VERSION only drives a soft "update
// available" nudge. Both are optional.
export async function GET() {
  return Response.json(mobileConfig(), { headers: { "Cache-Control": "public, max-age=300" } });
}
