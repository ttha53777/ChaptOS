import { redirect } from "next/navigation";
import { orgHref } from "@/lib/org-paths";

// The Instagram page was renamed Media; keep old bookmarks and links working.
export default async function InstagramRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(orgHref(slug, "/media"));
}
