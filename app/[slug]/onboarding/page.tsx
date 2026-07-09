import { redirect } from "next/navigation";

/**
 * The post-creation onboarding wizard is RETIRED.
 *
 * Setup now happens PRE-creation: the founder reviews a blueprint
 * (workflows / vocabulary / roles) on /welcome/create and provisionOrg applies
 * it atomically, stamping OrganizationConfig.onboardingCompletedAt at creation.
 * There is nothing left to configure here, so any hit on this route — a stale
 * bookmark, an old link, a founder who paged back — lands straight in the live
 * workspace.
 */
export default async function OnboardingRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/${slug}`);
}
