// /seo-preview — the SEO-optimized landing page mock. Unlike app/page.tsx it
// never redirects signed-in users, so the team can review it while logged in.
//
// `landingMetadata` (./metadata.ts) is what "/" would ship if this mock is promoted (title,
// description, canonical, Open Graph, Twitter). The preview itself overrides
// two things: robots noindex/nofollow, and no canonical, since a canonical
// pointing at "/" on a noindexed page sends Google mixed signals.
import type { Metadata } from "next";
import { SeoLandingPage, SEO_FAQ, stripMarks } from "./SeoLandingPage";
import { DESCRIPTION, landingMetadata } from "./metadata";
import { APP_NAME } from "@/lib/domains";
import { SITE_URL } from "@/lib/seo";
import { BILLING_BANDS, SELF_SERVE_MAX } from "@/lib/billing/tiers";

export const metadata: Metadata = {
  ...landingMetadata,
  alternates: undefined,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

const paid = BILLING_BANDS.filter(b => b.priceCents !== null && b.priceCents > 0);

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: APP_NAME,
      url: SITE_URL,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: APP_NAME,
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "SoftwareApplication",
      name: APP_NAME,
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Student organization management software",
      operatingSystem: "Web",
      description: DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#org` },
      featureList: [
        "Member and roster management", "Join requests approved by officers", "Attendance tracking with check-in",
        "Event calendar with Apple and Google Calendar sync", "Dues tracking", "Budget and reimbursement ledger",
        "Task assignment by person, role or everyone", "Meeting minutes and docs library", "AI assistant (Ask Chapt)",
        "Role-based permissions", "CSV export",
      ],
      // Straight from lib/billing/tiers.ts; the quote-only band past SELF_SERVE_MAX has no price to list.
      offers: [
        { "@type": "Offer", name: `${BILLING_BANDS[0].label} (up to ${BILLING_BANDS[0].upTo} members)`, price: "0", priceCurrency: "USD" },
        ...paid.map(b => ({
          "@type": "Offer",
          name: `${b.label} (${b.from}–${b.upTo ?? SELF_SERVE_MAX} members)`,
          priceCurrency: "USD",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: ((b.priceCents ?? 0) / 100).toFixed(2),
            priceCurrency: "USD",
            unitCode: "MON",
          },
        })),
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: SEO_FAQ.map(f => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: stripMarks(f.a) },
      })),
    },
  ],
};

export default function SeoPreviewPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // "<" escaped so no string in the data can close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
      />
      <SeoLandingPage />
    </>
  );
}
