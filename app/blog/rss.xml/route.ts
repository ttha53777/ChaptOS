// RSS 2.0 feed of every published post, built once at build time.
import { getPostsWithBodies } from "../posts";
import { APP_NAME, ROOT_DOMAIN } from "@/lib/domains";

export const dynamic = "force-static";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function GET() {
  // Static output can't see the request host, so the absolute URLs come from
  // config. Unset ROOT_DOMAIN means local dev.
  const site = ROOT_DOMAIN === "localhost" ? "http://localhost:3000" : `https://${ROOT_DOMAIN}`;
  const posts = getPostsWithBodies();

  const items = posts
    .map(p => {
      const url = `${site}/blog/${p.slug}`;
      // Feed readers render bodies off-site, so root-relative links must be absolute.
      const body = p.html.replace(/(href|src)="\//g, `$1="${site}/`);
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(`${p.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${esc(p.summary)}</description>
${p.tags.map(t => `      <category>${esc(t)}</category>`).join("\n")}
      <content:encoded><![CDATA[${body.replace(/]]>/g, "]]]]><![CDATA[>")}]]></content:encoded>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(APP_NAME)} Blog</title>
    <link>${site}/blog</link>
    <atom:link href="${site}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <description>Notes from the people building ${esc(APP_NAME)}.</description>
    <language>en-us</language>
${posts[0] ? `    <lastBuildDate>${new Date(`${posts[0].date}T00:00:00Z`).toUTCString()}</lastBuildDate>\n` : ""}${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
