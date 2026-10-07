import { Suspense } from "react";
import type { Metadata } from "next";
import { CREATE_THEME_BOOT } from "@/lib/onboarding/create-theme";
import { CreateFlow } from "./_components/CreateFlow";
import "./create-paper.css";

// /create — self-serve org creation, PRE-AUTH.
//
// The whole Name → Interview → Roles → Timeline → Charter flow runs signed out
// (the proxy allows this path anonymously); Google sign-in happens at the Build
// step, after which POST /api/orgs provisions the reviewed charter atomically
// and the founder lands on /[slug]/onboarding, the day-one welcome. Draft state
// lives in localStorage so it survives the OAuth redirect (?resume=1 is the
// return leg).
//
// Design: _design/Org Creation Paper Mock.html — you are drafting a charter.

export const metadata: Metadata = {
  title: "Create your organization",
};

export default function CreateOrgPage() {
  return (
    <>
      {/* Stamps data-crf-theme on <html> BEFORE .ocp is constructed, so the flow's
          first painted frame is already the right theme (see lib/onboarding/
          create-theme.ts for why this is a raw inline script and not next/script).
          It must stay ahead of <CreateFlow /> in the streamed markup. */}
      <script dangerouslySetInnerHTML={{ __html: CREATE_THEME_BOOT }} />
      {/* useSearchParams (the ?resume=1 leg) requires a Suspense boundary when the
          page is statically prerendered. */}
      <Suspense fallback={null}>
        <CreateFlow />
      </Suspense>
    </>
  );
}
