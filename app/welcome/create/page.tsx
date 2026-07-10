import { redirect } from "next/navigation";

// /welcome/create — RETIRED. The auth-first two-step create form was replaced
// by the pre-auth /create flow (Interview → Roles → Blueprint → Build; design:
// _design/Org Creation Flow Mock v3.html). This stub survives only for stale
// bookmarks and old links; the ?new=1 semantics are obsolete — /create handles
// signed-in founders natively at its Build step.
export default function RetiredCreatePage() {
  redirect("/create");
}
