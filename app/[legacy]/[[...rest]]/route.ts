import { NextResponse, type NextRequest } from "next/server";
import { orgHref } from "@/lib/org-paths";

/**
 * Orgs moved from /<slug>/… to /org/<slug>/… (see lib/org-paths.ts). Links
 * shared before the move — group chats, calendar feeds, bookmarks, Stripe
 * return URLs, announcement CTAs stored in the DB — still point at the root.
 * Send them on permanently, keeping the subpath and query.
 *
 * Every real top-level page (/login, /pricing, /org, …) is a static segment and
 * wins over this dynamic one, so nothing here has to know which words are taken.
 * Anything that couldn't have been an org slug (favicon probes, "foo.png") is a
 * plain 404 rather than a redirect into a workspace that can't exist.
 */
const LEGACY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ legacy: string; rest?: string[] }> }) {
  const { legacy, rest } = await params;
  if (!LEGACY_SLUG.test(legacy)) return new NextResponse(null, { status: 404 });
  const url = request.nextUrl.clone();
  url.pathname = orgHref(legacy, rest?.length ? `/${rest.map(encodeURIComponent).join("/")}` : "");
  return NextResponse.redirect(url, 308);
}
