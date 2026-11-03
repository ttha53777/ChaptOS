import { redirect } from "next/navigation";

// The Instagram page was renamed Media; keep old bookmarks and links working.
export default async function InstagramRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/${slug}/media`);
}
