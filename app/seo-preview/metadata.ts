// What "/" would ship if the /seo-preview mock is promoted. Lives outside
// page.tsx because a Next page may only export its route config.
import type { Metadata } from "next";
import { APP_NAME } from "@/lib/domains";
import { SITE_URL } from "@/lib/seo";
import { BILLING_BANDS } from "@/lib/billing/tiers";

const TITLE = `${APP_NAME}: Student Organization Management Software for College Clubs`;
export const DESCRIPTION =
  "Run your college club, fraternity, sorority, team or student government in one place: " +
  "members, attendance, events, dues, budgets, tasks and minutes. Free for up to " +
  `${BILLING_BANDS[0].upTo} members.`;

export const landingMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  applicationName: APP_NAME,
  category: "education",
  openGraph: {
    type: "website",
    url: "/",
    siteName: APP_NAME,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};
