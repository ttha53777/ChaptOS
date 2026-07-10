import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateFlow } from "./_components/CreateFlow";
import "./create-flow.css";

// /create — self-serve org creation, PRE-AUTH.
//
// The whole Interview → Roles → Blueprint flow runs signed out (the proxy
// allows this path anonymously); Google sign-in happens at the Build step,
// after which POST /api/orgs provisions the reviewed blueprint atomically and
// the founder lands in their real /[slug] workspace. Draft state lives in
// localStorage so it survives the OAuth redirect (?resume=1 is the return leg).
//
// Replaces the auth-first /welcome/create form (design: _design/Org Creation
// Flow Mock v3.html).

export const metadata: Metadata = {
  title: "Create your organization",
};

export default function CreateOrgPage() {
  return (
    // useSearchParams (the ?resume=1 leg) requires a Suspense boundary when the
    // page is statically prerendered.
    <Suspense fallback={null}>
      <CreateFlow />
    </Suspense>
  );
}
