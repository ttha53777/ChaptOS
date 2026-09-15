import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getJoinSession } from "@/lib/auth/join-session";
import WelcomeClient from "./WelcomeClient";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; requests?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  if (params.new !== "1" && params.requests !== "1") {
    const active = user?.memberships.find(m => m.organizationId === user.orgId)
      ?? user?.memberships[0];
    if (active) redirect(`/${active.orgSlug}`);
  }
  if (user) return <WelcomeClient email={user.email} />;
  const session = await getJoinSession();
  if (!session) redirect("/login");
  return <WelcomeClient email={session.account.email} />;
}
